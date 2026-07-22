import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ViewDashboardResumo } from '@/types/database.types';

/**
 * Ao carregar o Dashboard, primeiro corremos o motor de juros
 * (processar_capitalizacoes) para garantir que qualquer data de
 * aniversário vencida desde a última visita é capitalizada antes
 * de mostrarmos os números. Depois lemos a view de resumo.
 *
 * Em produção o ideal é agendar processar_capitalizacoes() via
 * pg_cron (ver fim de supabase/schema.sql) para não depender de
 * alguém abrir a app no dia certo — mas correr aqui também garante
 * correcção mesmo sem cron activo.
 */
export function useDashboard() {
  const queryClient = useQueryClient();

  return useQuery<ViewDashboardResumo>({
    queryKey: ['dashboard-resumo'],
    queryFn: async () => {
      await supabase.rpc('processar_capitalizacoes');
      queryClient.invalidateQueries({ queryKey: ['emprestimos'] });
      queryClient.invalidateQueries({ queryKey: ['cobrancas'] });

      const { data, error } = await supabase.from('view_dashboard_resumo').select('*').single();
      if (error) throw error;
      return data as ViewDashboardResumo;
    },
    staleTime: 60_000,
  });
}
