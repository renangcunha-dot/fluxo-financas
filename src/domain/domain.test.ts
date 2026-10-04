import { describe, expect, it } from 'vitest';
import { checkBudget, type BudgetContext } from './budget';
import { parseQuick, suggestCategory } from './categorize';
import { DEFAULT_CATEGORIES } from './defaults';
import { forecastMonth } from './forecast';
import { parseAmount } from './format';
import { generateDue } from './recurring';
import { byCategory, totals } from './summary';
import type { Recurring, Transaction } from './types';

let seq = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${++seq}`,
  type: 'expense',
  amount: 1000,
  date: '2026-10-02',
  categoryId: 'alimentacao',
  description: '',
  createdAt: 0,
  ...p,
});

const ctx = (p: Partial<BudgetContext> = {}): BudgetContext => ({
  transactions: [],
  budgets: [],
  blocks: [],
  overrides: [],
  ...p,
});

describe('parseAmount', () => {
  it.each([
    ['32', 3200],
    ['32,5', 3250],
    ['1.234,56', 123456],
    ['1234.56', 123456],
    ['1.000', 100000],
    ['R$ 10', 1000],
    ['0', null],
    ['abc', null],
  ])('%s → %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
});

describe('summary', () => {
  it('calcula receitas, despesas e saldo', () => {
    const t = totals([tx({ type: 'income', amount: 500000 }), tx({ amount: 120000 }), tx({ amount: 30000 })]);
    expect(t).toEqual({ income: 500000, expense: 150000, balance: 350000 });
  });

  it('agrupa por categoria com participação e variação', () => {
    const cur = [tx({ amount: 3000 }), tx({ amount: 1000, categoryId: 'transporte' })];
    const prev = [tx({ amount: 2000, date: '2026-09-10' })];
    const rows = byCategory(cur, prev, 'expense', DEFAULT_CATEGORIES);
    expect(rows[0]).toMatchObject({ categoryId: 'alimentacao', total: 3000, share: 0.75, delta: 0.5 });
    expect(rows[1]).toMatchObject({ categoryId: 'transporte', delta: null });
  });
});

describe('checkBudget', () => {
  const budgets = [{ scope: 'total', amount: 50000 }];

  it('ok sem limites', () => {
    expect(checkBudget(tx({}), ctx()).status).toBe('ok');
  });

  it('receitas nunca são barradas', () => {
    const blocks = [{ id: 'x', month: '2026-10', scope: 'total', createdAt: 0 }];
    expect(checkBudget(tx({ type: 'income' }), ctx({ blocks })).status).toBe('ok');
  });

  it('avisa ao cruzar 80%', () => {
    const r = checkBudget(tx({ amount: 15000 }), ctx({ budgets, transactions: [tx({ amount: 30000 })] }));
    expect(r.status).toBe('warn');
    expect(r.scopes[0].warnings).toEqual([0.8]);
  });

  it('pede decisão ao atingir 100%', () => {
    const r = checkBudget(tx({ amount: 10000 }), ctx({ budgets, transactions: [tx({ amount: 40000 })] }));
    expect(r.status).toBe('exceeded');
  });

  it('não pergunta de novo depois de "continuar" no mesmo mês', () => {
    const overrides = [{ id: 'o1', month: '2026-10', scope: 'total', kind: 'continue' as const, reason: 'x', amount: 1, description: '', createdAt: 0 }];
    const r = checkBudget(tx({ amount: 10000 }), ctx({ budgets, overrides, transactions: [tx({ amount: 60000 })] }));
    expect(r.status).toBe('ok');
  });

  it('bloqueio da categoria barra novas despesas dela, mas não de outras', () => {
    const blocks = [{ id: '2026-10:lazer', month: '2026-10', scope: 'lazer', createdAt: 0 }];
    expect(checkBudget(tx({ categoryId: 'lazer' }), ctx({ blocks })).status).toBe('blocked');
    expect(checkBudget(tx({ categoryId: 'saude' }), ctx({ blocks })).status).toBe('ok');
  });

  it('bloqueio vale só para o mês em que foi feito', () => {
    const blocks = [{ id: '2026-09:total', month: '2026-09', scope: 'total', createdAt: 0 }];
    expect(checkBudget(tx({}), ctx({ blocks })).status).toBe('ok');
  });

  it('na edição ignora o valor antigo da própria transação', () => {
    const existing = tx({ amount: 45000 });
    const r = checkBudget({ ...existing, amount: 46000 }, ctx({ budgets, transactions: [existing] }));
    // sem descontar seriam 91.000 (estouro); descontando, 46.000 (só aviso)
    expect(r.status).toBe('warn');
    expect(r.scopes[0].after).toBe(46000);
  });

  it('limite por categoria', () => {
    const r = checkBudget(
      tx({ amount: 20000, categoryId: 'lazer' }),
      ctx({ budgets: [{ scope: 'lazer', amount: 20000 }] }),
    );
    expect(r.status).toBe('exceeded');
    if (r.status === 'exceeded') expect(r.exceeded[0].scope).toBe('lazer');
  });
});

describe('forecastMonth', () => {
  it('extrapola gastos variáveis e soma recorrências pendentes', () => {
    const txs = [tx({ type: 'income', amount: 500000, date: '2026-10-01' }), tx({ amount: 10000, date: '2026-10-05' })];
    const rec: Recurring[] = [
      { id: 'r1', type: 'expense', amount: 150000, categoryId: 'moradia', description: 'Aluguel', day: 10, active: true, startMonth: '2026-01' },
    ];
    const f = forecastMonth(txs, rec, '2026-10', '2026-10-10');
    // 10.000 em 10 dias → 1.000/dia × 21 dias restantes = 21.000
    expect(f.variableDaily).toBe(1000);
    expect(f.pendingExpense).toBe(150000);
    expect(f.expense).toBe(10000 + 150000 + 21000);
    expect(f.balance).toBe(500000 - 181000);
  });

  it('calcula quanto pode gastar por dia até o limite', () => {
    const f = forecastMonth([tx({ amount: 20000, date: '2026-10-01' })], [], '2026-10', '2026-10-22', 50000);
    // sobra 30.000 em 10 dias (22 a 31)
    expect(f.dailyAllowance).toBe(3000);
  });

  it('no começo do mês pesa mais o histórico que o ritmo atual', () => {
    // dia 3 de 31: gastou 30.000 (ritmo 10.000/dia), histórico 1.000/dia
    const f = forecastMonth([tx({ amount: 30000, date: '2026-10-02' })], [], '2026-10', '2026-10-03', undefined, 1000);
    const w = 3 / 31;
    expect(f.variableDaily).toBe(Math.round(w * 10000 + (1 - w) * 1000));
  });

  it('mês passado usa valores reais', () => {
    const f = forecastMonth([tx({ amount: 5000, date: '2026-08-03' })], [], '2026-08', '2026-10-10');
    expect(f.kind).toBe('past');
    expect(f.expense).toBe(5000);
  });
});

describe('categorize', () => {
  it('interpreta o atalho de texto', () => {
    expect(parseQuick('uber 32')).toEqual({ type: 'expense', amount: 3200, description: 'uber' });
    expect(parseQuick('mercado extra 245,90')).toEqual({ type: 'expense', amount: 24590, description: 'mercado extra' });
    expect(parseQuick('+salário 5.000')).toEqual({ type: 'income', amount: 500000, description: 'salário' });
    expect(parseQuick('45 almoço')).toEqual({ type: 'expense', amount: 4500, description: 'almoço' });
  });

  it('usa o histórico antes das palavras-chave', () => {
    const history = [tx({ description: 'Uber trabalho', categoryId: 'outros-despesa' }), tx({ description: 'uber', categoryId: 'outros-despesa' })];
    expect(suggestCategory('uber', 'expense', history, DEFAULT_CATEGORIES)).toBe('outros-despesa');
  });

  it('cai nas palavras-chave sem histórico, ignorando acentos', () => {
    expect(suggestCategory('Farmácia', 'expense', [], DEFAULT_CATEGORIES)).toBe('saude');
    expect(suggestCategory('Salário outubro', 'income', [], DEFAULT_CATEGORIES)).toBe('salario');
    expect(suggestCategory('xyz', 'expense', [], DEFAULT_CATEGORIES)).toBeNull();
  });
});

describe('generateDue', () => {
  const base: Recurring = { id: 'r', type: 'expense', amount: 100, categoryId: 'moradia', description: 'Aluguel', day: 31, active: true, startMonth: '2026-08' };

  it('gera meses perdidos e respeita o dia de vencimento', () => {
    const { transactions, updated } = generateDue([base], '2026-10-15');
    expect(transactions.map((t) => t.date)).toEqual(['2026-08-31', '2026-09-30']);
    expect(updated[0].lastGenerated).toBe('2026-09');
  });

  it('não duplica o que já foi gerado', () => {
    const { transactions } = generateDue([{ ...base, day: 5, lastGenerated: '2026-10' }], '2026-10-15');
    expect(transactions).toHaveLength(0);
  });
});
