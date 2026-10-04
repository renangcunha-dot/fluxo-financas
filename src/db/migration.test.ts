import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { createDB } from './schema';

it('migra o banco da versão 1 sem perder dados', async () => {
  const name = 'fluxo-v1';
  const old = new Dexie(name);
  old.version(1).stores({
    transactions: 'id, date, type, categoryId, recurringId',
    categories: 'id, type',
    recurrings: 'id',
    budgets: 'scope',
    blocks: 'id, month',
    overrides: '++id, month',
    alerts: 'id',
  });
  await old.open();
  await old.table('transactions').add({ id: 't1', type: 'expense', amount: 500, date: '2026-10-01', categoryId: 'lazer', description: 'Cinema', createdAt: 1 });
  await old.table('budgets').put({ scope: 'total', amount: 100000 });
  await old.table('overrides').add({ month: '2026-10', scope: 'total', kind: 'continue', reason: 'Emergência', amount: 500, description: 'Cinema', createdAt: 1 });
  old.close();

  const db = createDB(name);
  await db.open();
  expect(db.verno).toBe(3);
  expect(db.tables.map((t) => t.name)).not.toContain('overrides');
  expect(await db.transactions.get('t1')).toMatchObject({ description: 'Cinema', amount: 500 });
  expect((await db.transactions.get('t1'))?.updatedAt).toBeGreaterThan(0);
  expect(await db.budgets.get('total')).toMatchObject({ amount: 100000 });
  const decisions = await db.decisions.toArray();
  expect(decisions).toHaveLength(1);
  expect(decisions[0]).toMatchObject({ reason: 'Emergência', kind: 'continue' });
  expect(typeof decisions[0].id).toBe('string');
  db.close();
});
