import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea, Badge, EmptyState, Spinner } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import { useEmprestimos, useCriarEmprestimo, taxaDiaria, type NovoDesembolsoInput } from '@/hooks/useEmprestimos';
import { mensagemErro } from '@/hooks/usePagamentos';
import type { TipoJuro } from '@/types/database.types';
import { useClientes } from '@/hooks/useClientes';
import { formatDate, formatMT, formatPercent, tipoJuroLabel } from '@/lib/utils';
import { ContratoForm, contratoDoCliente } from '@/components/contratos/ContratoForm';
import { useGuardarContrato } from '@/hooks/useContratos';
import { supabase } from '@/lib/supabase';
import { contratoVazio, gerarContratoPDF, sugerirGarantia, type DadosContrato } from '@/lib/contrato';

/** Dados que o Simulador passa para abrir o "Novo Empréstimo" já preenchido. */
export interface PrefillEmprestimo {
  capital: number;
  taxa: number; // em %
  tipo_juro: TipoJuro;
  data_desembolso: string;
  prazo_dias: number;
  n_prestacoes: number;
}

const estados = [
  { value: 'todos', label: 'Todos' },
  { value: 'ativo', label: 'Ativos' },
  { value: 'atraso', label: 'Em Atraso' },
  { value: 'liquidado', label: 'Liquidados' },
];

const emptyForm = { cliente_id: '', capital: '', taxa_juro: '30', data_desembolso: new Date().toISOString().slice(0, 10), observacoes: '', tipo_juro: 'diario' as TipoJuro };

