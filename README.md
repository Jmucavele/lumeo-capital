# LUMEO Capital — Sistema de Gestão de Microcrédito

Aplicação web (React + TypeScript + Vite + Tailwind + Supabase/PostgreSQL) para gerir
os empréstimos da LUMEO Capital, E.I., com o modelo de juro próprio da empresa
(capitalização por data de aniversário, sem prestações fixas, pagamentos com
data retroactiva).

## Estado desta entrega (v2)

- ✅ Base de dados (schema, funções, views) — `supabase/schema.sql`
- ✅ Motor de juros **recalculado a partir dos factos**: sempre que um pagamento é
  adicionado (mesmo com data retroactiva), o extrato inteiro do empréstimo é
  reconstruído do zero em ordem cronológica — capitalização sempre ancorada no
  dia do desembolso (nunca "desliza"), pagamento ganha o empate quando cai no
  mesmo dia de uma capitalização.
- ✅ Dashboard, Clientes (com edição), Empréstimos, Pagamentos (com campo de
  data), Extrato (ordem cronológica, filtrável por cliente), Cobranças
- ✅ Os 3 casos reais fornecidos (Michelle Bahule, Isabel Mário, Bernardo Sitoe)
  já vêm no `schema.sql` — corre a secção 11 do ficheiro (ou todo o ficheiro)
  para os teres logo na tua base de dados
- ✅ Tema claro/escuro, layout responsivo

**Fica para a fase 2**: autenticação/login, relatórios com exportação
PDF/Excel, Administração (utilizadores, perfis, permissões, logs).

## Como correr o projecto

### 1. Cria o projecto Supabase

1. Cria um projecto em [supabase.com](https://supabase.com).
2. Abre **SQL Editor** → cola o conteúdo de `supabase/schema.sql` → **Run**.
   (A secção 11 no fim já semeia os 3 clientes reais — apaga-a do ficheiro
   antes de correr se preferires começar com a base de dados vazia.)
3. Em **Project Settings → API**, copia o `Project URL` e a `anon public key`.

### 2. Configura o frontend

```bash
cp .env.example .env
# edita .env com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

npm install
npm run dev
```

Abre `http://localhost:5173`.

> Nota: como este código foi gerado num ambiente sem acesso à internet, as
> dependências nunca foram instaladas nem o build foi executado aqui, e o SQL
> nunca foi corrido contra um Postgres real — revê `npm run build` (`tsc -b`)
> e testa o schema no SQL Editor do Supabase antes de ires para produção.

### 3. (Opcional mas recomendado) Agenda o motor de juros

```sql
create extension if not exists pg_cron;
select cron.schedule('capitalizacao-diaria', '5 0 * * *', $$select processar_capitalizacoes();$$);
```

## Como funciona o motor de juros (v2)

Ao contrário de um livro-razão que só acrescenta linhas, aqui o extrato de
cada empréstimo é **sempre recalculado do zero** por `recompute_emprestimo()`:

1. Apaga todos os `movimentos` desse empréstimo.
2. Insere o desembolso + a capitalização imediata do 1º ciclo.
3. Percorre o tempo em ordem cronológica, intercalando:
   - **Capitalizações mensais**, sempre calculadas como `add_months_clamped(data_desembolso, nº_do_ciclo)` — nunca encadeadas a partir da capitalização anterior, por isso o dia do mês nunca "desliza" (ex.: 31 Jan → 28/29 Fev → **volta a cair em 31 Mar**, nunca em 2 ou 3 de Março).
   - **Pagamentos reais**, na data em que aconteceram (podem ser retroactivos). Se um pagamento e uma capitalização caem no mesmo dia, o pagamento é aplicado primeiro.
4. Grava o saldo final, a próxima capitalização, a data do último pagamento e o estado (`ativo` / `atraso` / `liquidado`) directamente em `emprestimos`.

Chamar isto sempre que: um empréstimo é criado (`registrar_desembolso`), um
pagamento é registado (`registrar_pagamento`), ou para "adiantar" todos os
saldos até hoje (`processar_capitalizacoes`, chamada automaticamente ao abrir
o Dashboard).

Testei esta lógica (em JavaScript, espelhando exactamente o SQL) contra os 3
casos reais que a LUMEO forneceu, incluindo o caso da Isabel Mário com dois
pagamentos parciais — os números batem certo em cada passo.

## Assunção que precisa da tua confirmação: "Em atraso"

> Um empréstimo activo passa a **"Em atraso"** quando o cliente está há mais
> de 30 dias sem fazer qualquer pagamento.

Isto está isolado dentro de `recompute_emprestimo()` em `supabase/schema.sql`
— muda o número de dias (ou o critério inteiro) num único sítio se a LUMEO
tiver uma definição diferente.

## Estrutura de pastas

```
supabase/schema.sql        Schema completo (tabelas, motor de juros, views, RLS, casos reais)
src/lib/supabase.ts        Cliente Supabase
src/types/database.types.ts Tipos TS espelhando o schema
src/hooks/                 React Query hooks (uma função por caso de uso de negócio)
src/pages/                 Uma página por módulo
src/components/ui/         Primitivas de UI (botão, cartão, tabela, diálogo…)
src/components/layout/     Sidebar + layout geral
src/components/theme/      Tema claro/escuro
```

