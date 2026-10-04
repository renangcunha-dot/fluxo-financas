import { db, TABLES } from '../db/schema';
import { checkBudget, type ScopeCheck } from '../domain/budget';
import { DEFAULT_CATEGORIES } from '../domain/defaults';
import { addMonths, currentMonth, money, monthLabel, monthOf, pct, today, uid } from '../domain/format';
import { generateDue } from '../domain/recurring';
import { TOTAL_SCOPE, type Recurring, type Transaction } from '../domain/types';
import { push } from '../notifications/notify';
import { askGate, useUI } from './ui';

export async function scopeName(scope: string) {
  if (scope === TOTAL_SCOPE) return 'gastos do mês';
  const c = await db.categories.get(scope);
  return c ? `${c.icon} ${c.name}` : scope;
}

async function budgetContext() {
  const [transactions, budgets, blocks, overrides] = await Promise.all([
    db.transactions.where('type').equals('expense').toArray(),
    db.budgets.toArray(),
    db.blocks.toArray(),
    db.overrides.toArray(),
  ]);
  return { transactions, budgets, blocks, overrides };
}

async function warn(scopes: ScopeCheck[], month: string) {
  for (const s of scopes) {
    for (const t of s.warnings) {
      const id = `${month}:${s.scope}:${t}`;
      if (await db.alerts.get(id)) continue;
      await db.alerts.put({ id, createdAt: Date.now() });
      const name = await scopeName(s.scope);
      const rest = money(Math.max(0, s.limit - s.after));
      const text = `Você usou ${pct(s.after / s.limit)} do limite de ${name}. Restam ${rest}.`;
      useUI.getState().toast(text, 'warn');
      push(t >= 0.8 ? '🟠 Limite quase no fim' : '🟡 Metade do limite', text, { tag: id });
    }
  }
}

export type SaveResult = 'saved' | 'blocked' | 'cancelled';

/**
 * Salva um lançamento passando pelo "freio consciente":
 * bloqueado → pede motivo para desbloquear; estouro → push + decisão (bloquear/continuar); aviso → push informativo.
 */
export async function saveTransaction(tx: Transaction, recurring?: Recurring): Promise<SaveResult> {
  const { toast } = useUI.getState();
  const month = monthOf(tx.date);
  let check = checkBudget(tx, await budgetContext());

  if (check.status === 'blocked') {
    const answer = await askGate({ kind: 'blocked', tx, scopes: check.blockedScopes });
    if (answer.choice !== 'unblock') return 'cancelled';
    await db.transaction('rw', db.blocks, db.overrides, async () => {
      for (const scope of check.status === 'blocked' ? check.blockedScopes : []) {
        await db.blocks.delete(`${month}:${scope}`);
        await db.overrides.add({ month, scope, kind: 'unblock', reason: answer.reason, amount: tx.amount, description: tx.description, createdAt: Date.now() });
      }
    });
    check = checkBudget(tx, await budgetContext());
  }

  if (check.status === 'exceeded') {
    const first = check.exceeded[0];
    const name = await scopeName(first.scope);
    push('🚦 Você chegou no seu limite', `${money(tx.amount)} em "${tx.description || 'nova despesa'}" leva ${name} a ${money(first.after)} de ${money(first.limit)}. Bloquear ou continuar?`, {
      tag: `gate:${month}:${first.scope}`,
      requireInteraction: true,
      actions: [
        { action: 'block', title: '🛑 Bloquear' },
        { action: 'continue', title: 'Continuar' },
      ],
    });
    const answer = await askGate({ kind: 'exceeded', tx, exceeded: check.exceeded });
    if (answer.choice === 'cancel') return 'cancelled';
    if (answer.choice === 'block') {
      await db.blocks.bulkPut(check.exceeded.map((s) => ({ id: `${month}:${s.scope}`, month, scope: s.scope, createdAt: Date.now() })));
      toast(`🛑 ${name} bloqueado até o fim de ${monthLabel(month)}. Boa decisão!`, 'good');
      return 'blocked';
    }
    if (answer.choice === 'continue') {
      await db.overrides.bulkAdd(
        check.exceeded.map((s) => ({ month, scope: s.scope, kind: 'continue' as const, reason: answer.reason, amount: tx.amount, description: tx.description, createdAt: Date.now() })),
      );
    }
  }

  await db.transaction('rw', db.transactions, db.recurrings, async () => {
    await db.transactions.put(tx);
    if (recurring) await db.recurrings.put(recurring);
  });
  if (check.status === 'warn') await warn(check.scopes, month);
  toast(tx.type === 'income' ? `Receita de ${money(tx.amount)} salva` : `Despesa de ${money(tx.amount)} salva`, 'good');
  return 'saved';
}

export async function deleteTransaction(id: string) {
  await db.transactions.delete(id);
  useUI.getState().toast('Lançamento excluído');
}

export async function unblock(month: string, scope: string, reason: string) {
  await db.transaction('rw', db.blocks, db.overrides, async () => {
    await db.blocks.delete(`${month}:${scope}`);
    await db.overrides.add({ month, scope, kind: 'unblock', reason, amount: 0, description: '', createdAt: Date.now() });
  });
}

