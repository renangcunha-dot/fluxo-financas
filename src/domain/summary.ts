import { addMonths, monthOf } from './format';
import type { Category, Transaction, TxType } from './types';

export interface Totals {
  income: number;
  expense: number;
  balance: number;
}

export function totals(txs: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, balance: income - expense };
}

export const inMonth = (txs: Transaction[], month: string) => txs.filter((t) => monthOf(t.date) === month);

export interface CategoryRow {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  total: number;
  share: number;
  prevTotal: number;
  /** Variação relativa vs. mês anterior; null quando não havia gasto antes. */
  delta: number | null;
  count: number;
}

export function byCategory(
  txs: Transaction[],
  prevTxs: Transaction[],
  type: TxType,
  categories: Category[],
): CategoryRow[] {
  const sum = (list: Transaction[]) => {
    const map = new Map<string, { total: number; count: number }>();
    for (const t of list) {
      if (t.type !== type) continue;
      const cur = map.get(t.categoryId) ?? { total: 0, count: 0 };
      cur.total += t.amount;
      cur.count += 1;
      map.set(t.categoryId, cur);
    }
    return map;
  };
  const cur = sum(txs);
  const prev = sum(prevTxs);
  const grand = [...cur.values()].reduce((a, b) => a + b.total, 0);
  const catMap = new Map(categories.map((c) => [c.id, c]));

  return [...cur.entries()]
    .map(([categoryId, { total, count }]) => {
      const c = catMap.get(categoryId);
      const prevTotal = prev.get(categoryId)?.total ?? 0;
      return {
        categoryId,
        name: c?.name ?? 'Sem categoria',
        icon: c?.icon ?? '❔',
        color: c?.color ?? '#94a3b8',
        total,
        count,
        share: grand ? total / grand : 0,
        prevTotal,
        delta: prevTotal ? (total - prevTotal) / prevTotal : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface MonthPoint extends Totals {
  month: string;
}

export function lastMonths(txs: Transaction[], endMonth: string, n: number): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const month = addMonths(endMonth, -i);
    points.push({ month, ...totals(inMonth(txs, month)) });
  }
  return points;
}

/** Gasto do mês num escopo ('total' ou categoria), ignorando opcionalmente uma transação (edição). */
export function spentInScope(txs: Transaction[], month: string, scope: string, excludeId?: string): number {
  let s = 0;
  for (const t of txs) {
    if (t.type !== 'expense' || t.id === excludeId || monthOf(t.date) !== month) continue;
    if (scope === 'total' || t.categoryId === scope) s += t.amount;
  }
  return s;
}
