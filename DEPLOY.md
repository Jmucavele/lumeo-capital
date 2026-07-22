# Guia de Publicação — LUMEO Capital

Este guia assume que nunca usaste Supabase nem Vercel. São só copiar/colar,
sem escrever código. Demora à volta de 15 minutos.

---

## Passo 1 — Criar a base de dados (Supabase)

1. Vai a **https://supabase.com** → **Start your project** → cria conta (podes usar o Google/GitHub).
2. Clica **New Project**.
   - **Name**: `lumeo-capital`
   - **Database Password**: cria uma password forte e **guarda-a nalgum sítio seguro** (vais precisar dela raramente, mas se a perderes não há como recuperar).
   - **Region**: escolhe a mais próxima de Moçambique (ex.: `South Africa` se disponível, senão `Europe`).
   - Clica **Create new project** e espera ~2 minutos enquanto é criado.
3. No menu da esquerda, clica no ícone **SQL Editor** (parece um `>_`).
4. Clica **New query**.
5. Abre o ficheiro `supabase/schema.sql` (dentro do zip que te enviei), copia **todo o conteúdo**, cola no editor.
6. Clica **Run** (ou `Ctrl+Enter`). Deves ver "Success. No rows returned" no fim.
   - Isto já cria as tabelas, o motor de juros, e os 3 clientes reais (Michelle, Isabel, Bernardo).
7. No menu da esquerda, clica **Project Settings** (ícone de engrenagem) → **API**.
8. Vais precisar de dois valores desta página:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public** key (uma chave longa, em "Project API keys")
   - Deixa esta página aberta, precisas destes dois valores no Passo 3.

---

## Passo 2 — Publicar o site (Vercel)

1. Vai a **https://vercel.com** → **Sign Up** → escolhe **Continue with GitHub** (se não tiveres conta GitHub, cria uma grátis primeiro em **github.com**).
2. Precisas de colocar o código do projecto no GitHub primeiro:
   - Vai a **https://github.com/new**
   - **Repository name**: `lumeo-capital`
   - Deixa "Public" ou "Private" (tanto faz) → **Create repository**
   - Na página seguinte, clica **uploading an existing file**
   - Arrasta **todos os ficheiros e pastas** de dentro do zip que te enviei (não o zip em si — o conteúdo lá dentro: `src`, `supabase`, `package.json`, etc.)
   - Em baixo, clica **Commit changes**
3. Volta ao Vercel → **Add New** → **Project**
4. Escolhe o repositório `lumeo-capital` que acabaste de criar → **Import**
5. Na secção **Environment Variables**, adiciona duas:
   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | o **Project URL** que copiaste no Passo 1 |
   | `VITE_SUPABASE_ANON_KEY` | a chave **anon public** que copiaste no Passo 1 |
6. Clica **Deploy**. Espera 1–2 minutos.
7. Quando terminar, a Vercel dá-te um link tipo `https://lumeo-capital.vercel.app` — **esse é o link fixo da tua equipa**.

---

## Passo 3 — Testar

1. Abre o link da Vercel no browser.
2. Deves ver o Dashboard com a Michelle Bahule, Isabel Mário e Bernardo Sitoe já lá.
3. Experimenta criar um cliente novo, um empréstimo, e um pagamento — confirma que os números batem certo.
4. Partilha o link com a tua equipa. Todos veem os mesmos dados, em tempo real.

---

## Se alguma coisa não funcionar

- **Página em branco / erro no ecrã**: abre a consola do browser (`F12` → separador "Console") e vê a mensagem de erro. O mais comum é as variáveis de ambiente (Passo 2.5) estarem trocadas ou com espaços a mais.
- **"Failed to fetch" ou dados não aparecem**: confirma no Supabase (SQL Editor) que correste o `schema.sql` com sucesso — corre `select * from clientes;` para confirmares que os 3 clientes lá estão.
- **Quiseres actualizar o código depois**: edita os ficheiros no GitHub (ou volta a fazer upload) — a Vercel publica automaticamente a nova versão sempre que o repositório muda.

Qualquer erro nestes passos, diz-me exactamente o que vês no ecrã (uma captura ajuda) que te ajudo a resolver.
