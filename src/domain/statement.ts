import { normalize, suggestCategory } from './categorize';
import { FALLBACK_CATEGORY } from './defaults';
import type { Category, Transaction, TxType } from './types';

/** Uma linha do extrato. `amount` tem sinal: positivo = entrada, negativo = saída (centavos). */
export interface StatementRow {
  date: string;
  amount: number;
  description: string;
  fitId?: string;
}

export interface CsvMapping {
  headerRow: number; // -1 = sem cabeçalho
  date: number;
  description: number[];
  amount?: number;
  credit?: number;
  debit?: number;
  kind?: number; // coluna "Tipo" (C/D, Entrada/Saída)
  id?: number;
}

export interface ParsedStatement {
  format: 'ofx' | 'csv';
  bank?: string;
  rows: StatementRow[];
  /** Fatura de cartão: compras vêm positivas e devem virar despesas. */
  creditCard: boolean;
  csv?: { table: string[][]; mapping: CsvMapping | null };
}

// ---------- utilidades ----------

/** Bancos brasileiros ainda exportam em Windows-1252; tenta UTF-8 primeiro. */
export function decodeStatement(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return text.replace(/^﻿/, '');
}

const pad = (n: number | string) => String(n).padStart(2, '0');

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** "-1.234,56", "1,234.56", "(50,00)", "50,00 D", "R$ -12", "-45.90" → centavos com sinal. */
export function parseSigned(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (/\s*[dD]$/.test(s)) {
    sign = -1;
    s = s.replace(/\s*[dD]$/, '');
  } else s = s.replace(/\s*[cC]$/, '');
  s = s.replace(/R\$|\s/g, '');
  if (s.startsWith('-')) {
    sign *= -1;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) {
    sign *= -1;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else if (lastDot > lastComma && lastComma > -1) s = s.replace(/,/g, '');
  else if (lastDot > -1 && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return sign * Math.round(n * 100);
}

/** Converte "UBER   *TRIP" → "Uber *Trip": só mexe em textos todos em maiúsculas. */
export function tidyDescription(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s*/-])(\p{L})/gu, (_, p, c: string) => p + c.toUpperCase());
}

// ---------- OFX ----------

export function parseOFX(text: string): ParsedStatement {
  const tag = (block: string, name: string) => block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, 'i'))?.[1].trim() ?? '';
  const bank = tag(text, 'ORG') || undefined;
  const creditCard = /<CCSTMTRS>/i.test(text);
  const rows: StatementRow[] = [];
  for (const chunk of text.split(/<STMTTRN>/i).slice(1)) {
    const block = chunk.split(/<\/STMTTRN>/i)[0];
    const date = parseDate(tag(block, 'DTPOSTED'));
    const rawAmt = tag(block, 'TRNAMT');
    const amount = parseSigned(rawAmt.includes('.') ? rawAmt.replace(/,/g, '') : rawAmt);
    if (!date || amount === null || amount === 0) continue;
    const memo = tag(block, 'MEMO');
    const name = tag(block, 'NAME');
    const description = memo && name && !memo.toLowerCase().includes(name.toLowerCase()) ? `${name} ${memo}` : memo || name;
    rows.push({ date, amount, description: tidyDescription(description), fitId: tag(block, 'FITID') || undefined });
  }
  return { format: 'ofx', bank, rows, creditCard };
}

// ---------- CSV ----------

function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  const score = (d: string) => lines.reduce((a, l) => a + (l.split(d).length - 1), 0);
  return [';', ',', '\t', '|'].sort((a, b) => score(b) - score(a))[0];
}

export function splitCSV(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c)) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c)) rows.push(row);
  return rows;
}

const H = {
  date: /^(data|date|dt)\b|data (de )?(lan[cç]amento|movimento|transa[cç][aã]o|compra)/,
  amount: /^(valor|amount|value|quantia|montante)\b|valor \(r\$\)|valor r\$/,
  credit: /cr[eé]dito|entrada/,
  debit: /d[eé]bito|sa[ií]da/,
  kind: /^(tipo|natureza|d\/c|c\/d)/,
  id: /identificador|^id$|documento|fitid/,
  desc: [/descri/, /hist[oó]rico/, /^title$|t[ií]tulo/, /estabelecimento/, /^lan[cç]amento$|detalhe/, /memo|observa/],
};

