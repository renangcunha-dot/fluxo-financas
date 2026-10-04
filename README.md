# Fluxo: controle financeiro com freio consciente

App web para controlar receitas e despesas, com limite mensal que **age na hora do gasto**. Quando você atinge o limite, o app manda um push e pergunta: **bloquear** ou **continuar gastando?**

Os dados ficam **somente no seu dispositivo** (IndexedDB). Não há cadastro nem servidor.

## Funcionalidades

- **Receitas e despesas por categoria:** valor, % do total e variação em relação ao mês anterior.
- **Saldo do mês:** positivo ou negativo, com gráfico de rosca das despesas e tendência dos últimos 6 meses.
- **Limites geral e por categoria:**
  - Alertas aos 50%, 80% e 100%.
  - No limite, você escolhe **Bloquear** (trava novas despesas até o fim do mês) ou **Continuar** (registra o motivo).
  - Desbloquear também exige um motivo, e todas as decisões ficam em um histórico.
- **Previsão de fechamento:** quanto você ainda pode gastar por dia, combinando o ritmo atual com o seu histórico.
- **Lançamento rápido:** digite `uber 32` ou `+salário 5000`. A categoria é sugerida a partir do seu histórico.
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

## Stack

Vite, React, TypeScript, Tailwind CSS, Recharts, Dexie (IndexedDB), Zustand e vite-plugin-pwa (Workbox).

## Estrutura

```
src/
  domain/         regras puras e testadas: totais, limites, previsão, categorização, recorrências, insights
  db/             esquema do IndexedDB
  store/          estado da interface e ações (fluxo do freio, backup)
  notifications/  permissão e push via service worker
  components/     UI, gráficos, lançamento rápido, modal do freio
  pages/          Início, Lançamentos, Limites, Mais
  sw.ts           service worker (cache offline e ações das notificações)
```

## Limitações

- O bloqueio vale para os lançamentos dentro do app. Ele não bloqueia cartões nem contas bancárias.
- As notificações aparecem enquanto o app ou o navegador estiver aberto, inclusive em segundo plano. Avisos com o app totalmente fechado exigiriam um servidor de push.
- Cada pessoa tem os próprios dados no próprio aparelho. Para trocar de dispositivo, use o backup em JSON.
