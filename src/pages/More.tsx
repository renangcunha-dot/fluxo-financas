import { useRef, useState } from 'react';
import { Button, Card, inputCls, Segmented } from '../components/ui';
import { db } from '../db/schema';
import { money, parseAmount, uid } from '../domain/format';
import type { Category, TxType } from '../domain/types';
import type { AppData } from '../hooks/useData';
import { exportCSV, exportJSON, importJSON, loadDemo, wipeAll } from '../store/actions';
import { useUI, type Theme } from '../store/ui';

const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948', '#898781'];

export function More({ data }: { data: AppData }) {
  const { theme, setTheme, toast } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (f?: File) => {
    if (!f) return;
    if (!confirm('Importar substitui todos os dados atuais. Continuar?')) return;
    try {
      await importJSON(f);
      toast('Backup restaurado com sucesso', 'good');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao importar', 'bad');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Categories data={data} />
      </div>
      <div className="space-y-4">
        <Recurrings data={data} />

        <Card title="Aparência">
          <Segmented<Theme> value={theme} onChange={setTheme} options={[{ value: 'system', label: 'Sistema' }, { value: 'light', label: '☀️ Claro' }, { value: 'dark', label: '🌙 Escuro' }]} />
        </Card>

        <Card title="Seus dados">
          <p className="mb-3 text-sm text-ink-2">🔐 Tudo fica salvo só neste aparelho. Faça backup de vez em quando.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={exportJSON}>⬇️ Backup (JSON)</Button>
            <Button onClick={() => fileRef.current?.click()}>⬆️ Restaurar</Button>
            <Button onClick={exportCSV}>📄 Exportar CSV</Button>
            <Button onClick={loadDemo}>🧪 Dados de exemplo</Button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />
          <Button
            variant="ghost"
            className="mt-3 w-full text-bad"
            onClick={async () => {
              if (confirm('Apagar TODOS os lançamentos, limites e recorrências? Isso não pode ser desfeito.')) {
                await wipeAll();
                toast('Dados apagados');
              }
            }}
          >
            Apagar tudo
          </Button>
        </Card>
      </div>
    </div>
  );
}

function Categories({ data }: { data: AppData }) {
  const [type, setType] = useState<TxType>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const list = data.categories.filter((c) => c.type === type);
  const used = new Set(data.transactions.map((t) => t.categoryId));

  const save = async (c: Category) => {
    await db.categories.put(c);
    setEditing(null);
  };

  return (
    <Card title="Categorias" action={<Button variant="ghost" className="px-2 py-1 text-brand" onClick={() => setEditing({ id: uid(), name: '', type, color: PALETTE[list.length % PALETTE.length], icon: '🏷️' })}>+ Nova</Button>}>
      <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'Despesas' }, { value: 'income', label: 'Receitas' }]} />
      <ul className="mt-3 divide-y divide-line">
        {list.map((c) =>
          editing?.id === c.id ? (
            <CategoryEditor key={c.id} value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <li key={c.id} className={`flex items-center gap-3 py-2.5 ${c.archived ? 'opacity-50' : ''}`}>
              <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="text-lg" aria-hidden>{c.icon}</span>
              <span className="flex-1">{c.name}{c.archived && ' (arquivada)'}</span>
              <button className="rounded-lg px-2 py-1 text-xs text-ink-2 hover:bg-surface-2" onClick={() => setEditing(c)}>Editar</button>
              {used.has(c.id) ? (
                <button className="rounded-lg px-2 py-1 text-xs text-ink-2 hover:bg-surface-2" onClick={() => db.categories.update(c.id, { archived: !c.archived })}>{c.archived ? 'Reativar' : 'Arquivar'}</button>
              ) : (
                <button className="rounded-lg px-2 py-1 text-xs text-bad hover:bg-surface-2" onClick={() => db.categories.delete(c.id)}>Excluir</button>
              )}
            </li>
          ),
        )}
        {editing && !data.categories.some((c) => c.id === editing.id) && (
          <CategoryEditor value={editing} onChange={setEditing} onSave={save} onCancel={() => setEditing(null)} />
        )}
      </ul>
    </Card>
  );
}

function CategoryEditor({ value, onChange, onSave, onCancel }: { value: Category; onChange: (c: Category) => void; onSave: (c: Category) => void; onCancel: () => void }) {
  return (
    <li className="space-y-2 py-3">
      <div className="flex gap-2">
        <input value={value.icon} onChange={(e) => onChange({ ...value, icon: e.target.value })} className={`${inputCls} w-14 text-center`} aria-label="Ícone (emoji)" maxLength={4} />
        <input autoFocus value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Nome da categoria" className={inputCls} />
      </div>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
        {PALETTE.map((p) => (
          <button key={p} type="button" aria-label={p} onClick={() => onChange({ ...value, color: p })} className={`size-7 rounded-full ring-offset-2 ring-offset-[var(--surface)] ${value.color === p ? 'ring-2 ring-[var(--ink)]' : ''}`} style={{ background: p }} />
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button variant="primary" disabled={!value.name.trim()} onClick={() => onSave({ ...value, name: value.name.trim() })}>Salvar</Button>
      </div>
    </li>
  );
}

function Recurrings({ data }: { data: AppData }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const monthlyIn = data.recurrings.filter((r) => r.active && r.type === 'income').reduce((a, r) => a + r.amount, 0);
  const monthlyOut = data.recurrings.filter((r) => r.active && r.type === 'expense').reduce((a, r) => a + r.amount, 0);

  return (
    <Card title="🔁 Recorrências">
      {data.recurrings.length === 0 ? (
        <p className="text-sm text-muted">Marque “Repetir todo mês” ao lançar salário, aluguel ou assinaturas — eles entram sozinhos no dia certo.</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-ink-2">
            Fixos por mês: <b className="tabular text-good">+{money(monthlyIn)}</b> · <b className="tabular text-bad">−{money(monthlyOut)}</b>
          </p>
          <ul className="divide-y divide-line">
            {data.recurrings.map((r) => {
              const c = data.catMap.get(r.categoryId);
              return (
                <li key={r.id} className={`flex items-center gap-3 py-2.5 text-sm ${r.active ? '' : 'opacity-50'}`}>
                  <span aria-hidden>{c?.icon}</span>
                  <span className="flex-1">
                    <span className="block font-medium">{r.description}</span>
                    <span className="text-xs text-muted">todo dia {r.day} · {c?.name}</span>
                  </span>
                  {editingId === r.id ? (
                    <input
                      autoFocus
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      onBlur={async () => {
                        const cents = parseAmount(amount);
                        if (cents) await db.recurrings.update(r.id, { amount: cents });
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      inputMode="decimal"
                      className={`${inputCls} w-28 py-1 text-right`}
                    />
                  ) : (
                    <button className={`tabular font-semibold ${r.type === 'income' ? 'text-good' : ''}`} onClick={() => { setEditingId(r.id); setAmount((r.amount / 100).toFixed(2).replace('.', ',')); }} title="Alterar valor">
                      {money(r.amount)}
                    </button>
                  )}
                  <button className="rounded-lg px-2 py-1 text-xs text-ink-2 hover:bg-surface-2" onClick={() => db.recurrings.update(r.id, { active: !r.active })}>{r.active ? 'Pausar' : 'Retomar'}</button>
                  <button className="rounded-lg px-2 py-1 text-xs text-bad hover:bg-surface-2" aria-label="Excluir recorrência" onClick={() => confirm('Excluir esta recorrência? Lançamentos já feitos continuam.') && db.recurrings.delete(r.id)}>✕</button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
