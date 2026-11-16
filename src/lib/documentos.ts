// Emissão de documentos: recibos de pagamento (PDF) e extractos (PDF e Excel).
// Tudo é gerado no browser, a partir dos dados que a página já tem — não
// precisa de mudanças na base de dados.
import type { ViewExtrato } from '@/types/database.types';

export const EMPRESA = {
  nome: 'LUMEO CAPITAL',
  descricao: 'Instituição de Microcrédito',
  alvara: 'Alvará nº 1077/11/01/PS/2026',
  nuit: 'NUIT 125624502',
  nuel: 'NUEL 105077452',
  contacto: 'Maputo · Tel. 872222933 · lumeo.capital@gmail.com',
  director: 'Julio Mucavel',
};

// Cores da marca (RGB)
const INK: [number, number, number] = [15, 21, 33];
const BRASS: [number, number, number] = [217, 164, 65];
const MOSS: [number, number, number] = [67, 114, 86];
const PARCH: [number, number, number] = [244, 240, 230];

const tipoLabel: Record<string, string> = {
  desembolso: 'Desembolso',
  capitalizacao: 'Capitalização de Juro',
  pagamento: 'Pagamento',
  ajuste: 'Ajuste',
};

// 15 000,00 — espaço como separador de milhares (também com 4 dígitos)
const nf = {
  format(v: number) {
    const [i, d] = Math.abs(v).toFixed(2).split('.');
    return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + d;
  },
};
const mt = (v: number | null | undefined) => (v == null ? '—' : `${nf.format(v)} MTn`);
const data = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};
const hojeISO = () => new Date().toISOString().slice(0, 10);
const nomeFicheiro = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');

// ---------- Valor por extenso (meticais) ----------
const UN = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
const DEZ = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CEN = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), r = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CEN[c]);
  if (r) partes.push(r < 20 ? UN[r] : DEZ[Math.floor(r / 10)] + (r % 10 ? ' e ' + UN[r % 10] : ''));
  return partes.join(' e ');
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const grupos: [number, string, string][] = [
    [1e9, 'mil milhões', 'mil milhões'],
    [1e6, 'milhão', 'milhões'],
    [1e3, 'mil', 'mil'],
    [1, '', ''],
  ];
  const partes: { txt: string; v: number }[] = [];
  let resto = n;
  for (const [div, sing, plur] of grupos) {
    const q = Math.floor(resto / div);
    resto %= div;
    if (!q) continue;
    let txt: string;
    if (div === 1) txt = ate999(q);
    else if (div === 1e3) txt = q === 1 ? 'mil' : `${ate999(q)} mil`;
    else txt = `${ate999(q)} ${q === 1 ? sing : plur}`;
    partes.push({ txt, v: q });
  }
  // Regra portuguesa: "e" antes do último grupo se este for < 100 ou centena exacta
  return partes.reduce((acc, p, i) => {
    if (i === 0) return p.txt;
    const ultimo = i === partes.length - 1;
    const usaE = ultimo && (p.v < 100 || p.v % 100 === 0);
    return acc + (usaE ? ' e ' : ' ') + p.txt;
  }, '');
}

export function valorPorExtenso(v: number): string {
  const abs = Math.abs(v);
  const inteiro = Math.floor(abs + 1e-9);
  const cent = Math.round((abs - inteiro) * 100);
  let txt = `${inteiroPorExtenso(inteiro)} ${inteiro === 1 ? 'metical' : 'meticais'}`;
  if (/(milhão|milhões)$/.test(txt.replace(/ meticais$/, ''))) txt = txt.replace(/ meticais$/, ' de meticais');
  if (cent) txt += ` e ${inteiroPorExtenso(cent)} ${cent === 1 ? 'centavo' : 'centavos'}`;
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// ---------- Cabeçalho comum dos PDFs ----------
type JsPDF = import('jspdf').jsPDF;

function cabecalho(doc: JsPDF, titulo: string, subtitulo?: string) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(0, 0, w, 30, 'F');
  doc.setFillColor(...BRASS);
  doc.roundedRect(12, 8, 14, 14, 2, 2, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('L', 19, 17.5, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(EMPRESA.nome, 30, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...PARCH);
  doc.text(`${EMPRESA.descricao} · ${EMPRESA.alvara}`, 30, 19);
  doc.text(`${EMPRESA.nuit} · ${EMPRESA.nuel} · ${EMPRESA.contacto}`, 30, 23.5);
  doc.setTextColor(...BRASS);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(titulo, w - 12, 14, { align: 'right' });
  if (subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(subtitulo, w - 12, 20, { align: 'right' });
  }
  doc.setTextColor(...INK);
}

function rodape(doc: JsPDF) {
  const n = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRASS);
    doc.setLineWidth(0.3);
    doc.line(12, h - 12, w - 12, h - 12);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(`Documento emitido em ${data(hojeISO())} pelo sistema de gestão da ${EMPRESA.nome}.`, 12, h - 7);
    doc.text(`Página ${i} de ${n}`, w - 12, h - 7, { align: 'right' });
  }
}

