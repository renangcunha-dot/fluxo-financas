import { create } from 'zustand';
import type { ScopeCheck } from '../domain/budget';
import { currentMonth } from '../domain/format';
import type { Transaction, TxType } from '../domain/types';

export type Page = 'dashboard' | 'transactions' | 'budgets' | 'more';
export type Theme = 'system' | 'light' | 'dark';

export type GateRequest =
  | { kind: 'exceeded'; tx: Transaction; exceeded: ScopeCheck[] }
  | { kind: 'blocked'; tx: Transaction; scopes: string[] };

export type GateAnswer =
  | { choice: 'continue'; reason: string }
  | { choice: 'block' }
  | { choice: 'unblock'; reason: string }
  | { choice: 'cancel' };

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'warn' | 'neutral';
}

interface UIState {
  page: Page;
  month: string;
  theme: Theme;
  quickAdd: { open: boolean; editing?: Transaction; presetType?: TxType };
  gate: (GateRequest & { resolve: (a: GateAnswer) => void }) | null;
  importOpen: boolean;
  setImportOpen: (open: boolean) => void;
  toasts: Toast[];
  setPage: (p: Page) => void;
  setMonth: (m: string) => void;
  setTheme: (t: Theme) => void;
  openQuickAdd: (opts?: { editing?: Transaction; presetType?: TxType }) => void;
  closeQuickAdd: () => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
}

const readTheme = (): Theme => {
  try {
    return (localStorage.getItem('fluxo-theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
};

let toastSeq = 0;

export const useUI = create<UIState>((set) => ({
  page: 'dashboard',
  month: currentMonth(),
  theme: readTheme(),
  quickAdd: { open: false },
  gate: null,
  importOpen: false,
  setImportOpen: (importOpen) => set({ importOpen }),
  toasts: [],
  setPage: (page) => set({ page }),
  setMonth: (month) => set({ month }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('fluxo-theme', theme);
    } catch {
      /* ignora */
    }
    set({ theme });
  },
  openQuickAdd: (opts = {}) => set({ quickAdd: { open: true, ...opts } }),
  closeQuickAdd: () => set({ quickAdd: { open: false } }),
  toast: (text, tone = 'neutral') => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }].slice(-3) }));
    setTimeout(() => useUI.getState().dismissToast(id), 4500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Abre o modal de decisão e espera a resposta (do modal ou do botão do push). */
export function askGate(req: GateRequest): Promise<GateAnswer> {
  return new Promise((resolve) => {
    useUI.setState({
      gate: {
        ...req,
        resolve: (a) => {
          useUI.setState({ gate: null });
          resolve(a);
        },
      },
    });
  });
}
