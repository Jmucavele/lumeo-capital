import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea, Badge, EmptyState, Spinner } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { useEmprestimos, useCriarEmprestimo, type NovoDesembolsoInput } from '@/hooks/useEmprestimos';
import { useClientes } from '@/hooks/useClientes';
import { formatDate, formatMT, formatPercent } from '@/lib/utils';

const estados = [
  { value: 'todos', label: 'Todos' },
  { value: 'ativo', label: 'Ativos' },
  { value: 'atraso', label: 'Em Atraso' },
  { value: 'liquidado', label: 'Liquidados' },
];

const emptyForm = { cliente_id: '', capital: '', taxa_juro: '', data_desembolso: new Date().toISOString().slice(0, 10), observacoes: '' };

export function Emprestimos() {
  const [filtro, setFiltro] = React.useState('todos');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const { data, isLoading } = useEmprestimos(filtro);
  const { data: clientes } = useClientes();
  const criar = useCriarEmprestimo();
  const navigate = useNavigate();

  const previaJuro = React.useMemo(() => {
    const capital = parseFloat(form.capital);
    const taxa = parseFloat(form.taxa_juro);
    if (!capital || !taxa) return null;
    return { juro: capital * (taxa / 100), saldoInicial: capital * (1 + taxa / 100) };
  }, [form.capital, form.taxa_juro]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.cliente_id || !form.capital || !form.taxa_juro) return;
    const input: NovoDesembolsoInput = {
      cliente_id: form.cliente_id,
      capital: parseFloat(form.capital),
      taxa_juro: parseFloat(form.taxa_juro) / 100,
      data_desembolso: form.data_desembolso,
      observacoes: form.observacoes || undefined,
    };
    const id = await criar.mutateAsync(input);
    setForm(emptyForm);
    setOpen(false);
    navigate(`/emprestimos/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Empréstimos</h1>
          <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
            Juros capitalizados imediatamente no desembolso e depois a cada data de aniversário.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Empréstimo
        </Button>
      </div>

      <div className="flex gap-2">
        {estados.map((e) => (
          <button
            key={e.value}
            onClick={() => setFiltro(e.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filtro === e.value
                ? 'bg-brass-500 text-ink-950'
                : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-parchment-200/70 hover:bg-ink-200 dark:hover:bg-ink-700'
            }`}
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="Nenhum empréstimo encontrado" description="Cria o primeiro empréstimo para um cliente já cadastrado." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                <th className="px-5 py-3 font-medium">Código</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Capital</th>
                <th className="px-5 py-3 font-medium">Taxa</th>
                <th className="px-5 py-3 font-medium">Desembolso</th>
                <th className="px-5 py-3 font-medium">Próx. Capitalização</th>
                <th className="px-5 py-3 font-medium">Saldo Atual</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => navigate(`/emprestimos/${e.id}`)}
                  className="border-b border-ink-50 dark:border-ink-800 last:border-0 hover:bg-ink-50 dark:hover:bg-ink-800/60 cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-xs text-ink-500">{e.codigo}</td>
                  <td className="px-5 py-3 font-medium">{e.clientes?.nome_completo ?? '—'}</td>
                  <td className="px-5 py-3 tabular">{formatMT(e.capital)}</td>
                  <td className="px-5 py-3 tabular">{formatPercent(e.taxa_juro)}</td>
                  <td className="px-5 py-3">{formatDate(e.data_desembolso)}</td>
                  <td className="px-5 py-3">{formatDate(e.data_proxima_capitalizacao)}</td>
                  <td className="px-5 py-3 tabular font-semibold text-brass-600 dark:text-brass-400">{formatMT(e.saldo_atual)}</td>
                  <td className="px-5 py-3"><Badge tone={e.estado}>{e.estado}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Novo Empréstimo"
        description="Os juros do 1º ciclo são adicionados ao capital imediatamente — sem carência."
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Cliente *</Label>
            <Select required value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
              <option value="">Selecionar cliente…</option>
              {clientes?.map((c) => (
                <option key={c.id} value={c.id}>{c.codigo} — {c.nome_completo}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Capital (MT) *</Label>
              <Input required type="number" min={0} step="0.01" value={form.capital} onChange={(e) => setForm({ ...form, capital: e.target.value })} />
            </div>
            <div>
              <Label>Taxa de Juro Mensal (%) *</Label>
              <Input required type="number" min={0} step="0.01" value={form.taxa_juro} onChange={(e) => setForm({ ...form, taxa_juro: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Data do Desembolso *</Label>
            <Input required type="date" value={form.data_desembolso} onChange={(e) => setForm({ ...form, data_desembolso: e.target.value })} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>

          {previaJuro && (
            <div className="rounded-lg bg-brass-500/10 border border-brass-500/30 px-3 py-2 text-sm">
              Juro do 1º ciclo: <strong>{formatMT(previaJuro.juro)}</strong> · Saldo inicial da dívida:{' '}
              <strong className="text-brass-600 dark:text-brass-400">{formatMT(previaJuro.saldoInicial)}</strong>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending}>{criar.isPending ? 'A processar…' : 'Confirmar Desembolso'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
