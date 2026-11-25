// Data access layer. All writes go through here so a future sync backend can hook in at one place.
import { nanoid } from 'nanoid';
import { db, PROJECT_TABLES } from './db';
import type {
  Chapter,
  Entity,
  EntityType,
  ID,
  LoreSection,
  Note,
  PlotCard,
  PlotThread,
  Project,
  Relationship,
  Scene,
  Snapshot,
  TimelineEvent,
} from './types';
import { DEFAULT_LORE_SECTIONS } from '@/lib/labels';
import { countChars, countWords, htmlToText } from '@/lib/text';

export const newId = () => nanoid(12);
const now = () => Date.now();

// ───────────────────────── Projects ─────────────────────────

export type NewProjectInput = Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'wordCount'>> & { title: string };

export async function createProject(input: NewProjectInput, lang: 'ar' | 'en' = 'ar'): Promise<Project> {
  const t = now();
  const project: Project = {
    id: newId(),
    title: input.title.trim() || (lang === 'ar' ? 'رواية بلا عنوان' : 'Untitled novel'),
    author: input.author ?? '',
    description: input.description ?? '',
    genre: input.genre ?? '',
    subgenre: input.subgenre ?? '',
    premise: input.premise ?? '',
    world: input.world ?? '',
    language: input.language ?? lang,
    cover: input.cover,
    status: input.status ?? 'idea',
    targetWords: input.targetWords ?? 80000,
    startDate: input.startDate,
    targetDate: input.targetDate,
    archived: false,
    createdAt: t,
    updatedAt: t,
    lastOpenedAt: t,
    wordCount: 0,
  };
  await db.transaction('rw', [db.projects, db.loreSections, db.chapters, db.scenes, db.sceneTexts], async () => {
    await db.projects.add(project);
    await db.loreSections.bulkAdd(
      DEFAULT_LORE_SECTIONS.map((s, i) => ({ id: newId(), projectId: project.id, key: s.key, name: s.label[lang], order: i })),
    );
    const ch = await createChapter(project.id, lang === 'ar' ? 'الفصل الأول' : 'Chapter One');
    const firstScene = await db.scenes.where('chapterId').equals(ch.id).first();
    if (firstScene) await db.projects.update(project.id, { lastSceneId: firstScene.id });
  });
  return project;
}

export const updateProject = (id: ID, patch: Partial<Project>) => db.projects.update(id, { ...patch, updatedAt: now() });

export async function touchProject(id: ID, sceneId?: ID) {
  await db.projects.update(id, { lastOpenedAt: now(), ...(sceneId ? { lastSceneId: sceneId } : {}) });
}

