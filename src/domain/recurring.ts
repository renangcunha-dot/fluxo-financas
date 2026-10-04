import { addMonths, daysInMonth, monthOf, uid } from './format';
import type { Recurring, Transaction } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Gera os lançamentos recorrentes que já venceram até hoje (inclusive meses perdidos
 * enquanto o app ficou fechado). Retorna as transações novas e as recorrências atualizadas.
 */
export function generateDue(
  recurrings: Recurring[],
  todayISO: string,
): { transactions: Transaction[]; updated: Recurring[] } {
  const curMonth = monthOf(todayISO);
  const todayDay = Number(todayISO.slice(8, 10));
  const transactions: Transaction[] = [];
  const updated: Recurring[] = [];

  for (const r of recurrings) {
    if (!r.active) continue;
    let month = r.lastGenerated ? addMonths(r.lastGenerated, 1) : r.startMonth;
    let last = r.lastGenerated;
    while (month <= curMonth) {
      const day = Math.min(r.day, daysInMonth(month));
      if (month === curMonth && day > todayDay) break;
      transactions.push({
        id: uid(),
        type: r.type,
        amount: r.amount,
        date: `${month}-${pad(day)}`,
        categoryId: r.categoryId,
        description: r.description,
        recurringId: r.id,
        createdAt: Date.now(),
      });
      last = month;
      month = addMonths(month, 1);
    }
    if (last !== r.lastGenerated) updated.push({ ...r, lastGenerated: last });
  }
  return { transactions, updated };
}
