// Contrato de Mútuo (Microcrédito) com Garantia — gerado em PDF já preenchido,
// com assinatura e carimbo do Director Geral. Texto fiel ao modelo
// Contrato_Mutuo_LUMEO_CAPITAL.docx.
import { valorPorExtenso } from '@/lib/documentos';
import { calcularPlano, garantiaExigida, type Plano } from '@/lib/simulador';
import type { TipoJuro } from '@/types/database.types';

type JsPDF = import('jspdf').jsPDF;
type RGB = [number, number, number];
const INK: RGB = [15, 21, 33];
const BRASS: RGB = [185, 131, 42];
const PARCH: RGB = [244, 240, 230];
const GREY: RGB = [110, 110, 110];

// ---------- Dados ----------
export type MeioDesembolso = 'numerario' | 'transferencia' | 'carteira';
export type TipoGarantia = 'sem' | 'fianca' | 'penhor' | 'viatura' | 'outra';

export interface DadosContrato {
  mutuario: {
    nome: string;
    nascimento?: string; // YYYY-MM-DD
    naturalidade?: string;
    documento?: string;
    doc_local?: string;
    doc_data?: string;
    nuit?: string;
    bairro?: string;
    quarteirao?: string;
    casa?: string;
    cidade?: string;
    morada?: string; // texto livre (ficha do cliente)
    telefone?: string;
    email?: string;
    profissao?: string;
  };
  fiador: {
    nome?: string;
    documento?: string;
    doc_local?: string;
    doc_data?: string;
    morada_telefone?: string;
    relacao?: string;
  };
  credito: {
    finalidade?: string;
    meio: MeioDesembolso;
    prazo_dias: number;
    n_prestacoes: number;
    comissao_pct?: number;
    garantia: TipoGarantia;
    garantia_outra?: string;
  };
  testemunhas?: { t1_nome?: string; t1_bi?: string; t2_nome?: string; t2_bi?: string };
}

export interface EmprestimoContrato {
  codigo: string;
  capital: number;
  taxa_juro: number;
  tipo_juro: TipoJuro;
  data_desembolso: string;
}

export function contratoVazio(): DadosContrato {
  return {
    mutuario: { nome: '' },
    fiador: {},
    credito: { meio: 'numerario', prazo_dias: 30, n_prestacoes: 1, comissao_pct: 0, garantia: 'sem' },
    testemunhas: {},
  };
}

export function sugerirGarantia(capital: number): TipoGarantia {
  if (capital <= 5000) return 'sem';
  if (capital <= 20000) return 'fianca';
  if (capital <= 50000) return 'penhor';
  return 'viatura';
}

