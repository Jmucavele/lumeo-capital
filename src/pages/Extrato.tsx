import * as React from 'react';
import { Link } from 'react-router-dom';
import { useExtrato } from '@/hooks/usePagamentos';
import { useClientes } from '@/hooks/useClientes';
import { EmptyState, Spinner, Select } from '@/components/ui/primitives';
import { formatDate, formatMT } from '@/lib/utils';

const tipos = [
  { value: 'todos', label: 'Todos' },
  { value: 'desembolso', label: 'Desembolsos' },
  { value: 'capitalizacao', label: 'Capitalizações' },
  { value: 'pagamento', label: 'Pagamentos' },
  { value: 'ajuste', label: 'Ajustes' },
];

const tipoLabel: Record<string, string> = {
  desembolso: 'Desembolso',
  capitalizacao: 'Capitalização de Juro',
  pagamento: 'Pagamento',
  ajuste: 'Ajuste',
};

const tipoTone: Record<string, string> = {
  desembolso: 'text-ink-700 dark:text-parchment-100',
  capitalizacao: 'text-rust-500',
  pagamento: 'text-moss-600 dark:text-moss-400',
  ajuste: 'text-brass-600',
};

export function Extrato() {
  const [filtro, setFiltro] = React.useState('todos');
  const [clienteId, setClienteId] = React.useState('todos');
  const { data, isLoading } = useExtrato();
  const { data: clientes } = useClientes();

  const filtrado = React.useMemo(
    () =>
      (data ?? []).filter(
        (m) => (filtro === 'todos' || m.tipo === filtro) && (clienteId === 'todos' || m.cliente_id === clienteId)
      ),
    [data, filtro, clienteId]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Extrato Geral</h1>
        <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
          Todos os movimentos da carteira, em ordem cronológica — a história real de cada empréstimo.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {tipos.map((t) => (
            <button
              key={t.value}
              onClick={() => setFiltro(t.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtro === t.value
                  ? 'bg-brass-500 text-ink-950'
                  : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-parchment-200/70 hover:bg-ink-200 dark:hover:bg-ink-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select className="w-auto" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="todos">Todos os clientes</option>
          {clientes?.map((c) => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.nome_completo}</option>
          ))}
        </Select>
      </div>

      <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : filtrado.length === 0 ? (
          <EmptyState title="Nenhum movimento neste filtro" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Empréstimo</th>
                <th className="px-5 py-3 font-medium">Movimento</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Saldo Após</th>
              </tr>
            </thead>
            <tbody>
              {filtrado.map((m) => (
                <tr key={m.movimento_id} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                  <td className="px-5 py-3 whitespace-nowrap">{formatDate(m.data_movimento)}</td>
                  <td className="px-5 py-3 font-medium">{m.nome_completo}</td>
                  <td className="px-5 py-3">
                    <Link to={`/emprestimos/${m.emprestimo_id}`} className="font-mono text-xs text-brass-600 hover:underline">
                      {m.codigo_emprestimo}
                    </Link>
                  </td>
                  <td className={`px-5 py-3 font-medium ${tipoTone[m.tipo]}`}>{tipoLabel[m.tipo]}</td>
                  <td className="px-5 py-3 tabular">{formatMT(m.valor)}</td>
                  <td className="px-5 py-3 tabular font-semibold">{formatMT(m.saldo_apos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
