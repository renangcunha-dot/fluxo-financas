import { FALLBACK_CATEGORY, KEYWORDS } from './defaults';
import { parseAmount } from './format';
import type { Category, Transaction, TxType } from './types';

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim();

const tokens = (s: string) => normalize(s).split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w));

/**
 * Sugere a categoria para uma descrição: primeiro pelo seu histórico
 * (descrições parecidas que você já lançou), depois por palavras-chave.
 */
export function suggestCategory(
  description: string,
  type: TxType,
  history: Transaction[],
  categories: Category[],
): string | null {
  const words = tokens(description);
  if (!words.length) return null;
  const valid = new Set(categories.filter((c) => c.type === type && !c.archived).map((c) => c.id));

  const score = new Map<string, number>();
  const full = normalize(description);
  for (const t of history) {
    if (t.type !== type || !valid.has(t.categoryId)) continue;
    const desc = normalize(t.description);
    let s = 0;
    if (desc === full) s += 5;
    for (const w of words) if (desc.split(/\s+/).includes(w)) s += 2;
    if (s) score.set(t.categoryId, (score.get(t.categoryId) ?? 0) + s);
  }
  if (score.size) return [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];

  for (const [catId, keys] of Object.entries(KEYWORDS)) {
    if (!valid.has(catId)) continue;
    if (words.some((w) => keys.includes(w))) return catId;
  }
  return null;
}

export interface QuickParse {
  type: TxType;
  amount: number | null;
  description: string;
}

/**
 * Interpreta o atalho de texto: "uber 32", "mercado 245,90", "+salário 5000" (o "+" indica receita).
 */
export function parseQuick(input: string): QuickParse {
  let s = input.trim();
  let type: TxType = 'expense';
  if (s.startsWith('+')) {
    type = 'income';
    s = s.slice(1).trim();
  } else if (s.startsWith('-')) {
    s = s.slice(1).trim();
  }
  const m = s.match(/(?:^|\s)(r\$\s*)?(\d[\d.,]*)\s*$/i) ?? s.match(/^(r\$\s*)?(\d[\d.,]*)(?:\s|$)/i);
  let amount: number | null = null;
  let description = s;
  if (m) {
    amount = parseAmount(m[2]);
    description = (s.slice(0, m.index) + s.slice((m.index ?? 0) + m[0].length)).trim();
  }
  return { type, amount, description };
}

export const fallbackCategory = (type: TxType) => FALLBACK_CATEGORY[type];