// ---------- Formatação ----------
const nf = (v: number) => {
  const [i, d] = Math.abs(v).toFixed(2).split('.');
  return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d;
};
const mt = (v: number) => `${nf(v)} MT`;
const dt = (iso?: string | null) => {
  if (!iso) return '___/___/______';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const porExtensoData = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { dia: String(d).padStart(2, '0'), mes: MESES[m - 1], ano: String(y) };
};
const pct = (t: number) => `${(t * 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;
const PCT_EXT: Record<number, string> = { 25: 'vinte e cinco', 27: 'vinte e sete', 28: 'vinte e oito', 30: 'trinta', 20: 'vinte', 35: 'trinta e cinco', 15: 'quinze', 10: 'dez' };
const pctExt = (t: number) => {
  const p = Math.round(t * 10000) / 100;
  return PCT_EXT[p] ? `${PCT_EXT[p]} por cento` : `${p} por cento`;
};
const v = (s?: string | null, fallback = '________________') => (s && s.trim() ? s.trim() : fallback);
const box = (on: boolean) => (on ? '[X]' : '[  ]');
const nomeFicheiro = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');

async function carregarImagem(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const data: string = await new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result as string);
      fr.onerror = ko;
      fr.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => ok({ w: 1, h: 1 });
      img.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

// ---------- Escritor com quebra de página automática ----------
class Escritor {
  doc: JsPDF;
  y = 20;
  readonly mx = 18;
  readonly w: number;
  readonly h: number;
  constructor(doc: JsPDF) {
    this.doc = doc;
    this.w = doc.internal.pageSize.getWidth();
    this.h = doc.internal.pageSize.getHeight();
  }
  get largura() {
    return this.w - this.mx * 2;
  }
  espaco(altura: number) {
    if (this.y + altura > this.h - 20) {
      this.doc.addPage();
      this.y = 20;
    }
  }
  texto(t: string, o: { bold?: boolean; size?: number; cor?: RGB; align?: 'left' | 'center' | 'justify'; gap?: number; indent?: number } = {}) {
    const size = o.size ?? 9.5;
    const doc = this.doc;
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...(o.cor ?? INK));
    const ind = o.indent ?? 0;
    const linhas: string[] = doc.splitTextToSize(t, this.largura - ind);
    const lh = size * 0.42;
    for (let i = 0; i < linhas.length; i++) {
      this.espaco(lh);
      const ultima = i === linhas.length - 1;
      if (o.align === 'center') doc.text(linhas[i], this.w / 2, this.y, { align: 'center' });
      else if (o.align === 'justify' && !ultima) doc.text(linhas[i], this.mx + ind, this.y, { align: 'justify', maxWidth: this.largura - ind });
      else doc.text(linhas[i], this.mx + ind, this.y);
      this.y += lh;
    }
    this.y += o.gap ?? 1.6;
  }
  titulo(t: string) {
    this.espaco(14);
    this.y += 2;
    this.texto(t, { bold: true, size: 10, cor: BRASS, gap: 1.2 });
  }
  par(t: string, gap = 1.6) {
    this.texto(t, { align: 'justify', gap });
  }
}

// ---------- Geração ----------
export async function gerarContratoPDF(opts: {
  numero: string;
  dataContrato: string;
  emprestimo: EmprestimoContrato;
  dados: DadosContrato;
}) {
  const [{ jsPDF }, { default: autoTable }, assinatura, carimbo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    carregarImagem('/docs/assinatura.png'),
    carregarImagem('/docs/carimbo.png'),
  ]);
  const { numero, dataContrato, emprestimo: e, dados } = opts;
  const { mutuario: m, fiador: f, credito: c } = dados;
  const t = dados.testemunhas ?? {};
  const plano: Plano = calcularPlano({
    capital: e.capital,
    taxa: e.taxa_juro,
    tipo: e.tipo_juro,
    dataDesembolso: e.data_desembolso,
    prazoDias: c.prazo_dias,
    nPrestacoes: c.n_prestacoes,
  });
  const taxa = e.taxa_juro;
  const r1 = 1 + taxa;
  const dc = porExtensoData(dataContrato);
  const temFiador = !!(f.nome && f.nome.trim());

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = new Escritor(doc);
  const tabela = (body: (string | { content: string; styles?: object })[][], col0 = 52, extra: object = {}) => {
    W.espaco(12);
    autoTable(doc, {
      startY: W.y,
      body,
      theme: 'grid',
      styles: { fontSize: 8.6, cellPadding: 1.6, textColor: INK, lineColor: [200, 192, 175], lineWidth: 0.2, valign: 'middle' },
      columnStyles: { 0: { cellWidth: col0, fontStyle: 'bold', fillColor: PARCH } },
      margin: { left: W.mx, right: W.mx, top: 18, bottom: 20 },
      ...extra,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    W.y = (doc as any).lastAutoTable.finalY + 6;
  };

  // --- Cabeçalho ---
  doc.setFillColor(...INK);
  doc.rect(0, 0, W.w, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(217, 164, 65);
  doc.text('LUMEO CAPITAL, E.I.  ·  Instituição de Microcrédito  ·  Alvará n.º 1077/11/01/PS/2026  ·  NUIT 125624502', W.w / 2, 6, { align: 'center' });
  W.y = 20;
  W.texto('CONTRATO DE MÚTUO (MICROCRÉDITO) COM GARANTIA', { bold: true, size: 13, align: 'center', gap: 2 });
  W.texto(`Contrato n.º ${numero}          Maputo, ${dc.dia} de ${dc.mes} de ${dc.ano}`, { size: 9.5, align: 'center', cor: GREY, gap: 3 });
  W.texto(`Empréstimo no sistema: ${e.codigo}`, { size: 7.5, align: 'center', cor: GREY, gap: 4 });

  W.texto('ENTRE:', { bold: true, gap: 2 });
  W.par(
    'PRIMEIRA OUTORGANTE: LUMEO Capital, E.I., instituição de prestação de serviços financeiros e de microcrédito devidamente legalizada, com sede na Rua de Malhangalene B, n.º 2081, 2.º Andar Esquerdo — KaMpfumo, Maputo, representada neste acto pelo Sr. Júlio Lázaro Mucavel, na qualidade de Director Geral, titular do B.I. n.º 100502084059M, emitido pelo Arquivo de Identificação de Maputo aos 18 de Maio de 2022, com poderes bastantes para o acto, doravante designada «MUTUANTE»;',
    3,
  );

  W.texto('SEGUNDO(A) OUTORGANTE — MUTUÁRIO(A), doravante designado(a) «MUTUÁRIO»:', { bold: true });
  const moradaDet =
    m.bairro || m.quarteirao || m.casa || m.cidade
      ? `Bairro ${v(m.bairro, '______')}, Quarteirão ${v(m.quarteirao, '____')}, Casa n.º ${v(m.casa, '____')}, Cidade ${v(m.cidade, '________')}`
      : v(m.morada);
  tabela([
    ['Nome completo', v(m.nome)],
    ['Data de nascimento / Naturalidade', `${m.nascimento ? dt(m.nascimento) : '___/___/______'} / ${v(m.naturalidade, '____________')}`],
    ['Documento (B.I./Passaporte) n.º', `${v(m.documento)}   emitido em ${v(m.doc_local, '____________')} aos ${dt(m.doc_data)}`],
    ['NUIT', v(m.nuit)],
    ['Morada', moradaDet],
    ['Telefone / E-mail', `${v(m.telefone, '__________')} / ${v(m.email, '__________')}`],
    ['Profissão / Entidade empregadora', v(m.profissao)],
  ]);

  W.texto('TERCEIRO(A) OUTORGANTE — FIADOR(A)/AVALISTA, quando exigível nos termos da Cláusula 7.ª, doravante «FIADOR»:', { bold: true });
  tabela([
    ['Nome completo', v(f.nome)],
    ['Documento (B.I./Passaporte) n.º', `${v(f.documento)}   emitido em ${v(f.doc_local, '____________')} aos ${dt(f.doc_data)}`],
    ['Morada / Telefone', v(f.morada_telefone)],
    ['Relação com o Mutuário', v(f.relacao)],
  ]);

  W.texto('CONDIÇÕES PARTICULARES DO CRÉDITO', { bold: true, size: 10.5, cor: BRASS });
  const com = c.comissao_pct ?? 0;
  const garantiaTxt =
    `${box(c.garantia === 'sem')} Sem garantia real   ${box(c.garantia === 'fianca')} Fiança/Aval   ${box(c.garantia === 'penhor')} Penhor de bem móvel   ` +
    `${box(c.garantia === 'viatura')} Viatura   ${box(c.garantia === 'outra')} Outra: ${c.garantia === 'outra' ? v(c.garantia_outra, '______') : '______'}`;
  tabela([
    ['Capital mutuado', `${mt(e.capital)} (${valorPorExtenso(e.capital)})`],
    ['Finalidade do crédito', v(c.finalidade)],
    [
      'Data de desembolso',
      `${dt(e.data_desembolso)}    Meio: ${box(c.meio === 'numerario')} Numerário  ${box(c.meio === 'transferencia')} Transferência  ${box(c.meio === 'carteira')} Carteira móvel`,
    ],
    ['Prazo / N.º de prestações', `${c.prazo_dias} dias    ${c.n_prestacoes} prestação(ões)`],
    ['Taxa de juro', `${pct(taxa)} (${pctExt(taxa)}) ao mês, em regime de juros compostos (Cláusula 4.ª)`],
    ['Comissão de abertura', com > 0 ? `${com}% do capital (${mt((e.capital * com) / 100)}), paga na data do desembolso` : 'Isento'],
    ['Garantia prestada', garantiaTxt],
    ['Data limite de pagamento', `${dt(plano.dataLimite)}    Montante total a reembolsar: ${mt(plano.total)}`],
  ], 46);

  W.par(
    'As Partes celebram, de livre e esclarecida vontade, o presente Contrato de Mútuo, que se rege pelas Condições Particulares acima e pelas Condições Gerais seguintes, e pela legislação moçambicana aplicável, nomeadamente o Código Civil e o Aviso n.º 8/GBM/2021, de 22 de Dezembro, do Banco de Moçambique.',
    3,
  );

  // --- Condições gerais ---
  W.texto('CONDIÇÕES GERAIS', { bold: true, size: 11, align: 'center', cor: BRASS, gap: 2 });
  const T = (x: string) => W.titulo(x);
  const P = (x: string) => W.par(x);

  T('CLÁUSULA 1.ª — OBJECTO');
  P('1.1 Pelo presente contrato, o Mutuante empresta ao Mutuário a quantia indicada nas Condições Particulares (o «Capital»), que este declara ter recebido na data de desembolso, dando a correspondente quitação.');
  P('1.2 O Mutuário obriga-se a restituir o Capital, acrescido de juros, comissões e demais encargos, nos prazos e condições aqui estabelecidos.');
  P('1.3 O presente contrato substitui e incorpora integralmente a Confissão de Dívida (Modelo FM003) eventualmente assinada entre as Partes relativamente ao mesmo crédito.');

  T('CLÁUSULA 2.ª — DESEMBOLSO E FINALIDADE');
  P('2.1 O desembolso só é efectuado após a assinatura do contrato por todos os outorgantes, a entrega de cópia do documento de identificação, comprovativo de residência e, quando aplicável, a constituição da garantia.');
  P('2.2 O Mutuário compromete-se a utilizar o crédito para a finalidade declarada, podendo o Mutuante solicitar comprovativos.');

  T('CLÁUSULA 3.ª — PRAZO E PRESTAÇÕES');
  P('3.1 O crédito é reembolsado no prazo e no número de prestações fixados nas Condições Particulares e no Plano de Pagamento (Anexo I), que faz parte integrante deste contrato.');
  P('3.2 Por decisão do Mutuante, o reembolso pode ser feito em até 2 (duas) prestações. O valor remanescente após a primeira prestação continua a vencer juros nos termos da Cláusula 4.ª.');
  P('3.3 Quando a data de vencimento coincidir com sábado, domingo ou feriado, o pagamento deve ser feito no dia útil imediatamente anterior.');
  P('3.4 O prazo máximo de reembolso por operação não excede 6 (seis) meses, salvo acordo escrito em contrário.');

  T('CLÁUSULA 4.ª — JUROS E REGIME DE CAPITALIZAÇÃO');
  const tx = String(taxa.toFixed(2)).replace('.', ',');
  P(`4.1 O Capital vence juros à taxa de ${pct(taxa)} (${pctExt(taxa)}) ao mês, em regime de juros compostos.`);
  P('4.2 Decorrido cada mês sem pagamento integral do valor em dívida, os juros vencidos nesse mês são somados ao capital (capitalização), passando o mês seguinte a vencer juros sobre o novo saldo, e assim sucessivamente até à liquidação total.');
  P(`4.3 Para meses completos, o montante em dívida é M = C × (1 + ${tx})^n, onde C é o capital e n o número de meses; a Cláusula 4.5 generaliza esta fórmula a qualquer número de dias.`);
  P('4.4 Exemplo ilustrativo para um capital de 10.000,00 MT:');
  {
    const rows: string[][] = [];
    let s = 10000;
    for (let i = 1; i <= 4; i++) {
      const j = s * taxa;
      s += j;
      rows.push([String(i), mt(j), mt(s)]);
    }
    W.espaco(30);
    autoTable(doc, {
      startY: W.y,
      head: [['Mês', 'Juros do mês', 'Saldo em dívida']],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.4, halign: 'center', textColor: INK, lineColor: [200, 192, 175], lineWidth: 0.2 },
      headStyles: { fillColor: INK, textColor: [217, 164, 65] },
      margin: { left: W.mx + 25, right: W.mx + 25, bottom: 20 },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    W.y = (doc as any).lastAutoTable.finalY + 4;
  }
  P('4.5 Contagem diária: os juros compostos correm desde o primeiro dia, sem distinção entre meses completos e fracções de mês. Cada dia conta como 1/30 de mês e o montante em dívida em qualquer data é dado pela fórmula única:');
  W.texto(`M = C × (1 + ${tx})^(t ÷ 30)`, { bold: true, align: 'center' });
  P('onde C = capital e t = número de dias decorridos desde o desembolso.');
  P(`Exemplo A — pagamento aos 15 dias, capital de 10.000,00 MT: M = 10.000 × ${r1.toFixed(2).replace('.', ',')}^0,5 = ${mt(10000 * Math.pow(r1, 0.5))}.`);
  const exB = 10000 * Math.pow(r1, 1.5);
  P(`Exemplo B — pagamento aos 45 dias: M = 10.000 × ${r1.toFixed(2).replace('.', ',')}^1,5 = ${mt(exB)}. Aos 30 e 60 dias o resultado coincide com a tabela da 4.4 (${mt(10000 * r1)} e ${mt(10000 * r1 * r1)}).`);
  P('4.6 Taxa de juro efectiva: é o custo real do crédito para o período em que o capital esteve em dívida, já considerando a capitalização, e calcula-se por:');
  W.texto('Taxa efectiva do período = (M ÷ C) - 1', { bold: true, align: 'center' });
  const fmtP = (x: number) => `${(x * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  P(
    `No Exemplo B: (${nf(exB)} ÷ 10.000) - 1 = ${fmtP(exB / 10000 - 1)} para 45 dias. Em 2 meses: ${fmtP(r1 ** 2 - 1)}; em 3 meses: ${fmtP(r1 ** 3 - 1)}. ` +
      `A taxa efectiva anual equivalente é (1 + ${tx})¹² - 1 = ${fmtP(r1 ** 12 - 1)}.`,
  );
  P('4.7 O Mutuário declara ter compreendido que, em caso de não pagamento, a dívida cresce de forma composta e não apenas proporcional ao tempo.');

  T('CLÁUSULA 5.ª — FORMA E LOCAL DE PAGAMENTO');
  P('5.1 Os pagamentos são feitos por depósito, transferência interbancária ou carteira móvel, com comunicação prévia ao Mutuante, exclusivamente para:');
  for (const l of [
    '•  872 222 933 — M-Vodafone/Movitel (Júlio Lázaro Mucavel)',
    '•  848 222 933 — M-Pesa (Júlio Lázaro Mucavel)',
    '•  Standard Bank — Titular: LUMEO CAPITAL MICROCREDITO EI — Conta n.º 1250023162587',
    '    NIB: 000301250002316258781 · NUIB: 202600001963944 · IBAN: MZ59000301250002316258781 · SWIFT: SBICMZMX',
  ])
    W.texto(l, { indent: 6, gap: 0.6 });
  W.y += 1;
  P('5.2 O pagamento só se considera efectuado quando o valor estiver disponível na conta do Mutuante. O Mutuário deve guardar o comprovativo e enviá-lo no próprio dia.');
  P('5.3 Os pagamentos recebidos são imputados pela seguinte ordem: (i) despesas de cobrança; (ii) juros de mora; (iii) juros remuneratórios; (iv) capital.');
  P('5.4 O Mutuante emitirá recibo de cada pagamento e declaração de quitação após a liquidação integral.');

  T('CLÁUSULA 6.ª — PAGAMENTO ANTECIPADO');
  P('6.1 O Mutuário pode liquidar antecipadamente, total ou parcialmente, a dívida, a qualquer momento, sem penalização, pagando apenas os juros vencidos até à data do pagamento.');

  T('CLÁUSULA 7.ª — GARANTIAS');
  P('7.1 Em função do montante do Capital, o Mutuário presta as seguintes garantias mínimas:');
  W.espaco(30);
  autoTable(doc, {
    startY: W.y,
    head: [['Capital mutuado', 'Garantia exigida']],
    body: [
      ['Até 5.000 MT', 'Este contrato como título executivo + contacto de referência'],
      ['5.001 a 20.000 MT', 'Fiança/aval pessoal de um Fiador com rendimento comprovado'],
      ['20.001 a 50.000 MT', 'Fiador + penhor de bem móvel (electrodoméstico, equipamento, telemóvel, etc.) de valor >= 150% do capital'],
      ['Acima de 50.000 MT', 'Fiador + penhor de viatura (com entrega do livrete/título de registo) ou outro bem de valor >= 150% do capital; declaração de rendimentos'],
    ],
    theme: 'grid',
    styles: { fontSize: 8.3, cellPadding: 1.4, textColor: INK, lineColor: [200, 192, 175], lineWidth: 0.2 },
    headStyles: { fillColor: INK, textColor: [217, 164, 65] },
    columnStyles: { 0: { cellWidth: 36, fontStyle: 'bold' } },
    margin: { left: W.mx, right: W.mx, bottom: 20 },
    didParseCell: (d) => {
      const g = garantiaExigida(e.capital).nivel;
      if (d.section === 'body' && (d.row.raw as string[])[0] === g) d.cell.styles.fillColor = [250, 236, 205];
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  W.y = (doc as any).lastAutoTable.finalY + 4;
  P('7.2 Os bens dados em garantia são identificados no Anexo II, e permanecem afectos ao pagamento até à liquidação total.');
  P('7.3 O Mutuário declara ser o legítimo proprietário dos bens dados em garantia, livres de ónus, e obriga-se a não os vender, onerar ou ceder sem autorização escrita do Mutuante.');
  P('7.4 A entrega de qualquer bem em garantia é formalizada no Auto de Entrega de Bem em Garantia (Anexo II), que deve: (a) descrever o bem com todas as suas características identificativas (tipo, marca, modelo, cor, ano, n.º de série/IMEI/chassi/motor, matrícula, estado de conservação, acessórios e documentos entregues); (b) indicar o valor de avaliação acordado; (c) ser assinado pelo Mutuário, pelo proprietário do bem (se diferente), pelo Fiador e pelo Mutuante; (d) ter as assinaturas reconhecidas presencialmente por Notário; e (e) ser visado pela Polícia da República de Moçambique (PRM), com assinatura e carimbo da esquadra da área.');
  P('7.5 Sem o Auto de Entrega devidamente assinado, reconhecido no Notário e visado pela PRM, a garantia considera-se não constituída e o Mutuante não está obrigado a efectuar o desembolso. Os custos do reconhecimento notarial são suportados pelo Mutuário.');
  P('7.6 Se a garantia perder valor ou se tornar insuficiente, o Mutuante pode exigir o seu reforço no prazo de 5 (cinco) dias úteis.');

  T('CLÁUSULA 8.ª — FIANÇA');
  P('8.1 O Fiador responsabiliza-se solidariamente com o Mutuário, como principal pagador, pelo cumprimento de todas as obrigações deste contrato, renunciando ao benefício da excussão prévia.');
  P('8.2 A fiança mantém-se válida até à liquidação integral da dívida, incluindo eventuais prorrogações acordadas.');

  T('CLÁUSULA 9.ª — INCUMPRIMENTO E MORA');
  P('9.1 Há mora quando qualquer prestação não for paga na data do vencimento.');
  P('9.2 Nos termos dos artigos 38.º a 40.º do Aviso n.º 8/GBM/2021, os juros de mora incidem apenas sobre o valor da prestação vencida e não paga, a uma taxa que não excede 2% ao ano, calculada proporcionalmente aos dias de atraso, não sendo cobrados outros encargos com fundamento na mora, além dos resultantes da cobrança judicial.');
  P('9.3 Os juros remuneratórios compostos da Cláusula 4.ª continuam a correr sobre o saldo em dívida até à liquidação total.');

  T('CLÁUSULA 10.ª — VENCIMENTO ANTECIPADO');
  P('10.1 O Mutuante pode declarar vencida e exigir de imediato a totalidade da dívida quando: (a) se verifique atraso superior a 15 dias em qualquer prestação; (b) o Mutuário preste informações falsas; (c) a garantia seja alienada, danificada ou não reforçada; (d) o Mutuário mude de residência ou contacto sem aviso.');

  T('CLÁUSULA 11.ª — COBRANÇA');
  P('11.1 Em caso de atraso, o Mutuante contactará o Mutuário e o Fiador por telefone, SMS, mensagem ou carta, sempre em horário razoável e com respeito pela sua dignidade e privacidade.');
  P('11.2 Esgotados 30 dias de atraso sem acordo de regularização, o Mutuante pode executar as garantias e/ou recorrer à via judicial.');

  T('CLÁUSULA 12.ª — EXECUÇÃO DAS GARANTIAS');
  P('12.1 No incumprimento, o Mutuante pode promover a venda do bem empenhado, pelo melhor preço de mercado, após notificação escrita ao Mutuário com 10 (dez) dias de antecedência.');
  P('12.2 O produto da venda é aplicado à dívida pela ordem da Cláusula 5.3. Qualquer excedente é devolvido ao Mutuário; se for insuficiente, o Mutuário e o Fiador continuam responsáveis pelo remanescente.');

  T('CLÁUSULA 13.ª — OBRIGAÇÕES DO MUTUÁRIO');
  P('13.1 Nos termos da alínea d) do artigo 8.º do Aviso n.º 8/GBM/2021, o Mutuário deve cumprir pontualmente o contrato. Obriga-se ainda a: (a) informar qualquer alteração de morada, emprego ou contacto em 5 dias; (b) conservar os bens dados em garantia; (c) prestar informação verdadeira.');

  T('CLÁUSULA 14.ª — DADOS PESSOAIS E CONFIDENCIALIDADE');
  P('14.1 Os dados pessoais recolhidos destinam-se apenas à gestão deste contrato e à cobrança, podendo ser comunicados às autoridades competentes quando legalmente exigido.');

  T('CLÁUSULA 15.ª — TÍTULO EXECUTIVO, DESPESAS E FORO');
  P('15.1 O presente contrato constitui título executivo nos termos da alínea c) do artigo 46.º do Código de Processo Civil.');
  P('15.2 São da responsabilidade do Mutuário as despesas judiciais e extrajudiciais, incluindo honorários de advogado, em que o Mutuante incorra com a cobrança coerciva.');
  P('15.3 Para dirimir quaisquer litígios, as Partes elegem o foro judicial da Cidade de Maputo, com renúncia a qualquer outro.');

  T('CLÁUSULA 16.ª — DISPOSIÇÕES FINAIS');
  P('16.1 Qualquer alteração a este contrato só é válida por escrito, assinada por todas as Partes.');
  P('16.2 O Mutuário e o Fiador declaram ter lido o contrato, recebido explicação clara sobre a taxa de juro, o regime de capitalização, as garantias e as consequências do incumprimento, e recebido um exemplar assinado.');
  P('16.3 O contrato é feito em 2 (dois) exemplares de igual valor, um para cada parte.');

  // --- Anexo I ---
  W.espaco(60);
  W.y += 3;
  W.texto('ANEXO I — PLANO DE PAGAMENTO', { bold: true, size: 10.5, cor: BRASS });
  desenharPlano(doc, autoTable, W, { emprestimo: e, plano, prazoDias: c.prazo_dias, comissaoPct: c.comissao_pct ?? 0 });

  // --- Assinaturas ---
  W.espaco(95);
  W.par('E por estarem de acordo, as Partes assinam o presente contrato, que rubricam em todas as páginas.');
  W.texto(`Maputo, ${dc.dia} de ${dc.mes} de ${dc.ano}`, { gap: 6 });
  const colW = W.largura / 3;
  const yLinha = W.y + 24;
  const colX = [W.mx, W.mx + colW, W.mx + colW * 2];
  const cab = ['O MUTUANTE', 'O(A) MUTUÁRIO(A)', 'O(A) FIADOR(A)'];
  doc.setFontSize(8.5);
  cab.forEach((t2, i) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(t2, colX[i] + colW / 2, W.y, { align: 'center' });
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(colX[i] + 5, yLinha, colX[i] + colW - 5, yLinha);
  });
  // Carimbo por baixo, assinatura por cima
  if (carimbo) {
    const s = 34;
    doc.addImage(carimbo.data, 'PNG', colX[0] + colW / 2 - s / 2 + 8, yLinha - 24, s, s);
  }
  if (assinatura) {
    const aw = 30;
    const ah = (aw * assinatura.h) / assinatura.w;
    doc.addImage(assinatura.data, 'PNG', colX[0] + colW / 2 - aw / 2 - 4, yLinha - ah + 3, aw, ah);
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.text('LUMEO Capital, E.I.', colX[0] + colW / 2, yLinha + 4, { align: 'center' });
  doc.text('Júlio Lázaro Mucavel — Director Geral', colX[0] + colW / 2, yLinha + 8, { align: 'center' });
  doc.text(doc.splitTextToSize(`Nome: ${m.nome}`, colW - 8), colX[1] + colW / 2, yLinha + 4, { align: 'center' });
  doc.text(doc.splitTextToSize(`Nome: ${temFiador ? f.nome : '______________________'}`, colW - 8), colX[2] + colW / 2, yLinha + 4, { align: 'center' });
  // Caixas para impressão digital
  [1, 2].forEach((i) => {
    doc.setDrawColor(170, 170, 170);
    doc.rect(colX[i] + colW / 2 - 11, yLinha + 12, 22, 22);
    doc.setFontSize(6.5);
    doc.setTextColor(...GREY);
    doc.text('Impressão digital', colX[i] + colW / 2, yLinha + 37, { align: 'center' });
  });
  W.y = yLinha + 46;

  // Testemunhas
  W.espaco(25);
  const half = W.largura / 2;
  const yT = W.y + 12;
  [
    ['TESTEMUNHA 1', t.t1_nome, t.t1_bi],
    ['TESTEMUNHA 2', t.t2_nome, t.t2_bi],
  ].forEach(([tt, nome, bi], i) => {
    const x = W.mx + half * i;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(tt as string, x + half / 2, W.y, { align: 'center' });
    doc.line(x + 10, yT, x + half - 10, yT);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.text(`Nome: ${v(nome, '__________________')}   B.I. n.º ${v(bi, '____________')}`, x + half / 2, yT + 4, { align: 'center' });
  });
  W.y = yT + 10;

  // --- Anexo II (só quando há penhor/viatura/outra garantia real) ---
  if (c.garantia === 'penhor' || c.garantia === 'viatura' || c.garantia === 'outra') {
    doc.addPage();
    W.y = 20;
    W.texto('ANEXO II — AUTO DE ENTREGA DE BEM EM GARANTIA (PENHOR)', { bold: true, size: 11, cor: BRASS, align: 'center' });
    W.texto(`Parte integrante do Contrato de Mútuo n.º ${numero} — documento sujeito a reconhecimento notarial e visto da PRM`, { size: 8, cor: GREY, align: 'center', gap: 4 });
    W.par(
      `Aos ____ dias do mês de ______________ de 20____, em Maputo, o(a) Sr.(a) ${m.nome}, portador(a) do B.I. n.º ${v(m.documento, '____________________')}, na qualidade de [  ] Mutuário  [  ] Proprietário do bem, entrega à LUMEO Capital, E.I., que recebe, em garantia (penhor) do Contrato de Mútuo acima identificado, o bem abaixo descrito, declarando ser o seu legítimo proprietário e que o mesmo se encontra livre de quaisquer ónus, encargos, penhoras ou litígios.`,
      3,
    );
    W.texto('1. IDENTIFICAÇÃO DO BEM', { bold: true });
    tabela([
      ['Tipo de bem', `${box(c.garantia === 'viatura')} Viatura  [  ] Motorizada  [  ] Electrónico  [  ] Electrodoméstico  [  ] Equipamento  [  ] Outro: ________`],
      ['Marca / Modelo', ''],
      ['Cor / Ano de fabrico', ''],
      ['N.º de série / IMEI', ''],
      ['N.º de chassi / N.º de motor', ''],
      ['Matrícula / N.º do livrete ou título', ''],
      ['Quilometragem / Horas de uso', ''],
      ['Estado de conservação', '[  ] Novo  [  ] Bom  [  ] Razoável  [  ] Com defeitos: ________________'],
      ['Danos / sinais visíveis', ''],
      ['Acessórios entregues', '[  ] Chaves (n.º ___)  [  ] Carregador  [  ] Caixa  [  ] Comando  [  ] Outros: ______'],
      ['Documentos entregues', '[  ] Livrete/Título de registo  [  ] Factura de compra  [  ] Seguro  [  ] Outros: ______'],
      ['Valor de avaliação acordado', `__________________ MT (mínimo recomendado: ${mt(e.capital * 1.5)})`],
      ['Local de guarda do bem', '[  ] Instalações do Mutuante  [  ] Outro: ____________________'],
      ['Registo fotográfico', '[  ] Sim — n.º de fotografias: ____ (rubricadas e anexas a este auto)'],
    ], 52, { styles: { fontSize: 8.4, cellPadding: 2.2, textColor: INK, lineColor: [200, 192, 175], lineWidth: 0.2, minCellHeight: 7 } });
    W.texto('2. DECLARAÇÕES', { bold: true });
    P('a) O bem permanece em posse do Mutuante até à liquidação total da dívida, sendo devolvido no estado em que foi entregue, salvo o desgaste normal, mediante declaração de quitação. b) Em caso de incumprimento, o Mutuante pode proceder à venda do bem nos termos da Cláusula 12.ª do Contrato. c) O Mutuante responde pela guarda diligente do bem, não respondendo por defeitos ocultos ou anteriores à entrega. d) As partes conferiram o bem e confirmam que a descrição acima corresponde à realidade.');
    W.texto('3. ASSINATURAS', { bold: true, gap: 3 });
    tabela(
      [
        [`Entregou — Mutuário/Proprietário\n\n\n_____________________________\nNome: ${m.nome}`, 'Recebeu — LUMEO Capital, E.I.\n\n\n_____________________________\nNome: Júlio Lázaro Mucavel'],
        [`O(A) Fiador(a)\n\n\n_____________________________\nNome: ${temFiador ? f.nome : '______________________'}`, 'Testemunha\n\n\n_____________________________\nNome: ______________________'],
        [
          'RECONHECIMENTO NOTARIAL\nReconheço as assinaturas supra de ______________________, feitas na minha presença.\nCartório Notarial de ______________\nData: ___/___/______\nO(A) Notário(a): ________________\n(Selo / Carimbo do Cartório)',
          'VISTO DA POLÍCIA (PRM)\nVisto. Tomado conhecimento da entrega do bem acima descrito em garantia.\nEsquadra / Comando: ______________\nNome do agente: ________________\nPosto / N.º: ____________ Data: ___/___/______\nAssinatura: ________________ (Carimbo da Esquadra)',
        ],
      ],
      W.largura / 2,
      { columnStyles: { 0: { cellWidth: W.largura / 2 } }, styles: { fontSize: 8, cellPadding: 3, textColor: INK, lineColor: [200, 192, 175], lineWidth: 0.2, halign: 'center' } },
    );
  }

  // --- Rodapé com rubricas ---
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(217, 164, 65);
    doc.setLineWidth(0.3);
    doc.line(W.mx, W.h - 13, W.w - W.mx, W.h - 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(`Contrato n.º ${numero}`, W.mx, W.h - 8.5);
    doc.text('Rubricas: Mutuante ______  Mutuário ______  Fiador ______', W.w / 2, W.h - 8.5, { align: 'center' });
    doc.text(`Página ${i} de ${n}`, W.w - W.mx, W.h - 8.5, { align: 'right' });
  }

  doc.save(`Contrato_${nomeFicheiro(numero)}_${nomeFicheiro(m.nome)}.pdf`);
}


// ======================================================================
// Plano de pagamento — usado no Anexo I e como documento independente
// ======================================================================
type AutoTable = typeof import('jspdf-autotable').default;

function desenharPlano(
  doc: JsPDF,
  autoTable: AutoTable,
  W: Escritor,
  o: { emprestimo: EmprestimoContrato; plano: Plano; prazoDias: number; comissaoPct: number },
) {
  const { emprestimo: e, plano } = o;
  const n = plano.prestacoes.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fim = () => (doc as any).lastAutoTable.finalY as number;

  // 1) Resumo em quadros
  const resumo: [string, string][] = [
    ['Capital', mt(e.capital)],
    ['Taxa de juro', `${pct(e.taxa_juro)} ao mês`],
    ['Prazo', `${o.prazoDias} dias`],
    ['N.º de prestações', `${n}`],
    ['Total a reembolsar', mt(plano.total)],
    ['Data limite', dt(plano.dataLimite)],
  ];
  W.espaco(26);
  const bw = (W.largura - 5 * 2) / 3;
  resumo.forEach(([k, v], i) => {
    const x = W.mx + (i % 3) * (bw + 2);
    const y = W.y + Math.floor(i / 3) * 13;
    doc.setFillColor(...PARCH);
    doc.roundedRect(x, y, bw, 11, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(...GREY);
    doc.text(k.toUpperCase(), x + 3, y + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...(i === 4 ? BRASS : INK));
    doc.text(v, x + 3, y + 9);
  });
  W.y += 28;

  // 2) Prestações
  autoTable(doc, {
    startY: W.y,
    head: [['Prestação', 'Data de vencimento', 'Dias', 'Capital', 'Juros', 'Valor da prestação', 'Saldo após pagamento']],
    body: plano.prestacoes.map((p) => [`${p.n}.ª`, dt(p.data), String(p.dias), nf(p.capital), nf(p.juros), nf(p.valor), nf(p.saldo)]),
    foot: [['TOTAL', '', '', nf(e.capital), nf(plano.totalJuros), nf(plano.total), '']],
    theme: 'grid',
    styles: { fontSize: 8.6, cellPadding: 1.8, textColor: INK, lineColor: [200, 192, 175], lineWidth: 0.2 },
    headStyles: { fillColor: INK, textColor: [217, 164, 65], halign: 'center' },
    footStyles: { fillColor: PARCH, textColor: INK, fontStyle: 'bold' },
    columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' }, 2: { halign: 'center' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'right' } },
    margin: { left: W.mx, right: W.mx, bottom: 20 },
    didParseCell: (d) => { if (d.section === 'foot' && d.column.index >= 3) d.cell.styles.halign = 'right'; },
  });
  W.y = fim() + 5;
  W.texto(
    `Juros compostos à taxa de ${pct(e.taxa_juro)} ao mês (${e.tipo_juro === 'mensal' ? 'capitalização mensal no desembolso e a cada aniversário' : 'contagem diária, Cláusula 4.5'}). ` +
      'Datas ajustadas para o dia útil anterior quando calham ao fim-de-semana (Cláusula 3.3).' +
      (o.comissaoPct > 0 ? ` Comissão de abertura de ${o.comissaoPct}% (${mt((e.capital * o.comissaoPct) / 100)}) paga no desembolso.` : ''),
    { size: 7.3, cor: GREY, gap: 4 },
  );

  // 3) Liquidação antecipada (Cláusula 6.ª)
  const linhasAnt: string[][] = [];
  const marcos = [7, 15].filter((d) => d < plano.prestacoes[0].dias);
  for (const d of marcos) {
    const data = addDiasISO(e.data_desembolso, d);
    linhasAnt.push([dt(data), `${d} dias`, mt(e.capital * fator(e.taxa_juro, d, e.tipo_juro))]);
  }
  let saldoAntes = e.capital;
  let tAnt = 0;
  for (const p of plano.prestacoes) {
    const base = tAnt === 0 ? 1 : fator(e.taxa_juro, tAnt, e.tipo_juro);
    const devido = saldoAntes * (fator(e.taxa_juro, p.dias, e.tipo_juro) / base);
    linhasAnt.push([dt(p.data), `${p.dias} dias${p.n > 1 ? ` (após a ${p.n - 1}.ª prestação)` : ''}`, mt(devido)]);
    saldoAntes = p.saldo;
    tAnt = p.dias;
  }
  W.espaco(30);
  W.texto('Se quiser liquidar tudo antecipadamente (Cláusula 6.ª), o valor a pagar é:', { bold: true, size: 8.8 });
  autoTable(doc, {
    startY: W.y,
    head: [['Data', 'Tempo decorrido', 'Valor para liquidar tudo']],
    body: linhasAnt,
    theme: 'grid',
    styles: { fontSize: 8.4, cellPadding: 1.5, textColor: INK, lineColor: [200, 192, 175], lineWidth: 0.2 },
    headStyles: { fillColor: [67, 114, 86], textColor: [255, 255, 255] },
    columnStyles: { 0: { halign: 'center', cellWidth: 35 }, 2: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: W.mx, right: W.mx, bottom: 20 },
  });
  W.y = fim() + 4;

  // 4) Onde pagar
  W.espaco(22);
  W.texto('Onde pagar (enviar o comprovativo no próprio dia):', { bold: true, size: 8.8 });
  for (const l of [
    'M-Pesa 848 222 933  ·  M-Vodafone/Movitel 872 222 933  (Júlio Lázaro Mucavel)',
    'Standard Bank — LUMEO CAPITAL MICROCREDITO EI — Conta 1250023162587 — NIB 000301250002316258781',
  ])
    W.texto(l, { size: 8.3, indent: 3, gap: 0.6 });
  W.y += 2;
}

const fator = (taxa: number, dias: number, tipo: TipoJuro) =>
  dias <= 0 ? 1 : tipo === 'mensal' ? Math.pow(1 + taxa, Math.max(1, Math.ceil(dias / 30))) : Math.pow(1 + taxa, dias / 30);
const addDiasISO = (iso: string, d: number) => {
  const [y, m, dd] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10);
};

/** Plano de Pagamento em PDF (1 página) — para entregar ao cliente.
 * Sem cliente/número = proposta do simulador. */
export async function gerarPlanoPDF(opts: {
  emprestimo: EmprestimoContrato;
  prazoDias: number;
  nPrestacoes: number;
  comissaoPct?: number;
  cliente?: string;
  numeroContrato?: string;
}) {
  const [{ jsPDF }, { default: autoTable }, assinatura, carimbo] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    carregarImagem('/docs/assinatura.png'),
    carregarImagem('/docs/carimbo.png'),
  ]);
  const e = opts.emprestimo;
  const plano = calcularPlano({ capital: e.capital, taxa: e.taxa_juro, tipo: e.tipo_juro, dataDesembolso: e.data_desembolso, prazoDias: opts.prazoDias, nPrestacoes: opts.nPrestacoes });
  const proposta = !opts.cliente;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = new Escritor(doc);

  doc.setFillColor(...INK);
  doc.rect(0, 0, W.w, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('LUMEO CAPITAL', W.mx, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PARCH);
  doc.text('Instituição de Microcrédito · Alvará n.º 1077/11/01/PS/2026 · NUIT 125624502', W.mx, 17.5);
  doc.text('Rua de Malhangalene B, n.º 2081, Maputo · Tel. 872 222 933', W.mx, 21.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(217, 164, 65);
  doc.text(proposta ? 'SIMULAÇÃO DE CRÉDITO' : 'PLANO DE PAGAMENTO', W.w - W.mx, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(
    proposta ? `Emitida em ${dt(new Date().toISOString())} · válida por 7 dias` : `${opts.numeroContrato ? `Contrato ${opts.numeroContrato} · ` : ''}Empréstimo ${e.codigo}`,
    W.w - W.mx, 18, { align: 'right' },
  );
  W.y = 36;

  if (!proposta) {
    W.texto(`Cliente: ${opts.cliente}`, { bold: true, size: 10.5, gap: 1 });
    W.texto(`Data de desembolso: ${dt(e.data_desembolso)}`, { size: 9, cor: GREY, gap: 4 });
  } else {
    W.texto(`Proposta para desembolso em ${dt(e.data_desembolso)}. Valores indicativos — o crédito só é concedido após análise e assinatura do contrato.`, { size: 8.8, cor: GREY, gap: 4 });
  }

  desenharPlano(doc, autoTable, W, { emprestimo: e, plano, prazoDias: opts.prazoDias, comissaoPct: opts.comissaoPct ?? 0 });

  if (!proposta) {
    W.espaco(45);
    const y = W.y + 22;
    if (carimbo) doc.addImage(carimbo.data, 'PNG', W.mx + 22, y - 22, 30, 30);
    if (assinatura) {
      const aw = 28;
      doc.addImage(assinatura.data, 'PNG', W.mx + 8, y - (aw * assinatura.h) / assinatura.w + 3, aw, (aw * assinatura.h) / assinatura.w);
    }
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(W.mx, y, W.mx + 65, y);
    doc.line(W.w - W.mx - 65, y, W.w - W.mx, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...INK);
    doc.text('LUMEO Capital — Júlio Lázaro Mucavel, Director Geral', W.mx + 32.5, y + 4, { align: 'center' });
    doc.text(`Tomei conhecimento: ${opts.cliente}`, W.w - W.mx - 32.5, y + 4, { align: 'center' });
  }

  doc.setFontSize(7);
  doc.setTextColor(...GREY);
  doc.text(`Documento emitido pelo sistema de gestão da LUMEO Capital em ${dt(new Date().toISOString())}.`, W.mx, W.h - 8);
  const nome = proposta ? `Simulacao_${Math.round(e.capital)}MT` : `Plano_Pagamento_${e.codigo}_${opts.cliente}`;
  doc.save(`${nomeFicheiro(nome)}.pdf`);
}
