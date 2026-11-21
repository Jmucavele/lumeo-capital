import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, ArrowRight, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { calcularPlano, garantiaExigida, montante } from '@/lib/simulador';
import { formatDate, formatMT, tipoJuroLabel } from '@/lib/utils';
import type { TipoJuro } from '@/types/database.types';
import type { PrefillEmprestimo } from '@/pages/Emprestimos';

const hoje = () => new Date().toISOString().slice(0, 10);
const pctFmt = (x: number) => `${(x * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export function Simulador() {
  const navigate = useNavigate();
  const [capital, setCapital] = React.useState('10000');
  const [taxa, setTaxa] = React.useState('30');
  const [tipo, setTipo] = React.useState<TipoJuro>('diario');
  const [data, setData] = React.useState(hoje());
  const [prazo, setPrazo] = React.useState('30');
  const [n, setN] = React.useState('1');
  const [comissao, setComissao] = React.useState('0');

  const C = parseFloat(capital) || 0;
  const r = (parseFloat(taxa) || 0) / 100;
  const prazoDias = Math.max(1, parseInt(prazo || '0', 10) || 1);
  const nPrest = parseInt(n, 10) || 1;
  const com = parseFloat(comissao) || 0;
  const valido = C > 0 && r > 0;

  const plano = React.useMemo(
    () => (valido ? calcularPlano({ capital: C, taxa: r, tipo, dataDesembolso: data, prazoDias, nPrestacoes: nPrest }) : null),
    [C, r, tipo, data, prazoDias, nPrest, valido],
  );
  const marcos = [7, 15, 30, 45, 60, 90, 120, 180];
  const g = garantiaExigida(C);
  const valorComissao = (C * com) / 100;

  function criarCredito() {
    const prefill: PrefillEmprestimo = { capital: C, taxa: parseFloat(taxa), tipo_juro: tipo, data_desembolso: data, prazo_dias: prazoDias, n_prestacoes: nPrest };
    navigate('/emprestimos', { state: { prefill } });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Simulador de Crédito</h1>
          <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
            Calcula quanto o cliente vai pagar, com as mesmas regras do contrato (Cláusula 4.ª). Nada é gravado.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()} disabled={!plano}><Printer className="h-4 w-4" /> Imprimir</Button>
          <Button onClick={criarCredito} disabled={!plano}>Criar crédito <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-4 w-4" /> Parâmetros</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Capital (MT)</Label><Input type="number" min={0} value={capital} onChange={(e) => setCapital(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Taxa mensal (%)</Label><Input type="number" min={0} step="0.5" value={taxa} onChange={(e) => setTaxa(e.target.value)} /></div>
              <div>
                <Label>Regime</Label>
                <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoJuro)}>
                  <option value="diario">{tipoJuroLabel.diario}</option>
                  <option value="mensal">{tipoJuroLabel.mensal}</option>
                </Select>
              </div>
            </div>
            <div><Label>Data de desembolso</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Prazo (dias)</Label><Input type="number" min={1} max={180} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
              <div>
                <Label>Prestações</Label>
                <Select value={n} onChange={(e) => setN(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6].map((x) => <option key={x} value={x}>{x}</option>)}
                </Select>
              </div>
            </div>
            <div><Label>Comissão de abertura (%)</Label><Input type="number" min={0} step="0.5" value={comissao} onChange={(e) => setComissao(e.target.value)} /></div>
            {nPrest > 2 && <p className="text-xs text-rust-500">O contrato prevê até 2 prestações (Cláusula 3.2). Mais do que isso exige acordo escrito.</p>}
            {prazoDias > 180 && <p className="text-xs text-rust-500">O prazo máximo por operação é 6 meses (Cláusula 3.4).</p>}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {plano && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { l: 'Total a reembolsar', v: formatMT(plano.total), tone: 'text-brass-600 dark:text-brass-400' },
                { l: 'Total de juros', v: formatMT(plano.totalJuros), tone: 'text-moss-600 dark:text-moss-400' },
                { l: 'Taxa efectiva do período', v: pctFmt(plano.taxaEfectiva), tone: '' },
                { l: 'Data limite', v: formatDate(plano.dataLimite), tone: '' },
              ].map((k) => (
                <Card key={k.l} className="p-4">
                  <p className="text-xs uppercase text-ink-400">{k.l}</p>
                  <p className={`mt-1 text-lg font-display font-bold tabular ${k.tone}`}>{k.v}</p>
                </Card>
              ))}
            </div>
          )}

          {plano && (
            <Card>
              <CardHeader><CardTitle>Plano de pagamento (Anexo I)</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                      <th className="py-2 pr-3">Prestação</th><th className="py-2 pr-3">Vencimento</th><th className="py-2 pr-3">Dias</th>
                      <th className="py-2 pr-3 text-right">Capital</th><th className="py-2 pr-3 text-right">Juros</th>
                      <th className="py-2 pr-3 text-right">Prestação</th><th className="py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.prestacoes.map((p) => (
                      <tr key={p.n} className="border-b border-ink-50 dark:border-ink-800">
                        <td className="py-2 pr-3">{p.n}.ª</td>
                        <td className="py-2 pr-3">{formatDate(p.data)}</td>
                        <td className="py-2 pr-3 tabular">{p.dias}</td>
                        <td className="py-2 pr-3 text-right tabular">{formatMT(p.capital)}</td>
                        <td className="py-2 pr-3 text-right tabular text-rust-500">{formatMT(p.juros)}</td>
                        <td className="py-2 pr-3 text-right tabular font-semibold">{formatMT(p.valor)}</td>
                        <td className="py-2 text-right tabular">{formatMT(p.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="pt-2" colSpan={3}>Total</td>
                      <td className="pt-2 text-right tabular">{formatMT(C)}</td>
                      <td className="pt-2 text-right tabular">{formatMT(plano.totalJuros)}</td>
                      <td className="pt-2 text-right tabular text-brass-600 dark:text-brass-400">{formatMT(plano.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                {com > 0 && (
                  <p className="text-xs text-ink-500 mt-3">
                    Comissão de abertura de {com}%: <strong>{formatMT(valorComissao)}</strong> paga no desembolso — o cliente recebe líquido{' '}
                    <strong>{formatMT(C - valorComissao)}</strong>.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {valido && (
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Se pagar tudo de uma vez ao fim de…</CardTitle></CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <tbody>
                      {marcos.map((d) => {
                        const M = montante(C, r, d, tipo);
                        return (
                          <tr key={d} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                            <td className="py-1.5">{d} dias</td>
                            <td className="py-1.5 text-right tabular font-medium">{formatMT(M)}</td>
                            <td className="py-1.5 text-right tabular text-xs text-ink-400">+{pctFmt(M / C - 1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-[11px] text-ink-400 mt-2">
                    {tipo === 'diario' ? 'M = C × (1 + taxa)^(dias ÷ 30)' : 'Juro do mês inteiro no desembolso e a cada aniversário'} · taxa efectiva anual {pctFmt(Math.pow(1 + r, 12) - 1)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Garantia exigida (Cláusula 7.1)</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-xs uppercase text-ink-400">{g.nivel}</p>
                  <p className="font-medium">{g.texto}</p>
                  {C > 20000 && <p className="text-ink-500">Valor mínimo do bem em penhor: <strong>{formatMT(C * 1.5)}</strong></p>}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
