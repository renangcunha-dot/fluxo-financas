export type TxType = 'expense' | 'income';

/** Carimbo da última alteração (ms), preenchido pelo banco — usado na sincronização. */
export interface Stamped {
  updatedAt?: number;
}

/** Valores monetários são sempre inteiros em centavos. */
export interface Category extends Stamped {
  id: string;
  name: string;
  type: TxType;
  color: string;
  icon: string;
  archived?: boolean;
}

export interface Transaction extends Stamped {
  id: string;
  type: TxType;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  categoryId: string;
  description: string;
  recurringId?: string;
  /** Chave do extrato importado (FITID ou hash) — evita importar duas vezes. */
  importKey?: string;
  createdAt: number;
}

export interface Recurring extends Stamped {
  id: string;
  type: TxType;
  amount: number;
  categoryId: string;
  description: string;
  /** Dia do mês (1–31); meses mais curtos usam o último dia. */
  day: number;
  active: boolean;
  /** Primeiro mês (YYYY-MM) em que deve ser lançado. */
  startMonth: string;
  /** Último mês (YYYY-MM) já lançado. */
  lastGenerated?: string;
}

/** Escopo de um limite: 'total' (todas as despesas) ou o id de uma categoria. */
export type BudgetScope = string;

export interface Budget extends Stamped {
  scope: BudgetScope;
  amount: number;
}

export interface Block extends Stamped {
  id: string; // `${month}:${scope}`
  month: string;
  scope: BudgetScope;
  createdAt: number;
}

export interface Override extends Stamped {
  id: string;
  month: string;
  scope: BudgetScope;
  kind: 'continue' | 'unblock';
  reason: string;
  amount: number;
  description: string;
  createdAt: number;
}

export const TOTAL_SCOPE = 'total';
