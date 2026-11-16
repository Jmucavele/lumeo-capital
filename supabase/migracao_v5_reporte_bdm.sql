-- =====================================================================
-- Migração v5 — Reporte mensal ao Banco de Moçambique
-- Correr uma vez no SQL Editor do Supabase.
--   * clientes.sexo            → quadro 2.1.4 (Carteira de clientes)
--   * emprestimos.finalidade   → quadro 2.1.3 (Sector de actividade)
--   * emprestimos.incluir_reporte_bdm → permite marcar créditos que não
--     pertencem à carteira da instituição (ex.: créditos pessoais)
-- =====================================================================
alter table clientes add column if not exists sexo text
  check (sexo in ('M', 'F', 'O'));

alter table emprestimos add column if not exists finalidade text
  check (finalidade in ('comercio', 'agricultura', 'negocio', 'industria', 'servicos', 'consumo', 'outros'));

alter table emprestimos add column if not exists incluir_reporte_bdm boolean not null default true;
