import { Link } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { useCobrancas } from '@/hooks/usePagamentos';
import { EmptyState, Spinner, Badge } from '@/components/ui/primitives';
import { formatDate, formatMT } from '@/lib/utils';

export function Cobrancas() {
  const { data, isLoading } = useCobrancas();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Cobranças</h1>
        <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
          Clientes sem qualquer pagamento há mais de 30 dias.{' '}
          <span className="text-ink-400">(critério ajustável em <code className="font-mono text-xs bg-ink-100 dark:bg-ink-800 px-1 rounded">view_cobrancas</code>)</span>
        </p>
      </div>

      <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="Nenhum cliente em atraso" description="Todos os clientes estão em dia com os pagamentos." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Empréstimo</th>
                <th className="px-5 py-3 font-medium">Saldo em Dívida</th>
                <th className="px-5 py-3 font-medium">Último Pagamento</th>
                <th className="px-5 py-3 font-medium">Dias sem Pagar</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.emprestimo_id} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                  <td className="px-5 py-3 font-medium">
                    <Link to={`/clientes/${c.cliente_id}`} className="hover:text-brass-500">{c.nome_completo}</Link>
                  </td>
                  <td className="px-5 py-3 text-ink-500">
                    {c.contacto ? (
                      <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.contacto}</span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <Link to={`/emprestimos/${c.emprestimo_id}`} className="font-mono text-xs text-brass-600 hover:underline">
                      {c.codigo_emprestimo}
                    </Link>
                  </td>
                  <td className="px-5 py-3 tabular font-semibold">{formatMT(c.saldo_atual)}</td>
                  <td className="px-5 py-3">{formatDate(c.data_ultimo_pagamento ?? c.data_desembolso)}</td>
                  <td className="px-5 py-3">
                    <Badge tone="atraso">{c.dias_sem_pagamento} dias</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
