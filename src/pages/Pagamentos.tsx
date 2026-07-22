import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea, EmptyState, Spinner } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { useEmprestimos } from '@/hooks/useEmprestimos';
import { useExtrato, useRegistrarPagamento } from '@/hooks/usePagamentos';
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

  const { data: emprestimos } = useEmprestimos('ativo');
  const { data: extrato, isLoading } = useExtrato();
  const registrar = useRegistrarPagamento();

  const pagamentos = React.useMemo(() => extrato?.filter((m) => m.tipo === 'pagamento') ?? [], [extrato]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emprestimoId || !valor || !dataPagamento) return;
    await registrar.mutateAsync({ emprestimo_id: emprestimoId, valor: parseFloat(valor), data_pagamento: dataPagamento, observacoes: observacoes || undefined });
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
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Registar Pagamento
        </Button>
      </div>

      <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        {isLoading ? (
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
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={registrar.isPending}>{registrar.isPending ? 'A guardar…' : 'Confirmar'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
