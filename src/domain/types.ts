export type TxType = 'expense' | 'income';

/** Valores monetários são sempre inteiros em centavos. */
export interface Category {
  id: string;
  name: string;
  type: TxType;
  color: string;
  icon: string;
  archived?: boolean;
}

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  /** YYYY-MM-DD */
  date: string;
  categoryId: string;
  description: string;
  recurringId?: string;
  createdAt: number;
}

export interface Recurring {
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

export interface Budget {
  scope: BudgetScope;
  amount: number;
}

export interface Block {
  id: string; // `${month}:${scope}`
  month: string;
  scope: BudgetScope;
  createdAt: number;
}

export interface Override {
  id?: number;
  month: string;
  scope: BudgetScope;
  kind: 'continue' | 'unblock';
  reason: string;
  amount: number;
  description: string;
  createdAt: number;
}

export const TOTAL_SCOPE = 'total';
