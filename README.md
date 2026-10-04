# Fluxo: controle financeiro com freio consciente

App web para controlar receitas e despesas, com limite mensal que **age na hora do gasto**. Quando você atinge o limite, o app manda um push e pergunta: **bloquear** ou **continuar gastando?**

O app funciona offline. Os dados ficam no seu dispositivo (IndexedDB) e, se você quiser, **sincronizam entre celular e computador** com login por e-mail (Supabase).

## Funcionalidades

- **Receitas e despesas por categoria:** valor, % do total e variação em relação ao mês anterior.
- **Saldo do mês:** positivo ou negativo, com gráfico de rosca das despesas e tendência dos últimos 6 meses.
- **Limites geral e por categoria:**
  - Alertas aos 50%, 80% e 100%.
  - No limite, você escolhe **Bloquear** (trava novas despesas até o fim do mês) ou **Continuar** (registra o motivo).
  - Desbloquear também exige um motivo, e todas as decisões ficam em um histórico.
- **Previsão de fechamento:** quanto você ainda pode gastar por dia, combinando o ritmo atual com o seu histórico.
- **Lançamento rápido:** digite `uber 32` ou `+salário 5000`. A categoria é sugerida a partir do seu histórico.
- **Importação de extrato OFX/CSV:** funciona com Nubank (conta e fatura), Itaú, Bradesco, Santander, BB, Caixa, Inter, C6 e outros.
  - Mostra uma prévia antes de importar e sugere a categoria de cada lançamento.
  - Identifica o que já foi importado e lançamentos que parecem duplicados.
  - Deixa de fora, por padrão, os pagamentos de fatura.
  - Ao mudar a categoria de um lançamento, aplica a mesma categoria aos iguais.
- **Sincronização:** celular e computador ficam iguais em tempo real e o app continua funcionando sem internet.
  - Em caso de conflito, vale a alteração mais recente.
  - Cada usuário só vê os próprios dados (RLS).
- **Recorrências:** salário, aluguel e assinaturas são lançados automaticamente.
- **Insights em português,** gerados localmente.
- **PWA:** instalável no celular e funciona offline.
- **Tema claro e escuro.**
- **Backup:** exportação e importação em JSON e exportação em CSV.

## Rodando localmente

```bash
npm install
npm run dev      # desenvolvimento
npm test         # testes da lógica (Vitest)
npm run build    # build de produção em dist/
```

## Ativando a sincronização (opcional)

Sem essa configuração, o app funciona normalmente, só no aparelho.

1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. No **SQL Editor**, cole e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql).
3. Em **Authentication → Email Templates → Magic Link**, inclua `{{ .Token }}` no corpo do e-mail. Assim o e-mail traz o código de 6 dígitos, que funciona também no app instalado no celular.
4. Em **Authentication → URL Configuration**, defina o *Site URL* com o endereço do app (ex.: `https://seu-app.vercel.app`).
5. Configure as variáveis de ambiente, no Vercel (Settings → Environment Variables) e/ou em `.env.local`, seguindo o [`.env.example`](.env.example):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Faça um novo deploy.

## Stack

Vite, React, TypeScript, Tailwind CSS, Recharts, Dexie (IndexedDB), Zustand, Supabase (auth + Postgres + Realtime) e vite-plugin-pwa (Workbox).

## Estrutura

```
src/
  domain/         regras puras e testadas: totais, limites, previsão, categorização, recorrências, insights, leitura de extratos
  db/             esquema do IndexedDB
  store/          estado da interface e ações (fluxo do freio, backup)
  sync/           motor de sincronização (local-first, last-write-wins) e conexão com o Supabase
  notifications/  permissão e push via service worker
  components/     UI, gráficos, lançamento rápido, modal do freio
  pages/          Início, Lançamentos, Limites, Mais
  sw.ts           service worker (cache offline e ações das notificações)
```

## Limitações

- O bloqueio vale para os lançamentos dentro do app. Ele não bloqueia cartões nem contas bancárias.
- As notificações aparecem enquanto o app ou o navegador estiver aberto, inclusive em segundo plano. Avisos com o app totalmente fechado exigiriam um servidor de push.
- Sem a sincronização configurada, cada pessoa tem os dados só no próprio aparelho. Nesse caso, use o backup em JSON para trocar de dispositivo.
