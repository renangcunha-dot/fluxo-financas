import { normalize } from './categorize';
import { tidyDescription, type ParsedStatement, type StatementRow } from './statement';

/** Um pedaço de texto do PDF com posição (origem no canto inferior esquerdo, como no PDF). */
export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  w: number;
  page: number;
}

interface Cell {
  x: number;
  x2: number;
  text: string;
}

export interface PdfLine {
  page: number;
  y: number;
  cells: Cell[];
  text: string;
}

/** Junta os pedaços de texto em linhas (mesmo y) e células (pedaços encostados). */
export function groupLines(items: PdfTextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  const pages = [...new Set(items.map((i) => i.page))].sort((a, b) => a - b);
  for (const page of pages) {
    const sorted = items.filter((i) => i.page === page && i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: PdfTextItem[][] = [];
    for (const it of sorted) {
      const row = rows.find((r) => Math.abs(r[0].y - it.y) <= 3);
      if (row) row.push(it);
      else rows.push([it]);
    }
    for (const row of rows.sort((a, b) => b[0].y - a[0].y)) {
      row.sort((a, b) => a.x - b.x);
      const cells: Cell[] = [];
      for (const it of row) {
        const last = cells[cells.length - 1];
        const charW = it.w / Math.max(1, it.str.length);
        if (last && it.x - last.x2 < Math.max(2, charW * 1.2)) {
          last.text += (it.x - last.x2 > charW * 0.25 ? ' ' : '') + it.str;
          last.x2 = it.x + it.w;
        } else cells.push({ x: it.x, x2: it.x + it.w, text: it.str });
      }
      for (const c of cells) c.text = c.text.replace(/\s+/g, ' ').trim();
      lines.push({ page, y: row[0].y, cells, text: cells.map((c) => c.text).join('  ') });
    }
  }
  return lines;
}

// ---------- datas ----------

const MONTHS: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
const MON = '(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\\.?';
const pad = (n: number) => String(n).padStart(2, '0');
/** Minúsculas sem acento, preservando "/" e o tamanho do texto (diferente de normalize). */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

interface DateHit {
  y?: number;
  m: number;
  d: number;
  len: number;
}

/** Data no começo do texto: 01/10/2026, 01/10/26, 01/10, 01 OUT 2026, 01 OUT, 1 de outubro de 2026. */
function leadingDate(text: string): DateHit | null {
  const s = fold(text.trimStart());
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/);
  if (m) return { d: +m[1], m: +m[2], y: m[3].length === 2 ? 2000 + +m[3] : +m[3], len: m[0].length };
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?![\d/])/);
  if (m) return { d: +m[1], m: +m[2], len: m[0].length };
  m = s.match(new RegExp(`^(\\d{1,2})\\s+(?:de\\s+)?${MON}(?:\\s+(?:de\\s+)?(\\d{4}))?(?![a-z])`));
  if (m) return { d: +m[1], m: MONTHS[m[2]], y: m[3] ? +m[3] : undefined, len: m[0].length };
  return null;
}

