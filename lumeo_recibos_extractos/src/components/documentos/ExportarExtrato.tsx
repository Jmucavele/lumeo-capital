import * as React from 'react';
import { FileDown, FileSpreadsheet, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exportarExtratoExcel, exportarExtratoPDF, gerarRecibo, type DadosExtrato } from '@/lib/documentos';
import type { ViewExtrato } from '@/types/database.types';

function useAccao() {
  const [aCorrer, setACorrer] = React.useState<string | null>(null);
  async function correr(chave: string, fn: () => Promise<void>) {
    setACorrer(chave);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      window.alert('Não foi possível gerar o documento.');
    } finally {
      setACorrer(null);
    }
  }
  return { aCorrer, correr };
}

/** Botões "PDF" e "Excel" para exportar um extracto. */
export function ExportarExtrato(props: DadosExtrato) {
  const { aCorrer, correr } = useAccao();
  const vazio = props.movimentos.length === 0;
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={vazio || !!aCorrer} onClick={() => correr('pdf', () => exportarExtratoPDF(props))}>
        <FileDown className="h-4 w-4" /> {aCorrer === 'pdf' ? 'A gerar…' : 'PDF'}
      </Button>
      <Button variant="outline" size="sm" disabled={vazio || !!aCorrer} onClick={() => correr('xlsx', () => exportarExtratoExcel(props))}>
        <FileSpreadsheet className="h-4 w-4" /> {aCorrer === 'xlsx' ? 'A gerar…' : 'Excel'}
      </Button>
    </div>
  );
}

/** Botão pequeno para emitir o recibo de um pagamento. */
export function BotaoRecibo({ pagamento }: { pagamento: ViewExtrato }) {
  const { aCorrer, correr } = useAccao();
  return (
    <button
      onClick={() => correr('recibo', () => gerarRecibo({ pagamento }))}
      disabled={!!aCorrer}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-moss-600 dark:text-moss-400 hover:bg-ink-100 dark:hover:bg-ink-800 disabled:opacity-50"
      title="Emitir recibo em PDF"
    >
      <Receipt className="h-3.5 w-3.5" /> {aCorrer ? 'A gerar…' : 'Recibo'}
    </button>
  );
}
