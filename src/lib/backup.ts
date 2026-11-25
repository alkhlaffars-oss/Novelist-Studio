// Full-library backups: downloadable JSON files plus rolling automatic copies kept inside IndexedDB.
import { db } from '@/db/db';
import { exportProjectBundle, importProjectBundle, newId, type ProjectBundle } from '@/db/repo';
import { useSettings } from '@/store/settings';

export const LIBRARY_FORMAT = 'novelist-studio/library';

export interface LibraryBackup {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  createdAt: string;
  settings?: unknown;
  projects: ProjectBundle[];
}

export async function buildLibraryBackup(opts: { includeHistory?: boolean } = {}): Promise<LibraryBackup> {
  const ids = (await db.projects.toCollection().primaryKeys()) as string[];
  const projects: ProjectBundle[] = [];
  for (const id of ids) projects.push(await exportProjectBundle(id, opts));
  const { set: _ignored, ...settings } = useSettings.getState();
  void _ignored;
  return { format: LIBRARY_FORMAT, version: 1, createdAt: new Date().toISOString(), settings, projects };
}

/** Restores a backup file. Restored projects are added next to existing ones — nothing is overwritten. */
export async function restoreFromFile(json: unknown): Promise<number> {
  const data = json as { format?: string; projects?: ProjectBundle[] };
  if (data?.format === LIBRARY_FORMAT && Array.isArray(data.projects)) {
    for (const p of data.projects) await importProjectBundle(p);
    return data.projects.length;
  }
  if (data?.format === 'novelist-studio/project') {
    await importProjectBundle(data as unknown as ProjectBundle);
    return 1;
  }
  throw new Error('INVALID_BACKUP');
}

const AUTO_INTERVAL = 24 * 60 * 60 * 1000;

/** Keeps a rolling set of automatic local backups (once a day while the app is used). */
export async function runAutoBackupIfDue(force = false) {
  const { backup } = useSettings.getState();
  if (!backup.auto && !force) return;
  const last = await db.backups.orderBy('createdAt').last();
  if (!force && last && Date.now() - last.createdAt < AUTO_INTERVAL) return;
  if ((await db.projects.count()) === 0) return;
  const data = JSON.stringify(await buildLibraryBackup({ includeHistory: false }));
  await db.backups.add({ id: newId(), createdAt: Date.now(), size: data.length, data });
  const all = await db.backups.orderBy('createdAt').toArray();
  const keep = Math.max(1, backup.keep);
  if (all.length > keep) await db.backups.bulkDelete(all.slice(0, all.length - keep).map((b) => b.id));
}

export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  return JSON.parse(text);
}
