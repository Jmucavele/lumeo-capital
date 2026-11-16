-- =====================================================================
-- Migração v6 — Apagar um cliente e TODO o seu histórico
-- Correr uma vez no SQL Editor do Supabase.
-- Apaga, numa só transacção: histórico de alterações de pagamentos,
-- movimentos (extracto), pagamentos, empréstimos e o próprio cliente.
-- É IRREVERSÍVEL. Para evitar enganos, exige o código do cliente
-- (ex.: 'C005') como confirmação.
-- =====================================================================
create or replace function apagar_cliente(p_cliente_id uuid, p_confirmacao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Sem permissão.';
  end if;

  select codigo into v_codigo from clientes where id = p_cliente_id;
  if v_codigo is null then
    raise exception 'Cliente não encontrado.';
  end if;
  if upper(trim(coalesce(p_confirmacao, ''))) <> upper(v_codigo) then
    raise exception 'Confirmação incorrecta: escreva o código do cliente (%).', v_codigo;
  end if;

  delete from pagamentos_historico
   where emprestimo_id in (select id from emprestimos where cliente_id = p_cliente_id);
  delete from movimentos
   where emprestimo_id in (select id from emprestimos where cliente_id = p_cliente_id);
  delete from pagamentos
   where emprestimo_id in (select id from emprestimos where cliente_id = p_cliente_id);
  delete from emprestimos where cliente_id = p_cliente_id;
  delete from clientes where id = p_cliente_id;
end;
$$;

revoke all on function apagar_cliente(uuid, text) from public, anon;
grant execute on function apagar_cliente(uuid, text) to authenticated;