export async function deleteProject(id: ID) {
  await db.transaction('rw', [db.projects, ...PROJECT_TABLES.map((t) => db[t])], async () => {
    for (const t of PROJECT_TABLES) await db[t].where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

export async function recomputeProjectWords(projectId: ID) {
  let total = 0;
  await db.scenes.where('projectId').equals(projectId).each((s) => (total += s.wordCount));
  await db.projects.update(projectId, { wordCount: total });
  return total;
}

// ───────────────────────── Project bundle (export / import / clone) ─────────────────────────

export const BUNDLE_FORMAT = 'novelist-studio/project';
export const BUNDLE_VERSION = 1;

export interface ProjectBundle {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt: string;
  project: Project;
  tables: Partial<Record<(typeof PROJECT_TABLES)[number], unknown[]>>;
}

export async function exportProjectBundle(projectId: ID, opts: { includeHistory?: boolean } = {}): Promise<ProjectBundle> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('Project not found');
  const tables: ProjectBundle['tables'] = {};
  for (const t of PROJECT_TABLES) {
    if (t === 'snapshots' && opts.includeHistory === false) continue;
    tables[t] = await db[t].where('projectId').equals(projectId).toArray();
  }
  return { format: BUNDLE_FORMAT, version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), project, tables };
}

/** Fields across tables that reference other records by id. */
const ID_FIELDS = new Set([
  'chapterId', 'sceneId', 'locationId', 'povId', 'sectionId', 'fromId', 'toId', 'threadId', 'payoffId', 'lastSceneId',
]);
const ID_ARRAY_FIELDS = new Set(['characterIds', 'chapterIds', 'sceneIds', 'entityIds', 'afterIds']);
const ENTITY_REF_FIELDS = new Set(['firstScene', 'lastScene', 'deathScene']);

/**
 * Imports a bundle as a brand new project. Every id is remapped so a bundle can be imported
 * any number of times (this is also how "duplicate project" works) without collisions.
 */
export async function importProjectBundle(bundle: ProjectBundle, opts: { titleSuffix?: string } = {}): Promise<ID> {
  if (bundle?.format !== BUNDLE_FORMAT || !bundle.project) throw new Error('INVALID_BUNDLE');
  const map = new Map<string, string>();
  const remap = (id: unknown) => {
    if (typeof id !== 'string' || !id) return id;
    if (!map.has(id)) map.set(id, newId());
    return map.get(id)!;
  };
  // First pass: allocate ids for every record so references resolve regardless of table order.
  remap(bundle.project.id);
  for (const rows of Object.values(bundle.tables)) for (const r of rows ?? []) remap((r as { id?: string }).id);

  const fix = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...row };
    for (const [k, v] of Object.entries(out)) {
      if (k === 'id' || k === 'projectId') out[k] = remap(v);
      else if (ID_FIELDS.has(k)) out[k] = typeof v === 'string' && map.has(v) ? map.get(v) : undefined;
      else if (ID_ARRAY_FIELDS.has(k) && Array.isArray(v)) out[k] = v.filter((x) => map.has(x)).map((x) => map.get(x));
      else if (k === 'fields' && v && typeof v === 'object') {
        const f = { ...(v as Record<string, string>) };
        for (const rk of ENTITY_REF_FIELDS) if (f[rk] && map.has(f[rk])) f[rk] = map.get(f[rk])!;
        out[k] = f;
      }
    }
    return out;
  };

  const project = fix(bundle.project as unknown as Record<string, unknown>) as unknown as Project;
  project.title = project.title + (opts.titleSuffix ?? '');
  project.updatedAt = now();
  project.archived = false;
  const newProjectId = project.id;

  await db.transaction('rw', [db.projects, ...PROJECT_TABLES.map((t) => db[t])], async () => {
    await db.projects.add(project);
    for (const t of PROJECT_TABLES) {
      const rows = (bundle.tables[t] ?? []) as Record<string, unknown>[];
      if (!rows.length) continue;
      const fixed = rows.map((r) => {
        const f = fix(r);
        f.projectId = newProjectId;
        if (t === 'dailyStats') f.key = `${newProjectId}|${f.date}`;
        return f;
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db[t] as any).bulkPut(fixed);
    }
  });
  await recomputeProjectWords(newProjectId);
  return newProjectId;
}

export async function duplicateProject(projectId: ID, suffix: string) {
  const bundle = await exportProjectBundle(projectId, { includeHistory: false });
  bundle.tables.dailyStats = [];
  bundle.tables.sessions = [];
  return importProjectBundle(bundle, { titleSuffix: suffix });
}

// ───────────────────────── Chapters ─────────────────────────

export async function getOrderedChapters(projectId: ID) {
  return db.chapters.where('[projectId+order]').between([projectId, -Infinity], [projectId, Infinity]).toArray();
}

export async function getOrderedScenes(chapterId: ID) {
  return db.scenes.where('[chapterId+order]').between([chapterId, -Infinity], [chapterId, Infinity]).toArray();
}

