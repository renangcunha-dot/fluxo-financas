import { SYNCED, type FluxoDB } from '../db/schema';

/** Linha como guardada na nuvem: uma tabela genérica com o JSON do registro. */
export interface RemoteRecord {
  tbl: string;
  id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  /** Carimbo do aparelho que alterou (ms) — vence o mais recente. */
  updated_at: number;
  /** Ordem de chegada no servidor — usada como cursor de leitura. */
  server_at?: string;
}

export interface Remote {
  /** Grava no servidor; o servidor só aceita se `updated_at` for mais novo que o que já tem. */
  push(records: RemoteRecord[]): Promise<void>;
  /** Tudo que chegou depois do cursor, em ordem de `server_at`. */
  pull(since: string | null): Promise<RemoteRecord[]>;
}

const isSynced = (t: string): t is (typeof SYNCED)[number] => (SYNCED as readonly string[]).includes(t);
const CHUNK = 500;

/** Envia as mudanças locais pendentes. Retorna quantos registros subiram. */
export async function pushChanges(db: FluxoDB, remote: Remote): Promise<number> {
  const pending = await db.pending.toArray();
  if (!pending.length) return 0;
  const records: RemoteRecord[] = [];
  for (const p of pending) {
    if (!isSynced(p.tbl)) continue;
    const row = (await db.table(p.tbl).get(p.key)) as (Record<string, unknown> & { updatedAt?: number }) | undefined;
    records.push(
      row
        ? { tbl: p.tbl, id: p.key, data: row, deleted: false, updated_at: row.updatedAt ?? p.at }
        : { tbl: p.tbl, id: p.key, data: null, deleted: true, updated_at: p.at },
    );
  }
  for (let i = 0; i < records.length; i += CHUNK) await remote.push(records.slice(i, i + CHUNK));
  // Só limpa o que não mudou de novo enquanto enviávamos.
  await db.transaction('rw', db.pending, async () => {
    for (const p of pending) {
      const cur = await db.pending.get(p.id);
      if (cur && cur.at === p.at) await db.pending.delete(p.id);
    }
  });
  return records.length;
}

/** Baixa e aplica mudanças de outros aparelhos (vence o carimbo mais recente). Retorna quantas mudaram algo aqui. */
export async function pullChanges(db: FluxoDB, remote: Remote): Promise<number> {
  const cursor = ((await db.meta.get('lastPull'))?.value as string | undefined) ?? null;
  const records = await remote.pull(cursor);
  if (!records.length) return 0;
  const pending = new Map((await db.pending.toArray()).map((p) => [p.id, p.at]));
  let applied = 0;

  await db.transaction('rw', [...SYNCED.map((t) => db.table(t)), db.meta], async (tx) => {
    db.remoteTxs.add(tx);
    for (const r of records) {
      if (!isSynced(r.tbl)) continue;
      const table = db.table(r.tbl);
      const local = (await table.get(r.id)) as { updatedAt?: number } | undefined;
      if (local && (local.updatedAt ?? 0) >= r.updated_at) continue;
      // Apagado aqui e ainda não enviado: a exclusão local é mais nova?
      const localDeleteAt = pending.get(`${r.tbl}:${r.id}`);
      if (!local && localDeleteAt !== undefined && localDeleteAt >= r.updated_at) continue;
      if (r.deleted) {
        if (local) {
          await table.delete(r.id);
          applied++;
        }
      } else if (r.data) {
        await table.put({ ...r.data, updatedAt: r.updated_at });
        applied++;
      }
    }
    const next = records.reduce((m, r) => (r.server_at && r.server_at > m ? r.server_at : m), cursor ?? '');
    if (next) await db.meta.put({ key: 'lastPull', value: next });
  });
  return applied;
}

export async function syncOnce(db: FluxoDB, remote: Remote) {
  const pushed = await pushChanges(db, remote);
  const pulled = await pullChanges(db, remote);
  return { pushed, pulled };
}

/** Primeiro login neste aparelho: tudo que já existe aqui vira pendente (mescla com a conta). */
export async function seedAll(db: FluxoDB) {
  const at = Date.now();
  for (const tbl of SYNCED) {
    const keyPath = tbl === 'budgets' ? 'scope' : 'id';
    const rows = (await db.table(tbl).toArray()) as Record<string, unknown>[];
    await db.pending.bulkPut(rows.map((r) => ({ id: `${tbl}:${r[keyPath]}`, tbl, key: String(r[keyPath]), at })));
  }
  await db.meta.delete('lastPull');
}

/** Servidor em memória com as mesmas regras do Supabase — usado nos testes. */
export class MemoryRemote implements Remote {
  rows = new Map<string, RemoteRecord>();
  private seq = 0;
  async push(records: RemoteRecord[]) {
    for (const r of records) {
      const k = `${r.tbl}:${r.id}`;
      const cur = this.rows.get(k);
      if (!cur || cur.updated_at < r.updated_at) {
        this.rows.set(k, { ...JSON.parse(JSON.stringify(r)), server_at: String(++this.seq).padStart(12, '0') });
      }
    }
  }
  async pull(since: string | null) {
    return [...this.rows.values()].filter((r) => !since || r.server_at! > since).sort((a, b) => a.server_at!.localeCompare(b.server_at!));
  }
}
