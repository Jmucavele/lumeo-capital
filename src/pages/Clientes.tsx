import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Select, Textarea, Badge, EmptyState, Spinner } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/dialog';
import {
  useClientes,
  useCreateCliente,
  useUpdateCliente,
  type ClienteInput,
  type ViewClientesResumo,
} from '@/hooks/useClientes';
import { formatMT } from '@/lib/utils';
import type { Cliente } from '@/types/database.types';

const emptyForm: ClienteInput = {
  nome_completo: '',
  documento: '',
  contacto: '',
  morada: '',
  fiador_nome: '',
  fiador_contacto: '',
  fiador_documento: '',
  observacoes: '',
};

export function Clientes() {
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<ClienteInput>(emptyForm);
  const [editando, setEditando] = React.useState<ViewClientesResumo | null>(null);
  const { data, isLoading } = useClientes(search);
  const createCliente = useCreateCliente();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome_completo.trim()) return;
    await createCliente.mutateAsync(form);
    setForm(emptyForm);
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Clientes</h1>
          <p className="text-sm text-ink-500 dark:text-parchment-200/60 mt-1">Cadastro e histórico de clientes da LUMEO Capital.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Procurar por nome, código ou documento…"
          className="pl-9"
        />
      </div>

      <div className="rounded-xl2 border border-ink-100 dark:border-ink-700 bg-white dark:bg-ink-900 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-14"><Spinner /></div>
        ) : !data || data.length === 0 ? (
          <EmptyState title="Nenhum cliente encontrado" description="Cria o primeiro cliente para começar a registar empréstimos." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-ink-400 border-b border-ink-100 dark:border-ink-700">
                <th className="px-5 py-3 font-medium">Código</th>
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Empréstimos Ativos</th>
                <th className="px-5 py-3 font-medium">Saldo em Dívida</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="border-b border-ink-50 dark:border-ink-800 last:border-0 hover:bg-ink-50 dark:hover:bg-ink-800/60 cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-xs text-ink-500">{c.codigo}</td>
                  <td className="px-5 py-3 font-medium">{c.nome_completo}</td>
                  <td className="px-5 py-3 text-ink-500">{c.contacto || '—'}</td>
                  <td className="px-5 py-3 tabular">{c.emprestimos_ativos}</td>
                  <td className="px-5 py-3 tabular font-medium">{formatMT(c.saldo_total_em_divida)}</td>
                  <td className="px-5 py-3">
                    <Badge tone={c.estado}>{c.estado}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditando(c);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} title="Novo Cliente" description="Preenche os dados obrigatórios; o resto pode ser completado depois.">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Nome completo *</Label>
            <Input required value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>NUIT / BI</Label>
              <Input value={form.documento ?? ''} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            </div>
            <div>
              <Label>Contacto</Label>
              <Input value={form.contacto ?? ''} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Morada</Label>
            <Input value={form.morada ?? ''} onChange={(e) => setForm({ ...form, morada: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome do fiador</Label>
              <Input value={form.fiador_nome ?? ''} onChange={(e) => setForm({ ...form, fiador_nome: e.target.value })} />
            </div>
            <div>
              <Label>Contacto do fiador</Label>
              <Input value={form.fiador_contacto ?? ''} onChange={(e) => setForm({ ...form, fiador_contacto: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea rows={2} value={form.observacoes ?? ''} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={createCliente.isPending}>
              {createCliente.isPending ? 'A guardar…' : 'Guardar Cliente'}
            </Button>
          </div>
        </form>
      </Dialog>

      <EditarClienteDialog cliente={editando} onClose={() => setEditando(null)} />
    </div>
  );
}

export function EditarClienteDialog({ cliente, onClose }: { cliente: ViewClientesResumo | Cliente | null; onClose: () => void }) {
  const updateCliente = useUpdateCliente();
  const [form, setForm] = React.useState({
    nome_completo: '', documento: '', contacto: '', morada: '', fiador_nome: '', fiador_contacto: '', estado: 'ativo' as 'ativo' | 'inativo' | 'bloqueado',
  });

  React.useEffect(() => {
    if (cliente) {
      setForm({
        nome_completo: cliente.nome_completo,
        documento: cliente.documento ?? '',
        contacto: cliente.contacto ?? '',
        morada: cliente.morada ?? '',
        fiador_nome: cliente.fiador_nome ?? '',
        fiador_contacto: cliente.fiador_contacto ?? '',
        estado: cliente.estado,
      });
    }
  }, [cliente]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cliente || !form.nome_completo.trim()) return;
    await updateCliente.mutateAsync({ id: cliente.id, ...form });
    onClose();
  }

  return (
    <Dialog open={!!cliente} onClose={onClose} title="Editar Cliente" description={cliente ? cliente.codigo : undefined}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <Label>Nome completo *</Label>
          <Input required value={form.nome_completo} onChange={(e) => setForm({ ...form, nome_completo: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>NUIT / BI</Label>
            <Input value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
          </div>
          <div>
            <Label>Contacto</Label>
            <Input value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Morada</Label>
          <Input value={form.morada} onChange={(e) => setForm({ ...form, morada: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Nome do fiador</Label>
            <Input value={form.fiador_nome} onChange={(e) => setForm({ ...form, fiador_nome: e.target.value })} />
          </div>
          <div>
            <Label>Contacto do fiador</Label>
            <Input value={form.fiador_contacto} onChange={(e) => setForm({ ...form, fiador_contacto: e.target.value })} />
          </div>
        </div>
        <div>
          <Label>Estado</Label>
          <Select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as typeof form.estado })}>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={updateCliente.isPending}>
            {updateCliente.isPending ? 'A guardar…' : 'Guardar Alterações'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
