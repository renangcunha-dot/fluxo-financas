import { daysInMonth, monthOf } from './format';
import type { Recurring, Transaction } from './types';

export interface Forecast {
  kind: 'past' | 'current' | 'future';
  income: number;
  expense: number;
  balance: number;
  /** Recorrências ainda não lançadas neste mês. */
  pendingIncome: number;
  pendingExpense: number;
  /** Quanto ainda pode gastar por dia (até o limite, ou até zerar o saldo). null se não houver margem calculável. */
  dailyAllowance: number | null;
  daysLeft: number;
  /** Média diária de gastos variáveis (exclui recorrentes). */
  variableDaily: number;
}

/**
 * Projeta o fechamento do mês: lançado + recorrências pendentes + gastos variáveis previstos
 * para os dias restantes. O ritmo diário mistura o mês atual com o histórico (`historyDaily`),
 * dando mais peso ao mês atual conforme ele avança — evita previsões absurdas nos primeiros dias.
 */
export function forecastMonth(
  monthTxs: Transaction[],
  recurrings: Recurring[],
  month: string,
  todayISO: string,
  limit?: number,
  historyDaily?: number,
): Forecast {
  const curMonth = monthOf(todayISO);
  const kind = month < curMonth ? 'past' : month > curMonth ? 'future' : 'current';
  const total = daysInMonth(month);
  const day = kind === 'current' ? Number(todayISO.slice(8, 10)) : kind === 'past' ? total : 0;
  const daysLeft = total - day;

  let income = 0;
  let expense = 0;
  let variable = 0;
  for (const t of monthTxs) {
    if (t.type === 'income') income += t.amount;
    else {
      expense += t.amount;
      if (!t.recurringId) variable += t.amount;
    }
  }

  let pendingIncome = 0;
  let pendingExpense = 0;
  if (kind !== 'past') {
    for (const r of recurrings) {
      if (!r.active || r.startMonth > month) continue;
      const already = monthTxs.some((t) => t.recurringId === r.id);
      if (already) continue;
      if (r.type === 'income') pendingIncome += r.amount;
      else pendingExpense += r.amount;
    }
  }

  const pace = day > 0 ? variable / day : 0;
  const w = historyDaily === undefined ? 1 : day / total;
  const variableDaily = w * pace + (1 - w) * (historyDaily ?? 0);
  const projectedVariable = Math.round(variableDaily * daysLeft);
  const projIncome = income + pendingIncome;
  const projExpense = expense + pendingExpense + projectedVariable;

  let dailyAllowance: number | null = null;
  if (kind !== 'past' && daysLeft + (kind === 'current' ? 1 : 0) > 0) {
    const remainingDays = kind === 'current' ? daysLeft + 1 : total;
    const room = limit
      ? limit - expense - pendingExpense
      : projIncome - expense - pendingExpense;
    dailyAllowance = Math.max(0, Math.floor(room / remainingDays));
  }

  return {
    kind,
    income: projIncome,
    expense: projExpense,
    balance: projIncome - projExpense,
    pendingIncome,
    pendingExpense,
    dailyAllowance,
    daysLeft,
    variableDaily: Math.round(variableDaily),
  };
}

/** Média diária de gastos variáveis (não recorrentes) dos meses informados; undefined se não houver dados. */
export function historicalDaily(txsByMonth: { month: string; txs: Transaction[] }[]): number | undefined {
  let sum = 0;
  let days = 0;
  for (const { month, txs } of txsByMonth) {
    const variable = txs.filter((t) => t.type === 'expense' && !t.recurringId);
    if (!variable.length) continue;
    sum += variable.reduce((a, t) => a + t.amount, 0);
    days += daysInMonth(month);
  }
  return days ? sum / days : undefined;
}
