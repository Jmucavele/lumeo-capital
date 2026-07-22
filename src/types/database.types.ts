// Tipos escritos à mão para corresponderem a supabase/schema.sql.
// Se preferires, substitui por tipos gerados automaticamente:
//   npx supabase gen types typescript --project-id SEU_ID > src/types/database.types.ts

export type EstadoCliente = 'ativo' | 'inativo' | 'bloqueado';
export type EstadoEmprestimo = 'ativo' | 'atraso' | 'liquidado';
export type TipoMovimento = 'desembolso' | 'capitalizacao' | 'pagamento' | 'ajuste';

export interface Cliente {
  id: string;
  codigo: string;
  nome_completo: string;
  documento: string | null;
  contacto: string | null;
  morada: string | null;
  foto_url: string | null;
  fiador_nome: string | null;
  fiador_contacto: string | null;
  fiador_documento: string | null;
  estado: EstadoCliente;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Emprestimo {
  id: string;
  codigo: string;
  cliente_id: string;
  capital: number;
  taxa_juro: number;
  data_desembolso: string;
  dia_aniversario: number;
  data_proxima_capitalizacao: string;
  saldo_atual: number;
  estado: EstadoEmprestimo;
  data_ultimo_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Movimento {
  id: string;
  emprestimo_id: string;
  tipo: TipoMovimento;
  valor: number;
  saldo_apos: number;
  data_movimento: string;
  codigo_pagamento: string | null;
  comprovativo_url: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface Pagamento {
  id: string;
  codigo: string;
  emprestimo_id: string;
  valor: number;
  data_pagamento: string;
  comprovativo_url: string | null;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
}

export interface ViewDashboardResumo {
  clientes_ativos_total: number;
  clientes_com_credito_ativo: number;
  total_emprestimos: number;
  emprestimos_ativos: number;
  emprestimos_em_atraso: number;
  emprestimos_liquidados: number;
  capital_total_emprestado: number;
  saldo_total_em_divida: number;
  juros_gerados_total: number;
  total_recebido: number;
}

export interface ViewExtrato {
  movimento_id: string;
  emprestimo_id: string;
  codigo_emprestimo: string;
  cliente_id: string;
  nome_completo: string;
  tipo: TipoMovimento;
  valor: number;
  saldo_apos: number;
  data_movimento: string;
  codigo_pagamento: string | null;
  comprovativo_url: string | null;
  observacoes: string | null;
}

export interface ViewCobrancas {
  emprestimo_id: string;
  codigo_emprestimo: string;
  cliente_id: string;
  codigo_cliente: string;
  nome_completo: string;
  contacto: string | null;
  saldo_atual: number;
  data_ultimo_pagamento: string | null;
  data_desembolso: string;
  dias_sem_pagamento: number;
}

export interface ViewClientesResumo extends Cliente {
  emprestimos_ativos: number;
  saldo_total_em_divida: number;
}

// Minimal Database interface — o suficiente para tipar o client do Supabase.
export interface Database {
  public: {
    Tables: {
      clientes: { Row: Cliente; Insert: Partial<Cliente>; Update: Partial<Cliente> };
      emprestimos: { Row: Emprestimo; Insert: Partial<Emprestimo>; Update: Partial<Emprestimo> };
      movimentos: { Row: Movimento; Insert: Partial<Movimento>; Update: Partial<Movimento> };
      pagamentos: { Row: Pagamento; Insert: Partial<Pagamento>; Update: Partial<Pagamento> };
    };
    Views: {
      view_dashboard_resumo: { Row: ViewDashboardResumo };
      view_extrato: { Row: ViewExtrato };
      view_cobrancas: { Row: ViewCobrancas };
      view_clientes_resumo: { Row: ViewClientesResumo };
    };
    Functions: {
      registrar_desembolso: {
        Args: {
          p_cliente_id: string;
          p_capital: number;
          p_taxa_juro: number;
          p_data_desembolso: string;
          p_observacoes?: string | null;
        };
        Returns: string;
      };
      registrar_pagamento: {
        Args: {
          p_emprestimo_id: string;
          p_valor: number;
          p_data_pagamento?: string; // 'YYYY-MM-DD'
          p_comprovativo_url?: string | null;
          p_observacoes?: string | null;
        };
        Returns: string;
      };
      processar_capitalizacoes: {
        Args: { p_data_referencia?: string };
        Returns: void;
      };
      atualizar_cliente: {
        Args: {
          p_cliente_id: string;
          p_nome_completo: string;
          p_documento?: string | null;
          p_contacto?: string | null;
          p_morada?: string | null;
          p_fiador_nome?: string | null;
          p_fiador_contacto?: string | null;
          p_estado?: EstadoCliente;
        };
        Returns: void;
      };
    };
  };
}
