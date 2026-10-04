import { useMemo, useState } from 'react';
import { Card, inputCls, Segmented } from '../components/ui';
import { normalize } from '../domain/categorize';
import { dayLabel, money } from '../domain/format';
import { inMonth, totals } from '../domain/summary';
import type { Transaction } from '../domain/types';
import type { AppData } from '../hooks/useData';
import { useUI } from '../store/ui';

type Filter = 'all' | 'expense' | 'income';

export function Transactions({ data }: { data: AppData }) {
  const { month, openQuickAdd } = useUI();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const list = useMemo(() => {
    const q = normalize(query);
    return inMonth(data.transactions, month)
      .filter((t) => filter === 'all' || t.type === filter)
      .filter((t) => !category || t.categoryId === category)
      .filter((t) => !q || normalize(t.description).includes(q) || normalize(data.catMap.get(t.categoryId)?.name ?? '').includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [data, month, filter, query, category]);

  const groups = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const t of list) map.set(t.date, [...(map.get(t.date) ?? []), t]);
    return [...map.entries()];
  }, [list]);

  const sum = totals(list);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔎 Buscar descrição ou categoria" className={`${inputCls} sm:flex-1`} />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} sm:w-52`} aria-label="Filtrar categoria">
          <option value="">Todas as categorias</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name} ({c.type === 'income' ? 'receita' : 'despesa'})</option>
          ))}
        </select>
        <div className="sm:w-72">
          <Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Tudo' }, { value: 'expense', label: 'Despesas' }, { value: 'income', label: 'Receitas' }]} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
        <span>{list.length} lançamento(s)</span>
        <span>Receitas <b className="tabular text-good">{money(sum.income)}</b></span>
        <span>Despesas <b className="tabular text-bad">{money(sum.expense)}</b></span>
        <span>Saldo <b className={`tabular ${sum.balance >= 0 ? 'text-good' : 'text-bad'}`}>{money(sum.balance)}</b></span>
      </div>

      {groups.length === 0 ? (
        <Card><p className="py-6 text-center text-muted">Nada por aqui. Toque em <b>+</b> para lançar.</p></Card>
      ) : (
        groups.map(([date, txs]) => {
          const day = totals(txs);
          return (
            <section key={date}>
              <h3 className="mb-1.5 flex justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                <span>{dayLabel(date)}</span>
                <span className="tabular">{money(day.balance)}</span>
              </h3>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {txs.map((t) => {
                  const c = data.catMap.get(t.categoryId);
                  return (
                    <li key={t.id}>
                      <button onClick={() => openQuickAdd({ editing: t })} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: `${c?.color ?? '#898781'}22` }} aria-hidden>
                          {c?.icon ?? '❔'}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{t.description || c?.name}</span>
                          <span className="block text-xs text-muted">{c?.name}{t.recurringId ? ' · 🔁 recorrente' : ''}</span>
                        </span>
                        <span className={`tabular font-semibold ${t.type === 'income' ? 'text-good' : ''}`}>
                          {t.type === 'income' ? '+' : '−'}{money(t.amount)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
