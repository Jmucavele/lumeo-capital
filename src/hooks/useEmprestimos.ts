import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Emprestimo } from '@/types/database.types';

export interface EmprestimoComCliente extends Emprestimo {
  clientes: { nome_completo: string; codigo: string } | null;
}

export function useEmprestimos(estado?: string) {
  return useQuery<EmprestimoComCliente[]>({
    queryKey: ['emprestimos', estado ?? 'todos'],
    queryFn: async () => {
      let query = supabase
        .from('emprestimos')
        .select('*, clientes ( nome_completo, codigo )')
        .order('created_at', { ascending: false });
      if (estado && estado !== 'todos') query = query.eq('estado', estado);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as EmprestimoComCliente[];
    },
  });
}

export function useEmprestimo(id: string | undefined) {
  return useQuery<EmprestimoComCliente>({
    queryKey: ['emprestimo', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emprestimos')
        .select('*, clientes ( nome_completo, codigo )')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as EmprestimoComCliente;
    },
  });
}

export interface NovoDesembolsoInput {
  cliente_id: string;
  capital: number;
  taxa_juro: number;
  data_desembolso: string;
  observacoes?: string;
}

/** Cria o empréstimo chamando a função SQL registrar_desembolso, que já
 * aplica a capitalização imediata do 1º ciclo dentro da transacção. */
export function useCriarEmprestimo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovoDesembolsoInput) => {
      const { data, error } = await supabase.rpc('registrar_desembolso', {
        p_cliente_id: input.cliente_id,
        p_capital: input.capital,
        p_taxa_juro: input.taxa_juro,
        p_data_desembolso: input.data_desembolso,
        p_observacoes: input.observacoes ?? null,
      });
      if (error) throw error;
      return data as string; // id do novo empréstimo
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['emprestimos'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['dashboard-resumo'] });
    },
  });
}
