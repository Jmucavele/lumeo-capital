import * as React from 'react';
import { Link } from 'react-router-dom';
import { useExtrato } from '@/hooks/usePagamentos';
import { useClientes } from '@/hooks/useClientes';
import { EmptyState, Spinner, Select } from '@/components/ui/primitives';
import { ExportarExtrato } from '@/components/documentos/ExportarExtrato';
import { BotaoRecibo } from '@/components/documentos/ExportarExtrato';
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
  const [emprestimoId, setEmprestimoId] = React.useState('todos');
  // Por omissão só mostra empréstimos com saldo em dívida (activos/em atraso).
  const [mostrarLiquidados, setMostrarLiquidados] = React.useState(false);
  const { data, isLoading } = useExtrato();
  const { data: clientes } = useClientes();

  const comSaldo = (m: { estado_emprestimo?: string; saldo_atual_emprestimo?: number }) =>
    m.estado_emprestimo
      ? m.estado_emprestimo !== 'liquidado' && (m.saldo_atual_emprestimo ?? 0) > 0.005
      : true; // se a migração v3 ainda não correu, não esconde nada

  // Movimentos visíveis segundo o interruptor "liquidados"
  const base = React.useMemo(
    () => (data ?? []).filter((m) => mostrarLiquidados || comSaldo(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, mostrarLiquidados]
  );

  // Dropdown de clientes: só quem tem movimentos visíveis (i.e. com dívida)
  const clientesDisponiveis = React.useMemo(() => {
    const ids = new Set(base.map((m) => m.cliente_id));
    return (clientes ?? []).filter((c) => ids.has(c.id));
  }, [base, clientes]);

  const totalLiquidados = React.useMemo(
    () => new Set((data ?? []).filter((m) => !comSaldo(m)).map((m) => m.emprestimo_id)).size,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data]
  );

  // Se o cliente escolhido deixou de estar na lista, volta a "todos"
  React.useEffect(() => {
    if (clienteId !== 'todos' && clientes && !clientesDisponiveis.some((c) => c.id === clienteId)) setClienteId('todos');
  }, [clientesDisponiveis, clienteId, clientes]);

  // Lista de empréstimos disponível para o dropdown — derivada do próprio
  // extrato (sem pedido extra ao servidor), já filtrada pelo cliente
  // escolhido (se houver um seleccionado).
  const emprestimosDisponiveis = React.useMemo(() => {
    const vistos = new Map<string, { id: string; codigo: string; clienteId: string }>();
    for (const m of base) {
      if (clienteId !== 'todos' && m.cliente_id !== clienteId) continue;
      if (!vistos.has(m.emprestimo_id)) {
        vistos.set(m.emprestimo_id, { id: m.emprestimo_id, codigo: m.codigo_emprestimo, clienteId: m.cliente_id });
      }
    }
    return Array.from(vistos.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [base, clienteId]);

  // Se o cliente mudar e o empréstimo seleccionado já não pertencer a ele, limpa o filtro de empréstimo.
  React.useEffect(() => {
    if (emprestimoId !== 'todos' && !emprestimosDisponiveis.some((e) => e.id === emprestimoId)) {
      setEmprestimoId('todos');
    }
  }, [emprestimosDisponiveis, emprestimoId]);

  const filtrado = React.useMemo(
    () =>
      base.filter(
        (m) =>
          (filtro === 'todos' || m.tipo === filtro) &&
          (clienteId === 'todos' || m.cliente_id === clienteId) &&
          (emprestimoId === 'todos' || m.emprestimo_id === emprestimoId)
      ),
    [base, filtro, clienteId, emprestimoId]
  );

  const clienteSel = clientesDisponiveis.find((c) => c.id === clienteId);
  const emprestimoSel = emprestimosDisponiveis.find((e) => e.id === emprestimoId);
  const tituloExport = emprestimoSel ? `Extracto do Empréstimo ${emprestimoSel.codigo}` : clienteSel ? 'Extracto do Cliente' : 'Extracto Geral';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-display font-bold">Extrato Geral</h1>
        <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
          {mostrarLiquidados
            ? 'Todos os movimentos da carteira, incluindo empréstimos já liquidados.'
            : 'Movimentos dos empréstimos com saldo em dívida, em ordem cronológica.'}
        </p>
      </div>
        <ExportarExtrato movimentos={filtrado} titulo={tituloExport} cliente={clienteSel?.nome_completo} />
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
        <div className="flex gap-2 flex-wrap">
          <Select
            className="w-auto"
            value={clienteId}
            onChange={(e) => {
              setClienteId(e.target.value);
              setEmprestimoId('todos'); // trocar de cliente reinicia o filtro de empréstimo
            }}
          >
            <option value="todos">Todos os clientes</option>
            {clientesDisponiveis.map((c) => (
              <option key={c.id} value={c.id}>{c.codigo} — {c.nome_completo}</option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-sm text-ink-500 dark:text-parchment-200/70 px-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={mostrarLiquidados}
              onChange={(e) => setMostrarLiquidados(e.target.checked)}
              className="accent-brass-500 h-4 w-4"
            />
            Mostrar liquidados{totalLiquidados ? ` (${totalLiquidados})` : ''}
          </label>
          <Select className="w-auto" value={emprestimoId} onChange={(e) => setEmprestimoId(e.target.value)}>
            <option value="todos">Todos os empréstimos</option>
            {emprestimosDisponiveis.map((e) => (
              <option key={e.id} value={e.id}>{e.codigo}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : filtrado.length === 0 ? (
          <EmptyState
            title="Nenhum movimento neste filtro"
            description={!mostrarLiquidados && totalLiquidados ? 'Os empréstimos liquidados estão escondidos — activa "Mostrar liquidados".' : undefined}
          />
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
                  <td className="px-5 py-3 font-medium">
                    {m.nome_completo}
                    {m.estado_emprestimo === 'liquidado' && (
                      <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase bg-moss-600/15 text-moss-600">liquidado</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <Link to={`/emprestimos/${m.emprestimo_id}`} className="font-mono text-xs text-brass-600 hover:underline">
                      {m.codigo_emprestimo}
                    </Link>
                  </td>
                  <td className={`px-5 py-3 font-medium ${tipoTone[m.tipo]}`}>
                    {tipoLabel[m.tipo]}
                    {m.tipo === 'pagamento' && <span className="ml-1"><BotaoRecibo pagamento={m} /></span>}
                  </td>
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
