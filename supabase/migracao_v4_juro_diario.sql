-- =====================================================================
-- LUMEO CAPITAL — Migração v4: juro DIÁRIO COMPOSTO + posição à data
--
-- Cada empréstimo passa a ter um "tipo de juro":
--   'mensal' (actual) : a taxa mensal é capitalizada por inteiro no dia do
--                       desembolso e depois em cada aniversário.
--   'diario'          : a taxa mensal é convertida numa taxa diária
--                       equivalente, base 30 dias:
--                          taxa_diaria = (1 + taxa_mensal)^(1/30) - 1
--                       e o juro cresce dia a dia (composto). Ao fim de 30
--                       dias sem pagamentos a dívida cresceu exactamente a
--                       taxa mensal. O juro é lançado no extrato em cada
--                       aniversário e no dia de cada pagamento.
--
-- Nova função posicao_emprestimo(id, data): devolve quanto o cliente
-- deve numa data, nas DUAS regras (mensal e diária), para comparação.
--
-- Os empréstimos existentes ficam todos como 'mensal' — nada muda neles.
-- Como aplicar: SQL Editor → New query → colar tudo → Run. Pode correr
-- mais de uma vez. Não apaga dados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Novo campo
-- ---------------------------------------------------------------------
alter table emprestimos add column if not exists tipo_juro text not null default 'mensal';
do $$ begin
  alter table emprestimos add constraint emprestimos_tipo_juro_chk check (tipo_juro in ('mensal', 'diario'));
exception when duplicate_object then null; end $$;

create or replace function taxa_diaria_equivalente(p_taxa_mensal numeric)
returns numeric language sql immutable as $$
  select power(1 + p_taxa_mensal, 1.0 / 30) - 1;
$$;

-- ---------------------------------------------------------------------
-- 2. MOTOR ÚNICO. Percorre o empréstimo em ordem cronológica até
--    p_data_referencia, segundo a regra p_regime. Se p_gravar = true,
--    reconstrói a tabela movimentos (só para o regime do próprio
--    empréstimo). Devolve o saldo lançado + o juro diário ainda por
--    lançar até à data de referência.
-- ---------------------------------------------------------------------
create or replace function _motor_juros(
  p_emprestimo_id uuid,
  p_regime text,
  p_data_referencia date,
  p_gravar boolean
) returns table(
  saldo numeric, juro_por_lancar numeric, proxima date, ultimo_pagamento date,
  ultimo_evento date, total_pago numeric
) language plpgsql as $$
declare
  emp record;
  v_postado numeric(14,2);       -- saldo já lançado no extrato
  v_exacto numeric;              -- saldo com juro diário a correr (sem arredondar)
  v_d numeric;                   -- taxa diária
  v_juro numeric(14,2);
  v_ultimo date;                 -- data até onde o juro diário já foi calculado
  v_proxima date;
  v_ciclo int := 0;
  v_ult_pag date := null;
  v_pago numeric(14,2) := 0;
  pag_codigos text[]; pag_valores numeric[]; pag_datas date[]; pag_obs text[]; pag_comp text[];
  n int; i int := 1;
