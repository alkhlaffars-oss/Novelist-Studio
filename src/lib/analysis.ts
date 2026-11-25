// Manuscript indexing helpers shared by the bible, continuity checker, search and AI context.
import { db } from '@/db/db';
import type { Chapter, Entity, Scene } from '@/db/types';
import { getOrderedChapters } from '@/db/repo';
import { findAll, htmlToText } from './text';

export interface IndexedScene {
  scene: Scene;
  chapter: Chapter;
  chapterIndex: number;
  sceneIndex: number; // inside chapter
  position: number; // across the book
  text: string;
}

/** Loads all scenes in reading order with their plain text. */
export async function buildSceneIndex(projectId: string): Promise<IndexedScene[]> {
  const chapters = await getOrderedChapters(projectId);
  const [scenes, texts] = await Promise.all([db.scenes.where('projectId').equals(projectId).toArray(), db.sceneTexts.where('projectId').equals(projectId).toArray()]);
  const textById = new Map(texts.map((t) => [t.id, t.html]));
  const out: IndexedScene[] = [];
  let position = 0;
  chapters.forEach((chapter, chapterIndex) => {
    scenes
      .filter((s) => s.chapterId === chapter.id)
      .sort((a, b) => a.order - b.order)
      .forEach((scene, sceneIndex) => {
        out.push({ scene, chapter, chapterIndex, sceneIndex, position: position++, text: htmlToText(textById.get(scene.id) ?? '') });
      });
  });
  return out;
}

/** Names an entity is referred to by: full name, aliases and (for characters) the first name. */
export function entityNames(e: Entity): string[] {
  const names = new Set<string>();
  const add = (n: string) => {
    const v = n.trim();
    if (v.length >= 2) names.add(v);
  };
  add(e.name);
  for (const a of (e.fields.aliases ?? '').split(/[،,;\n]/)) add(a);
  if (e.type === 'character') {
    const first = e.name.trim().split(/\s+/)[0];
    if (first && first.length >= 3 && first !== e.name.trim()) add(first);
  }
  return [...names];
}

export interface Mention {
  sceneId: string;
  position: number;
  count: number;
  excerpt: string;
}

/** Scenes whose text mentions any of the names (Arabic-normalized, whole word with clitic prefixes). */
export function findMentions(index: IndexedScene[], names: string[]): Mention[] {
  const out: Mention[] = [];
  for (const s of index) {
    let count = 0;
    let first: { start: number; end: number } | undefined;
    for (const n of names) {
      const hits = findAll(s.text, n, { wholeWord: true });
      count += hits.length;
      if (hits[0] && (!first || hits[0].start < first.start)) first = hits[0];
    }
    if (count && first) {
      const a = Math.max(0, first.start - 50);
      out.push({ sceneId: s.scene.id, position: s.position, count, excerpt: (a > 0 ? '…' : '') + s.text.slice(a, first.end + 70).replace(/\s+/g, ' ') + '…' });
    }
  }
  return out;
}

/** Splits text into sentences (Arabic and Latin punctuation). */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?؟…])\s+|\n+/).filter((s) => s.trim());
}

export function sceneLabelOf(s: IndexedScene, sceneWord: string) {
  return `${s.chapter.title} · ${sceneWord} ${s.sceneIndex + 1}${s.scene.title ? ' — ' + s.scene.title : ''}`;
}
