import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/schema';
import type { Block, Budget, Category, Override, Recurring, Transaction } from '../domain/types';

export interface AppData {
  ready: boolean;
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  blocks: Block[];
  overrides: Override[];
  recurrings: Recurring[];
  catMap: Map<string, Category>;
}

const EMPTY: never[] = [];

/** Todos os dados do app, reativos ao IndexedDB. Volume pessoal cabe tranquilamente em memória. */
export function useData(): AppData {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const budgets = useLiveQuery(() => db.budgets.toArray(), []);
  const blocks = useLiveQuery(() => db.blocks.toArray(), []);
  const overrides = useLiveQuery(() => db.overrides.orderBy('id').reverse().toArray(), []);
  const recurrings = useLiveQuery(() => db.recurrings.toArray(), []);
  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  return {
    ready: !!(transactions && categories && budgets && blocks && overrides && recurrings),
    transactions: transactions ?? EMPTY,
    categories: categories ?? EMPTY,
    budgets: budgets ?? EMPTY,
    blocks: blocks ?? EMPTY,
    overrides: overrides ?? EMPTY,
    recurrings: recurrings ?? EMPTY,
    catMap,
  };
}
