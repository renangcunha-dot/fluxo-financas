import Dexie, { type EntityTable, type Transaction as DexieTx } from 'dexie';
import { DEFAULT_CATEGORIES } from '../domain/defaults';
import { uid } from '../domain/format';
import type { Block, Budget, Category, Override, Recurring, Transaction } from '../domain/types';

export interface Alert {
  /** `${month}:${scope}:${threshold}` — evita repetir o mesmo aviso. */
  id: string;
  createdAt: number;
}

/** Registro alterado localmente que ainda precisa subir para a nuvem. */
export interface Pending {
  id: string; // `${tbl}:${key}`
  tbl: string;
  key: string;
  at: number;
}

export interface Meta {
  key: string;
  value: unknown;
}

/** Tabelas sincronizadas entre aparelhos. */
export const SYNCED = ['transactions', 'categories', 'recurrings', 'budgets', 'blocks', 'decisions', 'alerts'] as const;
export type SyncedTable = (typeof SYNCED)[number];

export type FluxoDB = Dexie & {
  transactions: EntityTable<Transaction, 'id'>;
  categories: EntityTable<Category, 'id'>;
  recurrings: EntityTable<Recurring, 'id'>;
  budgets: EntityTable<Budget, 'scope'>;
  blocks: EntityTable<Block, 'id'>;
  decisions: EntityTable<Override, 'id'>;
  alerts: EntityTable<Alert, 'id'>;
  pending: EntityTable<Pending, 'id'>;
  meta: EntityTable<Meta, 'key'>;
  /** Transações que aplicam dados vindos da nuvem (não geram pendências). */
  remoteTxs: WeakSet<object>;
  onLocalChange: (() => void) | null;
};

export function createDB(name: string): FluxoDB {
  const db = new Dexie(name) as FluxoDB;
  db.remoteTxs = new WeakSet();
  db.onLocalChange = null;

  db.version(1).stores({
    transactions: 'id, date, type, categoryId, recurringId',
    categories: 'id, type',
    recurrings: 'id',
    budgets: 'scope',
    blocks: 'id, month',
    overrides: '++id, month',
    alerts: 'id',
  });

  // v2: decisões com id texto (não colide entre aparelhos), carimbo updatedAt, fila de sincronização.
  db.version(2)
    .stores({
      transactions: 'id, date, type, categoryId, recurringId, importKey',
      decisions: 'id, month',
      pending: 'id',
      meta: 'key',
    })
    .upgrade(async (tx) => {
      const now = Date.now();
      const old = await tx.table('overrides').toArray();
      await tx.table('decisions').bulkAdd(old.map(({ id: _id, ...o }) => ({ ...o, id: uid(), updatedAt: now })));
      for (const t of ['transactions', 'categories', 'recurrings', 'budgets', 'blocks', 'alerts']) {
        await tx.table(t).toCollection().modify((r: { updatedAt?: number }) => {
          r.updatedAt ??= now;
        });
      }
    });

  db.version(3).stores({ overrides: null });

  db.on('populate', (tx) => {
    tx.table('categories').bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c, updatedAt: 0 })));
  });

  // ---- rastreamento de mudanças locais ----
  const queue = new Map<string, Pending>();
  let flushTimer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    flushTimer = undefined;
    const items = [...queue.values()];
    queue.clear();
    if (items.length) db.pending.bulkPut(items).then(() => db.onLocalChange?.()).catch(() => {});
  };
  const isRemote = (t: DexieTx | null) => {
    for (let x = t as (DexieTx & { parent?: DexieTx }) | undefined; x; x = x.parent) if (db.remoteTxs.has(x)) return true;
    return false;
  };
  const track = (tbl: string, key: unknown, t: DexieTx) => {
    t.on('complete', () => {
      const k = String(key);
      queue.set(`${tbl}:${k}`, { id: `${tbl}:${k}`, tbl, key: k, at: Date.now() });
      flushTimer ??= setTimeout(flush, 0);
    });
  };

  for (const tbl of SYNCED) {
    const table = db.table(tbl);
    const keyPath = tbl === 'budgets' ? 'scope' : 'id';
    table.hook('creating', function (key, obj, t) {
      if (isRemote(t)) return;
      obj.updatedAt = Date.now();
      track(tbl, key ?? obj[keyPath], t);
    });
    table.hook('updating', function (_mods, key, _obj, t) {
      if (isRemote(t)) return;
      track(tbl, key, t);
      return { updatedAt: Date.now() };
    });
    table.hook('deleting', function (key, _obj, t) {
      if (isRemote(t)) return;
      track(tbl, key, t);
    });
  }

  return db;
}

export const db = createDB('fluxo');

export const TABLES = [...SYNCED] as const;