// ---------- Recibo de pagamento ----------
export interface DadosRecibo {
  pagamento: ViewExtrato; // linha do extrato do tipo 'pagamento'
  saldoAnterior?: number | null;
}

export async function gerarRecibo({ pagamento: p, saldoAnterior }: DadosRecibo) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a5', orientation: 'landscape' });
  const w = doc.internal.pageSize.getWidth();
  const valor = Math.abs(p.valor);
  const numero = p.codigo_pagamento ?? p.movimento_id.slice(0, 8).toUpperCase();

  cabecalho(doc, 'RECIBO', `Nº ${numero}`);

  // Valor em destaque
  doc.setFillColor(...PARCH);
  doc.roundedRect(12, 36, w - 24, 20, 2, 2, 'F');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('VALOR RECEBIDO', 17, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...MOSS);
  doc.text(mt(valor), 17, 51);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text('DATA DO PAGAMENTO', w - 17, 42, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(data(p.data_movimento), w - 17, 51, { align: 'right' });

  // Texto do recibo
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const frase =
    `Recebemos de ${p.nome_completo} a quantia de ${mt(valor)} ` +
    `(${valorPorExtenso(valor)}), referente ao pagamento do empréstimo ${p.codigo_emprestimo}.`;
  doc.text(doc.splitTextToSize(frase, w - 24), 12, 65);

  // Quadro de detalhe
  const linhas: [string, string][] = [
    ['Cliente', p.nome_completo],
    ['Empréstimo', p.codigo_emprestimo],
    ['Saldo antes do pagamento', mt(saldoAnterior ?? p.saldo_apos + valor)],
    ['Valor pago', mt(valor)],
    ['Saldo em dívida após o pagamento', mt(p.saldo_apos)],
  ];
  if (p.observacoes) linhas.push(['Observações', p.observacoes]);
  let y = 80;
  doc.setFontSize(9);
  for (const [k, v] of linhas) {
    doc.setTextColor(100, 100, 100);
    doc.text(k, 12, y);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(String(v), w / 2 - 10, y);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(225, 225, 225);
    doc.line(12, y + 1.8, w - 12, y + 1.8);
    y += 6.5;
  }

  // Situação
  if (p.saldo_apos <= 0.005) {
    doc.setTextColor(...MOSS);
    doc.setFont('helvetica', 'bold');
    doc.text('EMPRÉSTIMO TOTALMENTE LIQUIDADO', w - 12, y + 2, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  // Assinaturas
  const yA = Math.max(y + 18, 128);
  doc.setDrawColor(...INK);
  doc.setTextColor(...INK);
  doc.setFontSize(8.5);
  doc.line(18, yA, 88, yA);
  doc.text(`${EMPRESA.director} — Director Geral`, 53, yA + 4.5, { align: 'center' });
  doc.line(w - 88, yA, w - 18, yA);
  doc.text('O(A) Cliente', w - 53, yA + 4.5, { align: 'center' });

  rodape(doc);
  doc.save(`Recibo_${nomeFicheiro(numero)}_${nomeFicheiro(p.nome_completo)}.pdf`);
}

// ---------- Extracto ----------
export interface DadosExtrato {
  movimentos: ViewExtrato[];
  titulo?: string; // ex. "Extracto do Empréstimo E002"
  cliente?: string;
  emprestimo?: {
    codigo: string;
    capital: number;
    taxa_juro: number;
    tipo_juro?: string;
    data_desembolso: string;
    saldo_atual: number;
    estado?: string;
  };
}

function resumo(movs: ViewExtrato[]) {
  const soma = (t: string) => movs.filter((m) => m.tipo === t).reduce((a, m) => a + m.valor, 0);
  return {
    desembolsado: soma('desembolso'),
    juros: soma('capitalizacao'),
    pago: -soma('pagamento'),
    ajustes: soma('ajuste'),
  };
}

function periodo(movs: ViewExtrato[]) {
  if (!movs.length) return '';
  return `${data(movs[0].data_movimento)} a ${data(movs[movs.length - 1].data_movimento)}`;
}

export async function exportarExtratoPDF({ movimentos, titulo, cliente, emprestimo }: DadosExtrato) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const umEmprestimo = new Set(movimentos.map((m) => m.emprestimo_id)).size === 1;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const w = doc.internal.pageSize.getWidth();
  cabecalho(doc, (titulo ?? 'EXTRACTO').toUpperCase(), periodo(movimentos));

  // Bloco de identificação
  let y = 38;
  doc.setFontSize(9);
  const info: [string, string][] = [];
  if (cliente) info.push(['Cliente', cliente]);
  if (emprestimo) {
    info.push(
      ['Empréstimo', emprestimo.codigo],
      ['Capital', mt(emprestimo.capital)],
      ['Taxa de juro', `${(emprestimo.taxa_juro * 100).toFixed(2)}% ao mês${emprestimo.tipo_juro ? ' · ' + (emprestimo.tipo_juro === 'diario' ? 'Diário composto' : 'Mensal composto') : ''}`],
      ['Data de desembolso', data(emprestimo.data_desembolso)],
    );
  }
  info.push(['Data de emissão', data(hojeISO())]);
  for (let i = 0; i < info.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = col === 0 ? 12 : w / 2 + 2;
    doc.setTextColor(110, 110, 110);
    doc.text(info[i][0], x, y + row * 6);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(info[i][1], x + 34, y + row * 6);
    doc.setFont('helvetica', 'normal');
  }
  y += Math.ceil(info.length / 2) * 6 + 2;

  const head = umEmprestimo
    ? [['Data', 'Movimento', 'Referência', 'Débito', 'Crédito', 'Saldo']]
    : [['Data', 'Cliente', 'Empréstimo', 'Movimento', 'Débito', 'Crédito', 'Saldo']];
  const body = movimentos.map((m) => {
    const deb = m.valor > 0 ? nf.format(m.valor) : '';
    const cred = m.valor < 0 ? nf.format(-m.valor) : '';
    return umEmprestimo
      ? [data(m.data_movimento), tipoLabel[m.tipo] ?? m.tipo, m.codigo_pagamento ?? '', deb, cred, nf.format(m.saldo_apos)]
      : [data(m.data_movimento), m.nome_completo, m.codigo_emprestimo, tipoLabel[m.tipo] ?? m.tipo, deb, cred, nf.format(m.saldo_apos)];
  });
  const r = resumo(movimentos);
  const nCols = head[0].length;
  const foot = [[
    { content: 'TOTAIS', colSpan: nCols - 3, styles: { halign: 'left' as const } },
    nf.format(r.desembolsado + r.juros + Math.max(r.ajustes, 0)),
    nf.format(r.pago + Math.max(-r.ajustes, 0)),
    umEmprestimo && movimentos.length ? nf.format(movimentos[movimentos.length - 1].saldo_apos) : '',
  ]];

  autoTable(doc, {
    startY: y,
    head,
    body,
    foot,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.8, textColor: INK },
    headStyles: { fillColor: INK, textColor: BRASS, fontStyle: 'bold' },
    footStyles: { fillColor: PARCH, textColor: INK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 248, 243] },
    columnStyles: Object.fromEntries(
      Array.from({ length: 3 }, (_, i) => [nCols - 3 + i, { halign: 'right' as const }])
    ),
    margin: { left: 12, right: 12, bottom: 18 },
    didParseCell: (d) => {
      if (d.column.index >= nCols - 3 && d.section !== 'body') d.cell.styles.halign = 'right';
    },
    didDrawPage: (d) => { if (d.pageNumber > 1) cabecalho(doc, (titulo ?? 'EXTRACTO').toUpperCase(), periodo(movimentos)); },
  });

  // Resumo final
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let yf = (doc as any).lastAutoTable.finalY + 8;
  if (yf > doc.internal.pageSize.getHeight() - 45) { doc.addPage(); cabecalho(doc, (titulo ?? 'EXTRACTO').toUpperCase()); yf = 40; }
  const linhas: [string, string][] = [
    ['Total desembolsado', mt(r.desembolsado)],
    ['Total de juros capitalizados', mt(r.juros)],
    ['Total pago', mt(r.pago)],
  ];
  if (Math.abs(r.ajustes) > 0.005) linhas.push(['Ajustes', mt(r.ajustes)]);
  if (emprestimo) linhas.push(['Saldo actual em dívida', mt(emprestimo.saldo_atual)]);
  doc.setFontSize(9);
  for (const [k, v] of linhas) {
    doc.setTextColor(110, 110, 110);
    doc.text(k, w - 100, yf);
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'bold');
    doc.text(v, w - 12, yf, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    yf += 5.5;
  }

  rodape(doc);
  const base = emprestimo ? `Extracto_${emprestimo.codigo}_${cliente ?? ''}` : `Extracto_${cliente ?? 'Geral'}`;
  doc.save(`${nomeFicheiro(base)}_${hojeISO()}.pdf`);
}

