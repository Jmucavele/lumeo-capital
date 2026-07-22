import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Cliente, ViewClientesResumo } from '@/types/database.types';

export function useClientes(search?: string) {
  return useQuery<ViewClientesResumo[]>({
    queryKey: ['clientes', search ?? ''],
    queryFn: async () => {
      let query = supabase.from('view_clientes_resumo').select('*').order('created_at', { ascending: false });
      if (search) {
        query = query.or(`nome_completo.ilike.%${search}%,codigo.ilike.%${search}%,documento.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as ViewClientesResumo[];
    },
  });
}

export function useCliente(id: string | undefined) {
  return useQuery<Cliente>({
    queryKey: ['cliente', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Cliente;
    },
  });
}

export type ClienteInput = Pick<
  Cliente,
  'nome_completo' | 'documento' | 'contacto' | 'morada' | 'fiador_nome' | 'fiador_contacto' | 'fiador_documento' | 'observacoes'
>;

export function useCreateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClienteInput) => {
      const { data, error } = await supabase.from('clientes').insert(input).select().single();
      if (error) throw error;
      return data as Cliente;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  });
}

export interface EditarClienteInput {
  id: string;
  nome_completo: string;
  documento?: string;
  contacto?: string;
  morada?: string;
  fiador_nome?: string;
  fiador_contacto?: string;
  estado?: 'ativo' | 'inativo' | 'bloqueado';
}

/** Chama a função SQL atualizar_cliente (em vez de um update directo à
 * tabela) para manter a edição de clientes num único ponto no servidor. */
export function useUpdateCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditarClienteInput) => {
      const { error } = await supabase.rpc('atualizar_cliente', {
        p_cliente_id: input.id,
        p_nome_completo: input.nome_completo,
        p_documento: input.documento ?? null,
        p_contacto: input.contacto ?? null,
        p_morada: input.morada ?? null,
        p_fiador_nome: input.fiador_nome ?? null,
        p_fiador_contacto: input.fiador_contacto ?? null,
        p_estado: input.estado ?? 'ativo',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['cliente'] });
    },
  });
}
