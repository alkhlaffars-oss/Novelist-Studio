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
  }
}

export const db = new NovelistDB();

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
