import { monthOf } from './format';
import { spentInScope } from './summary';
import { TOTAL_SCOPE, type Block, type Budget, type Override, type Transaction } from './types';

export const WARN_THRESHOLDS = [0.5, 0.8] as const;

export interface ScopeCheck {
  scope: string;
  limit: number;
  before: number;
  after: number;
  /** Limiares de aviso (0.5, 0.8) cruzados por este lançamento. */
  warnings: number[];
  /** O lançamento leva o escopo a >= 100% e ainda não houve "continuar" neste mês. */
  exceeds: boolean;
}

export type BudgetCheck =
  | { status: 'ok'; scopes: ScopeCheck[] }
  | { status: 'warn'; scopes: ScopeCheck[] }
  | { status: 'exceeded'; scopes: ScopeCheck[]; exceeded: ScopeCheck[] }
  | { status: 'blocked'; scopes: ScopeCheck[]; blockedScopes: string[] };

export interface BudgetContext {
  transactions: Transaction[];
  budgets: Budget[];
  blocks: Block[];
  overrides: Override[];
}

/**
 * Avalia um lançamento de despesa contra os limites do mês.
 * Prioridade: bloqueio > estouro (pede decisão) > aviso > ok.
 */
export function checkBudget(
  tx: Pick<Transaction, 'type' | 'amount' | 'date' | 'categoryId'> & { id?: string },
  ctx: BudgetContext,
): BudgetCheck {
  if (tx.type !== 'expense') return { status: 'ok', scopes: [] };
  const month = monthOf(tx.date);
  const relevant = [TOTAL_SCOPE, tx.categoryId];

  const blockedScopes = ctx.blocks
    .filter((b) => b.month === month && relevant.includes(b.scope))
    .map((b) => b.scope);

  const scopes: ScopeCheck[] = ctx.budgets
    .filter((b) => b.amount > 0 && relevant.includes(b.scope))
    .map((b) => {
      const before = spentInScope(ctx.transactions, month, b.scope, tx.id);
      const after = before + tx.amount;
      // Uma decisão consciente ("continuar" ou "desbloquear") vale para o resto do mês.
      const continued = ctx.overrides.some((o) => o.month === month && o.scope === b.scope);
      return {
        scope: b.scope,
        limit: b.amount,
        before,
        after,
        warnings: WARN_THRESHOLDS.filter((t) => before < t * b.amount && after >= t * b.amount),
        exceeds: after >= b.amount && !continued,
      };
    });

  if (blockedScopes.length) return { status: 'blocked', scopes, blockedScopes };
  const exceeded = scopes.filter((s) => s.exceeds);
  if (exceeded.length) return { status: 'exceeded', scopes, exceeded };
  if (scopes.some((s) => s.warnings.length)) return { status: 'warn', scopes };
  return { status: 'ok', scopes };
}

export type BudgetHealth = 'ok' | 'attention' | 'danger' | 'over';

export function health(spent: number, limit: number): BudgetHealth {
  if (!limit) return 'ok';
  const r = spent / limit;
  if (r >= 1) return 'over';
  if (r >= 0.8) return 'danger';
  if (r >= 0.5) return 'attention';
  return 'ok';
}
