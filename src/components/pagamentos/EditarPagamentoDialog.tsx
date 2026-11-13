import * as React from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label, Textarea } from '@/components/ui/primitives';
import { mensagemErro, useAnularPagamento, useEditarPagamento } from '@/hooks/usePagamentos';
import { formatDate, formatMT } from '@/lib/utils';
import type { ViewExtrato } from '@/types/database.types';

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  /** Linha do extrato do tipo 'pagamento' a editar; null fecha o diálogo. */
  pagamento: ViewExtrato | null;
  onClose: () => void;
}

/**
 * Editar ou anular um pagamento já registado.
 * - Exige sempre um motivo (fica no histórico de auditoria).
 * - Mostra o antes/depois e pede confirmação antes de gravar.
 * - O saldo de todo o empréstimo é recalculado no servidor.
 */
export function EditarPagamentoDialog({ pagamento, onClose }: Props) {
  const editar = useEditarPagamento();
  const anular = useAnularPagamento();

  const [modo, setModo] = React.useState<'editar' | 'anular'>('editar');
  const [valor, setValor] = React.useState('');
  const [data, setData] = React.useState('');
  const [observacoes, setObservacoes] = React.useState('');
  const [motivo, setMotivo] = React.useState('');
  const [confirmar, setConfirmar] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const valorOriginal = pagamento ? Math.abs(pagamento.valor) : 0;

  React.useEffect(() => {
    if (!pagamento) return;
    setModo('editar');
    setValor(String(Math.abs(pagamento.valor)));
    setData(pagamento.data_movimento.slice(0, 10));
    setObservacoes(pagamento.observacoes ?? '');
    setMotivo('');
    setConfirmar(false);
    setErro(null);
  }, [pagamento]);

  if (!pagamento) return null;

  const valorNum = parseFloat(valor);
  const semAlteracoes =
    modo === 'editar' &&
    valorNum === valorOriginal &&
    data === pagamento.data_movimento.slice(0, 10) &&
    (observacoes || '') === (pagamento.observacoes || '');

  function validar(): string | null {
    if (!motivo.trim()) return 'Indica o motivo — fica registado no histórico.';
    if (modo === 'anular') return null;
    if (!valor || Number.isNaN(valorNum) || valorNum <= 0) return 'O valor tem de ser maior que zero.';
    if (!data) return 'Indica a data do pagamento.';
    if (data > hoje()) return 'A data não pode ser no futuro.';
    if (semAlteracoes) return 'Não alteraste nada.';
    return null;
  }

  function pedirConfirmacao(e: React.FormEvent) {
    e.preventDefault();
    const v = validar();
    setErro(v);
    if (!v) setConfirmar(true);
  }

  async function gravar() {
    if (!pagamento?.pagamento_id) {
      setErro('Este pagamento não tem identificador. Corre a migração v3 no Supabase.');
      return;
    }
    setErro(null);
    try {
      if (modo === 'anular') {
        await anular.mutateAsync({ pagamento_id: pagamento.pagamento_id, motivo: motivo.trim() });
      } else {
        await editar.mutateAsync({
          pagamento_id: pagamento.pagamento_id,
          valor: valorNum,
          data_pagamento: data,
          observacoes: observacoes.trim() || null,
          motivo: motivo.trim(),
        });
      }
      onClose();
    } catch (err) {
      setErro(mensagemErro(err));
      setConfirmar(false);
    }
  }

  const aGuardar = editar.isPending || anular.isPending;

  return (
    <Dialog
      open
      onClose={aGuardar ? () => {} : onClose}
      title={`${modo === 'anular' ? 'Anular' : 'Editar'} pagamento ${pagamento.codigo_pagamento ?? ''}`}
      description={`${pagamento.nome_completo} · ${pagamento.codigo_emprestimo} · ${formatMT(valorOriginal)} em ${formatDate(pagamento.data_movimento)}`}
    >
      {!confirmar ? (
        <form onSubmit={pedirConfirmacao} className="space-y-3">
          <div className="flex gap-2">
            {(['editar', 'anular'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setModo(m); setErro(null); }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  modo === m
                    ? m === 'anular' ? 'bg-rust-500 text-white' : 'bg-brass-500 text-ink-950'
                    : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-parchment-200/70'
                }`}
              >
                {m === 'editar' ? 'Corrigir valores' : 'Anular pagamento'}
              </button>
            ))}
          </div>

          {modo === 'editar' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Valor Pago (MT) *</Label>
                  <Input type="number" min={0.01} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} />
                </div>
                <div>
                  <Label>Data do Pagamento *</Label>
                  <Input type="date" max={hoje()} value={data} onChange={(e) => setData(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-600 dark:text-parchment-200/70">
              O pagamento deixa de contar para o saldo e o empréstimo é recalculado como se nunca tivesse existido
              (os juros dos meses seguintes podem aumentar). O registo original fica guardado no histórico.
            </p>
          )}

          <div>
            <Label>Motivo da {modo === 'anular' ? 'anulação' : 'alteração'} *</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={modo === 'anular' ? 'Ex.: lançado em duplicado' : 'Ex.: valor digitado errado'}
            />
          </div>

          {erro && <p className="text-sm text-rust-500">{erro}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Continuar</Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-medium">Confirma a {modo === 'anular' ? 'anulação' : 'alteração'}:</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-400">
                <th className="py-1" />
                <th className="py-1">Antes</th>
                <th className="py-1">Depois</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 text-ink-500">Valor</td>
                <td className="py-1 tabular">{formatMT(valorOriginal)}</td>
                <td className="py-1 tabular font-semibold">{modo === 'anular' ? 'Anulado' : formatMT(valorNum)}</td>
              </tr>
              {modo === 'editar' && (
                <tr>
                  <td className="py-1 text-ink-500">Data</td>
                  <td className="py-1">{formatDate(pagamento.data_movimento)}</td>
                  <td className="py-1 font-semibold">{formatDate(data)}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-ink-500">Motivo: {motivo}</p>
          <p className="text-xs text-ink-500">
            O saldo e os juros do empréstimo {pagamento.codigo_emprestimo} serão recalculados automaticamente.
          </p>
          {erro && <p className="text-sm text-rust-500">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={aGuardar} onClick={() => setConfirmar(false)}>Voltar</Button>
            <Button type="button" disabled={aGuardar} onClick={gravar}>
              {aGuardar ? 'A guardar…' : modo === 'anular' ? 'Confirmar anulação' : 'Confirmar alteração'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
