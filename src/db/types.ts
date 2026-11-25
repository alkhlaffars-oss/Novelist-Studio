// Core domain model for Novelist Studio.
// Every record carries `projectId` so a whole project can be exported, cloned or deleted atomically.

export type ID = string;

export type ProjectStatus = 'idea' | 'writing' | 'paused' | 'complete';
export type ChapterStatus = 'idea' | 'draft' | 'revision' | 'complete';

export interface Project {
  id: ID;
  title: string;
  author: string;
  description: string;
  genre: string;
  subgenre: string;
  premise: string;
  world: string;
  language: 'ar' | 'en' | string;
  cover?: string; // data URL (resized on upload)
  status: ProjectStatus;
  targetWords: number;
  startDate?: string; // yyyy-mm-dd
  targetDate?: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  lastSceneId?: ID;
  wordCount: number; // cached total of all scenes
}

export interface Chapter {
  id: ID;
  projectId: ID;
  order: number;
  title: string;
  summary: string;
  status: ChapterStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Scene {
  id: ID;
  projectId: ID;
  chapterId: ID;
  order: number;
  title: string;
  synopsis: string;
  wordCount: number;
  charCount: number;
  characterIds: ID[];
  povId?: ID;
  locationId?: ID;
  storyTime: string;
  goal: string;
  conflict: string;
  outcome: string;
  status: ChapterStatus;
  cursor?: number;
  createdAt: number;
  updatedAt: number;
}

/** Scene text lives in its own table so tree/list queries stay light even for huge novels. */
export interface SceneText {
  id: ID; // same as scene id
  projectId: ID;
  html: string;
}

export type EntityType = 'character' | 'location' | 'object' | 'lore';

export interface Entity {
  id: ID;
  projectId: ID;
  type: EntityType;
  sectionId?: ID; // for lore entries
  name: string;
  fields: Record<string, string>;
  image?: string;
  tags: string[];
  // character map layout
  mapX?: number;
  mapY?: number;
  createdAt: number;
  updatedAt: number;
}

export interface LoreSection {
  id: ID;
  projectId: ID;
  key?: string; // built-in key, absent for custom sections
  name: string;
  order: number;
}

export interface Relationship {
  id: ID;
  projectId: ID;
  fromId: ID;
  toId: ID;
  label: string;
  kind: 'family' | 'love' | 'friend' | 'enemy' | 'ally' | 'work' | 'other';
}

export interface TimelineEvent {
  id: ID;
  projectId: ID;
  title: string;
  description: string;
  dateLabel: string; // free text: "سنة 312 من عهد الملك" or "2024-05-03"
  timeLabel: string;
  chronoOrder: number; // position in in-world chronology
  locationId?: ID;
  characterIds: ID[];
  chapterId?: ID;
  sceneId?: ID;
  afterIds: ID[]; // events that must happen before this one
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export type PlotStage =
  | 'premise'
  | 'setup'
  | 'inciting'
  | 'rising'
  | 'turning'
  | 'midpoint'
  | 'climax'
  | 'resolution'
  | 'ending';

export interface PlotThread {
  id: ID;
  projectId: ID;
  name: string;
  description: string;
  color: string;
  characterIds: ID[];
  order: number;
}

export interface PlotCard {
  id: ID;
  projectId: ID;
  title: string;
  description: string;
  stage: PlotStage;
  threadId?: ID;
  order: number;
  characterIds: ID[];
  chapterIds: ID[];
  sceneIds: ID[];
  foreshadow: boolean; // a setup that needs a payoff
  payoffId?: ID; // card that pays it off
  createdAt: number;
  updatedAt: number;
}

export type NoteType =
  | 'idea'
  | 'dialogue'
  | 'ending'
  | 'future'
  | 'quote'
  | 'question'
  | 'research'
  | 'unused';

export interface Note {
  id: ID;
  projectId: ID;
  type: NoteType;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Snapshot {
  id: ID;
  projectId: ID;
  sceneId: ID;
  content: string;
  wordCount: number;
  label: string;
  kind: 'auto' | 'manual' | 'pre-restore' | 'pre-ai' | 'conflict' | 'pre-replace';
  createdAt: number;
}

export interface DailyStat {
  key: string; // `${projectId}|${date}`
  projectId: ID;
  date: string; // yyyy-mm-dd (local)
  added: number; // words added
  removed: number;
  seconds: number; // active writing time
}

export interface WritingSession {
  id: ID;
  projectId: ID;
  start: number;
  end: number;
  added: number;
  removed: number;
}

export type IssueKind =
  | 'dead-character'
  | 'first-appearance'
  | 'attribute'
  | 'age'
  | 'timeline-order'
  | 'location-mismatch'
  | 'double-presence'
  | 'unresolved-question'
  | 'foreshadow'
  | 'empty'
  | 'manual'
  | 'ai';

export interface Issue {
  id: ID;
  projectId: ID;
  kind: IssueKind;
  fingerprint: string; // stable id for auto issues so dismissals survive re-runs
  title: string;
  detail: string;
  sceneIds: ID[];
  chapterIds: ID[];
  entityIds: ID[];
  status: 'open' | 'resolved' | 'ignored';
  source: 'auto' | 'manual' | 'ai';
  createdAt: number;
  updatedAt: number;
}

export interface LocalBackup {
  id: ID;
  createdAt: number;
  size: number;
  data: string; // JSON
}

export interface KV {
  key: string;
  value: unknown;
}