/** Descobre quais colunas são data, valor e descrição — pelo cabeçalho ou pelo conteúdo. */
export function detectMapping(table: string[][]): CsvMapping | null {
  for (let r = 0; r < Math.min(table.length, 25); r++) {
    const head = table[r].map((c) => normalize(c));
    const find = (re: RegExp) => head.findIndex((h) => re.test(h) && !/saldo/.test(h));
    const date = find(H.date);
    if (date < 0) continue;
    const amount = find(H.amount);
    const credit = find(H.credit);
    const debit = find(H.debit);
    if (amount < 0 && (credit < 0 || debit < 0)) continue;
    const description: number[] = [];
    for (const re of H.desc) {
      const i = head.findIndex((h, k) => re.test(h) && !description.includes(k) && k !== date && k !== amount);
      if (i >= 0) description.push(i);
      if (description.length === 2) break;
    }
    const kind = find(H.kind);
    const id = find(H.id);
    return {
      headerRow: r,
      date,
      amount: amount >= 0 ? amount : undefined,
      credit: amount < 0 ? credit : undefined,
      debit: amount < 0 ? debit : undefined,
      description,
      kind: kind >= 0 && kind !== date ? kind : undefined,
      id: id >= 0 && !description.includes(id) ? id : undefined,
    };
  }
  // Sem cabeçalho: deduz pelo conteúdo das primeiras linhas com data.
  const sample = table.filter((r) => r.some((c) => parseDate(c))).slice(0, 15);
  if (!sample.length) return null;
  const cols = Math.max(...sample.map((r) => r.length));
  const ratio = (test: (c: string) => boolean) =>
    Array.from({ length: cols }, (_, i) => sample.filter((r) => r[i] && test(r[i])).length / sample.length);
  const dateR = ratio((c) => !!parseDate(c));
  const numR = ratio((c) => /\d/.test(c) && parseSigned(c) !== null && !parseDate(c));
  const textR = ratio((c) => /\p{L}{3,}/u.test(c));
  const date = dateR.indexOf(Math.max(...dateR));
  const numeric = numR.map((v, i) => (v > 0.8 && i !== date ? i : -1)).filter((i) => i >= 0);
  const desc = textR.map((v, i) => (v > 0.5 && i !== date ? i : -1)).filter((i) => i >= 0);
  if (!numeric.length || !desc.length) return null;
  // Com duas colunas numéricas, a última costuma ser o saldo.
  const amount = numeric.length > 1 ? numeric[numeric.length - 2] : numeric[0];
  return { headerRow: -1, date, amount, description: desc.slice(0, 2) };
}

const SKIP = /^(saldo|s a l d o|total|saldo anterior|saldo do dia|saldo final)\b/i;

export function rowsFromCSV(table: string[][], m: CsvMapping): StatementRow[] {
  const out: StatementRow[] = [];
  for (let r = m.headerRow + 1; r < table.length; r++) {
    const row = table[r];
    const date = parseDate(row[m.date] ?? '');
    if (!date) continue;
    let amount: number | null = null;
    if (m.amount !== undefined) amount = parseSigned(row[m.amount] ?? '');
    else {
      const c = parseSigned(row[m.credit!] ?? '') ?? 0;
      const d = parseSigned(row[m.debit!] ?? '') ?? 0;
      amount = Math.abs(c) - Math.abs(d);
    }
    if (amount === null || amount === 0) continue;
    if (m.kind !== undefined) {
      const k = normalize(row[m.kind] ?? '');
      if (/^(d|debito|saida|despesa)/.test(k)) amount = -Math.abs(amount);
      else if (/^(c|credito|entrada|receita)/.test(k)) amount = Math.abs(amount);
    }
    const parts = m.description.map((i) => row[i] ?? '').filter(Boolean);
    const description = [...new Set(parts)].join(' · ');
    if (SKIP.test(normalize(description))) continue;
    out.push({ date, amount, description: tidyDescription(description), fitId: m.id !== undefined ? row[m.id] || undefined : undefined });
  }
  return out;
}

export function parseCSV(text: string, mapping?: CsvMapping): ParsedStatement {
  const table = splitCSV(text);
  const m = mapping ?? detectMapping(table);
  const header = m && m.headerRow >= 0 ? table[m.headerRow].map((c) => normalize(c)) : [];
  // Fatura do Nubank (date,title,amount): compras positivas.
  const creditCard = header.includes('title') && header.includes('amount');
  let bank: string | undefined;
  if (creditCard || (header.includes('identificador') && header.includes('descricao'))) bank = 'Nubank';
  return { format: 'csv', bank, rows: m ? rowsFromCSV(table, m) : [], creditCard, csv: { table, mapping: m } };
}

export function parseStatement(text: string, filename = ''): ParsedStatement {
  if (/\.(ofx|qfx)$/i.test(filename) || /<OFX>|OFXHEADER/i.test(text.slice(0, 2000))) return parseOFX(text);
  return parseCSV(text);
}

// ---------- prévia da importação ----------

export type ImportStatus = 'new' | 'duplicate' | 'maybe-duplicate' | 'card-payment';

export interface ImportItem {
  key: string;
  date: string;
  type: TxType;
  amount: number;
  description: string;
  categoryId: string;
  status: ImportStatus;
  selected: boolean;
}

const CARD_PAYMENT = /pagamento (de |da )?fatura|pgto\.? fatura|pag fatura|fatura (do )?cart|pagamento recebido|pagto cartao|pagamento cartao/;

export function buildPreview(
  parsed: ParsedStatement,
  existing: Transaction[],
  categories: Category[],
  creditCard = parsed.creditCard,
): ImportItem[] {
  const keys = new Set(existing.map((t) => t.importKey).filter(Boolean));
  const loose = new Set(existing.map((t) => `${t.date}|${t.type}|${t.amount}`));
  const seen = new Map<string, number>();
  const history = [...existing];

  return parsed.rows.map((r) => {
    const signed = creditCard ? -r.amount : r.amount;
    const type: TxType = signed >= 0 ? 'income' : 'expense';
    const amount = Math.abs(signed);
    const base = r.fitId ? `fit:${r.fitId}` : `h:${r.date}|${signed}|${normalize(r.description)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const key = n > 1 ? `${base}#${n}` : base;

    let status: ImportStatus = 'new';
    if (keys.has(key)) status = 'duplicate';
    else if (CARD_PAYMENT.test(normalize(r.description))) status = 'card-payment';
    else if (loose.has(`${r.date}|${type}|${amount}`)) status = 'maybe-duplicate';

    const categoryId = suggestCategory(r.description, type, history, categories) ?? FALLBACK_CATEGORY[type];
    return { key, date: r.date, type, amount, description: r.description, categoryId, status, selected: status === 'new' };
  });
}
