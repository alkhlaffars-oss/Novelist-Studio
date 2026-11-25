// Two-way sync between the local IndexedDB and the encrypted `records` table.
// Local-first: the app always reads/writes IndexedDB; this engine runs in the background.
//  • Change detection: a content hash per record (db.syncState) as of the last successful sync.
//  • Pull: everything changed on the server since the last pull (server timestamps).
//  • Push: records whose hash changed locally, and deletions.
//  • Conflicts (changed on both sides): the newer server copy wins, and for scene text the local
//    version is preserved in version history so nothing is lost.
import type { Table } from 'dexie';
import { db } from '@/db/db';
import { newId } from '@/db/repo';
import { countWords, htmlToText } from '@/lib/text';
import { getDataKey, supabase, useCloud } from './account';
import { decryptJson, encryptJson, hashValue } from './crypto';

/** Tables that sync. Version history (snapshots) and local backups stay on each device. */
const SYNCED = [
  'projects',
  'chapters',
  'scenes',
  'sceneTexts',
  'entities',
  'loreSections',
  'relationships',
  'events',
  'plotThreads',
  'plotCards',
  'notes',
  'issues',
  'dailyStats',
  'sessions',
] as const;
type Kind = (typeof SYNCED)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (k: Kind) => db[k] as unknown as Table<any, string>;
const pk = (k: Kind) => table(k).schema.primKey.keyPath as string;
const stateKey = (k: Kind, id: string) => `${k}|${id}`;

interface RemoteRow {
  kind: Kind;
  id: string;
  payload: string | null;
  iv: string | null;
  deleted: boolean;
  updated_at: string;
}

let running = false;
let again = false;
let timer = 0;

/** Called by database hooks on any local change: sync a few seconds later. */
export function scheduleSync(delay = 4000) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), delay);
}

export async function syncNow(): Promise<void> {
  const st = useCloud.getState();
  const key = getDataKey();
  if (st.status !== 'ready' || !key || !st.userId || !navigator.onLine) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  st.set({ syncing: true, error: undefined });
  try {
    await pull(key);
    await push(key, st.userId);
    await supabase().from('profiles').update({ last_seen: new Date().toISOString() }).eq('user_id', st.userId);
    useCloud.getState().set({ lastSync: Date.now() });
  } catch (e) {
    console.error('sync failed', e);
    useCloud.getState().set({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
    useCloud.getState().set({ syncing: false });
    if (again) {
      again = false;
      scheduleSync(1000);
    }
  }
}

async function pull(key: CryptoKey) {
  const sb = supabase();
  let since = ((await db.kv.get('cloud:lastPull'))?.value as string | undefined) ?? '1970-01-01T00:00:00Z';
  for (;;) {
    const { data, error } = await sb.from('records').select('kind,id,payload,iv,deleted,updated_at').gt('updated_at', since).order('updated_at', { ascending: true }).limit(200);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as RemoteRow[];
    for (const r of rows) if ((SYNCED as readonly string[]).includes(r.kind)) await applyRemote(key, r);
    if (rows.length) {
      since = rows[rows.length - 1].updated_at;
      await db.kv.put({ key: 'cloud:lastPull', value: since });
    }
    if (rows.length < 200) break;
  }
  // Keep cached project word totals consistent with pulled scenes.
}

async function applyRemote(key: CryptoKey, r: RemoteRow) {
  const t = table(r.kind);
  const sk = stateKey(r.kind, r.id);
  const [local, state] = await Promise.all([t.get(r.id), db.syncState.get(sk)]);
  const localHash = local ? hashValue(local) : undefined;
  const changedLocally = local ? localHash !== state?.hash : !!state; // edited, or deleted locally, since last sync

  if (r.deleted) {
    if (!changedLocally && local) await t.delete(r.id);
    if (!changedLocally) await db.syncState.delete(sk);
    return;
  }
  const remote = await decryptJson<Record<string, unknown>>(key, r.payload!, r.iv!);
  const remoteHash = hashValue(remote);
  if (remoteHash === localHash) {
    await db.syncState.put({ key: sk, hash: remoteHash });
    return;
  }
  if (changedLocally && local && r.kind === 'sceneTexts') {
    // Both devices edited the same scene: keep this device's text in history, take the newer server text.
    const scene = await db.scenes.get(r.id);
    const html = String((local as { html?: string }).html ?? '');
    if (scene && html)
      await db.snapshots.add({ id: newId(), projectId: scene.projectId, sceneId: r.id, content: html, wordCount: countWords(htmlToText(html)), label: 'Sync conflict — this device', kind: 'conflict', createdAt: Date.now() });
  }
  await t.put(remote);
  await db.syncState.put({ key: sk, hash: remoteHash });
}

async function push(key: CryptoKey, userId: string) {
  const sb = supabase();
  const states = new Map((await db.syncState.toArray()).map((s) => [s.key, s.hash]));
  const upserts: { row: Record<string, unknown>; sk: string; hash: string }[] = [];
  const deletes: { kind: Kind; id: string; sk: string }[] = [];
  for (const k of SYNCED) {
    const key = pk(k);
    const seen = new Set<string>();
    await table(k).each((row: Record<string, unknown>) => {
      const id = String(row[key]);
      const sk = stateKey(k, id);
      seen.add(sk);
      const h = hashValue(row);
      if (states.get(sk) !== h) upserts.push({ row: { __kind: k, __id: id, ...row }, sk, hash: h });
    });
    const prefix = `${k}|`;
    for (const sk of states.keys()) if (sk.startsWith(prefix) && !seen.has(sk)) deletes.push({ kind: k, id: sk.slice(prefix.length), sk });
  }

  for (let i = 0; i < upserts.length; i += 50) {
    const batch = upserts.slice(i, i + 50);
    const rows = await Promise.all(
      batch.map(async ({ row }) => {
        const { __kind, __id, ...data } = row as { __kind: Kind; __id: string } & Record<string, unknown>;
        const { payload, iv } = await encryptJson(key, data);
        return { user_id: userId, kind: __kind, id: __id, payload, iv, deleted: false, words: __kind === 'projects' ? Number(data.wordCount) || 0 : 0 };
      }),
    );
    const { error } = await sb.from('records').upsert(rows, { onConflict: 'user_id,kind,id' });
    if (error) throw new Error(error.message);
    await db.syncState.bulkPut(batch.map((b) => ({ key: b.sk, hash: b.hash })));
  }
  for (let i = 0; i < deletes.length; i += 100) {
    const batch = deletes.slice(i, i + 100);
    const { error } = await sb.from('records').upsert(
      batch.map((d) => ({ user_id: userId, kind: d.kind, id: d.id, payload: null, iv: null, deleted: true, words: 0 })),
      { onConflict: 'user_id,kind,id' },
    );
    if (error) throw new Error(error.message);
    await db.syncState.bulkDelete(batch.map((d) => d.sk));
  }
}

/** Wires database hooks and background triggers. Call once at startup. */
export function startSyncEngine() {
  for (const k of SYNCED) {
    const t = table(k);
    t.hook('creating', () => scheduleSync());
    t.hook('updating', () => scheduleSync());
    t.hook('deleting', () => scheduleSync());
  }
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void syncNow();
    else scheduleSync(500);
  });
  window.setInterval(() => void syncNow(), 60_000);
  useCloud.subscribe((s, prev) => {
    if (s.status === 'ready' && prev.status !== 'ready') scheduleSync(300);
  });
}
