// Cálculos e exportação Excel da secção Finanças (caixa e relatórios).
import { EMPRESA } from '@/lib/documentos';
import { CATEGORIAS_NAO_RESULTADO, type MovimentoCaixa } from '@/hooks/useFinancas';
import type { Emprestimo, ViewExtrato } from '@/types/database.types';

export type EmprestimoRel = Emprestimo & { clientes: { nome_completo: string; codigo: string; contacto: string | null } | null };

const hoje = () => new Date().toISOString().slice(0, 10);
const dias = (a: string, b: string) => {
  const [y1, m1, d1] = a.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = b.slice(0, 10).split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
};
const dentro = (d: string, de: string, ate: string) => d.slice(0, 10) >= de && d.slice(0, 10) <= ate;

// ---------- Caixa ----------
export function resumoCaixa(movs: MovimentoCaixa[], de: string, ate: string) {
  const sinal = (m: MovimentoCaixa) => (m.tipo === 'entrada' ? m.valor : -m.valor);
  const saldoInicial = movs.filter((m) => m.data < de).reduce((a, m) => a + sinal(m), 0);
  const periodo = movs.filter((m) => dentro(m.data, de, ate));
  const entradas = periodo.filter((m) => m.tipo === 'entrada').reduce((a, m) => a + m.valor, 0);
  const saidas = periodo.filter((m) => m.tipo === 'saida').reduce((a, m) => a + m.valor, 0);
  let corrente = saldoInicial;
  const linhas = periodo.map((m) => {
    corrente += sinal(m);
    return { ...m, saldo: corrente };
  });
  const porCategoria = new Map<string, { entrada: number; saida: number }>();
  for (const m of periodo) {
    const x = porCategoria.get(m.categoria) ?? { entrada: 0, saida: 0 };
    x[m.tipo] += m.valor;
    porCategoria.set(m.categoria, x);
  }
  return { saldoInicial, entradas, saidas, saldoFinal: saldoInicial + entradas - saidas, linhas, porCategoria };
}

// ---------- Demonstração de resultados ----------
export function demonstracaoResultados(movs: ViewExtrato[], caixa: MovimentoCaixa[], de: string, ate: string) {
  const per = movs.filter((m) => dentro(m.data_movimento, de, ate));
  const jurosGerados = per.filter((m) => m.tipo === 'capitalizacao').reduce((a, m) => a + m.valor, 0);
  const recebido = -per.filter((m) => m.tipo === 'pagamento').reduce((a, m) => a + m.valor, 0);
  const desembolsado = per.filter((m) => m.tipo === 'desembolso').reduce((a, m) => a + m.valor, 0);
  const manual = caixa.filter((m) => m.origem === 'manual' && dentro(m.data, de, ate) && !CATEGORIAS_NAO_RESULTADO.includes(m.categoria));
  const outrasReceitas = manual.filter((m) => m.tipo === 'entrada');
  const custos = manual.filter((m) => m.tipo === 'saida');
  const agrupa = (xs: MovimentoCaixa[]) => {
    const g = new Map<string, number>();
    xs.forEach((m) => g.set(m.categoria, (g.get(m.categoria) ?? 0) + m.valor));
    return [...g.entries()].sort((a, b) => b[1] - a[1]);
  };
  const totOutras = outrasReceitas.reduce((a, m) => a + m.valor, 0);
  const totCustos = custos.reduce((a, m) => a + m.valor, 0);
  const receitas = jurosGerados + totOutras;
  return {
    jurosGerados,
    outrasReceitas: agrupa(outrasReceitas),
    totOutras,
    receitas,
    custos: agrupa(custos),
    totCustos,
    resultado: receitas - totCustos,
    margem: receitas ? (receitas - totCustos) / receitas : 0,
    recebido,
    desembolsado,
  };
}

// ---------- Carteira e risco (aging / PAR) ----------
export const FAIXAS = [
  { id: 'em_dia', label: 'Em dia (0–30 dias)', min: 0, max: 30 },
  { id: 'd31', label: '31–60 dias', min: 31, max: 60 },
  { id: 'd61', label: '61–90 dias', min: 61, max: 90 },
  { id: 'd90', label: 'Mais de 90 dias', min: 91, max: Infinity },
] as const;

