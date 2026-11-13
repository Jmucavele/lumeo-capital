import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PagamentoHistorico, ViewCobrancas, ViewExtrato } from '@/types/database.types';

export interface NovoPagamentoInput {
  emprestimo_id: string;
  valor: number;
  data_pagamento: string; // 'YYYY-MM-DD' — a data em que o pagamento realmente aconteceu
  comprovativo_url?: string;
  observacoes?: string;
}

/** Regista um pagamento (parcial ou total), com a data real em que
 * aconteceu — pode ser retroactiva. O motor de juros recalcula todo o
 * extrato do empréstimo a partir daí (ver recompute_emprestimo no SQL). */
function invalidarTudo(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['emprestimos', 'emprestimo', 'extrato', 'clientes', 'dashboard-resumo', 'cobrancas', 'pagamentos-historico']) {
    qc.invalidateQueries({ queryKey: [k] });
  }
}

/** Mensagem legível a partir de um erro do Supabase/Postgres. */
export function mensagemErro(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: string }).message);
  return 'Ocorreu um erro inesperado. Tenta novamente.';
}

export interface EditarPagamentoInput {
  pagamento_id: string;
  valor: number;
  data_pagamento: string;
  observacoes?: string | null;
  motivo: string;
}

/** Edita um pagamento já registado. O motor recalcula todo o extrato e o
 * antes/depois fica gravado em pagamentos_historico. */
export function useEditarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditarPagamentoInput) => {
      const { error } = await supabase.rpc('editar_pagamento', {
        p_pagamento_id: input.pagamento_id,
        p_valor: input.valor,
        p_data_pagamento: input.data_pagamento,
        p_observacoes: input.observacoes ?? null,
        p_motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidarTudo(qc),
  });
}

/** Anula (remove) um pagamento lançado por engano, guardando-o no histórico. */
export function useAnularPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pagamento_id: string; motivo: string }) => {
      const { error } = await supabase.rpc('anular_pagamento', {
        p_pagamento_id: input.pagamento_id,
        p_motivo: input.motivo,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidarTudo(qc),
  });
}

export function useHistoricoPagamentos() {
  return useQuery<PagamentoHistorico[]>({
    queryKey: ['pagamentos-historico'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagamentos_historico')
        .select('*')
        .order('alterado_em', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as PagamentoHistorico[];
    },
  });
}

const ordemTipo: Record<string, number> = { desembolso: 0, pagamento: 1, capitalizacao: 2, ajuste: 3 };

export function useRegistrarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovoPagamentoInput) => {
      const { data, error } = await supabase.rpc('registrar_pagamento', {
        p_emprestimo_id: input.emprestimo_id,
        p_valor: input.valor,
        p_data_pagamento: input.data_pagamento,
        p_comprovativo_url: input.comprovativo_url ?? null,
        p_observacoes: input.observacoes ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidarTudo(qc),
  });
}

export function useExtrato(emprestimoId?: string) {
  return useQuery<ViewExtrato[]>({
    queryKey: ['extrato', emprestimoId ?? 'todos'],
    queryFn: async () => {
      const novaQuery = () => {
        let q = supabase.from('view_extrato').select('*').order('data_movimento', { ascending: true }).order('movimento_id');
        if (emprestimoId) q = q.eq('emprestimo_id', emprestimoId);
        return q;
      };
      // Sem limite fixo de 500: busca em páginas para não "perder" movimentos
      // quando a carteira crescer.
      const todos: ViewExtrato[] = [];
      const passo = 1000;
      for (let de = 0; ; de += passo) {
        const { data, error } = await novaQuery().range(de, de + passo - 1);
        if (error) throw error;
        todos.push(...(data as ViewExtrato[]));
        if (!data || data.length < passo) break;
      }
      // Mesmo dia: desembolso primeiro, depois pagamento, depois capitalização
      // (é a ordem em que o motor de juros os aplica).
      return todos.sort(
        (a, b) =>
          a.data_movimento.localeCompare(b.data_movimento) ||
          (ordemTipo[a.tipo] ?? 9) - (ordemTipo[b.tipo] ?? 9)
      );
    },
  });
}

export function useCobrancas() {
  return useQuery<ViewCobrancas[]>({
    queryKey: ['cobrancas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('view_cobrancas').select('*');
      if (error) throw error;
      return data as ViewCobrancas[];
    },
  });
}