/** All scenes of a project in reading order, with their chapter. */
export async function getManuscript(projectId: ID) {
  const chapters = await getOrderedChapters(projectId);
  const scenes = await db.scenes.where('projectId').equals(projectId).toArray();
  const byChapter = new Map<ID, Scene[]>();
  for (const s of scenes) {
    if (!byChapter.has(s.chapterId)) byChapter.set(s.chapterId, []);
    byChapter.get(s.chapterId)!.push(s);
  }
  return chapters.map((c) => ({ chapter: c, scenes: (byChapter.get(c.id) ?? []).sort((a, b) => a.order - b.order) }));
}

export async function createChapter(projectId: ID, title: string, afterOrder?: number): Promise<Chapter> {
  const t = now();
  const chapters = await getOrderedChapters(projectId);
  let order = chapters.length ? chapters[chapters.length - 1].order + 1 : 0;
  if (afterOrder !== undefined) {
    const next = chapters.find((c) => c.order > afterOrder);
    order = next ? (afterOrder + next.order) / 2 : afterOrder + 1;
  }
  const chapter: Chapter = { id: newId(), projectId, order, title, summary: '', status: 'draft', createdAt: t, updatedAt: t };
  await db.chapters.add(chapter);
  await createScene(projectId, chapter.id, '');
  return chapter;
}

export const updateChapter = (id: ID, patch: Partial<Chapter>) => db.chapters.update(id, { ...patch, updatedAt: now() });

export async function deleteChapter(id: ID) {
  const ch = await db.chapters.get(id);
  if (!ch) return;
  await db.transaction('rw', [db.chapters, db.scenes, db.sceneTexts, db.events], async () => {
    const sceneIds = (await db.scenes.where('chapterId').equals(id).primaryKeys()) as ID[];
    await db.scenes.bulkDelete(sceneIds);
    await db.sceneTexts.bulkDelete(sceneIds);
    // History is kept so a deleted chapter can still be recovered from the project history page.
    await db.events.where('projectId').equals(ch.projectId).modify((e) => {
      if (e.chapterId === id) e.chapterId = undefined;
      if (e.sceneId && sceneIds.includes(e.sceneId)) e.sceneId = undefined;
    });
    await db.chapters.delete(id);
  });
  await recomputeProjectWords(ch.projectId);
}

export async function reorderChapters(ids: ID[]) {
  await db.transaction('rw', db.chapters, async () => {
    for (let i = 0; i < ids.length; i++) await db.chapters.update(ids[i], { order: i });
  });
}

export async function duplicateChapter(id: ID, suffix: string) {
  const ch = await db.chapters.get(id);
  if (!ch) return;
  const scenes = await getOrderedScenes(id);
  const chapters = await getOrderedChapters(ch.projectId);
  const idx = chapters.findIndex((c) => c.id === id);
  const t = now();
  const copy: Chapter = { ...ch, id: newId(), title: ch.title + suffix, createdAt: t, updatedAt: t };
  const texts = await db.sceneTexts.bulkGet(scenes.map((s) => s.id));
  await db.transaction('rw', db.chapters, db.scenes, db.sceneTexts, async () => {
    await db.chapters.add(copy);
    for (let i = 0; i < scenes.length; i++) {
      const sid = newId();
      await db.scenes.add({ ...scenes[i], id: sid, chapterId: copy.id, createdAt: t, updatedAt: t });
      await db.sceneTexts.add({ id: sid, projectId: ch.projectId, html: texts[i]?.html ?? '' });
    }
    const ids = chapters.map((c) => c.id);
    ids.splice(idx + 1, 0, copy.id);
    for (let i = 0; i < ids.length; i++) await db.chapters.update(ids[i], { order: i });
  });
  await recomputeProjectWords(ch.projectId);
  return copy;
}