begin
  select * into emp from emprestimos where id = p_emprestimo_id;
  if not found then return; end if;

  if p_gravar then delete from movimentos where emprestimo_id = p_emprestimo_id; end if;

  select array_agg(codigo order by data_pagamento, created_at),
         array_agg(valor order by data_pagamento, created_at),
         array_agg(data_pagamento order by data_pagamento, created_at),
         array_agg(coalesce(observacoes,'') order by data_pagamento, created_at),
         array_agg(comprovativo_url order by data_pagamento, created_at)
    into pag_codigos, pag_valores, pag_datas, pag_obs, pag_comp
    from pagamentos where emprestimo_id = p_emprestimo_id;
  n := coalesce(array_length(pag_codigos, 1), 0);

  -- Desembolso
  v_postado := emp.capital;
  if p_gravar then
    insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
    values (p_emprestimo_id, 'desembolso', emp.capital, emp.capital, emp.data_desembolso, 'Desembolso do capital');
  end if;

  if p_regime = 'mensal' then
    -- ===================== REGRA MENSAL (igual à v2/v3) =====================
    v_juro := round(emp.capital * emp.taxa_juro, 2);
    v_postado := round(emp.capital + v_juro, 2);
    if p_gravar then
      insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
      values (p_emprestimo_id, 'capitalizacao', v_juro, v_postado, emp.data_desembolso,
              'Capitalização inicial do 1º ciclo (imediata, sem carência)');
    end if;
    v_proxima := add_months_clamped(emp.data_desembolso, 1);
    v_ultimo := emp.data_desembolso;

    while v_postado > 0.005 loop
      if i <= n and pag_datas[i] <= p_data_referencia
         and (v_proxima > p_data_referencia or pag_datas[i] <= v_proxima) then
        v_postado := round(greatest(v_postado - pag_valores[i], 0), 2);
        v_pago := v_pago + pag_valores[i];
        if p_gravar then
          insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, codigo_pagamento, comprovativo_url, observacoes)
          values (p_emprestimo_id, 'pagamento', -pag_valores[i], v_postado, pag_datas[i], pag_codigos[i], pag_comp[i], pag_obs[i]);
        end if;
        v_ult_pag := pag_datas[i]; v_ultimo := pag_datas[i];
        i := i + 1;
      elsif v_proxima <= p_data_referencia then
        v_juro := round(v_postado * emp.taxa_juro, 2);
        v_postado := round(v_postado + v_juro, 2);
        if p_gravar then
          insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
          values (p_emprestimo_id, 'capitalizacao', v_juro, v_postado, v_proxima, 'Capitalização automática na data de aniversário');
        end if;
        v_ultimo := v_proxima;
        v_ciclo := v_ciclo + 1;
        v_proxima := add_months_clamped(emp.data_desembolso, v_ciclo + 1);
      else
        exit;
      end if;
    end loop;

    return query select v_postado::numeric, 0::numeric, v_proxima, v_ult_pag, v_ultimo, v_pago::numeric;
    return;
  end if;

  -- ======================= REGRA DIÁRIA COMPOSTA =======================
  v_d := taxa_diaria_equivalente(emp.taxa_juro);
  v_exacto := emp.capital;
  v_ultimo := emp.data_desembolso;
  v_proxima := add_months_clamped(emp.data_desembolso, 1);

  while v_postado > 0.005 loop
    if i <= n and pag_datas[i] <= p_data_referencia
       and (v_proxima > p_data_referencia or pag_datas[i] <= v_proxima) then
      -- juro dos dias desde o último evento até ao pagamento
      v_exacto := v_exacto * power(1 + v_d, pag_datas[i] - v_ultimo);
      v_juro := round(v_exacto - v_postado, 2);
      if v_juro > 0 then
        v_postado := v_postado + v_juro;
        if p_gravar then
          insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
          values (p_emprestimo_id, 'capitalizacao', v_juro, v_postado, pag_datas[i],
                  'Juro diário composto (' || (pag_datas[i] - v_ultimo) || ' dias) até ao pagamento');
        end if;
      end if;
      v_postado := round(greatest(v_postado - pag_valores[i], 0), 2);
      v_exacto := v_postado;
      v_pago := v_pago + pag_valores[i];
      if p_gravar then
        insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, codigo_pagamento, comprovativo_url, observacoes)
        values (p_emprestimo_id, 'pagamento', -pag_valores[i], v_postado, pag_datas[i], pag_codigos[i], pag_comp[i], pag_obs[i]);
      end if;
      v_ultimo := pag_datas[i]; v_ult_pag := pag_datas[i];
      i := i + 1;
    elsif v_proxima <= p_data_referencia then
      -- fecho do ciclo no aniversário
      v_exacto := v_exacto * power(1 + v_d, v_proxima - v_ultimo);
      v_juro := round(v_exacto - v_postado, 2);
      v_postado := v_postado + v_juro;
      v_exacto := v_postado;
      if p_gravar and v_juro > 0 then
        insert into movimentos (emprestimo_id, tipo, valor, saldo_apos, data_movimento, observacoes)
        values (p_emprestimo_id, 'capitalizacao', v_juro, v_postado, v_proxima,
                'Juro diário composto (' || (v_proxima - v_ultimo) || ' dias) — fecho do ciclo');
      end if;
      v_ultimo := v_proxima;
      v_ciclo := v_ciclo + 1;
      v_proxima := add_months_clamped(emp.data_desembolso, v_ciclo + 1);
    else
      exit;
    end if;
  end loop;

  -- juro que já correu desde o último evento até à data de referência
  if v_postado > 0.005 and p_data_referencia > v_ultimo then
    v_juro := round(v_exacto * power(1 + v_d, p_data_referencia - v_ultimo) - v_postado, 2);
  else
    v_juro := 0;
  end if;

  return query select v_postado::numeric, v_juro::numeric, v_proxima, v_ult_pag, v_ultimo, v_pago::numeric;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. recompute_emprestimo passa a usar o motor, com o regime do empréstimo
