-- =====================================================================
-- LUMEO CAPITAL, E.I. — Sistema de Gestão de Microcrédito
-- Schema completo para Supabase / PostgreSQL (v2 — motor de juros
-- recalculado a partir dos factos, com data de capitalização ancorada
-- no dia do desembolso e suporte a pagamentos com data retroactiva)
-- =====================================================================
-- Como aplicar: cola este ficheiro inteiro no SQL Editor do teu projecto
-- Supabase (https://app.supabase.com/project/_/sql) e corre uma vez.
-- Se já tinhas a v1 aplicada, corre isto num projecto novo (mais simples
-- e seguro do que migrar em cima de dados de teste).
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
-- 1. TIPOS
-- =====================================================================

do $$ begin
  create type estado_emprestimo as enum ('ativo', 'atraso', 'liquidado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_movimento as enum ('desembolso', 'capitalizacao', 'pagamento', 'ajuste');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_cliente as enum ('ativo', 'inativo', 'bloqueado');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- 2. SEQUÊNCIAS DE CÓDIGO (C001, E001, P0001...)
-- =====================================================================

create sequence if not exists seq_cliente start 1;
create sequence if not exists seq_emprestimo start 1;
create sequence if not exists seq_pagamento start 1;

create or replace function gerar_codigo(prefixo text, seq regclass)
returns text language plpgsql as $$
declare
  n bigint;
  largura int;
begin
  n := nextval(seq);
  largura := case prefixo when 'P' then 5 else 3 end;
  return prefixo || lpad(n::text, largura, '0');
end;
$$;

-- =====================================================================
-- 3. TABELAS
-- =====================================================================

create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null default gerar_codigo('C', 'seq_cliente'),
  nome_completo text not null,
  documento text,                  -- NUIT / BI
  contacto text,
  morada text,
  foto_url text,
  fiador_nome text,
  fiador_contacto text,
  fiador_documento text,
  estado estado_cliente not null default 'ativo',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists emprestimos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null default gerar_codigo('E', 'seq_emprestimo'),
  cliente_id uuid not null references clientes(id) on delete restrict,
  capital numeric(14,2) not null check (capital > 0),
  taxa_juro numeric(6,4) not null check (taxa_juro >= 0),   -- fração: 0.25 = 25%
  data_desembolso date not null,
  dia_aniversario int not null,               -- só informativo; o cálculo real ancora sempre em data_desembolso
  data_proxima_capitalizacao date not null,
  saldo_atual numeric(14,2) not null default 0,
  estado estado_emprestimo not null default 'ativo',
  data_ultimo_pagamento date,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_emprestimos_cliente on emprestimos(cliente_id);
create index if not exists idx_emprestimos_estado on emprestimos(estado);
create index if not exists idx_emprestimos_proxima_cap on emprestimos(data_proxima_capitalizacao);

-- Eventos de origem: os pagamentos REAIS, tal como introduzidos pelo
-- utilizador (com a data em que o pagamento aconteceu, não a data em
-- que foi digitado no sistema). Isto é o que nunca muda.
create table if not exists pagamentos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null default gerar_codigo('P', 'seq_pagamento'),
  emprestimo_id uuid not null references emprestimos(id) on delete restrict,
  valor numeric(14,2) not null check (valor > 0),
  data_pagamento date not null,
  comprovativo_url text,
  observacoes text,
  criado_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_pagamentos_emprestimo on pagamentos(emprestimo_id, data_pagamento);

-- Livro-razão: DERIVADO. É sempre apagado e reconstruído por
-- recompute_emprestimo() a partir de emprestimos + pagamentos, na ordem
-- cronológica real dos factos. Nunca editar à mão.
create table if not exists movimentos (
  id uuid primary key default gen_random_uuid(),
  emprestimo_id uuid not null references emprestimos(id) on delete cascade,
  tipo tipo_movimento not null,
  valor numeric(14,2) not null,
  saldo_apos numeric(14,2) not null,
  data_movimento date not null,
  codigo_pagamento text,                -- só preenchido para tipo='pagamento'
  comprovativo_url text,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_movimentos_emprestimo on movimentos(emprestimo_id, data_movimento);
create index if not exists idx_movimentos_tipo on movimentos(tipo);

-- =====================================================================
-- 4. add_months_clamped: soma meses a uma data, ANCORANDO sempre no dia
--    original e "aparando" para o último dia do mês quando este não
--    existe (ex.: 31 Jan + 1 mês = 28/29 Fev, nunca "transborda" para
--    Março). É o que garante que a capitalização fica sempre no dia de
--    aniversário do desembolso, sem desvios ao longo dos meses.
-- =====================================================================

create or replace function add_months_clamped(p_data date, p_meses int)
returns date language plpgsql immutable as $$
declare
  v_ano int; v_mes int; v_dia int; v_ultimo_dia int; v_total_meses int;
begin
  v_dia := extract(day from p_data)::int;
  v_total_meses := (extract(year from p_data)::int * 12 + extract(month from p_data)::int - 1) + p_meses;
  v_ano := v_total_meses / 12;
  v_mes := (v_total_meses % 12) + 1;
  v_ultimo_dia := extract(day from ((date_trunc('month', make_date(v_ano, v_mes, 1)) + interval '1 month - 1 day')));
  return make_date(v_ano, v_mes, least(v_dia, v_ultimo_dia));
end;
$$;

-- =====================================================================
-- 5. registrar_desembolso: cria o empréstimo e gera o extrato inicial
--    (o desembolso + a capitalização imediata do 1º ciclo, sem carência)
-- =====================================================================

create or replace function registrar_desembolso(
  p_cliente_id uuid,
  p_capital numeric,
  p_taxa_juro numeric,
  p_data_desembolso date,
  p_observacoes text default null
) returns uuid language plpgsql as $$
declare
  v_emprestimo_id uuid;
begin
  if p_capital <= 0 then raise exception 'Capital deve ser maior que zero'; end if;
  if p_taxa_juro < 0 then raise exception 'Taxa de juro não pode ser negativa'; end if;

  insert into emprestimos (
    cliente_id, capital, taxa_juro, data_desembolso, dia_aniversario,
    data_proxima_capitalizacao, saldo_atual, estado, observacoes
  ) values (
    p_cliente_id, p_capital, p_taxa_juro, p_data_desembolso,
    extract(day from p_data_desembolso)::int,
    add_months_clamped(p_data_desembolso, 1), p_capital, 'ativo', p_observacoes
  ) returning id into v_emprestimo_id;

  perform recompute_emprestimo(v_emprestimo_id);
  return v_emprestimo_id;
end;
$$;

-- =====================================================================
-- 6. registrar_pagamento: grava o pagamento REAL (com a data escolhida
--    pelo utilizador, que pode ser retroactiva) e manda recalcular todo
--    o extrato do empréstimo a partir daí.
-- =====================================================================

create or replace function registrar_pagamento(
  p_emprestimo_id uuid,
  p_valor numeric,
  p_data_pagamento date default current_date,
  p_comprovativo_url text default null,
  p_observacoes text default null
) returns uuid language plpgsql as $$
declare
  v_pagamento_id uuid;
begin
  if p_valor <= 0 then raise exception 'O valor do pagamento deve ser maior que zero'; end if;
  if not exists (select 1 from emprestimos where id = p_emprestimo_id) then
    raise exception 'Empréstimo não encontrado';
  end if;

  insert into pagamentos (emprestimo_id, valor, data_pagamento, comprovativo_url, observacoes)
  values (p_emprestimo_id, p_valor, p_data_pagamento, p_comprovativo_url, p_observacoes)
  returning id into v_pagamento_id;

  perform recompute_emprestimo(p_emprestimo_id);
  return v_pagamento_id;
end;
$$;

-- =====================================================================
-- 7. recompute_emprestimo: o MOTOR DE JUROS. Reconstrói do zero o
--    extrato de UM empréstimo, percorrendo o tempo em ordem cronológica
--    e intercalando capitalizações mensais (ancoradas em data_desembolso,
--    nunca na última capitalização) com os pagamentos reais, pela ordem
--    em que aconteceram. Chamar sempre que: o empréstimo é criado, um
--    pagamento é adicionado/editado/apagado, ou para "adiantar" saldos
--    até à data de hoje (ver processar_capitalizacoes).
--
--    Regra de empate: se um pagamento e uma capitalização caem no MESMO
--    dia, o pagamento é aplicado primeiro (reduz logo o saldo antes de
--    o juro desse ciclo ser calculado) — replica exactamente o exemplo
--    da Isabel Mário fornecido pela LUMEO.
-- =====================================================================

create or replace function recompute_emprestimo(p_emprestimo_id uuid, p_data_referencia date default current_date)
returns void language plpgsql as $$
declare
  emp record;
  v_saldo numeric(14,2);
  v_juro numeric(14,2);
  v_proxima date;
  v_ciclo int := 0;
  v_ultimo_pagamento date;
  pag_ids uuid[];
  pag_codigos text[];
  pag_valores numeric(14,2)[];
  pag_datas date[];
  pag_obs text[];
  pag_comp text[];
  n int;
  i int := 1;
begin
  select * into emp from emprestimos where id = p_emprestimo_id for update;
  if not found then return; end if;

  delete from movimentos where emprestimo_id = p_emprestimo_id;

  select array_agg(id order by data_pagamento, created_at),
         array_agg(codigo order by data_pagamento, created_at),
         array_agg(valor order by data_pagamento, created_at),
         array_agg(data_pagamento order by data_pagamento, created_at),
         array_agg(coalesce(observacoes,'') order by data_pagamento, created_at),
         array_agg(comprovativo_url order by data_pagamento, created_at)
    into pag_ids, pag_codigos, pag_valores, pag_datas, pag_obs, pag_comp
    from pagamentos where emprestimo_id = p_emprestimo_id;

  n := coalesce(array_length(pag_ids, 1), 0);

  insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
  values (p_emprestimo_id, 'desembolso', emp.capital, emp.capital, emp.data_desembolso, 'Desembolso do capital');

  v_juro := round(emp.capital * emp.taxa_juro, 2);
  v_saldo := round(emp.capital + v_juro, 2);
  insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
  values (p_emprestimo_id, 'capitalizacao', v_juro, v_saldo, emp.data_desembolso,
          'Capitalização inicial do 1º ciclo (imediata, sem carência)');

  v_proxima := add_months_clamped(emp.data_desembolso, 1);
  v_ultimo_pagamento := null;

  while v_saldo > 0.005 loop
    if i <= n and pag_datas[i] <= p_data_referencia
       and (v_proxima > p_data_referencia or pag_datas[i] <= v_proxima) then
      -- próximo facto: um pagamento (empata com capitalização no mesmo dia -> paga primeiro)
      v_saldo := round(greatest(v_saldo - pag_valores[i], 0), 2);
      insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, codigo_pagamento, comprovativo_url, observacoes)
      values (p_emprestimo_id, 'pagamento', -pag_valores[i], v_saldo, pag_datas[i], pag_codigos[i], pag_comp[i], pag_obs[i]);
      v_ultimo_pagamento := pag_datas[i];
      i := i + 1;
    elsif v_proxima <= p_data_referencia then
      -- próximo facto: uma capitalização vencida
      v_juro := round(v_saldo * emp.taxa_juro, 2);
      v_saldo := round(v_saldo + v_juro, 2);
      insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
      values (p_emprestimo_id, 'capitalizacao', v_juro, v_saldo, v_proxima, 'Capitalização automática na data de aniversário');
      v_ciclo := v_ciclo + 1;
      v_proxima := add_months_clamped(emp.data_desembolso, v_ciclo + 1);
    else
      exit; -- nada mais vencido até à data de referência
    end if;
  end loop;

  update emprestimos
     set saldo_atual = v_saldo,
         data_proxima_capitalizacao = v_proxima,
         data_ultimo_pagamento = v_ultimo_pagamento,
         estado = case
                    when v_saldo <= 0.005 then 'liquidado'::estado_emprestimo
                    when (p_data_referencia - coalesce(v_ultimo_pagamento, emp.data_desembolso)) > 30 then 'atraso'::estado_emprestimo
                    else 'ativo'::estado_emprestimo
                  end,
         updated_at = now()
   where id = p_emprestimo_id;
end;
$$;

-- Chamar ao abrir o Dashboard (ou via pg_cron) para "adiantar" todos os
-- empréstimos activos até hoje, gerando qualquer capitalização vencida.
create or replace function processar_capitalizacoes(p_data_referencia date default current_date)
returns void language plpgsql as $$
declare r record;
begin
  for r in select id from emprestimos where estado <> 'liquidado' loop
    perform recompute_emprestimo(r.id, p_data_referencia);
  end loop;
end;
$$;

-- =====================================================================
-- 8. VIEWS de apoio ao Dashboard, Extrato, Clientes e Cobranças
-- =====================================================================

create or replace view view_dashboard_resumo as
select
  (select count(*) from clientes where estado = 'ativo') as clientes_ativos_total,
  (select count(distinct cliente_id) from emprestimos where estado in ('ativo','atraso')) as clientes_com_credito_ativo,
  (select count(*) from emprestimos) as total_emprestimos,
  (select count(*) from emprestimos where estado in ('ativo','atraso')) as emprestimos_ativos,
  (select count(*) from emprestimos where estado = 'atraso') as emprestimos_em_atraso,
  (select count(*) from emprestimos where estado = 'liquidado') as emprestimos_liquidados,
  (select coalesce(sum(capital),0) from emprestimos) as capital_total_emprestado,
  (select coalesce(sum(saldo_atual),0) from emprestimos where estado in ('ativo','atraso')) as saldo_total_em_divida,
  (select coalesce(sum(valor),0) from movimentos where tipo = 'capitalizacao') as juros_gerados_total,
  (select coalesce(sum(valor),0) from pagamentos) as total_recebido;

-- Extrato em ORDEM CRONOLÓGICA (mais antigo primeiro) — lê-se como a
-- história real do empréstimo, com o saldo a evoluir passo a passo.
create or replace view view_extrato as
select
  m.id as movimento_id,
  m.emprestimo_id,
  e.codigo as codigo_emprestimo,
  cl.id as cliente_id,
  cl.nome_completo,
  m.tipo,
  m.valor,
  m.saldo_apos,
  m.data_movimento,
  m.codigo_pagamento,
  m.comprovativo_url,
  m.observacoes
from movimentos m
join emprestimos e on e.id = m.emprestimo_id
join clientes cl on cl.id = e.cliente_id
order by m.data_movimento asc, m.created_at asc;

create or replace view view_cobrancas as
select
  em.id as emprestimo_id,
  em.codigo as codigo_emprestimo,
  cl.id as cliente_id,
  cl.codigo as codigo_cliente,
  cl.nome_completo,
  cl.contacto,
  em.saldo_atual,
  em.data_ultimo_pagamento,
  em.data_desembolso,
  greatest(current_date - coalesce(em.data_ultimo_pagamento, em.data_desembolso), 0) as dias_sem_pagamento
from emprestimos em
join clientes cl on cl.id = em.cliente_id
where em.estado in ('ativo', 'atraso')
  and (current_date - coalesce(em.data_ultimo_pagamento, em.data_desembolso)) > 30
order by dias_sem_pagamento desc;

create or replace view view_clientes_resumo as
select
  cl.*,
  count(em.id) filter (where em.estado in ('ativo','atraso')) as emprestimos_ativos,
  coalesce(sum(em.saldo_atual) filter (where em.estado in ('ativo','atraso')), 0) as saldo_total_em_divida
from clientes cl
left join emprestimos em on em.cliente_id = cl.id
group by cl.id;

-- =====================================================================
-- 9. Editar cliente (usada pelo formulário "Editar" no frontend)
-- =====================================================================

create or replace function atualizar_cliente(
  p_cliente_id uuid,
  p_nome_completo text,
  p_documento text default null,
  p_contacto text default null,
  p_morada text default null,
  p_fiador_nome text default null,
  p_fiador_contacto text default null,
  p_estado estado_cliente default 'ativo'
) returns void language plpgsql as $$
begin
  update clientes
     set nome_completo = p_nome_completo,
         documento = p_documento,
         contacto = p_contacto,
         morada = p_morada,
         fiador_nome = p_fiador_nome,
         fiador_contacto = p_fiador_contacto,
         estado = p_estado,
         updated_at = now()
   where id = p_cliente_id;
end;
$$;

-- =====================================================================
-- 10. ROW LEVEL SECURITY
--     Fase 1: qualquer utilizador autenticado (equipa LUMEO) tem acesso
--     total. Perfis/permissões granulares ficam para a Administração.
-- =====================================================================

alter table clientes enable row level security;
alter table emprestimos enable row level security;
alter table pagamentos enable row level security;
alter table movimentos enable row level security;

drop policy if exists "authenticated_full_access" on clientes;
create policy "authenticated_full_access" on clientes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated_full_access" on emprestimos;
create policy "authenticated_full_access" on emprestimos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated_full_access" on pagamentos;
create policy "authenticated_full_access" on pagamentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated_full_access" on movimentos;
create policy "authenticated_full_access" on movimentos for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- =====================================================================
-- 11. CASOS REAIS DA LUMEO (opcional — corre isto se quiseres começar
--     já com os 3 clientes reais em vez de uma base vazia)
-- =====================================================================

do $$
declare
  v_cliente_id uuid;
  v_emprestimo_id uuid;
begin
  if not exists (select 1 from clientes where nome_completo = 'Michelle Bahule') then
    insert into clientes (nome_completo, estado) values ('Michelle Bahule', 'ativo') returning id into v_cliente_id;
    perform registrar_desembolso(v_cliente_id, 100000, 0.25, '2026-05-11', 'Caso real importado');
  end if;

  if not exists (select 1 from clientes where nome_completo = 'Isabel Mário') then
    insert into clientes (nome_completo, estado) values ('Isabel Mário', 'ativo') returning id into v_cliente_id;
    v_emprestimo_id := registrar_desembolso(v_cliente_id, 15000, 0.28, '2026-05-15', 'Caso real importado');
    perform registrar_pagamento(v_emprestimo_id, 13200, '2026-06-14', null, null);
    perform registrar_pagamento(v_emprestimo_id, 1680, '2026-07-13', null, 'Pagamento apenas dos juros do ciclo');
  end if;

  if not exists (select 1 from clientes where nome_completo = 'Bernardo Sitoe') then
    insert into clientes (nome_completo, estado) values ('Bernardo Sitoe', 'ativo') returning id into v_cliente_id;
    v_emprestimo_id := registrar_desembolso(v_cliente_id, 5000, 0.25, '2026-03-16', 'Caso real importado');
    perform registrar_pagamento(v_emprestimo_id, 9765.63, '2026-05-29', null, 'Liquidação total da dívida');
  end if;
end $$;

-- =====================================================================
-- 12. AGENDAMENTO (opcional, requer extensão pg_cron activada)
-- =====================================================================

-- select cron.schedule('capitalizacao-diaria', '5 0 * * *', $$select processar_capitalizacoes();$$);
