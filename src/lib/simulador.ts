// Motor do simulador de crédito — as mesmas regras do contrato de mútuo.
//   Diário composto: M = C × (1 + r)^(t ÷ 30)   (Cláusula 4.5)
//   Mensal composto: juro do mês inteiro logo no desembolso e a cada
//   aniversário (regra do sistema para empréstimos do tipo "mensal").
import type { TipoJuro } from '@/types/database.types';

export const TAXA_PADRAO = 0.3;

export function addDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export function diasEntre(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Cláusula 3.3 — se calhar ao sábado ou domingo, paga no dia útil anterior. */
export function diaUtilAnterior(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 6) return addDias(iso, -1);
  if (dow === 0) return addDias(iso, -2);
  return iso;
}

/** Factor de crescimento da dívida ao fim de t dias. */
export function factor(taxa: number, dias: number, tipo: TipoJuro = 'diario'): number {
  if (dias <= 0) return tipo === 'mensal' ? 1 + taxa : 1;
  if (tipo === 'mensal') return Math.pow(1 + taxa, Math.max(1, Math.ceil(dias / 30))); // pagar no dia do aniversário evita nova capitalização
  return Math.pow(1 + taxa, dias / 30);
}

export function montante(capital: number, taxa: number, dias: number, tipo: TipoJuro = 'diario') {
  return capital * factor(taxa, dias, tipo);
}

export interface Prestacao {
  n: number;
  data: string;
  dias: number;
  capital: number;
  juros: number;
  valor: number;
  saldo: number;
}

export interface Plano {
  prestacoes: Prestacao[];
  total: number;
  totalJuros: number;
  dataLimite: string;
  taxaEfectiva: number; // custo do período: total ÷ capital - 1
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Plano de pagamento em n prestações iguais, distribuídas ao longo do prazo.
 * Cada prestação paga primeiro os juros que correram desde a anterior e o
 * resto amortiza capital; a última fecha o saldo a zero.
 */
export function calcularPlano(opts: {
  capital: number;
  taxa: number;
  tipo: TipoJuro;
  dataDesembolso: string;
  prazoDias: number;
  nPrestacoes: number;
}): Plano {
  const { capital, taxa, tipo, dataDesembolso } = opts;
  const n = Math.max(1, Math.floor(opts.nPrestacoes || 1));
  const prazo = Math.max(1, Math.floor(opts.prazoDias || 30));

  const datas: string[] = [];
  for (let i = 1; i <= n; i++) datas.push(diaUtilAnterior(addDias(dataDesembolso, Math.round((prazo * i) / n))));
  const dias = datas.map((d) => Math.max(1, diasEntre(dataDesembolso, d)));

  // Prestação constante P tal que Σ P / factor(t_i) = C
  const soma = dias.reduce((a, t) => a + 1 / factor(taxa, t, tipo), 0);
  const P = capital / soma;

  const prestacoes: Prestacao[] = [];
  let saldo = capital;
  let tAnterior = 0;
  for (let i = 0; i < n; i++) {
    const base = tAnterior === 0 ? 1 : factor(taxa, tAnterior, tipo);
    const cresc = factor(taxa, dias[i], tipo) / base;
    const juros = saldo * (cresc - 1);
    const ultimo = i === n - 1;
    const valor = ultimo ? saldo + juros : P;
    const amort = valor - juros;
    saldo = ultimo ? 0 : saldo - amort;
    prestacoes.push({ n: i + 1, data: datas[i], dias: dias[i], capital: r2(amort), juros: r2(juros), valor: r2(valor), saldo: r2(Math.max(saldo, 0)) });
    tAnterior = dias[i];
  }
  const total = r2(prestacoes.reduce((a, p) => a + p.valor, 0));
  return {
    prestacoes,
    total,
    totalJuros: r2(total - capital),
    dataLimite: datas[n - 1],
    taxaEfectiva: total / capital - 1,
  };
}

/** Garantia mínima exigida pela Cláusula 7.1, em função do capital. */
export function garantiaExigida(capital: number): { nivel: string; texto: string } {
  if (capital <= 5000) return { nivel: 'Até 5.000 MT', texto: 'Contrato como título executivo + contacto de referência' };
  if (capital <= 20000) return { nivel: '5.001 a 20.000 MT', texto: 'Fiança/aval pessoal de um Fiador com rendimento comprovado' };
  if (capital <= 50000) return { nivel: '20.001 a 50.000 MT', texto: 'Fiador + penhor de bem móvel de valor >= 150% do capital' };
  return { nivel: 'Acima de 50.000 MT', texto: 'Fiador + penhor de viatura (ou bem >= 150% do capital) + declaração de rendimentos' };
}
