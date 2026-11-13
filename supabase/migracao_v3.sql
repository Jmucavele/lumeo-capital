-- =====================================================================
-- LUMEO CAPITAL — Migração v3
--   1. Editar e anular pagamentos (com histórico de auditoria)
--   2. Dashboard: capital desembolsado só dos créditos activos
--   3. Extrato: expõe o estado/saldo actual do empréstimo e o id do
--      pagamento (para o frontend filtrar e editar)
--   4. Verificação de integridade da carteira
-- Como aplicar: Supabase → SQL Editor → New query → colar tudo → Run.
-- É seguro correr mais de uma vez. Não apaga dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Histórico de alterações de pagamentos (auditoria)
-- ---------------------------------------------------------------------
create table if not exists pagamentos_historico (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null,
  codigo_pagamento text,
  emprestimo_id uuid not null,
  acao text not null check (acao in ('edicao', 'anulacao')),
  valor_anterior numeric(14,2),
  data_anterior date,
  observacoes_anterior text,
  valor_novo numeric(14,2),
  data_nova date,
  observacoes_nova text,
  motivo text not null,
  alterado_por uuid,
  alterado_em timestamptz not null default now()
);

create index if not exists idx_pag_hist_pagamento on pagamentos_historico(pagamento_id);
create index if not exists idx_pag_hist_emprestimo on pagamentos_historico(emprestimo_id);

alter table pagamentos_historico enable row level security;
-- Mesma política de acesso que as outras tabelas (copia a da tabela pagamentos)
do $$
declare pol record;
begin
  drop policy if exists "acesso_historico" on pagamentos_historico;
  select * into pol from pg_policies where tablename = 'pagamentos' and schemaname = 'public' limit 1;
  if found and pol.qual is not null then
    execute format('create policy "acesso_historico" on pagamentos_historico for all using (%s) with check (%s)',
                   pol.qual, coalesce(pol.with_check, pol.qual));
  else
    create policy "acesso_historico" on pagamentos_historico for all
      using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Validação comum: valor positivo, data entre o desembolso e hoje.
--    (o motor nunca deixa o saldo ficar negativo).
-- ---------------------------------------------------------------------
create or replace function _validar_pagamento(
  p_emprestimo_id uuid, p_valor numeric, p_data date, p_ignorar_pagamento uuid default null
) returns void language plpgsql as $$
declare
  emp record;
begin
  select * into emp from emprestimos where id = p_emprestimo_id;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'O valor do pagamento deve ser maior que zero'; end if;
  if p_data is null then raise exception 'A data do pagamento é obrigatória'; end if;
  if p_data < emp.data_desembolso then
    raise exception 'A data do pagamento (%) não pode ser anterior ao desembolso (%)',
      to_char(p_data, 'DD/MM/YYYY'), to_char(emp.data_desembolso, 'DD/MM/YYYY');
  end if;
  if p_data > current_date then raise exception 'A data do pagamento não pode ser no futuro'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. editar_pagamento: altera valor/data/observações, regista o antes e
--    o depois, e recalcula todo o extrato do empréstimo.
-- ---------------------------------------------------------------------
create or replace function editar_pagamento(
  p_pagamento_id uuid,
  p_valor numeric,
  p_data_pagamento date,
  p_observacoes text default null,
  p_motivo text default null
) returns void language plpgsql as $$
declare
  pag record;
