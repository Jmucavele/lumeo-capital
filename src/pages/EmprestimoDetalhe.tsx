import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Badge, Label, Textarea, Input, Spinner, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useEmprestimo } from '@/hooks/useEmprestimos';
import { useExtrato, useRegistrarPagamento } from '@/hooks/usePagamentos';
import { formatDate, formatMT, formatPercent } from '@/lib/utils';

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

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export function EmprestimoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: emprestimo, isLoading } = useEmprestimo(id);
  const { data: extrato } = useExtrato(id);
  const registrarPagamento = useRegistrarPagamento();

  const [open, setOpen] = React.useState(false);
  const [valor, setValor] = React.useState('');
  const [dataPagamento, setDataPagamento] = React.useState(hoje());
  const [observacoes, setObservacoes] = React.useState('');

  async function handlePagamento(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !valor || !dataPagamento) return;
    await registrarPagamento.mutateAsync({ emprestimo_id: id, valor: parseFloat(valor), data_pagamento: dataPagamento, observacoes: observacoes || undefined });
    setValor('');
    setDataPagamento(hoje());
    setObservacoes('');
    setOpen(false);
  }

  if (isLoading || !emprestimo) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/emprestimos')}>
        <ArrowLeft className="h-4 w-4" /> Voltar a Empréstimos
      </Button>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{emprestimo.codigo}</CardTitle>
            <Link to={`/clientes/${emprestimo.cliente_id}`} className="text-xl font-display font-bold mt-1 hover:text-brass-500">
              {emprestimo.clientes?.nome_completo}
            </Link>
          </div>
          <Badge tone={emprestimo.estado}>{emprestimo.estado}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-ink-400 text-xs">Capital</p><p className="mt-0.5 tabular">{formatMT(emprestimo.capital)}</p></div>
          <div><p className="text-ink-400 text-xs">Taxa de Juro Mensal</p><p className="mt-0.5">{formatPercent(emprestimo.taxa_juro)}</p></div>
          <div><p className="text-ink-400 text-xs">Data de Desembolso</p><p className="mt-0.5">{formatDate(emprestimo.data_desembolso)}</p></div>
          <div><p className="text-ink-400 text-xs">Próxima Capitalização</p><p className="mt-0.5">{formatDate(emprestimo.data_proxima_capitalizacao)}</p></div>
          <div className="col-span-2 md:col-span-1">
            <p className="text-ink-400 text-xs">Saldo Atual em Dívida</p>
            <p className="mt-0.5 text-lg font-display font-bold tabular text-brass-600 dark:text-brass-400">{formatMT(emprestimo.saldo_atual)}</p>
          </div>
          <div><p className="text-ink-400 text-xs">Último Pagamento</p><p className="mt-0.5">{formatDate(emprestimo.data_ultimo_pagamento)}</p></div>
        </CardContent>
      </Card>

      {emprestimo.estado !== 'liquidado' && (
        <Button onClick={() => setOpen(true)}>
          <Receipt className="h-4 w-4" /> Registar Pagamento
        </Button>
      )}

      <div>
        <h2 className="text-lg font-display font-semibold mb-3">Extrato do Empréstimo</h2>
        {!extrato || extrato.length === 0 ? (
          <Card><EmptyState title="Sem movimentos ainda" /></Card>
        ) : (
          <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                  <th className="px-5 py-3 font-medium">Data</th>
                  <th className="px-5 py-3 font-medium">Movimento</th>
                  <th className="px-5 py-3 font-medium">Valor</th>
                  <th className="px-5 py-3 font-medium">Saldo Após</th>
                  <th className="px-5 py-3 font-medium">Observações</th>
                </tr>
              </thead>
              <tbody>
                {extrato.map((m) => (
                  <tr key={m.movimento_id} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                    <td className="px-5 py-3 whitespace-nowrap">{formatDate(m.data_movimento)}</td>
                    <td className={`px-5 py-3 font-medium ${tipoTone[m.tipo]}`}>
                      {tipoLabel[m.tipo]}{m.codigo_pagamento ? ` · ${m.codigo_pagamento}` : ''}
                    </td>
                    <td className="px-5 py-3 tabular">{formatMT(m.valor)}</td>
                    <td className="px-5 py-3 tabular font-semibold">{formatMT(m.saldo_apos)}</td>
                    <td className="px-5 py-3 text-ink-500">{m.observacoes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Registar Pagamento" description="O saldo é reduzido imediatamente após guardar.">
        <form onSubmit={handlePagamento} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor Pago (MT) *</Label>
              <Input required type="number" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            </div>
            <div>
              <Label>Data do Pagamento *</Label>
              <Input required type="date" max={hoje()} value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Nº de comprovativo, forma de pagamento, etc." />
          </div>
          <p className="text-xs text-ink-400">Saldo atual: {formatMT(emprestimo.saldo_atual)}</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={registrarPagamento.isPending}>
              {registrarPagamento.isPending ? 'A guardar…' : 'Confirmar Pagamento'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
