import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Emprestimo, ViewExtrato } from '@/types/database.types';

export interface MovimentoCaixa {
  id: string;
  data: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  conta: string;
  descricao: string | null;
  valor: number;
  origem: 'manual' | 'automatico';
  emprestimo_id: string | null;
}

export const CATEGORIAS_ENTRADA = ['Capital próprio / Injecção', 'Empréstimo obtido', 'Comissões de abertura', 'Outras receitas'];
export const CATEGORIAS_SAIDA = [
  'Renda e instalações',
  'Salários e honorários',
  'Comunicações e internet',
  'Transporte e combustível',
  'Material de escritório',
  'Taxas, licenças e impostos',
  'Comissões bancárias / carteira móvel',
  'Despesas de cobrança',
  'Levantamento do proprietário',
  'Outras despesas',
];
export const CONTAS: Record<string, string> = {
  numerario: 'Numerário',
  banco: 'Standard Bank',
  mpesa: 'M-Pesa',
  emola: 'e-Mola / Movitel',
};
/** Categorias que NÃO são custo operacional (entram no caixa mas não no resultado). */
export const CATEGORIAS_NAO_RESULTADO = ['Levantamento do proprietário', 'Capital próprio / Injecção', 'Empréstimo obtido'];

export function useCaixa() {
  return useQuery<MovimentoCaixa[]>({
    queryKey: ['caixa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('view_caixa').select('*').order('data', { ascending: true });
      if (error) throw error;
      return (data as MovimentoCaixa[]).map((m) => ({ ...m, valor: Number(m.valor) }));
    },
  });
}

export interface NovoMovimentoCaixa {
  data: string;
  tipo: 'entrada' | 'saida';
  categoria: string;
  conta: string;
  descricao?: string;
  valor: number;
}

export function useRegistarCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NovoMovimentoCaixa) => {
      const { error } = await supabase.from('caixa_movimentos').insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caixa'] }),
  });
}

/** Só apaga lançamentos manuais do caixa (nunca desembolsos/pagamentos). */
export function useApagarCaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('caixa_movimentos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caixa'] }),
  });
}

/** Dados base para os relatórios — só leitura. */
export function useDadosRelatorios() {
  return useQuery({
    queryKey: ['relatorios-base'],
    queryFn: async () => {
      const [emp, mov] = await Promise.all([
        supabase.from('emprestimos').select('*, clientes ( nome_completo, codigo, contacto )'),
        supabase.from('view_extrato').select('*').order('data_movimento', { ascending: true }),
      ]);
      if (emp.error) throw emp.error;
      if (mov.error) throw mov.error;
      return {
        emprestimos: emp.data as (Emprestimo & { clientes: { nome_completo: string; codigo: string; contacto: string | null } | null })[],
        movimentos: (mov.data as ViewExtrato[]).map((m) => ({ ...m, valor: Number(m.valor), saldo_apos: Number(m.saldo_apos) })),
      };
    },
  });
}