/** Data mais recente citada no documento (período, vencimento) — referência para datas sem ano. */
function referenceDate(text: string): Date {
  const s = fold(text);
  const dates: Date[] = [];
  for (const m of s.matchAll(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/g)) dates.push(new Date(+m[3], +m[2] - 1, +m[1]));
  for (const m of s.matchAll(new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?${MON}\\s+(?:de\\s+)?(\\d{4})`, 'g'))) dates.push(new Date(+m[3], MONTHS[m[2]] - 1, +m[1]));
  for (const m of s.matchAll(new RegExp(`${MON}\\s+(?:de\\s+)?(\\d{4})`, 'g'))) dates.push(new Date(+m[2], MONTHS[m[1]] - 1, 28));
  const valid = dates.filter((d) => d.getFullYear() > 2000 && d.getFullYear() < 2100);
  return valid.length ? new Date(Math.max(...valid.map((d) => +d))) : new Date();
}

function resolveDate(hit: DateHit, ref: Date): string | null {
  if (hit.m < 1 || hit.m > 12 || hit.d < 1 || hit.d > 31) return null;
  let y = hit.y ?? ref.getFullYear();
  // "05 DEZ" numa fatura de janeiro é do ano anterior.
  if (hit.y === undefined && new Date(y, hit.m - 1, hit.d) > new Date(+ref + 45 * 864e5)) y--;
  return `${y}-${pad(hit.m)}-${pad(hit.d)}`;
}

// ---------- valores ----------

const MONEY = /(?<![\d.,/])(?:(-|−|–)\s?)?(?:R\$\s?)?(?:(-|−|–)\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})(?:\s?([DC])(?![\p{L}]))?(\s?-)?(?![\d,])/gu;

interface Money {
  value: number;
  sign: -1 | 0 | 1;
  x: number;
  start: number;
  end: number;
  cell: number;
}

function moneyIn(line: PdfLine): Money[] {
  const out: Money[] = [];
  line.cells.forEach((c, ci) => {
    for (const m of c.text.matchAll(MONEY)) {
      const value = Math.round(Number(m[3].replace(/\./g, '').replace(',', '.')) * 100);
      const neg = !!(m[1] || m[2] || m[5]) || m[4] === 'D';
      const sign = neg ? -1 : m[4] === 'C' ? 1 : 0;
      // posição aproximada do número dentro da célula
      const frac = (m.index! + m[0].length / 2) / Math.max(1, c.text.length);
      out.push({ value, sign, x: c.x + (c.x2 - c.x) * frac, start: m.index!, end: m.index! + m[0].length, cell: ci });
    }
  });
  return out;
}

// ---------- cabeçalho de colunas ----------

type Role = 'amount' | 'credit' | 'debit' | 'balance';

function headerColumns(line: PdfLine): { role: Role; x: number }[] | null {
  const t = normalize(line.text);
  if (!/\b(data|dia)\b/.test(t) || !/(valor|credito|debito|entrada|saida|lancamento|historico|descricao)/.test(t)) return null;
  const cols: { role: Role; x: number }[] = [];
  for (const c of line.cells) {
    const h = normalize(c.text);
    const x = (c.x + c.x2) / 2;
    if (/saldo/.test(h)) cols.push({ role: 'balance', x });
    else if (/cr[eé]dito|entrada/.test(h)) cols.push({ role: 'credit', x });
    else if (/d[eé]bito|sa[ií]da/.test(h)) cols.push({ role: 'debit', x });
    else if (/^valor|valor \(|valor r\$/.test(h)) cols.push({ role: 'amount', x });
  }
  return cols.length ? cols : null;
}

// ---------- leitura ----------

const SKIP = /^(saldo|s a l d o|total|subtotal|resumo|limite|pagamento minimo|valor minimo|lancamentos? futuros?|data\b)/;
const INCOME_WORDS = /(receb|credito|deposito|salario|estorno|rendimento|resgate|devolu|reembolso|transferencia recebida|ted recebida|pix recebido)/;

interface Draft {
  date: string;
  value: number;
  sign: -1 | 0 | 1;
  description: string;
  page: number;
  y: number;
}

export function parsePdfLines(lines: PdfLine[]): ParsedStatement {
  const full = lines.map((l) => l.text).join('\n');
  const nfull = normalize(full);
  const ref = referenceDate(full);
  const creditCard = /fatura/.test(nfull) && /vencimento/.test(nfull) && /(limite|pagamento minimo|total (da|desta) fatura)/.test(nfull);
  const hasBalanceWord = /saldo/.test(nfull);

  let columns: { role: Role; x: number }[] | null = null;
  let currentDate: string | null = null;
  let sectionSign: -1 | 0 | 1 = 0;
  const drafts: Draft[] = [];

  for (const line of lines) {
    const header = headerColumns(line);
    if (header) {
      columns = header;
      continue;
    }
    const nt = normalize(line.text);

    // Seções "Total de entradas / saídas" (Nubank) definem o sinal dos itens seguintes.
    const section = nt.match(/^(?:\d{1,2} \w+ \d{4}\s+)?total de (entradas|saidas)/);
    if (section) {
      sectionSign = section[1] === 'entradas' ? 1 : -1;
      const hit = leadingDate(line.text);
      if (hit) currentDate = resolveDate(hit, ref) ?? currentDate;
      continue;
    }

    const hit = leadingDate(line.text);
    const date = hit ? resolveDate(hit, ref) : null;
    if (date) {
      if (date !== currentDate) sectionSign = 0;
      currentDate = date;
    }
    const money = moneyIn(line);

    if (!money.length) {
      // Linha só com texto logo abaixo de um lançamento: continuação da descrição.
      const prev = drafts[drafts.length - 1];
      const rest = line.text.trim();
      if (!hit && prev && prev.page === line.page && prev.y - line.y < 16 && rest.length < 60 && !SKIP.test(nt)) {
        prev.description = `${prev.description} ${rest}`.trim();
        prev.y = line.y;
      }
      continue;
    }
    if (!currentDate) continue;

    // Escolhe o valor do lançamento (não o saldo).
    let pick: Money | undefined;
    let colSign: -1 | 0 | 1 = 0;
    if (columns) {
      const scored = money.map((m) => {
        const col = columns!.reduce((best, c) => (Math.abs(c.x - m.x) < Math.abs(best.x - m.x) ? c : best));
        return { m, col, dist: Math.abs(col.x - m.x) };
      });
      const useful = scored.filter((s) => s.col.role !== 'balance' && s.dist < 90);
      const chosen = useful[0];
      if (chosen) {
        pick = chosen.m;
        colSign = chosen.col.role === 'credit' ? 1 : chosen.col.role === 'debit' ? -1 : 0;
      }
    }
    if (!pick) pick = money.length >= 2 && hasBalanceWord ? money[money.length - 2] : money[money.length - 1];

    // Descrição = texto da linha sem a data e sem os valores.
    let description = line.cells
      .map((c, ci) => {
        let t = c.text;
        for (const m of money.filter((m) => m.cell === ci).sort((a, b) => b.start - a.start)) t = t.slice(0, m.start) + t.slice(m.end);
        return t;
      })
      .join(' ');
    description = description.trimStart();
    if (hit) {
      const lead = leadingDate(description);
      if (lead) description = description.slice(lead.len);
    }
    description = description.replace(/R\$/g, '').replace(/\s+/g, ' ').replace(/^[\s\-–:|]+|[\s\-–:|]+$/g, '').trim();
    if (!description || SKIP.test(normalize(description))) continue;

    drafts.push({ date: currentDate, value: pick.value, sign: pick.sign || colSign || sectionSign, description, page: line.page, y: line.y });
  }

  // Sinal dos valores sem indicação explícita.
  const anyNegative = drafts.some((d) => d.sign === -1);
  const rows: StatementRow[] = drafts
    .filter((d) => d.value > 0)
    .map((d) => {
      let sign = d.sign;
      if (!sign) {
        if (creditCard || anyNegative) sign = 1;
        else sign = INCOME_WORDS.test(normalize(d.description)) ? 1 : -1;
      }
      return { date: d.date, amount: sign * d.value, description: tidyDescription(d.description) };
    });

  const bank = detectBank(nfull);
  return { format: 'pdf', bank, rows, creditCard };
}

function detectBank(t: string): string | undefined {
  const banks: [RegExp, string][] = [
    [/nu pagamentos|nubank/, 'Nubank'],
    [/itau/, 'Itaú'],
    [/bradesco/, 'Bradesco'],
    [/santander/, 'Santander'],
    [/banco do brasil/, 'Banco do Brasil'],
    [/caixa economica/, 'Caixa'],
    [/banco inter|inter&co|\binter\b/, 'Inter'],
    [/\bc6\b/, 'C6 Bank'],
  ];
  return banks.find(([re]) => re.test(t))?.[1];
}
