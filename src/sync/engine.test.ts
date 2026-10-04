import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDB, type FluxoDB } from '../db/schema';
import { generateDue } from '../domain/recurring';
import type { Recurring, Transaction } from '../domain/types';
import { MemoryRemote, seedAll, syncOnce } from './engine';

const settle = () => new Promise((r) => setTimeout(r, 15));
let n = 0;
const tx = (p: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  type: 'expense',
  amount: 1000,
  date: '2026-10-02',
  categoryId: 'alimentacao',
  description: 'Mercado',
  createdAt: 0,
  ...p,
});

let phone: FluxoDB;
let pc: FluxoDB;
let cloud: MemoryRemote;

/** Sincroniza todos os aparelhos duas vezes (como acontece na prática com o agendamento). */
const syncAll = async () => {
  await settle();
  for (let i = 0; i < 2; i++) {
    await syncOnce(phone, cloud);
    await syncOnce(pc, cloud);
  }
  await settle();
};

beforeEach(async () => {
  phone = createDB(`phone-${++n}`);
  pc = createDB(`pc-${n}`);
  cloud = new MemoryRemote();
  await Promise.all([phone.open(), pc.open()]);
});
afterEach(() => {
  phone.close();
  pc.close();
});

describe('sincronização', () => {
  it('lançamento no celular aparece no computador, sem eco de volta', async () => {
    const t = tx();
    await phone.transactions.add(t);
    await syncAll();
    expect(await pc.transactions.get(t.id)).toMatchObject({ amount: 1000, description: 'Mercado' });
    expect(await pc.pending.count()).toBe(0);
    expect(await phone.pending.count()).toBe(0);
  });

  it('edição e exclusão propagam', async () => {
    const t = tx();
    await phone.transactions.add(t);
    await syncAll();
    await pc.transactions.update(t.id, { amount: 2500 });
    await syncAll();
    expect((await phone.transactions.get(t.id))?.amount).toBe(2500);
    await phone.transactions.delete(t.id);
    await syncAll();
    expect(await pc.transactions.get(t.id)).toBeUndefined();
    expect(cloud.rows.get(`transactions:${t.id}`)?.deleted).toBe(true);
  });

  it('conflito offline: vence a alteração mais recente nos dois aparelhos', async () => {
    const t = tx();
    await phone.transactions.add(t);
    await syncAll();
    await phone.transactions.update(t.id, { description: 'antiga' });
    await settle();
    await pc.transactions.update(t.id, { description: 'mais nova' });
    // celular sincroniza primeiro, mas a edição do PC é mais nova
    await syncAll();
    expect((await phone.transactions.get(t.id))?.description).toBe('mais nova');
    expect((await pc.transactions.get(t.id))?.description).toBe('mais nova');
  });

  it('exclusão mais nova vence edição mais antiga feita offline', async () => {
    const t = tx();
    await phone.transactions.add(t);
    await syncAll();
    await pc.transactions.update(t.id, { amount: 9999 });
    await settle();
    await phone.transactions.delete(t.id);
    await settle();
    await syncOnce(pc, cloud); // edição antiga chega primeiro
    await syncAll();
    expect(await phone.transactions.get(t.id)).toBeUndefined();
    expect(await pc.transactions.get(t.id)).toBeUndefined();
  });

  it('limites, bloqueios e decisões também sincronizam', async () => {
    await phone.budgets.put({ scope: 'total', amount: 50000 });
    await phone.blocks.put({ id: '2026-10:lazer', month: '2026-10', scope: 'lazer', createdAt: 1 });
    await phone.decisions.add({ id: 'd1', month: '2026-10', scope: 'total', kind: 'continue', reason: 'Emergência', amount: 100, description: '', createdAt: 1 });
    await syncAll();
    expect(await pc.budgets.get('total')).toMatchObject({ amount: 50000 });
    expect(await pc.blocks.get('2026-10:lazer')).toBeTruthy();
    expect((await pc.decisions.get('d1'))?.reason).toBe('Emergência');
  });

  it('recorrência gerada nos dois aparelhos não duplica', async () => {
    const r: Recurring = { id: 'r1', type: 'expense', amount: 220000, categoryId: 'moradia', description: 'Aluguel', day: 1, active: true, startMonth: '2026-10' };
    for (const d of [phone, pc]) {
      const { transactions } = generateDue([r], '2026-10-05');
      await d.transactions.bulkPut(transactions);
    }
    await syncAll();
    expect(await phone.transactions.count()).toBe(1);
    expect(await pc.transactions.count()).toBe(1);
  });

  it('primeiro login mescla os dados que já estavam no aparelho', async () => {
    await phone.transactions.add(tx({ id: 'do-celular' }));
    await pc.transactions.add(tx({ id: 'do-pc' }));
    await settle();
    await phone.pending.clear();
    await pc.pending.clear();
    await seedAll(phone);
    await seedAll(pc);
    await syncAll();
    const ids = (await pc.transactions.toArray()).map((t) => t.id).sort();
    expect(ids).toEqual(['do-celular', 'do-pc']);
    expect((await phone.transactions.toArray()).length).toBe(2);
  });
});
