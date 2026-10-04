import { useMemo } from 'react';
import { CategoryDonut, IncomeBars, TrendChart } from '../components/Charts';
import { Button, Card, Delta, HealthTag, LimitBar } from '../components/ui';
import { forecastMonth, historicalDaily } from '../domain/forecast';
import { addMonths, money, monthLabel, today } from '../domain/format';
import { buildInsights } from '../domain/insights';
import { byCategory, inMonth, lastMonths, totals } from '../domain/summary';
import { TOTAL_SCOPE } from '../domain/types';
import type { AppData } from '../hooks/useData';
import { loadDemo } from '../store/actions';
import { useUI } from '../store/ui';

const rel = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null);

export function Dashboard({ data }: { data: AppData }) {
  const { month, setMonth, setPage, openQuickAdd } = useUI();

  const view = useMemo(() => {
    const cur = inMonth(data.transactions, month);
    const prev = inMonth(data.transactions, addMonths(month, -1));
    const t = totals(cur);
    const pt = totals(prev);
    const expenseRows = byCategory(cur, prev, 'expense', data.categories);
    const incomeRows = byCategory(cur, prev, 'income', data.categories);
    const limit = data.budgets.find((b) => b.scope === TOTAL_SCOPE)?.amount;
    const history = historicalDaily([1, 2, 3].map((k) => {
      const m = addMonths(month, -k);
      return { month: m, txs: inMonth(data.transactions, m) };
    }));
    const forecast = forecastMonth(cur, data.recurrings, month, today(), limit, history);
    return {
      t,
      pt,
      expenseRows,
      incomeRows,
      limit,
      forecast,
      insights: buildInsights({ totals: t, prevTotals: pt, expenseRows, forecast, limit }),
      trend: lastMonths(data.transactions, month, 6),
      limits: new Map(data.budgets.map((b) => [b.scope, b.amount])),
      blocked: data.blocks.filter((b) => b.month === month),
    };
  }, [data, month]);

  if (data.ready && data.transactions.length === 0) {
    return (
      <Card className="mx-auto max-w-lg py-10 text-center">
        <div className="text-5xl">🌱</div>
        <h2 className="mt-3 text-xl font-bold">Vamos organizar seu dinheiro</h2>
        <p className="mt-2 text-ink-2">Lance sua primeira receita ou despesa — ou carregue 6 meses de exemplo para explorar o app.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button variant="primary" onClick={() => openQuickAdd()}>+ Primeiro lançamento</Button>
          <Button onClick={loadDemo}>Ver com dados de exemplo</Button>
        </div>
      </Card>
    );
  }

  const { t, pt, forecast, limit } = view;

  return (
    <div className="space-y-4">
      {view.blocked.length > 0 && (
        <button onClick={() => setPage('budgets')} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--bad-mark)]/40 bg-[var(--bad-mark)]/10 p-3 text-left text-sm">
          <span className="text-xl">🔒</span>
          <span className="flex-1">
            <b>Bloqueado em {monthLabel(month)}:</b>{' '}
            {view.blocked.map((b) => (b.scope === TOTAL_SCOPE ? 'todas as despesas' : data.catMap.get(b.scope)?.name ?? b.scope)).join(', ')}
          </span>
          <span className="text-ink-2">Gerenciar ›</span>
        </button>
      )}

      {/* Resumo */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-ink-2">Saldo do mês</p>
          <p className={`tabular mt-1 text-3xl font-bold ${t.balance >= 0 ? 'text-good' : 'text-bad'}`}>{money(t.balance)}</p>
          <p className="mt-1 text-xs text-muted">{t.balance >= 0 ? '▲ Positivo' : '▼ Negativo'} · mês anterior {money(pt.balance)}</p>
        </Card>
        <Card>
          <p className="flex items-center justify-between text-sm text-ink-2">Receitas <Delta value={rel(t.income, pt.income)} /></p>
          <p className="tabular mt-1 text-2xl font-bold">{money(t.income)}</p>
          <button onClick={() => openQuickAdd({ presetType: 'income' })} className="mt-1 text-xs font-semibold text-brand">+ Adicionar receita</button>
        </Card>
        <Card>
          <p className="flex items-center justify-between text-sm text-ink-2">Despesas <Delta value={rel(t.expense, pt.expense)} invert /></p>
          <p className="tabular mt-1 text-2xl font-bold">{money(t.expense)}</p>
          <button onClick={() => openQuickAdd({ presetType: 'expense' })} className="mt-1 text-xs font-semibold text-brand">+ Adicionar despesa</button>
        </Card>
      </div>

      {/* Limite + previsão */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Limite de despesas do mês" action={limit ? <HealthTag spent={t.expense} limit={limit} /> : null}>
          {limit ? (
            <>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="tabular text-xl font-bold">{money(t.expense)}</span>
                <span className="tabular text-sm text-ink-2">de {money(limit)}</span>
              </div>
              <LimitBar spent={t.expense} limit={limit} />
              <p className="mt-3 text-sm text-ink-2">
                {t.expense >= limit ? (
                  <>Você passou <b className="text-bad">{money(t.expense - limit)}</b> do limite.</>
                ) : (
                  <>Restam <b className="text-ink">{money(limit - t.expense)}</b> para gastar.</>
                )}
              </p>
            </>
          ) : (
            <div className="text-sm text-ink-2">
              <p>Defina um teto mensal: o app avisa aos 50% e 80%, e no limite pergunta se você quer <b>bloquear</b> ou <b>continuar</b>.</p>
              <Button variant="primary" className="mt-3" onClick={() => setPage('budgets')}>Definir limite</Button>
            </div>
          )}
        </Card>

        <Card title={forecast.kind === 'past' ? 'Fechamento do mês' : 'Previsão de fechamento'}>
          {forecast.kind === 'future' ? (
            <p className="text-sm text-ink-2">Mês futuro: aparecem aqui as recorrências previstas ({money(forecast.pendingIncome)} de receitas, {money(forecast.pendingExpense)} de despesas).</p>
          ) : (
            <>
              <p className={`tabular text-xl font-bold ${forecast.balance >= 0 ? 'text-good' : 'text-bad'}`}>{money(forecast.balance)}</p>
              <p className="text-sm text-ink-2">
                {forecast.kind === 'current' ? 'saldo previsto no ritmo atual de gastos' : 'saldo final'}
              </p>
              {forecast.kind === 'current' && (
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="text-xs text-ink-2">Pode gastar por dia</dt>
                    <dd className="tabular text-lg font-bold">{forecast.dailyAllowance !== null ? money(forecast.dailyAllowance) : '—'}</dd>
                    <dd className="text-xs text-muted">{forecast.daysLeft + 1} dia(s) restantes{limit ? ' · até o limite' : ''}</dd>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-3">
                    <dt className="text-xs text-ink-2">Ainda a cair</dt>
                    <dd className="tabular text-sm"><span className="text-good">+{money(forecast.pendingIncome)}</span></dd>
                    <dd className="tabular text-sm"><span className="text-bad">−{money(forecast.pendingExpense)}</span></dd>
                  </div>
                </dl>
              )}
            </>
          )}
        </Card>
      </div>

      {view.insights.length > 0 && (
        <Card title="💡 Insights">
          <ul className="space-y-2">
            {view.insights.map((i, k) => (
              <li key={k} className="flex gap-2 text-sm">
                <span aria-hidden>{i.icon}</span>
                <span className={i.tone === 'bad' ? 'text-ink' : 'text-ink-2'}>{i.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-5">
        <Card title="Despesas por categoria" className="lg:col-span-3">
          {view.expenseRows.length ? <CategoryDonut rows={view.expenseRows} limits={view.limits} /> : <p className="text-sm text-muted">Nenhuma despesa neste mês.</p>}
        </Card>
        <Card title="Receitas por categoria" className="lg:col-span-2">
          {view.incomeRows.length ? <IncomeBars rows={view.incomeRows} /> : <p className="text-sm text-muted">Nenhuma receita neste mês.</p>}
        </Card>
      </div>

      <Card title="Últimos 6 meses" action={<span className="text-xs text-muted">clique numa barra para abrir o mês</span>}>
        <TrendChart points={view.trend} current={month} onPick={setMonth} />
      </Card>
    </div>
  );
}
