import { useState } from 'react';
import { db, TABLES } from '../db/schema';
import { DEFAULT_CATEGORIES } from '../domain/defaults';
import { sendLoginCode, signOut, syncConfigured, syncNow, useSync, verifyLoginCode, type SyncStatus } from '../sync/manager';
import { useUI } from '../store/ui';
import { Button, Card, inputCls } from './ui';

const LABEL: Record<SyncStatus, { icon: string; text: string }> = {
  off: { icon: '📴', text: 'Sincronização não configurada' },
  'signed-out': { icon: '☁️', text: 'Desconectado' },
  syncing: { icon: '🔄', text: 'Sincronizando…' },
  idle: { icon: '✅', text: 'Sincronizado' },
  offline: { icon: '📶', text: 'Sem internet — sincroniza quando voltar' },
  error: { icon: '⚠️', text: 'Erro ao sincronizar' },
};

/** Ícone compacto para o cabeçalho. */
export function SyncBadge() {
  const { status, pending } = useSync();
  const setPage = useUI((s) => s.setPage);
  if (status === 'off') return null;
  const l = LABEL[status];
  return (
    <button onClick={() => setPage('more')} title={l.text} aria-label={l.text} className="relative rounded-lg px-2 py-1.5 text-base hover:bg-surface-2">
      <span className={status === 'syncing' ? 'inline-block animate-spin' : ''}>{status === 'signed-out' ? '☁️' : l.icon}</span>
      {pending > 0 && status !== 'syncing' && <span className="absolute -top-0.5 -right-0.5 rounded-full bg-[var(--warn-mark)] px-1 text-[10px] font-bold text-black">{pending}</span>}
    </button>
  );
}

export function SyncCard() {
  const s = useSync();
  const toast = useUI((u) => u.toast);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  if (!syncConfigured) {
    return (
      <Card title="☁️ Sincronização">
        <p className="text-sm text-ink-2">Esta instalação ainda não tem um servidor configurado. Seus dados ficam só neste aparelho — use o backup para levar para outro.</p>
      </Card>
    );
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Algo deu errado', 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (s.status === 'signed-out') {
    return (
      <Card title="☁️ Sincronizar celular e computador">
        <p className="mb-3 text-sm text-ink-2">Entre com seu e-mail nos dois aparelhos e tudo fica igual, em tempo real. Continua funcionando sem internet.</p>
        {step === 'email' ? (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await sendLoginCode(email.trim());
                setStep('code');
                toast('Código enviado — confira seu e-mail', 'good');
              });
            }}
          >
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={inputCls} autoComplete="email" />
            <Button variant="primary" disabled={busy}>{busy ? 'Enviando…' : 'Receber código'}</Button>
          </form>
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await verifyLoginCode(email.trim(), code.trim());
                toast('Conectado! Sincronizando seus dados…', 'good');
              });
            }}
          >
            <p className="text-sm">Digite o código que chegou em <b>{email}</b>:</p>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123456" className={`${inputCls} tabular text-center text-xl tracking-[0.3em]`} autoFocus />
              <Button variant="primary" disabled={busy || code.length < 6}>Entrar</Button>
            </div>
            <p className="text-xs text-muted">
              Também pode tocar no link do e-mail neste aparelho.{' '}
              <button type="button" className="font-semibold text-brand" onClick={() => setStep('email')}>Trocar e-mail</button>
            </p>
          </form>
        )}
      </Card>
    );
  }

  const l = LABEL[s.status];
  const wipeLocal = async () => {
    if (!confirm('Sair e apagar os dados DESTE aparelho? Eles continuam salvos na sua conta.')) return;
    await signOut();
    await db.transaction('rw', [...TABLES.map((t) => db.table(t)), db.pending, db.meta], async () => {
      for (const t of TABLES) await db.table(t).clear();
      await db.pending.clear();
      await db.meta.clear();
    });
    await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((c) => ({ ...c })));
    await db.pending.clear();
    location.reload();
  };

  return (
    <Card title="☁️ Sincronização">
      <div className="flex items-start gap-3">
        <span className={`text-2xl ${s.status === 'syncing' ? 'animate-spin' : ''}`}>{l.icon}</span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{l.text}</p>
          <p className="truncate text-ink-2">{s.email}</p>
          <p className="text-xs text-muted">
            {s.lastSync ? `Última sincronização: ${new Date(s.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Ainda não sincronizou'}
            {s.pending > 0 && ` · ${s.pending} alteração(ões) para enviar`}
          </p>
          {s.status === 'error' && <p className="mt-1 text-xs text-bad">{s.error}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => syncNow()} disabled={s.status === 'syncing'}>🔄 Sincronizar agora</Button>
        <Button variant="ghost" onClick={() => run(signOut)}>Sair</Button>
        <Button variant="ghost" className="text-bad" onClick={wipeLocal}>Sair e limpar este aparelho</Button>
      </div>
    </Card>
  );
}
