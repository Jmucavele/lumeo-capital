import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[LUMEO] Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY em falta. ' +
      'Copia .env.example para .env e preenche com os dados do teu projecto Supabase.'
  );
}

// Nota: sem o genérico <Database> propositadamente. O nosso tipo Database
// (escrito à mão em src/types/database.types.ts) não corresponde 100% à
// forma interna que o supabase-js espera (faltam Relationships,
// CompositeTypes, etc.), o que causava erros de compilação em cascata em
// .insert()/.eq()/.rpc() por toda a app. Cada hook já tipa explicitamente
// o que devolve (useQuery<T>, 'as T'), por isso mantemos a segurança de
// tipos onde importa, só perdemos autocomplete nos nomes de tabelas/colunas.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
