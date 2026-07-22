import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ViewCobrancas, ViewExtrato } from '@/types/database.types';

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emprestimos'] });
      qc.invalidateQueries({ queryKey: ['emprestimo'] });
      qc.invalidateQueries({ queryKey: ['extrato'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['dashboard-resumo'] });
      qc.invalidateQueries({ queryKey: ['cobrancas'] });
    },
  });
}

export function useExtrato(emprestimoId?: string) {
  return useQuery<ViewExtrato[]>({
    queryKey: ['extrato', emprestimoId ?? 'todos'],
    queryFn: async () => {
      let query = supabase.from('view_extrato').select('*').order('data_movimento', { ascending: true });
      if (emprestimoId) query = query.eq('emprestimo_id', emprestimoId);
      const { data, error } = await query.limit(500);
      if (error) throw error;
      return data as ViewExtrato[];
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
