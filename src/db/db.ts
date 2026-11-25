import Dexie, { type EntityTable } from 'dexie';
import type {
  Chapter,
  DailyStat,
  Entity,
  Issue,
  KV,
  LocalBackup,
  LoreSection,
  Note,
  PlotCard,
  PlotThread,
  Project,
  Relationship,
  Scene,
  SceneText,
  Snapshot,
  TimelineEvent,
  WritingSession,
} from './types';

export class NovelistDB extends Dexie {
  projects!: EntityTable<Project, 'id'>;
  chapters!: EntityTable<Chapter, 'id'>;
  scenes!: EntityTable<Scene, 'id'>;
  sceneTexts!: EntityTable<SceneText, 'id'>;
  entities!: EntityTable<Entity, 'id'>;
  loreSections!: EntityTable<LoreSection, 'id'>;
  relationships!: EntityTable<Relationship, 'id'>;
  events!: EntityTable<TimelineEvent, 'id'>;
  plotThreads!: EntityTable<PlotThread, 'id'>;
  plotCards!: EntityTable<PlotCard, 'id'>;
  notes!: EntityTable<Note, 'id'>;
  snapshots!: EntityTable<Snapshot, 'id'>;
  dailyStats!: EntityTable<DailyStat, 'key'>;
  sessions!: EntityTable<WritingSession, 'id'>;
  issues!: EntityTable<Issue, 'id'>;
  backups!: EntityTable<LocalBackup, 'id'>;
  kv!: EntityTable<KV, 'key'>;
  syncState!: EntityTable<{ key: string; hash: string }, 'key'>;

  constructor() {
    super('novelist-studio');
    this.version(1).stores({
      projects: 'id, updatedAt, lastOpenedAt, archived',
      chapters: 'id, projectId, [projectId+order]',
      scenes: 'id, projectId, chapterId, [chapterId+order], updatedAt',
      sceneTexts: 'id, projectId',
      entities: 'id, projectId, [projectId+type], sectionId',
      loreSections: 'id, projectId',
      relationships: 'id, projectId, fromId, toId',
      events: 'id, projectId, sceneId',
      plotThreads: 'id, projectId',
      plotCards: 'id, projectId',
      notes: 'id, projectId, updatedAt',
      snapshots: 'id, projectId, sceneId, [sceneId+createdAt], createdAt',
      dailyStats: 'key, projectId, date',
      sessions: 'id, projectId, start',
      issues: 'id, projectId, fingerprint',
      backups: 'id, createdAt',
      kv: 'key',
    });
    // v2: cloud sync bookkeeping (hash of each record as last synced)
    this.version(2).stores({ syncState: 'key' });
  }
}

export const db = new NovelistDB();

/**
 * Database health, used to explain a stuck start instead of showing a blank screen.
 * "blocked" = another tab (often a frozen background tab on phones) still holds the old version open.
 */
export type DbHealth = 'opening' | 'ready' | 'blocked' | 'error';
let health: DbHealth = 'opening';
let healthError = '';
const listeners = new Set<() => void>();
const setHealth = (h: DbHealth, err = '') => {
  health = h;
  healthError = err;
  listeners.forEach((l) => l());
};
export const getDbHealth = () => ({ health, error: healthError });
export const onDbHealth = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
db.on('blocked', () => setHealth('blocked'));
db.on('ready', () => setHealth('ready'));
// When a newer version of the app upgrades the database in another tab, step aside so it is not blocked.
db.on('versionchange', () => {
  db.close();
  setTimeout(() => location.reload(), 300);
  return false;
});
db.open().catch((e) => setHealth('error', String(e?.message ?? e)));

/** Tables that hold project-scoped data (used for export, clone and delete). */
export const PROJECT_TABLES = [
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
  'snapshots',
  'dailyStats',
  'sessions',
  'issues',
] as const;

export type ProjectTable = (typeof PROJECT_TABLES)[number];

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* unsupported */
  }
  return false;
}