export function Emprestimos() {
  const [filtro, setFiltro] = React.useState('todos');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [erro, setErro] = React.useState<string | null>(null);
  const { data, isLoading } = useEmprestimos(filtro);
  const { data: clientes } = useClientes();
  const criar = useCriarEmprestimo();
  const navigate = useNavigate();
  const location = useLocation();
  const guardarContrato = useGuardarContrato();
  const [emitirContrato, setEmitirContrato] = React.useState(true);
  const [contrato, setContrato] = React.useState<DadosContrato>(contratoVazio());

  // Vindo do Simulador: abre o formulário já preenchido
  React.useEffect(() => {
    const p = (location.state as { prefill?: PrefillEmprestimo } | null)?.prefill;
    if (!p) return;
    setForm((f) => ({ ...f, capital: String(p.capital), taxa_juro: String(p.taxa), tipo_juro: p.tipo_juro, data_desembolso: p.data_desembolso }));
    setContrato((c) => ({ ...c, credito: { ...c.credito, prazo_dias: p.prazo_dias, n_prestacoes: p.n_prestacoes, garantia: sugerirGarantia(p.capital) } }));
    setOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  function escolherCliente(id: string) {
    setForm((f) => ({ ...f, cliente_id: id }));
    const cli = clientes?.find((c) => c.id === id);
    setContrato((c) => contratoDoCliente({ ...c, mutuario: { nome: '' }, fiador: {} }, cli));
  }

  const previaJuro = React.useMemo(() => {
    const capital = parseFloat(form.capital);
    const taxa = parseFloat(form.taxa_juro);
    if (!capital || !taxa) return null;
    const d = taxaDiaria(taxa / 100);
    return {
      juro: capital * (taxa / 100),
      saldoInicial: capital * (1 + taxa / 100),
      taxaDia: d,
      dia10: capital * Math.pow(1 + d, 10),
      dia15: capital * Math.pow(1 + d, 15),
      dia30: capital * Math.pow(1 + d, 30),
    };
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
      tipo_juro: form.tipo_juro,
    };
    setErro(null);
    let id: string;
    try {
      id = await criar.mutateAsync(input);
    } catch (err) {
      setErro(mensagemErro(err));
      return;
    }
    if (emitirContrato) {
      try {
        const { data: novo } = await supabase.from('emprestimos').select('codigo').eq('id', id).single();
        const c = await guardarContrato.mutateAsync({ emprestimo_id: id, data_contrato: input.data_desembolso, dados: contrato });
        await gerarContratoPDF({
          numero: c.numero,
          dataContrato: c.data_contrato,
          dados: contrato,
          emprestimo: { codigo: (novo as { codigo: string } | null)?.codigo ?? '', capital: input.capital, taxa_juro: input.taxa_juro, tipo_juro: input.tipo_juro, data_desembolso: input.data_desembolso },
        });
      } catch (err) {
        window.alert(`O empréstimo foi criado, mas o contrato não foi emitido: ${mensagemErro(err)}\nPode emiti-lo na página do empréstimo.`);
      }
    }
    setForm(emptyForm);
    setContrato(contratoVazio());
    setOpen(false);
    navigate(`/emprestimos/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Empréstimos</h1>
          <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
            Juro mensal composto (capitalizado no desembolso e a cada aniversário) ou diário composto (base 30 dias).
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
                  <td className="px-5 py-3 tabular">
                    {formatPercent(e.taxa_juro)}
                    <span className="block text-[11px] text-ink-400">{tipoJuroLabel[e.tipo_juro ?? 'mensal']}</span>
                  </td>
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
        className="max-w-2xl"
        title="Novo Empréstimo"
        description="Escolhe como o juro é calculado: mensal (ciclo inteiro logo no desembolso) ou diário composto."
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Cliente *</Label>
            <Select required value={form.cliente_id} onChange={(e) => escolherCliente(e.target.value)}>
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
            <Label>Tipo de Juro *</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['mensal', 'diario'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, tipo_juro: t })}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    form.tipo_juro === t
                      ? 'border-brass-500 bg-brass-500/10'
                      : 'border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800'
                  }`}
                >
                  <span className="font-medium block">{tipoJuroLabel[t]}</span>
                  <span className="text-xs text-ink-500">
                    {t === 'mensal' ? 'Juro do mês inteiro logo no desembolso' : 'Juro corre dia a dia; paga menos se pagar cedo'}
                  </span>
                </button>
              ))}
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

          {previaJuro && form.tipo_juro === 'mensal' && (
            <div className="rounded-lg bg-brass-500/10 border border-brass-500/30 px-3 py-2 text-sm">
              Juro do 1º ciclo: <strong>{formatMT(previaJuro.juro)}</strong> · Saldo inicial da dívida:{' '}
              <strong className="text-brass-600 dark:text-brass-400">{formatMT(previaJuro.saldoInicial)}</strong>
            </div>
          )}
          {previaJuro && form.tipo_juro === 'diario' && (
            <div className="rounded-lg bg-brass-500/10 border border-brass-500/30 px-3 py-2 text-sm space-y-1">
              <p>
                Taxa diária equivalente: <strong>{formatPercent(previaJuro.taxaDia, 4)}</strong> ao dia (base 30 dias)
              </p>
              <p className="text-xs text-ink-600 dark:text-parchment-200/70">
                Se não pagar nada, deve: dia 10 → <strong>{formatMT(previaJuro.dia10)}</strong> · dia 15 →{' '}
                <strong>{formatMT(previaJuro.dia15)}</strong> · dia 30 →{' '}
                <strong className="text-brass-600 dark:text-brass-400">{formatMT(previaJuro.dia30)}</strong>
              </p>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm font-medium pt-1">
            <input type="checkbox" checked={emitirContrato} onChange={(e) => setEmitirContrato(e.target.checked)} className="accent-brass-500 h-4 w-4" />
            Emitir contrato de mútuo (PDF assinado e carimbado)
          </label>
          {emitirContrato && (
            <ContratoForm
              value={contrato}
              onChange={setContrato}
              capital={parseFloat(form.capital) || undefined}
            />
          )}

          {erro && <p className="text-sm text-rust-500">{erro}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending}>{criar.isPending ? 'A processar…' : 'Confirmar Desembolso'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
