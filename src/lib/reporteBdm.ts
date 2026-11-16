// Reporte periódico de microfinanças ao Banco de Moçambique.
// 1) calcularReporte(): apura todos os números a partir dos empréstimos e
//    do extracto (movimentos).
// 2) gerarFicheiroBdm(): preenche o MODELO OFICIAL do BdM
//    (public/modelos/reporte_bdm.xlsx) editando directamente as células do
//    ficheiro — mantém o logótipo, as formatações e a estrutura aprovada.
import type { ViewExtrato } from '@/types/database.types';

export const FINALIDADES = [
  { value: 'comercio', label: 'Comércio', linha: 40 },
  { value: 'agricultura', label: 'Agricultura', linha: 41 },
  { value: 'negocio', label: 'Negócio', linha: 42 },
  { value: 'industria', label: 'Indústria', linha: 43 },
  { value: 'servicos', label: 'Serviços', linha: 44 },
  { value: 'consumo', label: 'Consumo', linha: 45 },
  { value: 'outros', label: 'Outros', linha: 46 },
] as const;

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export interface EmprestimoReporte {
  id: string;
  codigo: string;
  capital: number;
  taxa_juro: number;
  data_desembolso: string;
  finalidade: string | null;
  incluir_reporte_bdm: boolean | null;
  clientes: { id: string; nome_completo: string; sexo: string | null } | null;
}

export interface ParametrosReporte {
  dataReporte: string; // AAAA-MM-DD (normalmente dia 15)
  inicioPeriodo: string; // AAAA-MM-DD
  denominacao: string;
  endereco: string;
  provincia: string;
  telefone: string;
  email: string;
  trabalhadores: string;
  dataInicioActividades: string;
  operador: string;
  capitalInicial: number;
  capitaisAlheiosNacionais: number;
  capitaisAlheiosEstrangeiros: number;
  emprestimosObtidos: number;
  donativosObtidos: number;
  aumentoCapital: number;
  prazoMin: number;
  prazoMax: number;
  caixaAnterior: number;
  bancosAnterior: number;
  caixaActual: number;
  bancosActual: number;
}

