import * as React from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Badge, Spinner, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Label } from '@/components/ui/primitives';
import { useCliente } from '@/hooks/useClientes';
import { EditarClienteDialog } from '@/pages/Clientes';
import { supabase } from '@/lib/supabase';
import type { Emprestimo } from '@/types/database.types';
import { formatDate, formatMT, formatPercent } from '@/lib/utils';

export function ClienteDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cliente, isLoading } = useCliente(id);
  const [editando, setEditando] = React.useState(false);
  const [aApagar, setAApagar] = React.useState(false);
  const [confirmacao, setConfirmacao] = React.useState('');
  const [erroApagar, setErroApagar] = React.useState<string | null>(null);
  const [apagando, setApagando] = React.useState(false);
  const qc = useQueryClient();

  async function apagarCliente() {
    if (!cliente) return;
    setApagando(true);
    setErroApagar(null);
    const { error } = await supabase.rpc('apagar_cliente', { p_cliente_id: cliente.id, p_confirmacao: confirmacao });
    setApagando(false);
    if (error) return setErroApagar(error.message);
    qc.invalidateQueries();
    navigate('/clientes');
  }

  const { data: emprestimos } = useQuery<Emprestimo[]>({
    queryKey: ['emprestimos-do-cliente', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('emprestimos')
        .select('*')
        .eq('cliente_id', id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Emprestimo[];
    },
  });

  if (isLoading || !cliente) {
    return <div className="flex justify-center py-16"><Spinner /></div>;
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/clientes')}>
        <ArrowLeft className="h-4 w-4" /> Voltar a Clientes
      </Button>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{cliente.codigo}</CardTitle>
            <h1 className="text-xl font-display font-bold mt-1">{cliente.nome_completo}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={cliente.estado}>{cliente.estado}</Badge>
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Pencil className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button variant="outline" size="sm" className="text-rust-500 border-rust-500/40 hover:bg-rust-500/10"
              onClick={() => { setConfirmacao(''); setErroApagar(null); setAApagar(true); }}>
              <Trash2 className="h-3.5 w-3.5" /> Apagar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-ink-400 text-xs">Documento</p><p className="mt-0.5">{cliente.documento || '—'}</p></div>
          <div><p className="text-ink-400 text-xs">Contacto</p><p className="mt-0.5">{cliente.contacto || '—'}</p></div>
          <div><p className="text-ink-400 text-xs">Morada</p><p className="mt-0.5">{cliente.morada || '—'}</p></div>
          <div><p className="text-ink-400 text-xs">Registado em</p><p className="mt-0.5">{formatDate(cliente.created_at)}</p></div>
          {(cliente.fiador_nome || cliente.fiador_contacto) && (
            <>
              <div><p className="text-ink-400 text-xs">Fiador</p><p className="mt-0.5">{cliente.fiador_nome || '—'}</p></div>
              <div><p className="text-ink-400 text-xs">Contacto do fiador</p><p className="mt-0.5">{cliente.fiador_contacto || '—'}</p></div>
            </>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-display font-semibold mb-3">Empréstimos</h2>
        {!emprestimos || emprestimos.length === 0 ? (
          <Card><EmptyState title="Sem empréstimos" description="Este cliente ainda não tem nenhum crédito registado." /></Card>
        ) : (
          <div className="grid gap-3">
            {emprestimos.map((e) => (
              <Link key={e.id} to={`/emprestimos/${e.id}`}>
                <Card className="hover:border-brass-400 transition-colors">
                  <CardContent className="pt-5 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="font-mono text-xs text-ink-400">{e.codigo}</p>
                      <p className="text-sm mt-1">
                        Capital {formatMT(e.capital)} · Taxa {formatPercent(e.taxa_juro)} · Desde {formatDate(e.data_desembolso)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-display font-bold tabular text-brass-600 dark:text-brass-400">{formatMT(e.saldo_atual)}</p>
                      <Badge tone={e.estado}>{e.estado}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <EditarClienteDialog cliente={editando ? cliente : null} onClose={() => setEditando(false)} />
      <Dialog open={aApagar} onClose={() => setAApagar(false)} title="Apagar cliente e todo o histórico">
        <div className="space-y-3 text-sm">
          <p>
            Vai apagar <strong>{cliente.nome_completo}</strong> ({cliente.codigo}) e <strong>tudo</strong> o que lhe pertence:
            {' '}{emprestimos?.length ?? 0} empréstimo(s), desembolsos, pagamentos, extracto e histórico de alterações.
          </p>
          <p className="rounded-lg bg-rust-500/10 border border-rust-500/30 px-3 py-2 text-rust-500">
            Esta acção é irreversível. Os dados deixam também de aparecer nos reportes de períodos passados.
          </p>
          <div>
            <Label>Para confirmar, escreva o código do cliente: <strong>{cliente.codigo}</strong></Label>
            <Input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder={cliente.codigo} />
          </div>
          {erroApagar && <p className="text-rust-500">{erroApagar}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAApagar(false)}>Cancelar</Button>
            <Button className="bg-rust-500 hover:bg-rust-400 text-white"
              disabled={apagando || confirmacao.trim().toUpperCase() !== cliente.codigo.toUpperCase()}
              onClick={apagarCliente}>
              {apagando ? 'A apagar…' : 'Apagar definitivamente'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
