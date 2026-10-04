import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { money, moneyShort, monthLabel, pct } from '../domain/format';
import type { CategoryRow, MonthPoint } from '../domain/summary';
import { Delta, LimitBar } from './ui';

const MAX_SLICES = 8;

/** Mais de 8 categorias viram "Demais" — nunca geramos cores novas. */
function foldRows(rows: CategoryRow[]): CategoryRow[] {
  if (rows.length <= MAX_SLICES + 1) return rows;
  const head = rows.slice(0, MAX_SLICES);
  const tail = rows.slice(MAX_SLICES);
  const total = tail.reduce((a, r) => a + r.total, 0);
  const prevTotal = tail.reduce((a, r) => a + r.prevTotal, 0);
  return [
    ...head,
    {
      categoryId: '__rest',
      name: `Demais (${tail.length})`,
      icon: '…',
      color: '#898781',
      total,
      prevTotal,
      count: tail.reduce((a, r) => a + r.count, 0),
      share: tail.reduce((a, r) => a + r.share, 0),
      delta: prevTotal ? (total - prevTotal) / prevTotal : null,
    },
  ];
}

function TooltipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm shadow-lg">{children}</div>;
}

export function CategoryDonut({ rows, limits }: { rows: CategoryRow[]; limits: Map<string, number> }) {
  const data = foldRows(rows);
  const [active, setActive] = useState<string | null>(null);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const focus = data.find((r) => r.categoryId === active);

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,220px)_1fr]">
      <div className="relative mx-auto aspect-square w-full max-w-[220px]">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={0}
              stroke="var(--surface)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              onMouseEnter={(_, i) => setActive(data[i].categoryId)}
              onMouseLeave={() => setActive(null)}
            >
              {data.map((r) => (
                <Cell key={r.categoryId} fill={r.color} opacity={active && active !== r.categoryId ? 0.35 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted">{focus ? `${focus.icon} ${focus.name}` : 'Total gasto'}</span>
          <span className="tabular text-lg font-bold">{money(focus ? focus.total : total)}</span>
          {focus && <span className="text-xs text-ink-2">{pct(focus.share)} do total</span>}
        </div>
      </div>

      <ul className="space-y-1" aria-label="Despesas por categoria">
        {data.map((r) => {
          const limit = limits.get(r.categoryId);
          return (
            <li
              key={r.categoryId}
              onMouseEnter={() => setActive(r.categoryId)}
              onMouseLeave={() => setActive(null)}
              className={`rounded-lg px-2 py-1.5 transition ${active === r.categoryId ? 'bg-surface-2' : ''}`}
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{r.icon} {r.name}</span>
                <Delta value={r.delta} invert />
                <span className="w-10 text-right text-xs text-muted tabular">{pct(r.share)}</span>
                <span className="w-24 text-right font-semibold tabular">{money(r.total)}</span>
              </div>
              {limit ? (
                <div className="mt-1 flex items-center gap-2 pl-4.5">
                  <LimitBar spent={r.total} limit={limit} slim />
                  <span className="shrink-0 text-[11px] text-muted tabular">de {moneyShort(limit)}</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function IncomeBars({ rows }: { rows: CategoryRow[] }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="space-y-3" aria-label="Receitas por categoria">
      {rows.map((r) => (
        <li key={r.categoryId}>
          <div className="mb-1 flex items-center gap-2 text-sm">
            <span className="flex-1 truncate">{r.icon} {r.name}</span>
            <Delta value={r.delta} />
            <span className="w-10 text-right text-xs text-muted tabular">{pct(r.share)}</span>
            <span className="w-24 text-right font-semibold tabular">{money(r.total)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${(r.total / max) * 100}%`, background: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TrendChart({ points, current, onPick }: { points: MonthPoint[]; current: string; onPick: (m: string) => void }) {
  const data = points.map((p) => ({ ...p, label: monthLabel(p.month, 'short') }));
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-ink-2" aria-hidden>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-income" /> Receitas</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-expense" /> Despesas</span>
      </div>
      <div className="h-56">
        <ResponsiveContainer>
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
            <YAxis tickFormatter={(v) => moneyShort(v)} tickLine={false} axisLine={false} width={64} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: 'var(--surface-2)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as MonthPoint & { label: string };
                return (
                  <TooltipBox>
                    <p className="mb-1 font-semibold">{monthLabel(p.month)}</p>
                    <p className="flex justify-between gap-6"><span className="text-ink-2">Receitas</span><span className="tabular">{money(p.income)}</span></p>
                    <p className="flex justify-between gap-6"><span className="text-ink-2">Despesas</span><span className="tabular">{money(p.expense)}</span></p>
                    <p className="mt-1 flex justify-between gap-6 border-t border-line pt-1 font-semibold">
                      <span>Saldo</span>
                      <span className={`tabular ${p.balance >= 0 ? 'text-good' : 'text-bad'}`}>{money(p.balance)}</span>
                    </p>
                  </TooltipBox>
                );
              }}
            />
            <Bar isAnimationActive={false} dataKey="income" name="Receitas" fill="var(--income)" radius={[4, 4, 0, 0]} maxBarSize={28} onClick={(d) => onPick((d as unknown as MonthPoint).month)} className="cursor-pointer">
              {data.map((d) => <Cell key={d.month} fill="var(--income)" opacity={d.month === current ? 1 : 0.55} />)}
            </Bar>
            <Bar isAnimationActive={false} dataKey="expense" name="Despesas" fill="var(--expense)" radius={[4, 4, 0, 0]} maxBarSize={28} onClick={(d) => onPick((d as unknown as MonthPoint).month)} className="cursor-pointer">
              {data.map((d) => <Cell key={d.month} fill="var(--expense)" opacity={d.month === current ? 1 : 0.55} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