export async function exportarExtratoExcel({ movimentos, titulo, cliente, emprestimo }: DadosExtrato) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = EMPRESA.nome;
  const ws = wb.addWorksheet('Extracto', { views: [{ state: 'frozen', ySplit: 7 }] });
  const hex = (c: [number, number, number]) => 'FF' + c.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

  ws.columns = [
    { width: 12 }, { width: 28 }, { width: 12 }, { width: 22 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 16 }, { width: 30 },
  ];
  ws.mergeCells('A1:I1');
  ws.getCell('A1').value = `${EMPRESA.nome} — ${titulo ?? 'Extracto'}`;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: hex(BRASS) } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hex(INK) } };
  ws.getRow(1).height = 24;
  ws.mergeCells('A2:I2');
  ws.getCell('A2').value = `${EMPRESA.alvara} · ${EMPRESA.nuit} · ${EMPRESA.nuel}`;
  ws.getCell('A2').font = { size: 9, color: { argb: 'FF666666' } };
  const info = [
    cliente ? `Cliente: ${cliente}` : '',
    emprestimo ? `Empréstimo: ${emprestimo.codigo} · Capital ${mt(emprestimo.capital)} · ${(emprestimo.taxa_juro * 100).toFixed(2)}% ao mês · Desembolso ${data(emprestimo.data_desembolso)}` : '',
    `Período: ${periodo(movimentos)} · Emitido em ${data(hojeISO())}`,
  ].filter(Boolean);
  info.forEach((t, i) => {
    ws.mergeCells(`A${3 + i}:I${3 + i}`);
    ws.getCell(`A${3 + i}`).value = t;
    ws.getCell(`A${3 + i}`).font = { size: 10 };
  });

  const hdrRow = 7;
  const header = ['Data', 'Cliente', 'Empréstimo', 'Movimento', 'Referência', 'Débito (MTn)', 'Crédito (MTn)', 'Saldo (MTn)', 'Observações'];
  ws.getRow(hdrRow).values = header;
  ws.getRow(hdrRow).eachCell((c) => {
    c.font = { bold: true, color: { argb: hex(BRASS) } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hex(INK) } };
    c.alignment = { vertical: 'middle' };
  });

  movimentos.forEach((m, i) => {
    const r = ws.getRow(hdrRow + 1 + i);
    const [y, mo, d] = m.data_movimento.slice(0, 10).split('-').map(Number);
    r.values = [
      new Date(Date.UTC(y, mo - 1, d)),
      m.nome_completo,
      m.codigo_emprestimo,
      tipoLabel[m.tipo] ?? m.tipo,
      m.codigo_pagamento ?? '',
      m.valor > 0 ? m.valor : null,
      m.valor < 0 ? -m.valor : null,
      m.saldo_apos,
      m.observacoes ?? '',
    ];
    r.getCell(1).numFmt = 'dd/mm/yyyy';
    [6, 7, 8].forEach((c) => (r.getCell(c).numFmt = '#,##0.00'));
    if (i % 2) r.eachCell({ includeEmpty: true }, (c, n) => { if (n <= 9) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF8F3' } }; });
  });

  const first = hdrRow + 1, last = hdrRow + movimentos.length;
  const tot = ws.getRow(last + 1);
  tot.getCell(1).value = 'TOTAIS';
  if (movimentos.length) {
    tot.getCell(6).value = { formula: `SUM(F${first}:F${last})` };
    tot.getCell(7).value = { formula: `SUM(G${first}:G${last})` };
  }
  tot.eachCell({ includeEmpty: true }, (c, n) => {
    if (n > 9) return;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hex(PARCH) } };
    if (n >= 6) c.numFmt = '#,##0.00';
  });
  if (emprestimo) {
    const s = ws.getRow(last + 3);
    s.getCell(7).value = 'Saldo actual em dívida';
    s.getCell(7).font = { bold: true };
    s.getCell(8).value = emprestimo.saldo_atual;
    s.getCell(8).numFmt = '#,##0.00';
    s.getCell(8).font = { bold: true, color: { argb: hex(BRASS) } };
  }
  ws.autoFilter = { from: { row: hdrRow, column: 1 }, to: { row: hdrRow, column: 9 } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const base = emprestimo ? `Extracto_${emprestimo.codigo}_${cliente ?? ''}` : `Extracto_${cliente ?? 'Geral'}`;
  a.href = url;
  a.download = `${nomeFicheiro(base)}_${hojeISO()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