-- ---------------------------------------------------------------------
create or replace function recompute_emprestimo(p_emprestimo_id uuid, p_data_referencia date default current_date)
returns void language plpgsql as $$
declare
  emp record;
  r record;
begin
  select * into emp from emprestimos where id = p_emprestimo_id for update;
  if not found then return; end if;

  select * into r from _motor_juros(p_emprestimo_id, emp.tipo_juro, p_data_referencia, true);

  update emprestimos
     set saldo_atual = r.saldo,
         data_proxima_capitalizacao = r.proxima,
         data_ultimo_pagamento = r.ultimo_pagamento,
         estado = case
                    when r.saldo <= 0.005 then 'liquidado'::estado_emprestimo
                    when (p_data_referencia - coalesce(r.ultimo_pagamento, emp.data_desembolso)) > 30 then 'atraso'::estado_emprestimo
                    else 'ativo'::estado_emprestimo
                  end,
         updated_at = now()
   where id = p_emprestimo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. posicao_emprestimo: quanto se deve numa data, nas duas regras.
--    Uso: select * from posicao_emprestimo('<id>', '2026-11-20');
-- ---------------------------------------------------------------------
create or replace function posicao_emprestimo(p_emprestimo_id uuid, p_data date default current_date)
returns table(
  regime text, data_referencia date, saldo numeric, juro_acumulado numeric,
  dias_desde_ultimo_evento int, total_pago numeric
) language plpgsql as $$
declare
  reg text;
  r record;
begin
  foreach reg in array array['mensal', 'diario'] loop
    select * into r from _motor_juros(p_emprestimo_id, reg, p_data, false);
    if found then
      regime := reg;
      data_referencia := p_data;
      saldo := round(r.saldo + r.juro_por_lancar, 2);
      juro_acumulado := r.juro_por_lancar;
      dias_desde_ultimo_evento := greatest(p_data - r.ultimo_evento, 0);
      total_pago := r.total_pago;
      return next;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. registrar_desembolso com tipo de juro
-- ---------------------------------------------------------------------
drop function if exists registrar_desembolso(uuid, numeric, numeric, date, text);
create or replace function registrar_desembolso(
  p_cliente_id uuid,
  p_capital numeric,
  p_taxa_juro numeric,
  p_data_desembolso date,
  p_observacoes text default null,
  p_tipo_juro text default 'mensal'
) returns uuid language plpgsql as $$
declare
  v_emprestimo_id uuid;
begin
  if p_capital <= 0 then raise exception 'Capital deve ser maior que zero'; end if;
  if p_taxa_juro < 0 then raise exception 'Taxa de juro não pode ser negativa'; end if;
  if p_tipo_juro not in ('mensal', 'diario') then raise exception 'Tipo de juro inválido'; end if;

  insert into emprestimos (
    cliente_id, capital, taxa_juro, tipo_juro, data_desembolso, dia_aniversario,
    data_proxima_capitalizacao, saldo_atual, estado, observacoes
  ) values (
    p_cliente_id, p_capital, p_taxa_juro, p_tipo_juro, p_data_desembolso,
    extract(day from p_data_desembolso)::int,
    add_months_clamped(p_data_desembolso, 1), p_capital, 'ativo', p_observacoes
  ) returning id into v_emprestimo_id;

  perform recompute_emprestimo(v_emprestimo_id);
  return v_emprestimo_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Mudar o tipo de juro de um empréstimo existente (recalcula tudo)
-- ---------------------------------------------------------------------
create or replace function alterar_tipo_juro(p_emprestimo_id uuid, p_tipo_juro text)
returns void language plpgsql as $$
begin
  if p_tipo_juro not in ('mensal', 'diario') then raise exception 'Tipo de juro inválido'; end if;
  update emprestimos set tipo_juro = p_tipo_juro, updated_at = now() where id = p_emprestimo_id;
  if not found then raise exception 'Empréstimo não encontrado'; end if;
  perform recompute_emprestimo(p_emprestimo_id);
end;
$$;

-- processar_capitalizacoes já chama recompute_emprestimo: não precisa de mudar.
select processar_capitalizacoes();