export async function blockNow(month: string, scope: string) {
  await db.blocks.put({ id: `${month}:${scope}`, month, scope, createdAt: Date.now() });
}

/** Lança recorrências vencidas — roda ao abrir o app e a cada hora. */
export async function runRecurring() {
  const all = await db.recurrings.toArray();
  const { transactions, updated } = generateDue(all, today());
  if (!transactions.length) return;
  await db.transaction('rw', db.transactions, db.recurrings, async () => {
    await db.transactions.bulkPut(transactions);
    await db.recurrings.bulkPut(updated);
  });
  useUI.getState().toast(`${transactions.length} lançamento(s) recorrente(s) adicionados automaticamente`);
}

// ---------- Backup ----------

export async function exportJSON() {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  download(`fluxo-backup-${today()}.json`, JSON.stringify({ app: 'fluxo', version: 1, exportedAt: new Date().toISOString(), data }, null, 2), 'application/json');
}

export async function importJSON(file: File) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.app !== 'fluxo' || !parsed.data) throw new Error('Arquivo não é um backup do Fluxo.');
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) {
      await db.table(t).clear();
      if (Array.isArray(parsed.data[t])) await db.table(t).bulkAdd(parsed.data[t]);
    }
  });
}

export async function exportCSV() {
  const [txs, cats] = await Promise.all([db.transactions.orderBy('date').toArray(), db.categories.toArray()]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [
    'data;tipo;categoria;descricao;valor',
    ...txs.map((t) =>
      [t.date, t.type === 'income' ? 'Receita' : 'Despesa', esc(catName.get(t.categoryId) ?? ''), esc(t.description), (t.amount / 100).toFixed(2).replace('.', ',')].join(';'),
    ),
  ];
  download(`fluxo-lancamentos-${today()}.csv`, '﻿' + rows.join('\n'), 'text/csv');
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function wipeAll() {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear();
    await db.categories.bulkAdd(DEFAULT_CATEGORIES);
  });
}

// ---------- Dados de exemplo ----------

export async function loadDemo() {
  const cur = currentMonth();
  const todayDay = Number(today().slice(8, 10));
  const first = addMonths(cur, -5);
  const txs: Transaction[] = [];
  const add = (month: string, day: number, type: Transaction['type'], categoryId: string, description: string, reais: number, recurringId?: string) => {
    if (month === cur && day > todayDay) return; // o mês atual só tem o que já aconteceu
    txs.push({ id: uid(), type, amount: Math.round(reais * 100), date: `${month}-${String(day).padStart(2, '0')}`, categoryId, description, recurringId, createdAt: Date.now() });
  };

  // Fixos viram recorrências reais: o app lança sozinho e a previsão já conta com eles.
  const fixed: [Transaction['type'], string, string, number, number][] = [
    ['income', 'salario', 'Salário', 7800, 5],
    ['expense', 'moradia', 'Aluguel', 2200, 10],
    ['expense', 'assinaturas', 'Netflix', 44.9, 8],
    ['expense', 'assinaturas', 'Spotify', 21.9, 8],
    ['expense', 'educacao', 'Curso de inglês', 320, 20],
  ];
  const recurrings: Recurring[] = fixed.map(([type, categoryId, description, reais, day]) => ({
    id: uid(), type, categoryId, description, amount: Math.round(reais * 100), day, active: true, startMonth: first,
    lastGenerated: day <= todayDay ? cur : addMonths(cur, -1),
  }));

  const variable: [string, string, number][] = [
    ['alimentacao', 'Mercado', 420], ['alimentacao', 'iFood', 68], ['alimentacao', 'Padaria', 32],
    ['transporte', 'Uber', 27], ['transporte', 'Gasolina', 230], ['lazer', 'Cinema', 64],
    ['lazer', 'Bar com amigos', 140], ['saude', 'Farmácia', 85], ['compras', 'Amazon', 190],
    ['alimentacao', 'Restaurante', 115],
  ];
  for (let back = 5; back >= 0; back--) {
    const m = addMonths(cur, -back);
    const wobble = 1 + ((back * 37) % 9) / 20 - 0.2;
    recurrings.forEach((r) => add(m, r.day, r.type, r.categoryId, r.description, r.amount / 100, r.id));
    if (back % 2 === 0) add(m, 18, 'income', 'freelance', 'Projeto freela', 1500 + back * 150);
    add(m, 15, 'income', 'investimentos', 'Rendimento CDB', 120 + back * 6);
    add(m, 12, 'expense', 'moradia', 'Luz', 180 * wobble);
    variable.forEach(([cat, desc, value], i) => {
      const day = 1 + ((i * 3 + back) % 27);
      const mult = back === 0 && cat === 'alimentacao' ? 1.5 : wobble;
      add(m, day, 'expense', cat, desc, value * mult);
    });
  }
  await db.transaction('rw', db.transactions, db.recurrings, db.budgets, async () => {
    await db.transactions.bulkPut(txs);
    await db.recurrings.bulkPut(recurrings);
    await db.budgets.bulkPut([
      { scope: TOTAL_SCOPE, amount: 550000 },
      { scope: 'alimentacao', amount: 110000 },
      { scope: 'lazer', amount: 30000 },
    ]);
  });
  useUI.getState().toast('Dados de exemplo carregados — explore à vontade!', 'good');
}