/** Splits a chapter at a scene: that scene and everything after it move into a new chapter. */
export async function splitChapter(chapterId: ID, atSceneId: ID, newTitle: string) {
  const ch = await db.chapters.get(chapterId);
  if (!ch) return;
  const scenes = await getOrderedScenes(chapterId);
  const idx = scenes.findIndex((s) => s.id === atSceneId);
  if (idx <= 0) throw new Error('SPLIT_FIRST_SCENE');
  const t = now();
  const chapters = await getOrderedChapters(ch.projectId);
  const pos = chapters.findIndex((c) => c.id === chapterId);
  const newCh: Chapter = { id: newId(), projectId: ch.projectId, order: 0, title: newTitle, summary: '', status: ch.status, createdAt: t, updatedAt: t };
  await db.transaction('rw', db.chapters, db.scenes, async () => {
    await db.chapters.add(newCh);
    const moving = scenes.slice(idx);
    for (let i = 0; i < moving.length; i++) await db.scenes.update(moving[i].id, { chapterId: newCh.id, order: i });
    const ids = chapters.map((c) => c.id);
    ids.splice(pos + 1, 0, newCh.id);
    for (let i = 0; i < ids.length; i++) await db.chapters.update(ids[i], { order: i });
  });
  return newCh;
}

/** Merges `sourceId` into `targetId` (scenes appended, summaries joined), then removes the source chapter. */
export async function mergeChapters(targetId: ID, sourceId: ID) {
  const [target, source] = await Promise.all([db.chapters.get(targetId), db.chapters.get(sourceId)]);
  if (!target || !source) return;
  const [ts, ss] = await Promise.all([getOrderedScenes(targetId), getOrderedScenes(sourceId)]);
  await db.transaction('rw', db.chapters, db.scenes, db.events, async () => {
    for (let i = 0; i < ss.length; i++) await db.scenes.update(ss[i].id, { chapterId: targetId, order: ts.length + i });
    await db.events.where('projectId').equals(target.projectId).modify((e) => {
      if (e.chapterId === sourceId) e.chapterId = targetId;
    });
    await db.chapters.update(targetId, {
      summary: [target.summary, source.summary].filter(Boolean).join('\n\n'),
      updatedAt: now(),
    });
    await db.chapters.delete(sourceId);
  });
}

// ───────────────────────── Scenes ─────────────────────────

export async function createScene(projectId: ID, chapterId: ID, title: string, init: Partial<Scene> & { content?: string } = {}): Promise<Scene> {
  const { content = '', ...meta } = init;
  const t = now();
  const scenes = await getOrderedScenes(chapterId);
  const scene: Scene = {
    id: newId(),
    projectId,
    chapterId,
    order: scenes.length ? scenes[scenes.length - 1].order + 1 : 0,
    title,
    synopsis: '',
    wordCount: 0,
    charCount: 0,
    characterIds: [],
    storyTime: '',
    goal: '',
    conflict: '',
    outcome: '',
    status: 'draft',
    createdAt: t,
    updatedAt: t,
    ...meta,
  };
  if (content) {
    const text = htmlToText(content);
    scene.wordCount = countWords(text);
    scene.charCount = countChars(text);
  }
  await db.transaction('rw', db.scenes, db.sceneTexts, async () => {
    await db.scenes.add(scene);
    await db.sceneTexts.put({ id: scene.id, projectId, html: content });
  });
  return scene;
}

export const updateSceneMeta = (id: ID, patch: Partial<Scene>) => db.scenes.update(id, { ...patch, updatedAt: now() });

export async function deleteScene(id: ID) {
  const s = await db.scenes.get(id);
  if (!s) return;
  await db.transaction('rw', db.scenes, db.sceneTexts, db.events, async () => {
    await db.scenes.delete(id);
    await db.sceneTexts.delete(id);
    await db.events.where('sceneId').equals(id).modify({ sceneId: undefined });
  });
  await recomputeProjectWords(s.projectId);
}

export async function duplicateScene(id: ID, suffix: string) {
  const s = await db.scenes.get(id);
  if (!s) return;
  const siblings = await getOrderedScenes(s.chapterId);
  const idx = siblings.findIndex((x) => x.id === id);
  const t = now();
  const copy: Scene = { ...s, id: newId(), title: (s.title || '') + suffix, createdAt: t, updatedAt: t };
  const text = await getSceneHtml(id);
  await db.transaction('rw', db.scenes, db.sceneTexts, async () => {
    await db.scenes.add(copy);
    await db.sceneTexts.add({ id: copy.id, projectId: s.projectId, html: text });
    const ids = siblings.map((x) => x.id);
    ids.splice(idx + 1, 0, copy.id);
    for (let i = 0; i < ids.length; i++) await db.scenes.update(ids[i], { order: i });
  });
  await recomputeProjectWords(s.projectId);
  return copy;
}

