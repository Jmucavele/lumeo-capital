import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useExtrato } from '@/hooks/usePagamentos';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Spinner } from '@/components/ui/primitives';
import { calcularReporte, FINALIDADES, gerarFicheiroBdm, MESES, type EmprestimoReporte, type ParametrosReporte } from '@/lib/reporteBdm';
import { formatMT } from '@/lib/utils';

const CHAVE = 'lumeo-reporte-bdm-parametros';

function dia15(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-15`;
}
const inicioDoMes = (iso: string) => `${iso.slice(0, 8)}01`;

const PADRAO: ParametrosReporte = {
  dataReporte: dia15(),
  inicioPeriodo: inicioDoMes(dia15()),
  denominacao: 'Lumeo Capital',
  endereco: 'Maputo',
  provincia: 'Maputo',
  telefone: '872222933',
  email: 'lumeo.capital@gmail.com',
  trabalhadores: 'Um (1)',
  dataInicioActividades: '23 de Junho 2023',
  operador: 'Julio Lazaro Mucavel',
  capitalInicial: 150000,
  capitaisAlheiosNacionais: 0,
  capitaisAlheiosEstrangeiros: 0,
  emprestimosObtidos: 0,
  donativosObtidos: 0,
  aumentoCapital: 0,
  prazoMin: 1,
  prazoMax: 1,
  caixaAnterior: 0,
  bancosAnterior: 0,
  caixaActual: 0,
  bancosActual: 0,
};

function lerGuardado(): ParametrosReporte {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    // as datas são sempre as do mês corrente; o resto vem do último reporte
    return { ...PADRAO, ...g, dataReporte: PADRAO.dataReporte, inicioPeriodo: PADRAO.inicioPeriodo };
  } catch {
    return PADRAO;
  }
}

function useEmprestimosReporte() {
  return useQuery<EmprestimoReporte[]>({
    queryKey: ['emprestimos-reporte-bdm'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emprestimos')
        .select('id, codigo, capital, taxa_juro, data_desembolso, finalidade, incluir_reporte_bdm, clientes ( id, nome_completo, sexo )')
        .order('codigo');
      if (error) throw error;
      return data as unknown as EmprestimoReporte[];
    },
  });
}

export function ReporteBdm() {
  const [p, setP] = React.useState<ParametrosReporte>(lerGuardado);
  const [aGerar, setAGerar] = React.useState(false);
  const qc = useQueryClient();
  const { data: emprestimos, isLoading, error } = useEmprestimosReporte();
  const { data: extrato, isLoading: carregandoExtrato } = useExtrato();

  const set = <K extends keyof ParametrosReporte>(k: K, v: ParametrosReporte[K]) => setP((x) => ({ ...x, [k]: v }));
  const num = (k: keyof ParametrosReporte) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (parseFloat(e.target.value) || 0) as never);
  const txt = (k: keyof ParametrosReporte) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never);

  const res = React.useMemo(
    () => (emprestimos && extrato ? calcularReporte(emprestimos, extrato, p) : null),
    [emprestimos, extrato, p]
  );

  // Sugestão de caixa: capital + juros recebidos − capital emprestado em carteira
  const caixaSugerida = res ? res.juroRecebidoAcumulado + p.capitalInicial + p.aumentoCapital - res.carteira.capital - p.bancosActual : 0;
  const caixaAntSugerida = res ? res.juroRecebidoAcumuladoAnterior + p.capitalInicial - res.carteiraAnteriorCapital - p.bancosAnterior : 0;

  async function actualizar(tabela: 'clientes' | 'emprestimos', id: string, campos: Record<string, unknown>) {
    const { error: err } = await supabase.from(tabela).update(campos).eq('id', id);
    if (err) return window.alert(err.message);
    qc.invalidateQueries({ queryKey: ['emprestimos-reporte-bdm'] });
  }

  async function gerar() {
    if (!res) return;
    if (res.pendencias.length && !window.confirm(`Há ${res.pendencias.length} dado(s) em falta (ver lista). Gerar mesmo assim?`)) return;
    setAGerar(true);
    try {
      try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* ignora */ }
      await gerarFicheiroBdm(res, p);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao gerar o ficheiro.');
    } finally {
      setAGerar(false);
    }
  }

  if (error) {
    return (
      <Card><CardContent className="p-6 space-y-2">
        <p className="font-semibold text-rust-500">Não foi possível carregar os dados do reporte.</p>
        <p className="text-sm text-ink-500">Confirme que correu a migração <code>supabase/migracao_v5_reporte_bdm.sql</code> no SQL Editor do Supabase.</p>
        <p className="text-xs text-ink-400">{(error as Error).message}</p>
      </CardContent></Card>
    );
  }

  const mes = MESES[Number(p.dataReporte.slice(5, 7)) - 1];
  const linhaResumo = (rot: string, a: React.ReactNode, b?: React.ReactNode, c?: React.ReactNode) => (
    <tr className="border-b border-ink-50 dark:border-ink-800 last:border-0">
      <td className="px-4 py-2">{rot}</td>
      <td className="px-4 py-2 tabular text-right">{a}</td>
      <td className="px-4 py-2 tabular text-right">{b ?? ''}</td>
      <td className="px-4 py-2 tabular text-right font-semibold">{c ?? ''}</td>
    </tr>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Reporte Banco de Moçambique</h1>
          <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
            Reporte periódico de microfinanças, gerado no modelo oficial do BdM a partir dos dados do sistema.
          </p>
        </div>
        <Button onClick={gerar} disabled={!res || aGerar}>
          <FileSpreadsheet className="h-4 w-4" /> {aGerar ? 'A gerar…' : `Gerar reporte de ${mes}`}
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Período e dados da instituição</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Data do reporte</Label><Input type="date" value={p.dataReporte} onChange={txt('dataReporte')} /></div>
          <div><Label>Início do período</Label><Input type="date" value={p.inicioPeriodo} onChange={txt('inicioPeriodo')} /></div>
          <div><Label>Nº de trabalhadores</Label><Input value={p.trabalhadores} onChange={txt('trabalhadores')} /></div>
          <div><Label>Operador</Label><Input value={p.operador} onChange={txt('operador')} /></div>
          <div><Label>Capital inicial (MT)</Label><Input type="number" value={p.capitalInicial} onChange={num('capitalInicial')} /></div>
          <div><Label>Aumento de capital no período</Label><Input type="number" value={p.aumentoCapital} onChange={num('aumentoCapital')} /></div>
          <div><Label>Empréstimos obtidos</Label><Input type="number" value={p.emprestimosObtidos} onChange={num('emprestimosObtidos')} /></div>
          <div><Label>Donativos obtidos</Label><Input type="number" value={p.donativosObtidos} onChange={num('donativosObtidos')} /></div>
          <div><Label>Capitais alheios nacionais</Label><Input type="number" value={p.capitaisAlheiosNacionais} onChange={num('capitaisAlheiosNacionais')} /></div>
          <div><Label>Capitais alheios estrangeiros</Label><Input type="number" value={p.capitaisAlheiosEstrangeiros} onChange={num('capitaisAlheiosEstrangeiros')} /></div>
          <div><Label>Prazo mínimo (meses)</Label><Input type="number" value={p.prazoMin} onChange={num('prazoMin')} /></div>
          <div><Label>Prazo máximo (meses)</Label><Input type="number" value={p.prazoMax} onChange={num('prazoMax')} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Situação financeira (secção 3)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Caixa — mês anterior</Label>
            <Input type="number" value={p.caixaAnterior} onChange={num('caixaAnterior')} />
            {res && <button className="text-xs text-brass-600 hover:underline mt-1" onClick={() => set('caixaAnterior', Math.round(caixaAntSugerida * 100) / 100)}>sugestão: {formatMT(caixaAntSugerida)}</button>}
          </div>
          <div><Label>Bancos — mês anterior</Label><Input type="number" value={p.bancosAnterior} onChange={num('bancosAnterior')} /></div>
          <div>
            <Label>Caixa — {mes}</Label>
            <Input type="number" value={p.caixaActual} onChange={num('caixaActual')} />
            {res && <button className="text-xs text-brass-600 hover:underline mt-1" onClick={() => set('caixaActual', Math.round(caixaSugerida * 100) / 100)}>sugestão: {formatMT(caixaSugerida)}</button>}
          </div>
          <div><Label>Bancos — {mes}</Label><Input type="number" value={p.bancosActual} onChange={num('bancosActual')} /></div>
          <p className="col-span-full text-xs text-ink-500">
            "Outros activos" é preenchido automaticamente com o capital da carteira de crédito. A sugestão de caixa = capital + juros recebidos − capital emprestado − bancos.
          </p>
        </CardContent>
      </Card>

      {isLoading || carregandoExtrato || !res ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : (
        <>
          {res.pendencias.length > 0 && (
            <div className="rounded-xl2 border border-brass-500/40 bg-brass-500/10 p-4 text-sm space-y-1">
              <p className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Dados em falta</p>
              {res.pendencias.map((x) => <p key={x}>• {x}</p>)}
            </div>
          )}

          <Card>
            <CardHeader><CardTitle>Pré-visualização dos valores</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                    <th className="px-4 py-2 font-medium">Rubrica</th>
                    <th className="px-4 py-2 font-medium text-right">Capital</th>
                    <th className="px-4 py-2 font-medium text-right">Juro</th>
                    <th className="px-4 py-2 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {linhaResumo(`Créditos concedidos no período (${res.concedidos.numero})`, formatMT(res.concedidos.capital), '', formatMT(res.concedidos.capital))}
                  {linhaResumo(`Créditos reembolsados no período (${res.reembolsados.numero} liquidados)`, formatMT(res.reembolsados.capital), formatMT(res.reembolsados.juro), formatMT(res.reembolsados.capital + res.reembolsados.juro))}
                  {linhaResumo('Carteira activa', formatMT(res.carteira.capital), formatMT(res.carteira.juro), formatMT(res.carteira.capital + res.carteira.juro))}
                  {['I (1–30 dias)', 'II (31–90)', 'III (91–365)', 'IV (> 365)'].map((c, i) =>
                    res.classes[i].capital + res.classes[i].juro > 0
                      ? <React.Fragment key={c}>{linhaResumo(`Em risco — Classe ${c}`, formatMT(res.classes[i].capital), formatMT(res.classes[i].juro), formatMT(res.classes[i].capital + res.classes[i].juro))}</React.Fragment>
                      : null
                  )}
                  {linhaResumo('Clientes activos (H / M / Outros)', `${res.clientes.homens} / ${res.clientes.mulheres} / ${res.clientes.outros}`)}
                  {linhaResumo('Taxa de juro mensal (mín – máx)', res.taxaMin === null ? '—' : `${(res.taxaMin * 100).toFixed(0)}% – ${((res.taxaMax ?? 0) * 100).toFixed(0)}%`)}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Créditos — classificação para o reporte</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                    <th className="px-4 py-2 font-medium">Empréstimo</th>
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-4 py-2 font-medium">Sexo</th>
                    <th className="px-4 py-2 font-medium">Finalidade</th>
                    <th className="px-4 py-2 font-medium">Em dívida</th>
                    <th className="px-4 py-2 font-medium">Atraso</th>
                    <th className="px-4 py-2 font-medium">Incluir no reporte</th>
                  </tr>
                </thead>
                <tbody>
                  {(emprestimos ?? []).map((e) => {
                    const d = res.detalhe.find((x) => x.codigo === e.codigo);
                    return (
                      <tr key={e.id} className={`border-b border-ink-50 dark:border-ink-800 last:border-0 ${e.incluir_reporte_bdm === false ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2 font-mono text-xs">{e.codigo}</td>
                        <td className="px-4 py-2">{e.clientes?.nome_completo}</td>
                        <td className="px-4 py-2">
                          <Select className="w-auto py-1" value={e.clientes?.sexo ?? ''} onChange={(ev) => e.clientes && actualizar('clientes', e.clientes.id, { sexo: ev.target.value || null })}>
                            <option value="">—</option><option value="M">Homem</option><option value="F">Mulher</option><option value="O">Outro</option>
                          </Select>
                        </td>
                        <td className="px-4 py-2">
                          <Select className="w-auto py-1" value={e.finalidade ?? ''} onChange={(ev) => actualizar('emprestimos', e.id, { finalidade: ev.target.value || null })}>
                            <option value="">—</option>
                            {FINALIDADES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </Select>
                        </td>
                        <td className="px-4 py-2 tabular">{d ? formatMT(d.capital + d.juro) : '—'}</td>
                        <td className="px-4 py-2">{d && d.diasAtraso > 0 ? `${d.diasAtraso} dias (Classe ${d.classe})` : '—'}</td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="accent-brass-500 h-4 w-4" checked={e.incluir_reporte_bdm !== false}
                            onChange={(ev) => actualizar('emprestimos', e.id, { incluir_reporte_bdm: ev.target.checked })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-ink-500">
            Regras: os pagamentos abatem primeiro o juro vencido e depois o capital. Um crédito entra em risco quando passa mais de 30 dias sem pagamento
            (desde o último pagamento ou o desembolso); as classes contam os dias além desses 30.
          </p>
        </>
      )}
    </div>
  );
}
