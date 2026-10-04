import { useMemo, useRef, useState } from 'react';
import { normalize } from '../domain/categorize';
import { money } from '../domain/format';
import {
  buildPreview,
  decodeStatement,
  parseStatement,
  rowsFromCSV,
  type CsvMapping,
  type ImportItem,
  type ImportStatus,
  type ParsedStatement,
} from '../domain/statement';
import type { AppData } from '../hooks/useData';
import { importStatementItems } from '../store/actions';
import { useUI } from '../store/ui';
import { Button, Modal, Segmented } from './ui';

const STATUS: Record<ImportStatus, { label: string; cls: string }> = {
  new: { label: 'Novo', cls: 'bg-brand-soft text-ink' },
  duplicate: { label: 'Já importado', cls: 'bg-surface-2 text-muted' },
  'maybe-duplicate': { label: 'Possível duplicado', cls: 'bg-[var(--warn-mark)]/20 text-warn' },
  'card-payment': { label: 'Pagamento de fatura', cls: 'bg-surface-2 text-ink-2' },
};

type Filter = 'all' | 'selected' | 'skipped';

const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

export function ImportStatement({ data }: { data: AppData }) {
  const { importOpen, setImportOpen, toast } = useUI();
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedStatement | null>(null);
  const [creditCard, setCreditCard] = useState(false);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [showMapping, setShowMapping] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsed(null);
    setItems([]);
    setTouched(new Set());
    setFileName('');
    setFilter('all');
    setShowMapping(false);
  };
  const close = () => {
    reset();
    setImportOpen(false);
  };

  const preview = (p: ParsedStatement, card: boolean) => {
    setParsed(p);
    setCreditCard(card);
    setItems(buildPreview(p, data.transactions, data.categories, card));
    setTouched(new Set());
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const text = decodeStatement(await file.arrayBuffer());
      const p = parseStatement(text, file.name);
      setFileName(file.name);
      preview(p, p.creditCard);
      if (!p.rows.length) setShowMapping(p.format === 'csv');
    } catch {
      toast('Não consegui ler esse arquivo. Use OFX ou CSV exportado pelo banco.', 'bad');
    }
  };

  const remap = (m: CsvMapping) => {
    if (!parsed?.csv) return;
    preview({ ...parsed, rows: rowsFromCSV(parsed.csv.table, m), csv: { ...parsed.csv, mapping: m } }, creditCard);
  };

  const update = (key: string, patch: Partial<ImportItem>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  /** Mudou a categoria de um item? Aplica aos parecidos que você ainda não mexeu. */
  const setCategory = (item: ImportItem, categoryId: string) => {
    const desc = normalize(item.description);
    let n = 0;
    setItems((list) =>
      list.map((i) => {
        if (i.key === item.key) return { ...i, categoryId };
        if (i.type === item.type && !touched.has(i.key) && normalize(i.description) === desc) {
          n++;
          return { ...i, categoryId };
        }
        return i;
      }),
    );
    setTouched((s) => new Set(s).add(item.key));
    setTimeout(() => n && toast(`Categoria aplicada a mais ${n} lançamento(s) iguais`), 0);
  };

  const selected = items.filter((i) => i.selected);
  const totals = selected.reduce((a, i) => (i.type === 'income' ? { ...a, in: a.in + i.amount } : { ...a, out: a.out + i.amount }), { in: 0, out: 0 });
  const visible = items.filter((i) => filter === 'all' || (filter === 'selected' ? i.selected : !i.selected));
  const range = useMemo(() => {
    if (!items.length) return '';
    const dates = items.map((i) => i.date).sort();
    return `${fmtDate(dates[0])} a ${fmtDate(dates[dates.length - 1])}`;
  }, [items]);

  const doImport = async () => {
    setSaving(true);
    await importStatementItems(selected);
    setSaving(false);
    close();
  };

  return (
    <Modal open={importOpen} onClose={close} title="Importar extrato" wide="xl">
      {!parsed ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              onFile(e.dataTransfer.files[0]);
            }}
            className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-10 text-center transition ${dragging ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-2'}`}
          >
            <span className="text-4xl">📥</span>
            <span className="font-semibold">Arraste o arquivo aqui ou toque para escolher</span>
            <span className="text-sm text-ink-2">OFX ou CSV do extrato da conta ou da fatura do cartão</span>
          </button>
          <input ref={fileRef} type="file" accept=".ofx,.qfx,.csv,.txt,text/csv" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <details className="rounded-xl bg-surface-2 p-3 text-sm text-ink-2">
            <summary className="cursor-pointer font-semibold text-ink">Como exportar o extrato do meu banco?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><b>Nubank:</b> no app, Extrato → ícone de compartilhar → “Exportar CSV/OFX”. Fatura: Cartão → Faturas → Exportar.</li>
              <li><b>Itaú, Bradesco, Santander:</b> internet banking no computador → Extrato → Salvar/Exportar → formato <b>OFX</b> (Money).</li>
              <li><b>Banco do Brasil, Caixa:</b> Extrato → Exportar/Salvar → <b>OFX</b> (ou CSV).</li>
              <li><b>Inter, C6 e outros:</b> Extrato → Exportar → <b>OFX</b> ou <b>CSV</b>.</li>
            </ul>
            <p className="mt-2">O arquivo é lido só neste aparelho — nada é enviado para lugar nenhum.</p>
          </details>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">📄 {fileName}</span>
            {parsed.bank && <span className="text-ink-2">{parsed.bank}</span>}
            <span className="text-ink-2">{items.length} lançamentos · {range}</span>
            <button className="ml-auto text-xs font-semibold text-brand" onClick={reset}>Trocar arquivo</button>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
              <input type="checkbox" checked={creditCard} onChange={(e) => preview(parsed, e.target.checked)} className="size-4 accent-[var(--brand)]" />
              É fatura de cartão <span className="text-xs text-muted">(compras positivas viram despesas)</span>
            </label>
            {parsed.format === 'csv' && (
              <button className="rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-2" onClick={() => setShowMapping((v) => !v)}>
                ⚙️ Ajustar colunas
              </button>
            )}
          </div>

          {showMapping && parsed.csv && <MappingEditor table={parsed.csv.table} mapping={parsed.csv.mapping} onChange={remap} />}

          {items.length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-4 text-sm text-ink-2">Não encontrei lançamentos. Ajuste as colunas acima (data, descrição e valor).</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="w-64"><Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todos' }, { value: 'selected', label: 'Importar' }, { value: 'skipped', label: 'Ignorados' }]} /></div>
                <div className="flex gap-3 text-xs">
                  <button className="font-semibold text-brand" onClick={() => setItems((l) => l.map((i) => ({ ...i, selected: i.status !== 'duplicate' })))}>Marcar todos</button>
                  <button className="font-semibold text-ink-2" onClick={() => setItems((l) => l.map((i) => ({ ...i, selected: false })))}>Desmarcar</button>
                </div>
              </div>

              <ul className="max-h-[48dvh] divide-y divide-line overflow-y-auto rounded-2xl border border-line">
                {visible.map((i) => {
                  const cats = data.categories.filter((c) => c.type === i.type && !c.archived);
                  return (
                    <li key={i.key} className={`grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 px-3 py-2.5 sm:grid-cols-[auto_4.5rem_1fr_11rem_7rem] ${i.selected ? '' : 'opacity-55'}`}>
                      <input type="checkbox" checked={i.selected} onChange={(e) => update(i.key, { selected: e.target.checked })} className="size-4 accent-[var(--brand)]" aria-label="Importar" />
                      <span className="tabular hidden text-xs text-muted sm:block">{fmtDate(i.date)}</span>
                      <span className="min-w-0">
                        <input value={i.description} onChange={(e) => update(i.key, { description: e.target.value })} className="w-full truncate rounded-md bg-transparent px-1 py-0.5 text-sm outline-none focus:bg-surface-2" aria-label="Descrição" />
                        <span className="flex items-center gap-2 px-1 text-[11px]">
                          <span className="tabular text-muted sm:hidden">{fmtDate(i.date)}</span>
                          {i.status !== 'new' && <span className={`rounded-full px-1.5 py-px font-semibold ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>}
                        </span>
                      </span>
                      <span className={`tabular text-right text-sm font-semibold sm:order-last ${i.type === 'income' ? 'text-good' : ''}`}>
                        {i.type === 'income' ? '+' : '−'}{money(i.amount)}
                      </span>
                      <select value={i.categoryId} onChange={(e) => setCategory(i, e.target.value)} className="col-span-2 col-start-2 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs sm:col-span-1 sm:col-start-auto" aria-label="Categoria">
                        {cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center">
                <p className="flex-1 text-sm text-ink-2">
                  {selected.length} selecionado(s) · <span className="tabular text-good">+{money(totals.in)}</span> · <span className="tabular text-bad">−{money(totals.out)}</span>
                </p>
                <Button variant="ghost" onClick={close}>Cancelar</Button>
                <Button variant="primary" disabled={!selected.length || saving} onClick={doImport}>
                  {saving ? 'Importando…' : `Importar ${selected.length} lançamento(s)`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function MappingEditor({ table, mapping, onChange }: { table: string[][]; mapping: CsvMapping | null; onChange: (m: CsvMapping) => void }) {
  const [m, setM] = useState<CsvMapping>(mapping ?? { headerRow: -1, date: 0, description: [1], amount: 2 });
  const header = m.headerRow >= 0 ? table[m.headerRow] : null;
  const cols = Math.max(...table.slice(0, 30).map((r) => r.length));
  const label = (i: number) => `${String.fromCharCode(65 + i)}${header?.[i] ? ` · ${header[i]}` : ''}`;
  const sample = table.slice(m.headerRow + 1, m.headerRow + 4);
  const set = (patch: Partial<CsvMapping>) => {
    const next = { ...m, ...patch };
    setM(next);
    onChange(next);
  };
  const Select = ({ value, onPick, optional }: { value?: number; onPick: (v?: number) => void; optional?: boolean }) => (
    <select value={value ?? ''} onChange={(e) => onPick(e.target.value === '' ? undefined : Number(e.target.value))} className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
      {optional && <option value="">—</option>}
      {Array.from({ length: cols }, (_, i) => <option key={i} value={i}>{label(i)}</option>)}
    </select>
  );
  return (
    <div className="space-y-3 rounded-2xl bg-surface-2 p-3 text-sm">
      <div className="grid gap-2 sm:grid-cols-4">
        <label>
          <span className="mb-1 block text-xs font-semibold text-ink-2">Linha do cabeçalho</span>
          <select value={m.headerRow} onChange={(e) => set({ headerRow: Number(e.target.value) })} className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
            <option value={-1}>Sem cabeçalho</option>
            {table.slice(0, 15).map((r, i) => <option key={i} value={i}>{i + 1}: {r.join(' | ').slice(0, 40)}</option>)}
          </select>
        </label>
        <label><span className="mb-1 block text-xs font-semibold text-ink-2">Data</span><Select value={m.date} onPick={(v) => set({ date: v ?? 0 })} /></label>
        <label><span className="mb-1 block text-xs font-semibold text-ink-2">Descrição</span><Select value={m.description[0]} onPick={(v) => set({ description: v === undefined ? [] : [v] })} /></label>
        <label><span className="mb-1 block text-xs font-semibold text-ink-2">Valor</span><Select value={m.amount} optional onPick={(v) => set({ amount: v })} /></label>
      </div>
      {sample.length > 0 && (
        <div className="overflow-x-auto">
          <table className="text-xs">
            <tbody>
              {sample.map((r, k) => (
                <tr key={k}>{r.map((c, i) => <td key={i} className="max-w-40 truncate border border-line px-2 py-1">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