interface EstadoCredito {
  capital: number;
  juro: number;
  capitalPagoPeriodo: number;
  juroPagoPeriodo: number;
  juroPagoAcumulado: number;
  ultimoPagamento: string | null;
  liquidadoNoPeriodo: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** Reconstrói capital e juro em dívida de um crédito até uma data.
 * Os pagamentos amortizam primeiro o juro vencido e depois o capital. */
function estadoNaData(movs: ViewExtrato[], ate: string, inicio: string): EstadoCredito {
  const e: EstadoCredito = { capital: 0, juro: 0, capitalPagoPeriodo: 0, juroPagoPeriodo: 0, juroPagoAcumulado: 0, ultimoPagamento: null, liquidadoNoPeriodo: false };
  for (const m of movs) {
    if (m.data_movimento > ate) break;
    const noPeriodo = m.data_movimento >= inicio;
    if (m.tipo === 'desembolso') e.capital += m.valor;
    else if (m.tipo === 'capitalizacao') e.juro += m.valor;
    else if (m.tipo === 'ajuste') e.capital += m.valor;
    else if (m.tipo === 'pagamento') {
      let pago = -m.valor;
      const pj = Math.min(pago, Math.max(e.juro, 0));
      e.juro -= pj;
      pago -= pj;
      e.capital -= pago;
      e.juroPagoAcumulado += pj;
      e.ultimoPagamento = m.data_movimento;
      if (noPeriodo) {
        e.juroPagoPeriodo += pj;
        e.capitalPagoPeriodo += pago;
        if (e.capital + e.juro <= 0.005) e.liquidadoNoPeriodo = true;
      }
    }
  }
  e.capital = r2(Math.max(e.capital, 0));
  e.juro = r2(Math.max(e.juro, 0));
  return e;
}

export interface ResultadoReporte {
  concedidos: { capital: number; numero: number };
  reembolsados: { capital: number; juro: number; numero: number };
  carteira: { capital: number; juro: number };
  risco: { capital: number; juro: number };
  classes: { capital: number; juro: number }[]; // I, II, III, IV
  porFinalidade: Record<string, number>;
  clientes: { homens: number; mulheres: number; outros: number };
  taxaMin: number | null;
  taxaMax: number | null;
  juroRecebidoAcumulado: number;
  carteiraAnteriorCapital: number;
  juroRecebidoAcumuladoAnterior: number;
  pendencias: string[];
  detalhe: {
    codigo: string; cliente: string; capital: number; juro: number; diasAtraso: number; classe: string;
  }[];
}

export function calcularReporte(emprestimos: EmprestimoReporte[], extrato: ViewExtrato[], p: ParametrosReporte): ResultadoReporte {
  const incluidos = emprestimos.filter((e) => e.incluir_reporte_bdm !== false);
  const porEmprestimo = new Map<string, ViewExtrato[]>();
  for (const m of extrato) {
    if (!porEmprestimo.has(m.emprestimo_id)) porEmprestimo.set(m.emprestimo_id, []);
    porEmprestimo.get(m.emprestimo_id)!.push(m);
  }
  const fimAnterior = new Date(Date.parse(p.inicioPeriodo) - 86400000).toISOString().slice(0, 10);

  const res: ResultadoReporte = {
    concedidos: { capital: 0, numero: 0 },
    reembolsados: { capital: 0, juro: 0, numero: 0 },
    carteira: { capital: 0, juro: 0 },
    risco: { capital: 0, juro: 0 },
    classes: [0, 1, 2, 3].map(() => ({ capital: 0, juro: 0 })),
    porFinalidade: {},
    clientes: { homens: 0, mulheres: 0, outros: 0 },
    taxaMin: null,
    taxaMax: null,
    juroRecebidoAcumulado: 0,
    carteiraAnteriorCapital: 0,
    juroRecebidoAcumuladoAnterior: 0,
    pendencias: [],
    detalhe: [],
  };
  const clientesActivos = new Map<string, string | null>();

  for (const e of incluidos) {
    if (e.data_desembolso > p.dataReporte) continue;
    const movs = porEmprestimo.get(e.id) ?? [];
    const st = estadoNaData(movs, p.dataReporte, p.inicioPeriodo);
    const ant = estadoNaData(movs, fimAnterior, p.inicioPeriodo);
    res.juroRecebidoAcumulado += st.juroPagoAcumulado;
    res.juroRecebidoAcumuladoAnterior += ant.juroPagoAcumulado;
    if (e.data_desembolso <= fimAnterior) res.carteiraAnteriorCapital += ant.capital;

    // Concedidos no período
    if (e.data_desembolso >= p.inicioPeriodo) {
      res.concedidos.capital += e.capital;
      res.concedidos.numero += 1;
      const f = e.finalidade ?? 'outros';
      res.porFinalidade[f] = (res.porFinalidade[f] ?? 0) + e.capital;
      if (!e.finalidade) res.pendencias.push(`${e.codigo}: finalidade não definida (contada em "Outros").`);
    }
    // Reembolsos no período
    res.reembolsados.capital += st.capitalPagoPeriodo;
    res.reembolsados.juro += st.juroPagoPeriodo;
    if (st.liquidadoNoPeriodo) res.reembolsados.numero += 1;

    // Carteira activa e risco
    if (st.capital + st.juro > 0.005) {
      res.carteira.capital += st.capital;
      res.carteira.juro += st.juro;
      clientesActivos.set(e.clientes?.id ?? e.id, e.clientes?.sexo ?? null);
      res.taxaMin = res.taxaMin === null ? e.taxa_juro : Math.min(res.taxaMin, e.taxa_juro);
      res.taxaMax = res.taxaMax === null ? e.taxa_juro : Math.max(res.taxaMax, e.taxa_juro);
      // Atraso: dias sem pagamento (desde o último pagamento ou desembolso) além de 30 dias
      const ref = st.ultimoPagamento ?? e.data_desembolso;
      const atraso = diasEntre(ref, p.dataReporte) - 30;
      let classe = '—';
      if (atraso > 0) {
        const i = atraso <= 30 ? 0 : atraso <= 90 ? 1 : atraso <= 365 ? 2 : 3;
        classe = ['I', 'II', 'III', 'IV'][i];
        res.classes[i].capital += st.capital;
        res.classes[i].juro += st.juro;
        res.risco.capital += st.capital;
        res.risco.juro += st.juro;
      }
      res.detalhe.push({ codigo: e.codigo, cliente: e.clientes?.nome_completo ?? '', capital: st.capital, juro: st.juro, diasAtraso: Math.max(atraso, 0), classe });
    }
  }
  for (const [, sexo] of clientesActivos) {
    if (sexo === 'M') res.clientes.homens++;
    else if (sexo === 'F') res.clientes.mulheres++;
    else res.clientes.outros++;
  }
  const semSexo = incluidos.filter((e) => clientesActivos.has(e.clientes?.id ?? e.id) && !e.clientes?.sexo);
  for (const e of semSexo) res.pendencias.push(`${e.clientes?.nome_completo ?? e.codigo}: sexo do cliente não definido (contado em "Outros").`);
  return res;
}

// ---------------------------------------------------------------------
// Escrita no modelo oficial (.xlsx) — edição directa do XML da folha
// ---------------------------------------------------------------------
type Valor = number | string | { f: string } | null;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const colNum = (ref: string) => ref.replace(/\d+/g, '').split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);

