import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Emprestimo, PosicaoEmprestimo, TipoJuro } from '@/types/database.types';

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
  tipo_juro: TipoJuro;
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
        p_tipo_juro: input.tipo_juro,
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

/** Taxa diária equivalente (base 30 dias): (1 + mensal)^(1/30) - 1 */
export function taxaDiaria(taxaMensal: number) {
  return Math.pow(1 + taxaMensal, 1 / 30) - 1;
}

/** Quanto se deve numa data, nas duas regras (mensal e diária). */
export function usePosicaoEmprestimo(id: string | undefined, data: string) {
  return useQuery<PosicaoEmprestimo[]>({
    queryKey: ['posicao', id, data],
    enabled: !!id && !!data,
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc('posicao_emprestimo', { p_emprestimo_id: id, p_data: data });
      if (error) throw error;
      return rows as PosicaoEmprestimo[];
    },
  });
}

export function useAlterarTipoJuro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { emprestimo_id: string; tipo_juro: TipoJuro }) => {
      const { error } = await supabase.rpc('alterar_tipo_juro', {
        p_emprestimo_id: input.emprestimo_id,
        p_tipo_juro: input.tipo_juro,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      for (const k of ['emprestimos', 'emprestimo', 'extrato', 'clientes', 'dashboard-resumo', 'cobrancas', 'posicao']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}