begin
  select * into pag from pagamentos where id = p_pagamento_id for update;
  if not found then raise exception 'Pagamento não encontrado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica o motivo da alteração'; end if;

  perform _validar_pagamento(pag.emprestimo_id, p_valor, p_data_pagamento, p_pagamento_id);

  insert into pagamentos_historico (pagamento_id, codigo_pagamento, emprestimo_id, acao,
    valor_anterior, data_anterior, observacoes_anterior, valor_novo, data_nova, observacoes_nova, motivo, alterado_por)
  values (pag.id, pag.codigo, pag.emprestimo_id, 'edicao',
    pag.valor, pag.data_pagamento, pag.observacoes, p_valor, p_data_pagamento, p_observacoes, trim(p_motivo), auth.uid());

  update pagamentos
     set valor = p_valor, data_pagamento = p_data_pagamento, observacoes = p_observacoes
   where id = p_pagamento_id;

  perform recompute_emprestimo(pag.emprestimo_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. anular_pagamento: remove um pagamento lançado por engano, guarda o
--    registo completo no histórico e recalcula o empréstimo.
-- ---------------------------------------------------------------------
create or replace function anular_pagamento(p_pagamento_id uuid, p_motivo text)
returns void language plpgsql as $$
declare
  pag record;
begin
  select * into pag from pagamentos where id = p_pagamento_id for update;
  if not found then raise exception 'Pagamento não encontrado'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica o motivo da anulação'; end if;

  insert into pagamentos_historico (pagamento_id, codigo_pagamento, emprestimo_id, acao,
    valor_anterior, data_anterior, observacoes_anterior, motivo, alterado_por)
  values (pag.id, pag.codigo, pag.emprestimo_id, 'anulacao',
    pag.valor, pag.data_pagamento, pag.observacoes, trim(p_motivo), auth.uid());

  delete from pagamentos where id = p_pagamento_id;
  perform recompute_emprestimo(pag.emprestimo_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. registrar_pagamento: agora valida datas e bloqueia pagamentos em
--    empréstimos já liquidados.
-- ---------------------------------------------------------------------
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
  perform _validar_pagamento(p_emprestimo_id, p_valor, p_data_pagamento);
  if exists (select 1 from emprestimos where id = p_emprestimo_id and estado = 'liquidado'
             and (data_ultimo_pagamento is null or data_ultimo_pagamento <= p_data_pagamento)) then
    raise exception 'Este empréstimo já está liquidado';
  end if;

  insert into pagamentos (emprestimo_id, valor, data_pagamento, comprovativo_url, observacoes)
  values (p_emprestimo_id, p_valor, p_data_pagamento, p_comprovativo_url, p_observacoes)
  returning id into v_pagamento_id;

  perform recompute_emprestimo(p_emprestimo_id);
  return v_pagamento_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Dashboard: capital desembolsado só dos créditos activos (ativo +
--    atraso). O total histórico continua disponível noutra coluna.
-- ---------------------------------------------------------------------
drop view if exists view_dashboard_resumo;
create view view_dashboard_resumo as
select
  (select count(*) from clientes where estado = 'ativo') as clientes_ativos_total,
  (select count(distinct cliente_id) from emprestimos where estado in ('ativo','atraso')) as clientes_com_credito_ativo,
  (select count(*) from emprestimos) as total_emprestimos,
  (select count(*) from emprestimos where estado in ('ativo','atraso')) as emprestimos_ativos,
  (select count(*) from emprestimos where estado = 'atraso') as emprestimos_em_atraso,
  (select count(*) from emprestimos where estado = 'liquidado') as emprestimos_liquidados,
  (select coalesce(sum(capital),0) from emprestimos where estado in ('ativo','atraso')) as capital_ativo,
  (select coalesce(sum(capital),0) from emprestimos) as capital_total_emprestado,
  (select coalesce(sum(saldo_atual),0) from emprestimos where estado in ('ativo','atraso')) as saldo_total_em_divida,
  (select coalesce(sum(valor),0) from movimentos where tipo = 'capitalizacao') as juros_gerados_total,
  (select coalesce(sum(valor),0) from pagamentos) as total_recebido;

-- ---------------------------------------------------------------------
-- 7. Extrato com estado e saldo actual do empréstimo + id do pagamento
-- ---------------------------------------------------------------------
drop view if exists view_extrato;
create view view_extrato as
select
  m.id as movimento_id,
  m.emprestimo_id,
  e.codigo as codigo_emprestimo,
  e.estado as estado_emprestimo,
  e.saldo_atual as saldo_atual_emprestimo,
  cl.id as cliente_id,
  cl.nome_completo,
  m.tipo,
  m.valor,
  m.saldo_apos,
  m.data_movimento,
  m.codigo_pagamento,
  p.id as pagamento_id,
  m.comprovativo_url,
  m.observacoes
from movimentos m
join emprestimos e on e.id = m.emprestimo_id
join clientes cl on cl.id = e.cliente_id
left join pagamentos p on p.codigo = m.codigo_pagamento
order by m.data_movimento asc, m.created_at asc;

-- ---------------------------------------------------------------------
-- 8. Verificação de integridade: devolve linhas só se algo não bater.
--    Uso: select * from verificar_integridade();
-- ---------------------------------------------------------------------
create or replace function verificar_integridade()
returns table(codigo_emprestimo text, problema text) language sql as $$
  -- saldo do empréstimo diferente da soma dos movimentos do extrato
  select e.codigo, 'Saldo do empréstimo (' || e.saldo_atual || ') difere da soma do extrato (' || greatest(s.total, 0) || ')'
    from emprestimos e
    join (select emprestimo_id, sum(valor) total from movimentos group by emprestimo_id) s on s.emprestimo_id = e.id
   where abs(e.saldo_atual - greatest(s.total, 0)) > 0.01
  union all
  -- pagamentos que não aparecem no extrato
  select e.codigo, 'Pagamento ' || p.codigo || ' não aparece no extrato'
    from pagamentos p join emprestimos e on e.id = p.emprestimo_id
   where not exists (select 1 from movimentos m where m.codigo_pagamento = p.codigo)
     and e.estado <> 'liquidado'
  union all
  -- estado incoerente com o saldo
  select e.codigo, 'Estado "' || e.estado || '" com saldo ' || e.saldo_atual
    from emprestimos e
   where (e.estado = 'liquidado' and e.saldo_atual > 0.01)
      or (e.estado <> 'liquidado' and e.saldo_atual <= 0.005);
$$;

-- Garante que tudo está recalculado com as regras actuais
select processar_capitalizacoes();
