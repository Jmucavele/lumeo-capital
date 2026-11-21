import * as React from 'react';
import { Plus, Trash2, FileSpreadsheet, Wallet, TrendingUp, ShieldAlert, BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, Input, Label, Select, Spinner, EmptyState, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA,
  CONTAS,
  useApagarCaixa,
  useCaixa,
  useDadosRelatorios,
  useRegistarCaixa,
} from '@/hooks/useFinancas';
import { mensagemErro } from '@/hooks/usePagamentos';
import { carteira, demonstracaoResultados, exportarExcel, FAIXAS, fluxoMensal, isoParaDate, resumoCaixa } from '@/lib/relatorios';
import { cn, formatDate, formatMT } from '@/lib/utils';

type Aba = 'caixa' | 'resultados' | 'carteira' | 'evolucao';
const abas: { id: Aba; label: string; icon: React.ElementType }[] = [
  { id: 'caixa', label: 'Caixa', icon: Wallet },
  { id: 'resultados', label: 'Resultados', icon: TrendingUp },
  { id: 'carteira', label: 'Carteira & Risco', icon: ShieldAlert },
  { id: 'evolucao', label: 'Evolução mensal', icon: BarChart3 },
];

const hoje = () => new Date().toISOString().slice(0, 10);
const inicioMes = () => hoje().slice(0, 8) + '01';
const pct = (x: number) => `${(x * 100).toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const kfmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 0 })}k` : String(Math.round(v)));

function Kpi({ label, valor, tone, sub }: { label: string; valor: string; tone?: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase text-ink-400">{label}</p>
      <p className={cn('mt-1 text-lg md:text-xl font-display font-bold tabular', tone)}>{valor}</p>
      {sub && <p className="text-[11px] text-ink-400 mt-0.5">{sub}</p>}
    </Card>
  );
}

export function Financas() {
  const [aba, setAba] = React.useState<Aba>('caixa');
  const [de, setDe] = React.useState(inicioMes());
  const [ate, setAte] = React.useState(hoje());
  const caixa = useCaixa();
  const base = useDadosRelatorios();
  const subtitulo = `Período: ${formatDate(de)} a ${formatDate(ate)} · Emitido em ${formatDate(hoje())}`;

  const atalhos = [
    { l: 'Este mês', f: () => { setDe(inicioMes()); setAte(hoje()); } },
    { l: 'Mês passado', f: () => {
      const d = new Date(); const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)); const fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
      setDe(ini.toISOString().slice(0, 10)); setAte(fim.toISOString().slice(0, 10));
    } },
    { l: 'Este ano', f: () => { setDe(hoje().slice(0, 4) + '-01-01'); setAte(hoje()); } },
    { l: 'Tudo', f: () => { setDe('2020-01-01'); setAte(hoje()); } },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Finanças</h1>
        <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">
          Caixa, resultados e saúde da carteira. Desembolsos e pagamentos entram no caixa automaticamente; aqui só lança o resto (capital, despesas…).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {abas.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-1.5',
              aba === id ? 'bg-brass-500 text-ink-950' : 'bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-parchment-200/70 hover:bg-ink-200 dark:hover:bg-ink-700',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {aba !== 'carteira' && aba !== 'evolucao' && (
        <Card className="p-4 flex flex-wrap items-end gap-3">
          <div><Label>De</Label><Input type="date" value={de} onChange={(e) => setDe(e.target.value)} /></div>
          <div><Label>Até</Label><Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} /></div>
          <div className="flex flex-wrap gap-1.5">
            {atalhos.map((a) => <Button key={a.l} variant="outline" size="sm" onClick={a.f}>{a.l}</Button>)}
          </div>
        </Card>
      )}

      {(caixa.isLoading || base.isLoading) && <div className="flex justify-center py-14"><Spinner /></div>}
      {(caixa.isError || base.isError) && (
        <Card className="p-6 text-sm text-rust-500">
          Não foi possível carregar os dados financeiros. Confirme que correu a migração <code>migracao_v8_contratos_financas.sql</code> no Supabase.
        </Card>
      )}

      {caixa.data && base.data && aba === 'caixa' && <AbaCaixa de={de} ate={ate} subtitulo={subtitulo} />}
      {caixa.data && base.data && aba === 'resultados' && <AbaResultados de={de} ate={ate} subtitulo={subtitulo} />}
      {base.data && aba === 'carteira' && <AbaCarteira />}
      {caixa.data && base.data && aba === 'evolucao' && <AbaEvolucao />}
    </div>
  );
}

