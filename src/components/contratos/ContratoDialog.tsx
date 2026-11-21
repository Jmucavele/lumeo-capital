import * as React from 'react';
import { FileSignature } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/primitives';
import { ContratoForm, contratoDoCliente } from '@/components/contratos/ContratoForm';
import { useContrato, useGuardarContrato } from '@/hooks/useContratos';
import { useCliente } from '@/hooks/useClientes';
import { mensagemErro } from '@/hooks/usePagamentos';
import { contratoVazio, gerarContratoPDF, sugerirGarantia, type DadosContrato } from '@/lib/contrato';
import type { Emprestimo } from '@/types/database.types';

/** Botão + janela para emitir (ou reemitir) o contrato de um empréstimo já existente. */
export function BotaoContrato({ emprestimo }: { emprestimo: Emprestimo }) {
  const [open, setOpen] = React.useState(false);
  const { data: contrato, isLoading } = useContrato(emprestimo.id);
  const { data: cliente } = useCliente(emprestimo.cliente_id);
  const guardar = useGuardarContrato();
  const [dados, setDados] = React.useState<DadosContrato>(contratoVazio());
  const [dataContrato, setDataContrato] = React.useState(emprestimo.data_desembolso);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aGerar, setAGerar] = React.useState(false);

  function abrir() {
    setErro(null);
    if (contrato) {
      setDados(contratoDoCliente(contrato.dados, cliente));
      setDataContrato(contrato.data_contrato);
    } else {
      const base = contratoVazio();
      base.credito.garantia = sugerirGarantia(Number(emprestimo.capital));
      setDados(contratoDoCliente(base, cliente));
      setDataContrato(emprestimo.data_desembolso);
    }
    setOpen(true);
  }

  async function emitir() {
    setErro(null);
    setAGerar(true);
    try {
      const c = await guardar.mutateAsync({ emprestimo_id: emprestimo.id, data_contrato: dataContrato, dados });
      await gerarContratoPDF({
        numero: c.numero,
        dataContrato: c.data_contrato,
        dados,
        emprestimo: {
          codigo: emprestimo.codigo,
          capital: Number(emprestimo.capital),
          taxa_juro: Number(emprestimo.taxa_juro),
          tipo_juro: emprestimo.tipo_juro ?? 'mensal',
          data_desembolso: emprestimo.data_desembolso,
        },
      });
      setOpen(false);
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setAGerar(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={abrir} disabled={isLoading}>
        <FileSignature className="h-4 w-4" />
        {contrato ? `Contrato ${contrato.numero}` : 'Emitir contrato'}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={contrato ? `Contrato ${contrato.numero}` : 'Emitir contrato de mútuo'}
        description="Confirma os dados e gera o PDF já assinado e carimbado. A ficha do cliente não é alterada."
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <div className="max-w-[12rem]">
            <Label>Data do contrato</Label>
            <Input type="date" value={dataContrato} onChange={(e) => setDataContrato(e.target.value)} />
          </div>
          <ContratoForm value={dados} onChange={setDados} capital={Number(emprestimo.capital)} />
          {erro && <p className="text-sm text-rust-500">{erro}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={emitir} disabled={aGerar}>{aGerar ? 'A gerar…' : 'Guardar e emitir PDF'}</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
