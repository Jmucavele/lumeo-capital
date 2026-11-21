-- =====================================================================
-- LUMEO Capital — Migração v8: Contratos, Caixa e Relatórios
-- ---------------------------------------------------------------------
-- SÓ ACRESCENTA objectos novos. Não altera nem apaga nenhuma linha das
-- tabelas existentes (clientes, emprestimos, pagamentos, movimentos).
-- Pode ser corrida mais de uma vez sem problema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CONTRATOS — dados do contrato de mútuo de cada empréstimo.
--    Os dados extra do mutuário (NUIT, profissão, etc.) ficam AQUI,
--    para não mexer na ficha do cliente já gravada.
-- ---------------------------------------------------------------------
create sequence if not exists seq_contrato;

create table if not exists contratos (
  id             uuid primary key default gen_random_uuid(),
  emprestimo_id  uuid not null unique references emprestimos(id) on delete cascade,
  numero         text not null unique,
  data_contrato  date not null default current_date,
  dados          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Número no formato LC/0001/2026
create or replace function gerar_numero_contrato(p_data date default current_date)
returns text language sql as $$
  select 'LC/' || lpad(nextval('seq_contrato')::text, 4, '0') || '/' || extract(year from p_data)::int;
$$;

create or replace function guardar_contrato(p_emprestimo_id uuid, p_data_contrato date, p_dados jsonb)
returns contratos language plpgsql as $$
declare v contratos;
begin
  update contratos
     set dados = coalesce(p_dados, '{}'::jsonb),
         data_contrato = coalesce(p_data_contrato, data_contrato),
         updated_at = now()
   where emprestimo_id = p_emprestimo_id
  returning * into v;
  if found then return v; end if;

  insert into contratos (emprestimo_id, numero, data_contrato, dados)
  values (p_emprestimo_id, gerar_numero_contrato(coalesce(p_data_contrato, current_date)),
          coalesce(p_data_contrato, current_date), coalesce(p_dados, '{}'::jsonb))
  returning * into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 2. CAIXA — movimentos manuais (capital próprio, despesas, levantamentos…).
--    Desembolsos e pagamentos entram no caixa automaticamente pela view.
-- ---------------------------------------------------------------------
create table if not exists caixa_movimentos (
  id          uuid primary key default gen_random_uuid(),
  data        date not null default current_date,
  tipo        text not null check (tipo in ('entrada', 'saida')),
  categoria   text not null,
  conta       text not null default 'numerario',
  descricao   text,
  valor       numeric(14,2) not null check (valor > 0),
  created_at  timestamptz not null default now()
);
create index if not exists idx_caixa_data on caixa_movimentos(data);

-- Caixa consolidado: manual + desembolsos (saída) + pagamentos (entrada)
create or replace view view_caixa with (security_invoker = true) as
  select c.id::text            as id,
         c.data                as data,
         c.tipo                as tipo,
         c.categoria           as categoria,
         c.conta               as conta,
         c.descricao           as descricao,
         c.valor               as valor,
         'manual'::text        as origem,
         null::uuid            as emprestimo_id
    from caixa_movimentos c
  union all
  select 'D-' || e.id::text, e.data_desembolso, 'saida', 'Desembolso de crédito', 'numerario',
         e.codigo || ' — ' || cl.nome_completo, e.capital, 'automatico', e.id
    from emprestimos e join clientes cl on cl.id = e.cliente_id
  union all
  select 'P-' || p.id::text, p.data_pagamento, 'entrada', 'Reembolso de crédito', 'numerario',
         e.codigo || ' — ' || cl.nome_completo || coalesce(' (' || p.codigo || ')', ''), p.valor, 'automatico', e.id
    from pagamentos p
    join emprestimos e on e.id = p.emprestimo_id
    join clientes cl on cl.id = e.cliente_id;

-- ---------------------------------------------------------------------
-- 3. Acesso (RLS) — copia a política que já está em vigor na tabela
--    pagamentos, para as tabelas novas terem exactamente o mesmo acesso.
-- ---------------------------------------------------------------------
alter table contratos enable row level security;
alter table caixa_movimentos enable row level security;

do $$
declare pol record; t text; v_tem boolean;
begin
  select * into pol from pg_policies where tablename = 'pagamentos' and schemaname = 'public' limit 1;
  v_tem := found;
  foreach t in array array['contratos', 'caixa_movimentos'] loop
    execute format('drop policy if exists "acesso_lumeo" on %I', t);
    if v_tem and pol.qual is not null then
      execute format('create policy "acesso_lumeo" on %I for all using (%s) with check (%s)',
                     t, pol.qual, coalesce(pol.with_check, pol.qual));
    else
      execute format('create policy "acesso_lumeo" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on contratos, caixa_movimentos to anon, authenticated;
grant usage on sequence seq_contrato to anon, authenticated;
grant select on view_caixa to anon, authenticated;
grant execute on function guardar_contrato(uuid, date, jsonb) to anon, authenticated;
grant execute on function gerar_numero_contrato(date) to anon, authenticated;
