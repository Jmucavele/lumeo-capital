import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DadosContrato } from '@/lib/contrato';

export interface Contrato {
  id: string;
  emprestimo_id: string;
  numero: string;
  data_contrato: string;
  dados: DadosContrato;
  created_at: string;
  updated_at: string;
}

export function useContrato(emprestimoId: string | undefined) {
  return useQuery<Contrato | null>({
    queryKey: ['contrato', emprestimoId],
    enabled: !!emprestimoId,
    queryFn: async () => {
      const { data, error } = await supabase.from('contratos').select('*').eq('emprestimo_id', emprestimoId).maybeSingle();
      if (error) throw error;
      return (data as Contrato) ?? null;
    },
  });
}

/** Grava (ou actualiza) os dados do contrato. Não mexe na ficha do cliente. */
export function useGuardarContrato() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { emprestimo_id: string; data_contrato: string; dados: DadosContrato }) => {
      const { data, error } = await supabase.rpc('guardar_contrato', {
        p_emprestimo_id: input.emprestimo_id,
        p_data_contrato: input.data_contrato,
        p_dados: input.dados,
      });
      if (error) throw error;
      return data as Contrato;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['contrato', vars.emprestimo_id] }),
  });
}
