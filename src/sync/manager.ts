import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';
import { db } from '../db/schema';
import { pullChanges, pushChanges, seedAll, type Remote, type RemoteRecord } from './engine';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const syncConfigured = !!(URL && KEY);

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'idle' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  email?: string;
  lastSync?: number;
  error?: string;
  pending: number;
}

export const useSync = create<SyncState>(() => ({ status: syncConfigured ? 'signed-out' : 'off', pending: 0 }));

let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let userId: string | null = null;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;

async function getClient() {
  if (!syncConfigured) throw new Error('Sincronização não configurada');
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(URL!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' } });
  }
  return client;
}

function remote(c: SupabaseClient): Remote {
  return {
    async push(records) {
      const { error } = await c.rpc('push_records', { records });
      if (error) throw error;
    },
    async pull(since) {
      const out: RemoteRecord[] = [];
      // 30s de folga cobre gravações que terminaram fora de ordem; aplicar duas vezes é inofensivo.
      const from = since ? new Date(new Date(since).getTime() - 30_000).toISOString() : null;
      const page = 1000;
      for (let offset = 0; ; offset += page) {
        let q = c.from('records').select('tbl,id,data,deleted,updated_at,server_at').order('server_at', { ascending: true }).range(offset, offset + page - 1);
        if (from) q = q.gt('server_at', from);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data as RemoteRecord[]));
        if (data.length < page) break;
      }
      return out;
    },
  };
}

const refreshPending = async () => useSync.setState({ pending: await db.pending.count() });

export async function syncNow() {
  if (!userId || !client) return;
  if (running) {
    again = true;
    return;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    useSync.setState({ status: 'offline' });
    await refreshPending();
    return;
  }
  running = true;
  useSync.setState({ status: 'syncing', error: undefined });
  try {
    const r = remote(client);
    await pushChanges(db, r);
    await pullChanges(db, r);
    useSync.setState({ status: 'idle', lastSync: Date.now() });
  } catch (e) {
    useSync.setState({ status: 'error', error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) });
  } finally {
    running = false;
    await refreshPending();
    if (again) {
      again = false;
      schedule(300);
    }
  }
}

export function schedule(ms = 1500) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

async function onSignedIn(session: Session) {
  if (userId === session.user.id) return;
  userId = session.user.id;
  useSync.setState({ email: session.user.email, status: 'idle' });

  const prev = (await db.meta.get('syncUser'))?.value;
  if (prev !== userId) {
    await seedAll(db);
    await db.meta.put({ key: 'syncUser', value: userId });
  }
  db.onLocalChange = () => {
    refreshPending();
    schedule();
  };

  const c = await getClient();
  channel = c
    .channel(`records:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` }, () => schedule(400))
    .subscribe();
  clearInterval(interval);
  interval = setInterval(syncNow, 60_000);
  await syncNow();
}

function onSignedOut() {
  userId = null;
  db.onLocalChange = null;
  clearInterval(interval);
  clearTimeout(timer);
  if (channel) client?.removeChannel(channel);
  channel = null;
  useSync.setState({ status: syncConfigured ? 'signed-out' : 'off', email: undefined, lastSync: undefined });
}

let started: Promise<void> | null = null;

/** Liga a sincronização. Resolve depois da primeira sincronização (ou na hora, se não houver login). */
export function startSync(): Promise<void> {
  if (!syncConfigured) return Promise.resolve();
  started ??= (async () => {
    const c = await getClient();
    window.addEventListener('online', () => schedule(200));
    window.addEventListener('offline', () => useSync.setState({ status: 'offline' }));
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && schedule(200));
    c.auth.onAuthStateChange((event, session) => {
      // O callback não pode aguardar chamadas do Supabase (trava o auth); por isso o setTimeout.
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED')) setTimeout(() => onSignedIn(session), 0);
      if (event === 'SIGNED_OUT') onSignedOut();
    });
    const { data } = await c.auth.getSession();
    if (data.session) await onSignedIn(data.session);
    await refreshPending();
  })();
  return started;
}

export async function sendLoginCode(email: string) {
  const c = await getClient();
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } });
  if (error) throw error;
}

export async function verifyLoginCode(email: string, token: string) {
  const c = await getClient();
  const { data, error } = await c.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  if (data.session) await onSignedIn(data.session);
}

export async function signOut() {
  const c = await getClient();
  await syncNow();
  await c.auth.signOut();
  onSignedOut();
}
