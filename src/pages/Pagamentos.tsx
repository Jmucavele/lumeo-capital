import * as React from 'react';
import { Plus, Pencil, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea, EmptyState, Spinner } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { useEmprestimos } from '@/hooks/useEmprestimos';
import { mensagemErro, useExtrato, useHistoricoPagamentos, useRegistrarPagamento } from '@/hooks/usePagamentos';
import { EditarPagamentoDialog } from '@/components/pagamentos/EditarPagamentoDialog';
import type { ViewExtrato } from '@/types/database.types';
import { formatDate, formatMT } from '@/lib/utils';

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export function Pagamentos() {
  const [open, setOpen] = React.useState(false);
  const [emprestimoId, setEmprestimoId] = React.useState('');
  const [valor, setValor] = React.useState('');
  const [dataPagamento, setDataPagamento] = React.useState(hoje());
  const [observacoes, setObservacoes] = React.useState('');
  const [erro, setErro] = React.useState<string | null>(null);
  const [aEditar, setAEditar] = React.useState<ViewExtrato | null>(null);
  const [verHistorico, setVerHistorico] = React.useState(false);
  const { data: historico } = useHistoricoPagamentos();

  // Activos e em atraso (o filtro antigo só por 'ativo' escondia os em atraso)
  const { data: todosEmprestimos } = useEmprestimos();
  const emprestimos = React.useMemo(() => todosEmprestimos?.filter((e) => e.estado !== 'liquidado'), [todosEmprestimos]);
  const { data: extrato, isLoading } = useExtrato();
  const registrar = useRegistrarPagamento();

  // Mais recentes primeiro
  const pagamentos = React.useMemo(
    () => (extrato?.filter((m) => m.tipo === 'pagamento') ?? []).slice().reverse(),
    [extrato]
  );
  const emprestimoSel = emprestimos?.find((e) => e.id === emprestimoId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emprestimoId || !valor || !dataPagamento) return;
    const v = parseFloat(valor);
    if (Number.isNaN(v) || v <= 0) return setErro('O valor tem de ser maior que zero.');
    if (emprestimoSel && v > emprestimoSel.saldo_atual + 0.01 &&
        !window.confirm(`O valor (${formatMT(v)}) é maior que o saldo em dívida (${formatMT(emprestimoSel.saldo_atual)}). Registar mesmo assim?`)) return;
    setErro(null);
    try {
      await registrar.mutateAsync({ emprestimo_id: emprestimoId, valor: v, data_pagamento: dataPagamento, observacoes: observacoes || undefined });
    } catch (err) {
      return setErro(mensagemErro(err));
    }
    setEmprestimoId('');
    setValor('');
    setDataPagamento(hoje());
    setObservacoes('');
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Pagamentos</h1>
          <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
            Pagamentos parciais ou totais, em qualquer dia — o saldo é actualizado na hora.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setVerHistorico((x) => !x)}>
            <History className="h-4 w-4" /> {verHistorico ? 'Ver pagamentos' : `Histórico de alterações${historico?.length ? ` (${historico.length})` : ''}`}
          </Button>
          <Button onClick={() => { setErro(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Registar Pagamento
          </Button>
        </div>
      </div>

      <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        {verHistorico ? (
          !historico || historico.length === 0 ? (
            <EmptyState title="Nenhum pagamento foi editado ou anulado" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-5 py-3 font-medium">Quando</th>
                  <th className="px-5 py-3 font-medium">Pagamento</th>
                  <th className="px-5 py-3 font-medium">Acção</th>
                  <th className="px-5 py-3 font-medium">Antes</th>
                  <th className="px-5 py-3 font-medium">Depois</th>
                  <th className="px-5 py-3 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap">{new Date(h.alterado_em).toLocaleString('pt-MZ')}</td>
                    <td className="px-5 py-3 font-mono text-xs text-ink-500">{h.codigo_pagamento}</td>
                    <td className={`px-5 py-3 font-medium ${h.acao === 'anulacao' ? 'text-rust-500' : 'text-brass-600'}`}>
                      {h.acao === 'anulacao' ? 'Anulação' : 'Edição'}
                    </td>
                    <td className="px-5 py-3 tabular">{formatMT(h.valor_anterior)} · {formatDate(h.data_anterior)}</td>
                    <td className="px-5 py-3 tabular">{h.acao === 'anulacao' ? '—' : `${formatMT(h.valor_novo)} · ${formatDate(h.data_nova)}`}</td>
                    <td className="px-5 py-3 text-ink-500">{h.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : pagamentos.length === 0 ? (
          <EmptyState title="Ainda não há pagamentos registados" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                <th className="px-5 py-3 font-medium">Código</th>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Empréstimo</th>
                <th className="px-5 py-3 font-medium">Valor</th>
                <th className="px-5 py-3 font-medium">Saldo Após</th>
                <th className="px-5 py-3 font-medium">Obs.</th>
                <th className="px-5 py-3 font-medium text-right">Acções</th>
              </tr>
            </thead>
            <tbody>
              {pagamentos.map((p) => (
                <tr key={p.movimento_id} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs text-ink-500">{p.codigo_pagamento}</td>
                  <td className="px-5 py-3 whitespace-nowrap">{formatDate(p.data_movimento)}</td>
                  <td className="px-5 py-3 font-medium">{p.nome_completo}</td>
                  <td className="px-5 py-3 font-mono text-xs text-ink-500">{p.codigo_emprestimo}</td>
                  <td className="px-5 py-3 tabular text-moss-600 dark:text-moss-400 font-semibold">{formatMT(-p.valor)}</td>
                  <td className="px-5 py-3 tabular">{formatMT(p.saldo_apos)}</td>
                  <td className="px-5 py-3 text-ink-500 max-w-[14rem] truncate" title={p.observacoes ?? ''}>{p.observacoes || '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setAEditar(p)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brass-600 hover:bg-ink-100 dark:hover:bg-ink-800"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Registar Pagamento">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Empréstimo *</Label>
            <Select required value={emprestimoId} onChange={(e) => setEmprestimoId(e.target.value)}>
              <option value="">Selecionar empréstimo activo…</option>
              {emprestimos?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} — {e.clientes?.nome_completo} ({formatMT(e.saldo_atual)})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Pago (MT) *</Label>
              <Input required type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <Label>Data do Pagamento *</Label>
              <Input required type="date" max={hoje()} value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>
          {erro && <p className="text-sm text-rust-500">{erro}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={registrar.isPending}>{registrar.isPending ? 'A guardar…' : 'Confirmar'}</Button>
          </div>
        </form>
      </Dialog>

      <EditarPagamentoDialog pagamento={aEditar} onClose={() => setAEditar(null)} />
    </div>
  );
}
