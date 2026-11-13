import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Input, Spinner } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { taxaDiaria, usePosicaoEmprestimo, type EmprestimoComCliente } from '@/hooks/useEmprestimos';
import { formatDate, formatMT, formatPercent, tipoJuroLabel } from '@/lib/utils';

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  emprestimo: EmprestimoComCliente;
  /** Abre o registo de pagamento já preenchido com este valor e data. */
  onLiquidar?: (valor: number, data: string) => void;
}

/**
 * "Quanto deve o cliente no dia X?" — mostra a dívida nessa data segundo
 * as duas regras (mensal composto e diário composto), com destaque para a
 * regra que se aplica a este empréstimo.
 */
export function PosicaoCard({ emprestimo, onLiquidar }: Props) {
  const [data, setData] = React.useState(hoje());
  const { data: posicoes, isLoading, isError } = usePosicaoEmprestimo(emprestimo.id, data);

  const mensal = posicoes?.find((p) => p.regime === 'mensal');
  const diario = posicoes?.find((p) => p.regime === 'diario');
  const aplicavel = emprestimo.tipo_juro ?? 'mensal';
  const diferenca = mensal && diario ? mensal.saldo - diario.saldo : null;

  const colunas = [
    { regime: 'mensal' as const, p: mensal, nota: `${formatPercent(emprestimo.taxa_juro)} ao mês, ciclo inteiro no início` },
    { regime: 'diario' as const, p: diario, nota: `${formatPercent(taxaDiaria(emprestimo.taxa_juro), 4)} ao dia (base 30 dias)` },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posição à data</CardTitle>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-ink-400" />
          <Input
            type="date"
            className="w-auto"
            min={emprestimo.data_desembolso}
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : isError || !posicoes?.length ? (
          <p className="text-sm text-rust-500">
            Não foi possível calcular. Confirma que correste a migração v4 no Supabase.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {colunas.map(({ regime, p, nota }) => {
                const ativo = regime === aplicavel;
                return (
                  <div
                    key={regime}
                    className={`rounded-lg border p-4 ${
                      ativo ? 'border-brass-500 bg-brass-500/10' : 'border-ink-100 dark:border-ink-700 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium uppercase text-ink-500">{tipoJuroLabel[regime]}</p>
                      {ativo && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase bg-brass-500 text-ink-950 font-semibold">
                          aplica-se
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-2xl font-display font-bold tabular">{formatMT(p?.saldo)}</p>
                    <p className="text-xs text-ink-500 mt-1">{nota}</p>
                    {regime === 'diario' && p && p.juro_acumulado > 0 && (
                      <p className="text-xs text-ink-500 mt-1">
                        Inclui {formatMT(p.juro_acumulado)} de juro de {p.dias_desde_ultimo_evento} dia(s) ainda por lançar no extrato
                      </p>
                    )}
                    {ativo && onLiquidar && p && p.saldo > 0 && emprestimo.estado !== 'liquidado' && data <= hoje() && (
                      <Button size="sm" className="mt-3" onClick={() => onLiquidar(p.saldo, data)}>
                        Liquidar com este valor
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {diferenca !== null && Math.abs(diferenca) > 0.005 && (
              <p className="text-xs text-ink-500">
                Em {formatDate(data)}, a regra diária dá{' '}
                <strong>{formatMT(Math.abs(diferenca))}</strong> {diferenca > 0 ? 'a menos' : 'a mais'} que a mensal.
                {data > hoje() && ' (Simulação: assume que não há mais pagamentos até essa data.)'}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
