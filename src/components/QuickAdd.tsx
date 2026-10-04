import { useEffect, useMemo, useRef, useState } from 'react';
import { fallbackCategory, parseQuick, suggestCategory } from '../domain/categorize';
import { monthOf, parseAmount, today, uid } from '../domain/format';
import type { Recurring, Transaction, TxType } from '../domain/types';
import type { AppData } from '../hooks/useData';
import { deleteTransaction, saveTransaction } from '../store/actions';
import { useUI } from '../store/ui';
import { Button, inputCls, Modal, Segmented } from './ui';

const centsToInput = (c: number) => (c / 100).toFixed(2).replace('.', ',');

export function QuickAdd({ data }: { data: AppData }) {
  const { quickAdd, closeQuickAdd } = useUI();
  const editing = quickAdd.editing;
  const gateOpen = useUI((s) => !!s.gate);

  const [smart, setSmart] = useState('');
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [date, setDate] = useState(today());
  const [repeat, setRepeat] = useState(false);
  const [saving, setSaving] = useState(false);
  const smartRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!quickAdd.open) return;
    setSmart('');
    setType(editing?.type ?? quickAdd.presetType ?? 'expense');
    setAmount(editing ? centsToInput(editing.amount) : '');
    setDescription(editing?.description ?? '');
    setCategoryId(editing?.categoryId ?? '');
    setCategoryTouched(!!editing);
    setDate(editing?.date ?? today());
    setRepeat(false);
    setTimeout(() => smartRef.current?.focus(), 50);
  }, [quickAdd.open, editing, quickAdd.presetType]);

  const cats = useMemo(() => data.categories.filter((c) => c.type === type && !c.archived), [data.categories, type]);

  // Sugestão automática de categoria enquanto o usuário não escolhe manualmente.
  useEffect(() => {
    if (categoryTouched) return;
    const s = suggestCategory(description, type, data.transactions, data.categories);
    setCategoryId(s ?? '');
  }, [description, type, categoryTouched, data.transactions, data.categories]);

  const onSmart = (v: string) => {
    setSmart(v);
    const p = parseQuick(v);
    setType(p.type);
    setDescription(p.description);
    setAmount(p.amount ? centsToInput(p.amount) : '');
  };

  const cents = parseAmount(amount);
  const finalCategory = categoryId || fallbackCategory(type);
  const valid = !!cents;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    const tx: Transaction = {
      id: editing?.id ?? uid(),
      type,
      amount: cents!,
      date,
      categoryId: finalCategory,
      description: description.trim() || data.catMap.get(finalCategory)?.name || '',
      recurringId: editing?.recurringId,
      createdAt: editing?.createdAt ?? Date.now(),
    };
    let recurring: Recurring | undefined;
    if (repeat && !editing) {
      recurring = {
        id: uid(),
        type,
        amount: tx.amount,
        categoryId: tx.categoryId,
        description: tx.description,
        day: Number(date.slice(8, 10)),
        active: true,
        startMonth: monthOf(date),
        lastGenerated: monthOf(date),
      };
      tx.recurringId = recurring.id;
    }
    const result = await saveTransaction(tx, recurring);
    setSaving(false);
    if (result !== 'cancelled') closeQuickAdd();
  };

  const remove = async () => {
    if (!editing) return;
    await deleteTransaction(editing.id);
    closeQuickAdd();
  };

  return (
    <Modal open={quickAdd.open && !gateOpen} onClose={closeQuickAdd} title={editing ? 'Editar lançamento' : 'Novo lançamento'}>
      <form onSubmit={submit} className="space-y-4">
        {!editing && (
          <div>
            <input
              ref={smartRef}
              value={smart}
              onChange={(e) => onSmart(e.target.value)}
              placeholder='Digite rápido: "uber 32" ou "+salário 5000"'
              className={`${inputCls} border-dashed`}
              aria-label="Atalho de lançamento"
              enterKeyHint="done"
            />
            <p className="mt-1 text-xs text-muted">Valor e descrição são preenchidos sozinhos. Use “+” para receitas.</p>
          </div>
        )}

        <Segmented
          value={type}
          onChange={(t) => {
            setType(t);
            setCategoryTouched(false);
          }}
          options={[
            { value: 'expense', label: '↓ Despesa' },
            { value: 'income', label: '↑ Receita' },
          ]}
        />

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-2">Valor</span>
          <div className="flex items-center rounded-xl border border-line bg-surface-2 px-3 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
            <span className="text-muted">R$</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={`tabular w-full bg-transparent px-2 py-2.5 text-2xl font-bold outline-none ${type === 'income' ? 'text-good' : ''}`}
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-2">Descrição</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Mercado" className={inputCls} />
        </label>

        <div>
          <span className="mb-1 flex items-center justify-between text-xs font-semibold text-ink-2">
            Categoria
            {!categoryTouched && categoryId && <span className="font-normal text-brand">✨ sugerida</span>}
          </span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {cats.map((c) => {
              const selected = finalCategory === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setCategoryId(c.id);
                    setCategoryTouched(true);
                  }}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 text-xs transition ${selected ? 'border-brand bg-brand-soft font-semibold' : 'border-line hover:bg-surface-2'}`}
                >
                  <span className="text-lg" aria-hidden>{c.icon}</span>
                  <span className="w-full truncate text-center">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1">
            <span className="mb-1 block text-xs font-semibold text-ink-2">Data</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={inputCls} />
          </label>
          {!editing && (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm">
              <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="size-4 accent-[var(--brand)]" />
              🔁 Repetir todo mês
            </label>
          )}
        </div>
        {editing?.recurringId && <p className="text-xs text-muted">🔁 Este lançamento veio de uma recorrência. Gerencie recorrências em “Mais”.</p>}

        <div className="flex gap-2 pt-1">
          {editing && (
            <Button type="button" variant="ghost" onClick={remove} className="text-bad">
              Excluir
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={!valid || saving} className="flex-1 py-3 text-base">
            {saving ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
