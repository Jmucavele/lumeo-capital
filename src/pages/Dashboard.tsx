import { Wallet, Coins, TrendingUp, Landmark, Users, HandCoins, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Spinner } from '@/components/ui/primitives';
import { useDashboard } from '@/hooks/useDashboard';
import { formatMT } from '@/lib/utils';

const kpis = [
  { key: 'capital_total_emprestado', label: 'Capital Emprestado', icon: Landmark, tone: 'text-ink-700 dark:text-parchment-100' },
  { key: 'saldo_total_em_divida', label: 'Saldo em Dívida', icon: Wallet, tone: 'text-brass-600 dark:text-brass-400' },
  { key: 'juros_gerados_total', label: 'Juros Gerados', icon: TrendingUp, tone: 'text-moss-600 dark:text-moss-400' },
  { key: 'total_recebido', label: 'Total Recebido', icon: Coins, tone: 'text-moss-600 dark:text-moss-400' },
] as const;

const counts = [
  { key: 'clientes_ativos_total', label: 'Clientes Ativos', icon: Users },
  { key: 'emprestimos_ativos', label: 'Empréstimos Ativos', icon: HandCoins },
  { key: 'emprestimos_em_atraso', label: 'Em Atraso', icon: AlertTriangle },
  { key: 'emprestimos_liquidados', label: 'Liquidados', icon: CheckCircle2 },
] as const;

export function Dashboard() {
  const { data, isLoading, isError } = useDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Painel de Gestão</h1>
        <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
          Resumo actualizado automaticamente da carteira de crédito da LUMEO Capital.
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-ink-500 py-10 justify-center">
          <Spinner /> A processar capitalizações e a carregar dados…
        </div>
      )}

      {isError && (
        <Card className="p-6 text-rust-500 text-sm">
          Não foi possível carregar o resumo. Confirma as variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY em .env.
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpis.map(({ key, label, icon: Icon, tone }) => (
              <Card key={key}>
                <CardHeader>
                  <CardTitle>{label}</CardTitle>
                  <Icon className={`h-4 w-4 ${tone}`} />
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-display font-bold tabular ${tone}`}>{formatMT(data[key])}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {counts.map(({ key, label, icon: Icon }) => (
              <Card key={key}>
                <CardContent className="pt-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-ink-500 dark:text-parchment-200/60">{label}</p>
                    <p className="text-xl font-display font-bold tabular mt-1">{data[key]}</p>
                  </div>
                  <Icon className="h-5 w-5 text-brass-500" />
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Nota sobre o motor de juros</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-ink-600 dark:text-parchment-200/70 space-y-1">
              <p>
                Ao abrir este painel, o sistema já correu <code className="font-mono text-xs bg-ink-100 dark:bg-ink-800 px-1 rounded">processar_capitalizacoes()</code>{' '}
                para qualquer data de aniversário vencida — os saldos acima já incluem os juros mais recentes.
              </p>
              <p>
                Para não depender de alguém abrir a app, agenda a mesma função com pg_cron no Supabase (instrução comentada no fim de{' '}
                <code className="font-mono text-xs bg-ink-100 dark:bg-ink-800 px-1 rounded">supabase/schema.sql</code>).
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
