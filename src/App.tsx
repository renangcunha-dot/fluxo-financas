import { useEffect } from 'react';
import { BudgetGate } from './components/BudgetGate';
import { QuickAdd } from './components/QuickAdd';
import { MonthPicker } from './components/ui';
import { useData } from './hooks/useData';
import { initNotifications } from './notifications/notify';
import { Budgets } from './pages/Budgets';
import { Dashboard } from './pages/Dashboard';
import { More } from './pages/More';
import { Transactions } from './pages/Transactions';
import { runRecurring } from './store/actions';
import { useUI, type Page } from './store/ui';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Início', icon: '📊' },
  { id: 'transactions', label: 'Lançamentos', icon: '🧾' },
  { id: 'budgets', label: 'Limites', icon: '🚦' },
  { id: 'more', label: 'Mais', icon: '⚙️' },
];

function useTheme() {
  const theme = useUI((s) => s.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

export default function App() {
  const data = useData();
  const { page, setPage, openQuickAdd, toasts, dismissToast } = useUI();
  useTheme();

  useEffect(() => {
    initNotifications((action) => {
      // Botões do push resolvem a decisão pendente, se houver.
      const gate = useUI.getState().gate;
      if (!gate || gate.kind !== 'exceeded') return;
      if (action === 'block') gate.resolve({ choice: 'block' });
      if (action === 'continue') gate.resolve({ choice: 'continue', reason: 'Confirmado pela notificação' });
    });
    runRecurring();
    const id = setInterval(runRecurring, 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Atalho de teclado: "n" abre novo lançamento.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !useUI.getState().quickAdd.open) {
        e.preventDefault();
        openQuickAdd();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openQuickAdd]);

  const title = NAV.find((n) => n.id === page)!.label;

  return (
    <div className="min-h-dvh lg:flex">
      {/* Barra lateral (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface p-4 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="size-8" />
          <span className="text-lg font-bold">Fluxo</span>
        </div>
        <button onClick={() => openQuickAdd()} className="mb-4 rounded-xl bg-brand px-4 py-3 font-semibold text-brand-ink hover:brightness-110">
          + Novo lançamento <kbd className="ml-1 rounded bg-black/15 px-1.5 text-xs">N</kbd>
        </button>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-medium transition ${page === n.id ? 'bg-brand-soft text-ink' : 'text-ink-2 hover:bg-surface-2'}`}
            >
              <span aria-hidden>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-2 text-xs text-muted">🔐 Seus dados ficam só neste aparelho.</p>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <img src="/icon.svg" alt="" className="size-7 lg:hidden" />
              {title}
            </h1>
            {page !== 'more' && <MonthPicker />}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 pt-4 pb-28 sm:px-6 lg:pb-10">
          {!data.ready ? (
            <p className="py-20 text-center text-muted">Carregando…</p>
          ) : page === 'dashboard' ? (
            <Dashboard data={data} />
          ) : page === 'transactions' ? (
            <Transactions data={data} />
          ) : page === 'budgets' ? (
            <Budgets data={data} />
          ) : (
            <More data={data} />
          )}
        </main>
      </div>

      {/* Navegação inferior (celular) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.slice(0, 2).map((n) => <NavItem key={n.id} {...n} active={page === n.id} onClick={() => setPage(n.id)} />)}
        <div className="flex justify-center">
          <button onClick={() => openQuickAdd()} aria-label="Novo lançamento" className="-mt-5 flex size-14 items-center justify-center rounded-full bg-brand text-3xl text-brand-ink shadow-lg ring-4 ring-bg">+</button>
        </div>
        {NAV.slice(2).map((n) => <NavItem key={n.id} {...n} active={page === n.id} onClick={() => setPage(n.id)} />)}
      </nav>

      <QuickAdd data={data} />
      <BudgetGate data={data} />

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={`animate-pop pointer-events-auto max-w-md rounded-xl border px-4 py-2.5 text-sm shadow-lg ${
              { good: 'border-[var(--good-mark)]/40', bad: 'border-[var(--bad-mark)]/50', warn: 'border-[var(--warn-mark)]/60', neutral: 'border-line' }[t.tone]
            } bg-surface`}
          >
            {t.text}
          </button>
        ))}
      </div>
    </div>
  );
}

function NavItem({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-brand' : 'text-muted'}`}>
      <span className={`text-xl ${active ? '' : 'grayscale'}`} aria-hidden>{icon}</span>
      {label}
    </button>
  );
}