/** Persists the order of scenes per chapter (supports moving scenes between chapters). */
export async function reorderScenes(layout: { chapterId: ID; sceneIds: ID[] }[]) {
  await db.transaction('rw', db.scenes, async () => {
    for (const { chapterId, sceneIds } of layout)
      for (let i = 0; i < sceneIds.length; i++) await db.scenes.update(sceneIds[i], { chapterId, order: i });
  });
}

/** Splits a scene's HTML at a block boundary into a new following scene. */
export async function splitScene(id: ID, beforeHtml: string, afterHtml: string, newTitle: string) {
  const s = await db.scenes.get(id);
  if (!s) return;
  await saveSceneContent(id, beforeHtml, { snapshot: true, label: 'قبل التقسيم / Before split' });
  const siblings = await getOrderedScenes(s.chapterId);
  const idx = siblings.findIndex((x) => x.id === id);
  const created = await createScene(s.projectId, s.chapterId, newTitle, {
    content: afterHtml,
    characterIds: [...s.characterIds],
    locationId: s.locationId,
    status: s.status,
  });
  const ids = siblings.map((x) => x.id);
  ids.splice(idx + 1, 0, created.id);
  await reorderScenes([{ chapterId: s.chapterId, sceneIds: ids }]);
  await recomputeProjectWords(s.projectId);
  return created;
}

// ───────────────────────── Saving, history and statistics ─────────────────────────

const AUTO_SNAPSHOT_INTERVAL = 10 * 60 * 1000; // at most one automatic version per scene every 10 minutes
const MAX_AUTO_SNAPSHOTS = 60;
const SESSION_GAP = 5 * 60 * 1000;
const MAX_ACTIVE_GAP = 60 * 1000;

let activeSession: { id: ID; projectId: ID; start: number; last: number; added: number; removed: number } | null = null;