export function carteira(emps: EmprestimoRel[], ref = hoje()) {
  const activos = emps.filter((e) => e.estado !== 'liquidado');
  const linhas = activos
    .map((e) => {
      const d = Math.max(0, dias(e.data_ultimo_pagamento ?? e.data_desembolso, ref));
      const faixa = FAIXAS.find((f) => d >= f.min && d <= f.max)!;
      return { ...e, saldo: Number(e.saldo_atual), capital: Number(e.capital), diasSemPagamento: d, faixa: faixa.id };
    })
    .sort((a, b) => b.saldo - a.saldo);
  const total = linhas.reduce((a, l) => a + l.saldo, 0);
  const faixas = FAIXAS.map((f) => {
    const ls = linhas.filter((l) => l.faixa === f.id);
    const v = ls.reduce((a, l) => a + l.saldo, 0);
    return { ...f, n: ls.length, valor: v, pct: total ? v / total : 0 };
  });
  const par = (n: number) => {
    const v = linhas.filter((l) => l.diasSemPagamento > n).reduce((a, l) => a + l.saldo, 0);
    return total ? v / total : 0;
  };
  // Concentração por cliente
  const porCliente = new Map<string, { nome: string; saldo: number; n: number }>();
  for (const l of linhas) {
    const k = l.cliente_id;
    const x = porCliente.get(k) ?? { nome: l.clientes?.nome_completo ?? '—', saldo: 0, n: 0 };
    x.saldo += l.saldo;
    x.n += 1;
    porCliente.set(k, x);
  }
  const top = [...porCliente.values()].sort((a, b) => b.saldo - a.saldo).map((c) => ({ ...c, pct: total ? c.saldo / total : 0 }));
  return { linhas, total, faixas, par30: par(30), par60: par(60), par90: par(90), top, capitalActivo: linhas.reduce((a, l) => a + l.capital, 0) };
}

// ---------- Evolução mensal ----------
export function fluxoMensal(movs: ViewExtrato[], caixa: MovimentoCaixa[], meses = 12) {
  const fim = new Date();
  const lista: { chave: string; label: string; desembolsos: number; recebimentos: number; juros: number; despesas: number }[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth() - i, 1));
    const chave = d.toISOString().slice(0, 7);
    lista.push({ chave, label: `${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, desembolsos: 0, recebimentos: 0, juros: 0, despesas: 0 });
  }
  const idx = new Map(lista.map((l, i) => [l.chave, i]));
  for (const m of movs) {
    const i = idx.get(m.data_movimento.slice(0, 7));
    if (i === undefined) continue;
    if (m.tipo === 'desembolso') lista[i].desembolsos += m.valor;
    if (m.tipo === 'pagamento') lista[i].recebimentos += -m.valor;
    if (m.tipo === 'capitalizacao') lista[i].juros += m.valor;
  }
  for (const c of caixa) {
    if (c.origem !== 'manual' || c.tipo !== 'saida' || CATEGORIAS_NAO_RESULTADO.includes(c.categoria)) continue;
    const i = idx.get(c.data.slice(0, 7));
    if (i !== undefined) lista[i].despesas += c.valor;
  }
  return lista;
}

// ---------- Excel ----------
type Folha = { nome: string; titulo: string; cabecalho: string[]; linhas: (string | number | Date | null)[][]; moeda?: number[]; datas?: number[]; pct?: number[]; total?: number[] };

export async function exportarExcel(nomeFicheiro: string, subtitulo: string, folhas: Folha[]) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = EMPRESA.nome;
  for (const f of folhas) {
    const ws = wb.addWorksheet(f.nome.slice(0, 31), { views: [{ state: 'frozen', ySplit: 4 }] });
    const nc = f.cabecalho.length;
    ws.columns = f.cabecalho.map((h) => ({ width: Math.max(14, Math.min(40, h.length + 6)) }));
    ws.mergeCells(1, 1, 1, nc);
    ws.getCell(1, 1).value = `${EMPRESA.nome} — ${f.titulo}`;
    ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FFD9A441' } };
    ws.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1521' } };
    ws.getRow(1).height = 22;
    ws.mergeCells(2, 1, 2, nc);
    ws.getCell(2, 1).value = subtitulo;
    ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF666666' } };
    ws.getRow(4).values = f.cabecalho;
    ws.getRow(4).eachCell((c) => {
      c.font = { bold: true, color: { argb: 'FFD9A441' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1521' } };
    });
    f.linhas.forEach((l, i) => {
      const r = ws.getRow(5 + i);
      r.values = l;
      f.moeda?.forEach((c) => (r.getCell(c + 1).numFmt = '#,##0.00'));
      f.datas?.forEach((c) => (r.getCell(c + 1).numFmt = 'dd/mm/yyyy'));
      f.pct?.forEach((c) => (r.getCell(c + 1).numFmt = '0.0%'));
    });
    if (f.total && f.linhas.length) {
      const r = ws.getRow(5 + f.linhas.length);
      r.getCell(1).value = 'TOTAL';
      for (const c of f.total) {
        const col = ws.getColumn(c + 1).letter;
        r.getCell(c + 1).value = { formula: `SUM(${col}5:${col}${4 + f.linhas.length})` };
        r.getCell(c + 1).numFmt = '#,##0.00';
      }
      r.eachCell({ includeEmpty: true }, (c, n) => {
        if (n > nc) return;
        c.font = { bold: true };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F0E6' } };
      });
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomeFicheiro}_${hoje()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const isoParaDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