// ======================= CAIXA =======================
function AbaCaixa({ de, ate, subtitulo }: { de: string; ate: string; subtitulo: string }) {
  const { data = [] } = useCaixa();
  const registar = useRegistarCaixa();
  const apagar = useApagarCaixa();
  const [open, setOpen] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const vazio = { data: hoje(), tipo: 'saida' as 'entrada' | 'saida', categoria: CATEGORIAS_SAIDA[0], conta: 'numerario', descricao: '', valor: '' };
  const [f, setF] = React.useState(vazio);
  const r = React.useMemo(() => resumoCaixa(data, de, ate), [data, de, ate]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await registar.mutateAsync({ data: f.data, tipo: f.tipo, categoria: f.categoria, conta: f.conta, descricao: f.descricao || undefined, valor: parseFloat(f.valor) });
      setF(vazio);
      setOpen(false);
    } catch (err) {
      setErro(mensagemErro(err));
    }
  }

  function exportar() {
    exportarExcel('Caixa_LUMEO', subtitulo, [
      {
        nome: 'Caixa',
        titulo: 'Movimentos de Caixa',
        cabecalho: ['Data', 'Tipo', 'Categoria', 'Conta', 'Descrição', 'Entrada', 'Saída', 'Saldo'],
        linhas: [
          [null, '', 'Saldo inicial', '', '', null, null, r.saldoInicial],
          ...r.linhas.map((m) => [isoParaDate(m.data), m.tipo === 'entrada' ? 'Entrada' : 'Saída', m.categoria, CONTAS[m.conta] ?? m.conta, m.descricao ?? '', m.tipo === 'entrada' ? m.valor : null, m.tipo === 'saida' ? m.valor : null, m.saldo]),
        ],
        moeda: [5, 6, 7],
        datas: [0],
      },
      {
        nome: 'Por categoria',
        titulo: 'Caixa por categoria',
        cabecalho: ['Categoria', 'Entradas', 'Saídas'],
        linhas: [...r.porCategoria.entries()].map(([k, v]) => [k, v.entrada, v.saida]),
        moeda: [1, 2],
        total: [1, 2],
      },
    ]);
  }

  const cats = f.tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Saldo inicial" valor={formatMT(r.saldoInicial)} />
        <Kpi label="Entradas" valor={formatMT(r.entradas)} tone="text-moss-600 dark:text-moss-400" />
        <Kpi label="Saídas" valor={formatMT(r.saidas)} tone="text-rust-500" />
        <Kpi label="Saldo final" valor={formatMT(r.saldoFinal)} tone="text-brass-600 dark:text-brass-400" />
      </div>
      {r.saldoFinal < 0 && (
        <p className="text-sm text-rust-500">
          O saldo está negativo: provavelmente falta lançar o capital inicial (“Capital próprio / Injecção”) com data anterior ao primeiro desembolso.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={exportar}><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</Button>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo lançamento</Button>
      </div>

      <Card className="overflow-x-auto">
        {r.linhas.length === 0 ? (
          <EmptyState title="Sem movimentos neste período" description="Altere as datas ou lance um movimento." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                <th className="px-4 py-3">Data</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Conta</th><th className="px-4 py-3 text-right">Entrada</th><th className="px-4 py-3 text-right">Saída</th>
                <th className="px-4 py-3 text-right">Saldo</th><th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {r.linhas.map((m) => (
                <tr key={m.id} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(m.data)}</td>
                  <td className="px-4 py-2">
                    {m.categoria}
                    {m.origem === 'automatico' && <Badge className="ml-2 normal-case" tone="neutro">auto</Badge>}
                  </td>
                  <td className="px-4 py-2 text-ink-500">{m.descricao}</td>
                  <td className="px-4 py-2 text-ink-500">{CONTAS[m.conta] ?? m.conta}</td>
                  <td className="px-4 py-2 text-right tabular text-moss-600 dark:text-moss-400">{m.tipo === 'entrada' ? formatMT(m.valor) : ''}</td>
                  <td className="px-4 py-2 text-right tabular text-rust-500">{m.tipo === 'saida' ? formatMT(m.valor) : ''}</td>
                  <td className="px-4 py-2 text-right tabular font-medium">{formatMT(m.saldo)}</td>
                  <td className="px-2 py-2">
                    {m.origem === 'manual' && (
                      <button
                        className="p-1 rounded text-ink-400 hover:text-rust-500"
                        title="Apagar lançamento"
                        onClick={() => { if (window.confirm('Apagar este lançamento de caixa?')) apagar.mutate(m.id); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Dialog open={open} onClose={() => setOpen(false)} title="Novo lançamento de caixa" description="Desembolsos e pagamentos de clientes já entram sozinhos — não os lance aqui.">
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['entrada', 'saida'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setF({ ...f, tipo: t, categoria: (t === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA)[0] })}
                className={cn('rounded-lg border px-3 py-2 text-sm font-medium', f.tipo === t ? 'border-brass-500 bg-brass-500/10' : 'border-ink-200 dark:border-ink-700')}
              >
                {t === 'entrada' ? 'Entrada' : 'Saída / Despesa'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data *</Label><Input required type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
            <div><Label>Valor (MT) *</Label><Input required type="number" min={0.01} step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria *</Label>
              <Select value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
                {cats.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label>Conta</Label>
              <Select value={f.conta} onChange={(e) => setF({ ...f, conta: e.target.value })}>
                {Object.entries(CONTAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
          <div><Label>Descrição</Label><Input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
          {erro && <p className="text-sm text-rust-500">{erro}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={registar.isPending}>{registar.isPending ? 'A gravar…' : 'Gravar'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ======================= RESULTADOS =======================
function AbaResultados({ de, ate, subtitulo }: { de: string; ate: string; subtitulo: string }) {
  const { data: caixa = [] } = useCaixa();
  const { data: base } = useDadosRelatorios();
  const d = React.useMemo(() => demonstracaoResultados(base?.movimentos ?? [], caixa, de, ate), [base, caixa, de, ate]);

  function exportar() {
    const linhas: (string | number | null)[][] = [
      ['RECEITAS', null],
      ['Juros gerados (capitalizados)', d.jurosGerados],
      ...d.outrasReceitas.map(([k, v]) => [k, v]),
      ['Total de receitas', d.receitas],
      ['', null],
      ['CUSTOS OPERACIONAIS', null],
      ...d.custos.map(([k, v]) => [k, v]),
      ['Total de custos', d.totCustos],
      ['', null],
      ['RESULTADO DO PERÍODO', d.resultado],
      ['', null],
      ['Memorando — fluxo com clientes', null],
      ['Capital desembolsado', d.desembolsado],
      ['Recebido de clientes', d.recebido],
    ];
    exportarExcel('Resultados_LUMEO', subtitulo, [{ nome: 'Resultados', titulo: 'Demonstração de Resultados', cabecalho: ['Rubrica', 'Valor (MT)'], linhas, moeda: [1] }]);
  }

  const Linha = ({ k, v, forte, tone }: { k: string; v: number; forte?: boolean; tone?: string }) => (
    <div className={cn('flex justify-between py-1.5 border-b border-ink-50 dark:border-ink-800 text-sm', forte && 'font-semibold')}>
      <span>{k}</span>
      <span className={cn('tabular', tone)}>{formatMT(v)}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Receitas" valor={formatMT(d.receitas)} tone="text-moss-600 dark:text-moss-400" />
        <Kpi label="Custos" valor={formatMT(d.totCustos)} tone="text-rust-500" />
        <Kpi label="Resultado" valor={formatMT(d.resultado)} tone={d.resultado >= 0 ? 'text-brass-600 dark:text-brass-400' : 'text-rust-500'} sub={`Margem ${pct(d.margem)}`} />
        <Kpi label="Recebido de clientes" valor={formatMT(d.recebido)} sub={`Desembolsado ${formatMT(d.desembolsado)}`} />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={exportar}><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Demonstração de resultados</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs uppercase text-ink-400 mt-1 mb-1">Receitas</p>
          <Linha k="Juros gerados (capitalizados no período)" v={d.jurosGerados} />
          {d.outrasReceitas.map(([k, v]) => <Linha key={k} k={k} v={v} />)}
          <Linha k="Total de receitas" v={d.receitas} forte tone="text-moss-600 dark:text-moss-400" />
          <p className="text-xs uppercase text-ink-400 mt-5 mb-1">Custos operacionais</p>
          {d.custos.length === 0 && <p className="text-sm text-ink-400 py-1.5">Sem despesas lançadas no caixa neste período.</p>}
          {d.custos.map(([k, v]) => <Linha key={k} k={k} v={v} />)}
          <Linha k="Total de custos" v={d.totCustos} forte tone="text-rust-500" />
          <div className="mt-4"><Linha k="RESULTADO DO PERÍODO" v={d.resultado} forte tone={d.resultado >= 0 ? 'text-brass-600 dark:text-brass-400' : 'text-rust-500'} /></div>
          <p className="text-[11px] text-ink-400 mt-3">
            Os juros são reconhecidos quando são capitalizados (óptica do acréscimo), por isso incluem juros ainda não recebidos. Levantamentos do proprietário e entradas de capital não contam para o resultado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ======================= CARTEIRA & RISCO =======================
function AbaCarteira() {
  const { data: base } = useDadosRelatorios();
  const c = React.useMemo(() => carteira(base?.emprestimos ?? []), [base]);
  const subtitulo = `Posição em ${formatDate(hoje())}`;
  const corFaixa: Record<string, string> = { em_dia: 'bg-moss-500', d31: 'bg-brass-500', d61: 'bg-rust-400', d90: 'bg-rust-500' };

  function exportar() {
    exportarExcel('Carteira_LUMEO', subtitulo, [
      {
        nome: 'Carteira',
        titulo: 'Carteira activa e antiguidade',
        cabecalho: ['Empréstimo', 'Cliente', 'Contacto', 'Desembolso', 'Capital', 'Saldo em dívida', 'Último pagamento', 'Dias sem pagar', 'Faixa', 'Estado'],
        linhas: c.linhas.map((l) => [
          l.codigo, l.clientes?.nome_completo ?? '', l.clientes?.contacto ?? '', isoParaDate(l.data_desembolso), l.capital, l.saldo,
          l.data_ultimo_pagamento ? isoParaDate(l.data_ultimo_pagamento) : null, l.diasSemPagamento, FAIXAS.find((f) => f.id === l.faixa)?.label ?? '', l.estado,
        ]),
        moeda: [4, 5],
        datas: [3, 6],
        total: [4, 5],
      },
      {
        nome: 'Antiguidade',
        titulo: 'Antiguidade da carteira (aging) e PAR',
        cabecalho: ['Faixa', 'N.º empréstimos', 'Saldo', '% da carteira'],
        linhas: [
          ...c.faixas.map((f) => [f.label, f.n, f.valor, f.pct]),
          ['', null, null, null],
          ['PAR 30', null, null, c.par30],
          ['PAR 60', null, null, c.par60],
          ['PAR 90', null, null, c.par90],
        ],
        moeda: [2],
        pct: [3],
      },
      {
        nome: 'Concentração',
        titulo: 'Concentração por cliente',
        cabecalho: ['Cliente', 'N.º empréstimos', 'Saldo', '% da carteira'],
        linhas: c.top.map((t) => [t.nome, t.n, t.saldo, t.pct]),
        moeda: [2],
        pct: [3],
      },
    ]);
  }

  if (!c.linhas.length) return <Card><EmptyState title="Sem empréstimos activos" /></Card>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Carteira em dívida" valor={formatMT(c.total)} tone="text-brass-600 dark:text-brass-400" sub={`${c.linhas.length} empréstimos activos`} />
        <Kpi label="PAR 30" valor={pct(c.par30)} tone={c.par30 > 0.1 ? 'text-rust-500' : 'text-moss-600 dark:text-moss-400'} sub="Saldo com > 30 dias sem pagamento" />
        <Kpi label="PAR 90" valor={pct(c.par90)} tone={c.par90 > 0.05 ? 'text-rust-500' : 'text-moss-600 dark:text-moss-400'} sub="Risco de perda elevado" />
        <Kpi label="Maior exposição" valor={pct(c.top[0]?.pct ?? 0)} sub={c.top[0]?.nome} />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={exportar}><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Antiguidade (dias sem pagamento)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
              {c.faixas.map((f) => <div key={f.id} className={corFaixa[f.id]} style={{ width: `${f.pct * 100}%` }} title={f.label} />)}
            </div>
            {c.faixas.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className={cn('h-2.5 w-2.5 rounded-full', corFaixa[f.id])} />{f.label} <span className="text-ink-400">({f.n})</span></span>
                <span className="tabular">{formatMT(f.valor)} <span className="text-ink-400 text-xs ml-1">{pct(f.pct)}</span></span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Concentração por cliente</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {c.top.slice(0, 6).map((t) => (
              <div key={t.nome} className="text-sm">
                <div className="flex justify-between"><span>{t.nome}</span><span className="tabular">{formatMT(t.saldo)}</span></div>
                <div className="h-1.5 mt-1 rounded-full bg-ink-100 dark:bg-ink-800"><div className="h-1.5 rounded-full bg-brass-500" style={{ width: `${t.pct * 100}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
              <th className="px-4 py-3">Empréstimo</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3 text-right">Capital</th>
              <th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3">Último pagamento</th><th className="px-4 py-3 text-right">Dias</th>
            </tr>
          </thead>
          <tbody>
            {c.linhas.map((l) => (
              <tr key={l.id} className="border-b border-ink-50 dark:border-ink-800 last:border-0">
                <td className="px-4 py-2 font-mono text-xs">{l.codigo}</td>
                <td className="px-4 py-2">{l.clientes?.nome_completo}</td>
                <td className="px-4 py-2 text-right tabular">{formatMT(l.capital)}</td>
                <td className="px-4 py-2 text-right tabular font-medium">{formatMT(l.saldo)}</td>
                <td className="px-4 py-2">{formatDate(l.data_ultimo_pagamento)}</td>
                <td className="px-4 py-2 text-right">
                  <span className={cn('inline-flex items-center gap-1.5 tabular')}><span className={cn('h-2 w-2 rounded-full', corFaixa[l.faixa])} />{l.diasSemPagamento}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ======================= EVOLUÇÃO =======================
function AbaEvolucao() {
  const { data: caixa = [] } = useCaixa();
  const { data: base } = useDadosRelatorios();
  const serie = React.useMemo(() => fluxoMensal(base?.movimentos ?? [], caixa, 12), [base, caixa]);
  const tick = { fontSize: 11, fill: '#8a8f98' };

  function exportar() {
    exportarExcel('Evolucao_LUMEO', `Últimos 12 meses · Emitido em ${formatDate(hoje())}`, [
      {
        nome: 'Mensal',
        titulo: 'Evolução mensal',
        cabecalho: ['Mês', 'Desembolsos', 'Recebimentos', 'Juros gerados', 'Despesas', 'Fluxo líquido'],
        linhas: serie.map((s) => [s.chave, s.desembolsos, s.recebimentos, s.juros, s.despesas, s.recebimentos - s.desembolsos - s.despesas]),
        moeda: [1, 2, 3, 4, 5],
        total: [1, 2, 3, 4, 5],
      },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" onClick={exportar}><FileSpreadsheet className="h-4 w-4" /> Exportar Excel</Button>
      </div>
      <Card>
        <CardHeader><CardTitle>Desembolsos vs recebimentos (12 meses)</CardTitle></CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#8a8f9833" />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={kfmt} tick={tick} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => formatMT(v)} cursor={{ fill: '#8a8f981a' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="desembolsos" name="Desembolsos" fill="#202B40" radius={[4, 4, 0, 0]} />
              <Bar dataKey="recebimentos" name="Recebimentos" fill="#D9A441" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Juros gerados vs despesas</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#8a8f9833" />
              <XAxis dataKey="label" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={kfmt} tick={tick} axisLine={false} tickLine={false} width={44} />
              <Tooltip formatter={(v: number) => formatMT(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="juros" name="Juros gerados" fill="#437256" radius={[4, 4, 0, 0]} />
              <Line dataKey="despesas" name="Despesas" stroke="#C15D42" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
