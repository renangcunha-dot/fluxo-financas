import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { addMonths, currentMonth, monthLabel } from '../domain/format';
import { health } from '../domain/budget';
import { useUI } from '../store/ui';

export function Card({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-ink-2">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Variant = 'primary' | 'ghost' | 'danger' | 'soft';
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-brand-ink hover:brightness-110',
  soft: 'bg-surface-2 text-ink hover:brightness-95 dark:hover:brightness-125',
  ghost: 'text-ink-2 hover:bg-surface-2',
  danger: 'bg-[var(--bad-mark)] text-white hover:brightness-110',
};

export function Button({ variant = 'soft', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 ${variants[variant]} ${className}`}
    />
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={`animate-pop max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Fechar" className="-m-1 rounded-lg p-1 text-muted hover:bg-surface-2">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const healthColor = { ok: 'var(--good-mark)', attention: 'var(--warn-mark)', danger: 'var(--serious-mark)', over: 'var(--bad-mark)' };
const healthLabel = { ok: '✓ No controle', attention: '● Atenção', danger: '▲ Quase no limite', over: '■ Limite atingido' };

export function LimitBar({ spent, limit, slim }: { spent: number; limit: number; slim?: boolean }) {
  const h = health(spent, limit);
  const ratio = limit ? spent / limit : 0;
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-surface-2 ${slim ? 'h-1.5' : 'h-2.5'}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, ratio * 100)}%`, background: healthColor[h] }} />
    </div>
  );
}

export function HealthTag({ spent, limit }: { spent: number; limit: number }) {
  const h = health(spent, limit);
  const tone = { ok: 'text-good', attention: 'text-warn', danger: 'text-warn', over: 'text-bad' }[h];
  return <span className={`text-xs font-semibold ${tone}`}>{healthLabel[h]}</span>;
}

export function MonthPicker() {
  const { month, setMonth } = useUI();
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-1">
      <button aria-label="Mês anterior" onClick={() => setMonth(addMonths(month, -1))} className="rounded-lg px-2.5 py-1.5 text-lg text-ink-2 hover:bg-surface-2">‹</button>
      <span className="min-w-36 text-center font-semibold">{monthLabel(month)}</span>
      <button aria-label="Próximo mês" onClick={() => setMonth(addMonths(month, 1))} className="rounded-lg px-2.5 py-1.5 text-lg text-ink-2 hover:bg-surface-2">›</button>
      {!isCurrent && (
        <button onClick={() => setMonth(currentMonth())} className="ml-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-brand-soft">Hoje</button>
      )}
    </div>
  );
}

export function Delta({ value, invert }: { value: number | null; invert?: boolean }) {
  if (value === null || !Number.isFinite(value)) return <span className="text-xs text-muted">—</span>;
  const up = value > 0;
  const good = invert ? !up : up;
  if (Math.abs(value) < 0.005) return <span className="text-xs text-muted">= mês anterior</span>;
  return (
    <span className={`text-xs font-semibold ${good ? 'text-good' : 'text-bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(value * 100))}%
    </span>
  );
}

export const inputCls = 'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-ink outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/30';
