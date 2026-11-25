import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Chapter, Entity, Scene } from '@/db/types';

export interface ManuscriptChapter {
  chapter: Chapter;
  scenes: Scene[];
  words: number;
}

/** Live chapter/scene structure (metadata only — scene text is loaded on demand). */
export function useManuscript(projectId: string | undefined) {
  return useLiveQuery(async () => {
    if (!projectId) return [];
    const [chapters, scenes] = await Promise.all([
      db.chapters.where('[projectId+order]').between([projectId, -Infinity], [projectId, Infinity]).toArray(),
      db.scenes.where('projectId').equals(projectId).toArray(),
    ]);
    const by = new Map<string, Scene[]>();
    for (const s of scenes) {
      if (!by.has(s.chapterId)) by.set(s.chapterId, []);
      by.get(s.chapterId)!.push(s);
    }
    return chapters.map<ManuscriptChapter>((chapter) => {
      const list = (by.get(chapter.id) ?? []).sort((a, b) => a.order - b.order);
      return { chapter, scenes: list, words: list.reduce((a, s) => a + s.wordCount, 0) };
    });
  }, [projectId]);
}

export function useEntities(projectId: string | undefined, type?: Entity['type']) {
  return (
    useLiveQuery(async () => {
      if (!projectId) return [];
      const list = type ? await db.entities.where('[projectId+type]').equals([projectId, type]).toArray() : await db.entities.where('projectId').equals(projectId).toArray();
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }, [projectId, type]) ?? []
  );
}

/** Human label for a scene: "Chapter title · Scene N — title". */
export function sceneLabel(ms: ManuscriptChapter[] | undefined, sceneId: string | undefined, sceneWord: string) {
  if (!ms || !sceneId) return '';
  for (const c of ms) {
    const i = c.scenes.findIndex((s) => s.id === sceneId);
    if (i >= 0) return `${c.chapter.title} · ${sceneWord} ${i + 1}${c.scenes[i].title ? ' — ' + c.scenes[i].title : ''}`;
  }
  return '';
}

/** Reading position of every scene (0-based across the whole book). */
export function scenePositions(ms: ManuscriptChapter[] | undefined) {
  const m = new Map<string, number>();
  let i = 0;
  for (const c of ms ?? []) for (const s of c.scenes) m.set(s.id, i++);
  return m;
}
