import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_CATEGORIES } from '../domain/defaults';
import type { Block, Budget, Category, Override, Recurring, Transaction } from '../domain/types';

export interface Alert {
  /** `${month}:${scope}:${threshold}` — evita repetir o mesmo aviso. */
  id: string;
  createdAt: number;
}

export const db = new Dexie('fluxo') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>;
  categories: EntityTable<Category, 'id'>;
  recurrings: EntityTable<Recurring, 'id'>;
  budgets: EntityTable<Budget, 'scope'>;
  blocks: EntityTable<Block, 'id'>;
  overrides: EntityTable<Override, 'id'>;
  alerts: EntityTable<Alert, 'id'>;
};

db.version(1).stores({
  transactions: 'id, date, type, categoryId, recurringId',
  categories: 'id, type',
  recurrings: 'id',
  budgets: 'scope',
  blocks: 'id, month',
  overrides: '++id, month',
  alerts: 'id',
});

db.on('populate', (tx) => {
  tx.table('categories').bulkAdd(DEFAULT_CATEGORIES);
});

export const TABLES = ['transactions', 'categories', 'recurrings', 'budgets', 'blocks', 'overrides', 'alerts'] as const;