function escreverCelula(xml: string, ref: string, valor: Valor, estilo?: string): string {
  const linha = Number(ref.replace(/[A-Z]+/g, ''));
  let corpo = '', tipo = '';
  if (valor === null) corpo = '';
  else if (typeof valor === 'object') corpo = `<f>${esc(valor.f)}</f>`;
  else if (typeof valor === 'number') corpo = `<v>${r2(valor)}</v>`;
  else { corpo = `<is><t xml:space="preserve">${esc(valor)}</t></is>`; tipo = ' t="inlineStr"'; }

  const reCel = new RegExp(`<c r="${ref}"(?: s="(\\d+)")?[^>]*?(?:/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(reCel);
  if (m) {
    const s = m[1] ? ` s="${m[1]}"` : estilo ? ` s="${estilo}"` : '';
    return xml.replace(reCel, `<c r="${ref}"${s}${tipo}>${corpo}</c>`);
  }
  const nova = `<c r="${ref}"${estilo ? ` s="${estilo}"` : ''}${tipo}>${corpo}</c>`;
  const reLinha = new RegExp(`<row r="${linha}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const ml = xml.match(reLinha);
  if (!ml) throw new Error(`Linha ${linha} não existe no modelo`);
  if (ml[2] === '/>') return xml.replace(reLinha, `<row r="${linha}"${ml[1]}>${nova}</row>`);
  const interior = ml[3];
  const celulas = [...interior.matchAll(/<c r="([A-Z]+)\d+"/g)];
  const depois = celulas.find((c) => colNum(c[1]) > colNum(ref));
  const pos = depois ? depois.index! : interior.length;
  const novoInterior = interior.slice(0, pos) + nova + interior.slice(pos);
  return xml.replace(reLinha, `<row r="${linha}"${ml[1]}>${novoInterior}</row>`);
}

function dataPt(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

export async function gerarFicheiroBdm(res: ResultadoReporte, p: ParametrosReporte) {
  const { default: JSZip } = await import('jszip');
  const resp = await fetch('/modelos/reporte_bdm.xlsx');
  if (!resp.ok) throw new Error('Modelo do BdM não encontrado (public/modelos/reporte_bdm.xlsx).');
  const zip = await JSZip.loadAsync(await resp.arrayBuffer());
  const caminho = 'xl/worksheets/sheet1.xml';
  let xml = await zip.file(caminho)!.async('string');

  const mesActual = MESES[Number(p.dataReporte.slice(5, 7)) - 1];
  const mesAnterior = MESES[(Number(p.dataReporte.slice(5, 7)) + 10) % 12];
  const capitalActual = p.capitalInicial + p.aumentoCapital + res.juroRecebidoAcumulado;
  const pct = (v: number | null) => (v === null ? '' : `${r2(v * 100)}%`);

  const valores: [string, Valor][] = [
    ['A7', `PERÍODO DE REPORTE:  ${mesActual} ${p.dataReporte.slice(0, 4)}`],
    ['A8', `DATA:  ${dataPt(p.dataReporte)}`],
    ['A12', `Denominação: ${p.denominacao}`],
    ['A13', `Endereço: ${p.endereco}`],
    ['A14', `Provincia: ${p.provincia}`],
    ['A15', `Telefone: ${p.telefone}`],
    ['A16', `Fax:________________________________ E-mail: ${p.email}`],
    ['A17', `Nº de Trabalhadores: ${p.trabalhadores}`],
    ['A18', `Data de Início das Actividades: ${p.dataInicioActividades}`],
    ['A20', p.operador],
    // 2.1.1 Volume de créditos
    ['C26', res.concedidos.capital], ['D26', 0], ['E26', { f: 'C26+D26' }],
    ['C27', res.reembolsados.capital], ['D27', res.reembolsados.juro], ['E27', { f: 'C27+D27' }],
    ['C28', 0], ['D28', 0], ['E28', { f: 'C28+D28' }],
    ['C29', res.carteira.capital], ['D29', res.carteira.juro], ['E29', { f: 'C29+D29' }],
    ['C30', res.risco.capital], ['D30', res.risco.juro], ['E30', { f: 'C30+D30' }],
    // 2.1.2 Número de créditos
    ['C34', res.concedidos.numero], ['C35', res.reembolsados.numero],
    // 2.1.3 Por finalidade
    ...FINALIDADES.map((f) => [`E${f.linha}`, res.porFinalidade[f.value] ?? 0] as [string, Valor]),
    ['E47', { f: 'SUM(E40:E46)' }],
    // 2.1.4 Clientes
    ['E52', res.clientes.homens], ['E53', res.clientes.mulheres], ['E54', res.clientes.outros], ['E55', { f: 'SUM(E52:E54)' }],
    // 2.1.5 Carteira em risco
    ...res.classes.flatMap((c, i) => {
      const l = 60 + i;
      return [[`C${l}`, c.capital], [`D${l}`, c.juro], [`E${l}`, { f: `C${l}+D${l}` }]] as [string, Valor][];
    }),
    ['C64', { f: 'SUM(C60:C63)' }], ['D64', { f: 'SUM(D60:D63)' }], ['E64', { f: 'SUM(E60:E63)' }],
    // 2.2 Taxas e prazos
    ['D69', pct(res.taxaMin)], ['E69', pct(res.taxaMax)],
    ['D70', String(p.prazoMin)], ['E70', String(p.prazoMax)],
    // 2.3 Fontes de financiamento
    ['C74', p.capitalInicial + p.aumentoCapital], ['C76', p.capitaisAlheiosNacionais], ['C77', p.capitaisAlheiosEstrangeiros],
    ['C75', { f: 'C76+C77' }], ['C78', { f: 'C74+C75' }],
    // 2.4 Financiamentos do período
    ['C82', p.emprestimosObtidos], ['C83', p.donativosObtidos], ['C84', p.aumentoCapital], ['C85', { f: 'SUM(C82:C84)' }],
    // 2.5 Capital
    ['C89', p.capitalInicial], ['C90', capitalActual],
    // 3. Situação financeira (mês anterior | mês do reporte)
    ['C94', mesAnterior], ['D94', mesActual], ['E94', ''],
    ['C95', p.caixaAnterior], ['C96', p.bancosAnterior], ['C97', res.carteiraAnteriorCapital], ['C98', { f: 'SUM(C95:C97)' }],
    ['D95', p.caixaActual], ['D96', p.bancosActual], ['D97', res.carteira.capital], ['D98', { f: 'SUM(D95:D97)' }],
    ['E95', null], ['E96', null], ['E97', null], ['E98', null],
  ];
  for (const [ref, v] of valores) xml = escreverCelula(xml, ref, v, '26');
  zip.file(caminho, xml);

  // Força o Excel a recalcular as fórmulas ao abrir
  zip.remove('xl/calcChain.xml');
  const ct = await zip.file('[Content_Types].xml')!.async('string');
  zip.file('[Content_Types].xml', ct.replace(/<Override PartName="\/xl\/calcChain.xml"[^>]*\/>/, ''));
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship [^>]*calcChain[^>]*\/>/, ''));
  let wb = await zip.file('xl/workbook.xml')!.async('string');
  if (!wb.includes('fullCalcOnLoad')) wb = wb.replace(/<calcPr/, '<calcPr fullCalcOnLoad="1"');
  zip.file('xl/workbook.xml', wb);

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `REPORTE_Mensal_Lumeo_${mesActual}_${p.dataReporte.slice(0, 4)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