async function trackWriting(projectId: ID, delta: number) {
  const t = now();
  const date = new Date(t);
  const key = `${projectId}|${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let gapSeconds = 0;
  if (!activeSession || activeSession.projectId !== projectId || t - activeSession.last > SESSION_GAP) {
    activeSession = { id: newId(), projectId, start: t, last: t, added: 0, removed: 0 };
  } else {
    gapSeconds = Math.round(Math.min(t - activeSession.last, MAX_ACTIVE_GAP) / 1000);
  }
  activeSession.last = t;
  if (delta > 0) activeSession.added += delta;
  else activeSession.removed += -delta;

  const existing = await db.dailyStats.get(key);
  await db.dailyStats.put({
    key,
    projectId,
    date: key.split('|')[1],
    added: (existing?.added ?? 0) + Math.max(0, delta),
    removed: (existing?.removed ?? 0) + Math.max(0, -delta),
    seconds: (existing?.seconds ?? 0) + gapSeconds,
  });
  await db.sessions.put({
    id: activeSession.id,
    projectId,
    start: activeSession.start,
    end: t,
    added: activeSession.added,
    removed: activeSession.removed,
  });
}

export interface SaveOptions {
  snapshot?: boolean | 'auto';
  label?: string;
  kind?: Snapshot['kind'];
  track?: boolean;
}

/** Saves scene text, updates counts and statistics, and keeps automatic version history. */
export async function getSceneHtml(id: ID) {
  return (await db.sceneTexts.get(id))?.html ?? '';
}

/** Saves scene text, updates counts and statistics, and keeps automatic version history. */
export async function saveSceneContent(id: ID, html: string, opts: SaveOptions = { snapshot: 'auto', track: true }) {
  const scene = await db.scenes.get(id);
  if (!scene) return;
  const prevHtml = await getSceneHtml(id);
  if (prevHtml === html && !opts.snapshot) return scene;
  const text = htmlToText(html);
  const wordCount = countWords(text);
  const charCount = countChars(text);
  const t = now();

  await db.transaction('rw', [db.scenes, db.sceneTexts, db.snapshots, db.projects, db.dailyStats, db.sessions], async () => {
    // Version history: snapshot the *previous* content so the old state is always recoverable.
    if (opts.snapshot === true) {
      await addSnapshot(scene, prevHtml, opts.label ?? '', opts.kind ?? 'manual');
    } else if (opts.snapshot === 'auto' && prevHtml && prevHtml !== html) {
      const last = await db.snapshots.where('[sceneId+createdAt]').between([id, -Infinity], [id, Infinity]).last();
      if (!last || t - last.createdAt > AUTO_SNAPSHOT_INTERVAL) await addSnapshot(scene, prevHtml, '', 'auto');
    }
    await db.sceneTexts.put({ id, projectId: scene.projectId, html });
    await db.scenes.update(id, { wordCount, charCount, updatedAt: t });
    const delta = wordCount - scene.wordCount;
    const p = await db.projects.get(scene.projectId);
    if (p) await db.projects.update(p.id, { wordCount: Math.max(0, p.wordCount + delta), updatedAt: t, lastSceneId: id });
    if (opts.track !== false && delta !== 0) await trackWriting(scene.projectId, delta);
  });
  return db.scenes.get(id);
}

async function addSnapshot(scene: Scene, content: string, label: string, kind: Snapshot['kind']) {
  if (!content && kind !== 'manual') return;
  await db.snapshots.add({
    id: newId(),
    projectId: scene.projectId,
    sceneId: scene.id,
    content,
    wordCount: countWords(htmlToText(content)),
    label,
    kind,
    createdAt: now(),
  });
  if (kind === 'auto') {
    const autos = await db.snapshots.where('sceneId').equals(scene.id).filter((s) => s.kind === 'auto').sortBy('createdAt');
    if (autos.length > MAX_AUTO_SNAPSHOTS) await db.snapshots.bulkDelete(autos.slice(0, autos.length - MAX_AUTO_SNAPSHOTS).map((s) => s.id));
  }
}

/** Creates a named checkpoint of the current text. */
export async function createCheckpoint(sceneId: ID, label: string) {
  const s = await db.scenes.get(sceneId);
  if (!s) return;
  await addSnapshot(s, await getSceneHtml(sceneId), label, 'manual');
}

/** Restores an old version. The current text is saved first, so restoring never loses anything. */
export async function restoreSnapshot(snapshotId: ID, label: string) {
  const snap = await db.snapshots.get(snapshotId);
  if (!snap) return;
  const scene = await db.scenes.get(snap.sceneId);
  if (!scene) {
    throw new Error('SCENE_DELETED');
  }
  await saveSceneContent(snap.sceneId, snap.content, { snapshot: true, kind: 'pre-restore', label, track: false });
}

// ───────────────────────── Bible (characters, locations, objects, lore) ─────────────────────────

export async function createEntity(projectId: ID, type: EntityType, name: string, init: Partial<Entity> = {}) {
  const t = now();
  const e: Entity = { id: newId(), projectId, type, name, fields: {}, tags: [], createdAt: t, updatedAt: t, ...init };
  await db.entities.add(e);
  return e;
}
export const updateEntity = (id: ID, patch: Partial<Entity>) => db.entities.update(id, { ...patch, updatedAt: now() });
export async function deleteEntity(id: ID) {
  await db.transaction('rw', [db.entities, db.relationships, db.scenes, db.events, db.plotCards, db.plotThreads], async () => {
    await db.entities.delete(id);
    await db.relationships.where('fromId').equals(id).delete();
    await db.relationships.where('toId').equals(id).delete();
    const strip = <T extends { characterIds: ID[] }>(r: T) => {
      r.characterIds = r.characterIds.filter((x) => x !== id);
    };
    await db.scenes.toCollection().modify((s) => {
      strip(s);
      if (s.locationId === id) s.locationId = undefined;
      if (s.povId === id) s.povId = undefined;
    });
    await db.events.toCollection().modify((e) => {
      strip(e);
      if (e.locationId === id) e.locationId = undefined;
    });
    await db.plotCards.toCollection().modify(strip);
    await db.plotThreads.toCollection().modify(strip);
  });
}

export async function createLoreSection(projectId: ID, name: string) {
  const count = await db.loreSections.where('projectId').equals(projectId).count();
  const s: LoreSection = { id: newId(), projectId, name, order: count };
  await db.loreSections.add(s);
  return s;
}
export async function deleteLoreSection(id: ID) {
  await db.transaction('rw', db.loreSections, db.entities, async () => {
    await db.entities.where('sectionId').equals(id).delete();
    await db.loreSections.delete(id);
  });
}

export async function addRelationship(r: Omit<Relationship, 'id'>) {
  const rel = { ...r, id: newId() };
  await db.relationships.add(rel);
  return rel;
}

// ───────────────────────── Timeline, plot, notes ─────────────────────────

export async function createEvent(projectId: ID, init: Partial<TimelineEvent>) {
  const t = now();
  const all = await db.events.where('projectId').equals(projectId).toArray();
  const ev: TimelineEvent = {
    id: newId(),
    projectId,
    title: '',
    description: '',
    dateLabel: '',
    timeLabel: '',
    chronoOrder: all.length ? Math.max(...all.map((e) => e.chronoOrder)) + 1 : 0,
    characterIds: [],
    afterIds: [],
    createdAt: t,
    updatedAt: t,
    ...init,
  };
  await db.events.add(ev);
  return ev;
}
export const updateEvent = (id: ID, patch: Partial<TimelineEvent>) => db.events.update(id, { ...patch, updatedAt: now() });
export async function deleteEvent(id: ID) {
  await db.transaction('rw', db.events, async () => {
    await db.events.delete(id);
    await db.events.toCollection().modify((e) => {
      e.afterIds = e.afterIds.filter((x) => x !== id);
    });
  });
}

export async function createPlotCard(projectId: ID, init: Partial<PlotCard>) {
  const t = now();
  const card: PlotCard = {
    id: newId(),
    projectId,
    title: '',
    description: '',
    stage: 'setup',
    order: t,
    characterIds: [],
    chapterIds: [],
    sceneIds: [],
    foreshadow: false,
    createdAt: t,
    updatedAt: t,
    ...init,
  };
  await db.plotCards.add(card);
  return card;
}
export const updatePlotCard = (id: ID, patch: Partial<PlotCard>) => db.plotCards.update(id, { ...patch, updatedAt: now() });

export async function createThread(projectId: ID, name: string, color: string) {
  const count = await db.plotThreads.where('projectId').equals(projectId).count();
  const th: PlotThread = { id: newId(), projectId, name, description: '', color, characterIds: [], order: count };
  await db.plotThreads.add(th);
  return th;
}
export async function deleteThread(id: ID) {
  await db.transaction('rw', db.plotThreads, db.plotCards, async () => {
    await db.plotThreads.delete(id);
    await db.plotCards.where('projectId').notEqual('').modify((c) => {
      if (c.threadId === id) c.threadId = undefined;
    });
  });
}

export async function createNote(projectId: ID, init: Partial<Note>) {
  const t = now();
  const n: Note = { id: newId(), projectId, type: 'idea', title: '', content: '', tags: [], pinned: false, resolved: false, createdAt: t, updatedAt: t, ...init };
  await db.notes.add(n);
  return n;
}
export const updateNote = (id: ID, patch: Partial<Note>) => db.notes.update(id, { ...patch, updatedAt: now() });
