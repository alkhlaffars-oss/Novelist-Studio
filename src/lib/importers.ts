// Turns DOCX / Markdown / TXT manuscripts into chapters and scenes.
import { db } from '@/db/db';
import { createProject, createScene, newId, recomputeProjectWords } from '@/db/repo';
import { escapeHtml, isRtlText } from './text';

export interface ParsedManuscript {
  title: string;
  chapters: { title: string; scenes: string[] }[];
}

const CHAPTER_RE = /^\s*(الفصل|فصل|الجزء|الباب|chapter|part|prologue|epilogue|مقدمة|تمهيد|خاتمة)(\s+[\p{L}\p{N}\-–—:.]+)*\s*$/iu;
const SCENE_BREAK_RE = /^\s*((\*\s*){3,}|(#\s*){1,3}|([-–—]\s*){3,}|([✦◆•·]\s*){3,}|(~\s*){3,})\s*$/;
const ALLOWED = new Set(['P', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'BR', 'MARK']);

function cleanNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(cleanNode).join('');
  let tag = el.tagName;
  if (tag === 'B') tag = 'STRONG';
  if (tag === 'I') tag = 'EM';
  if (/^H[4-6]$/.test(tag)) tag = 'H3';
  if (tag === 'DIV') tag = 'P';
  if (!ALLOWED.has(tag) && tag !== 'P') return inner;
  if (tag === 'BR') return '<br>';
  const t = tag.toLowerCase();
  return `<${t}>${inner}</${t}>`;
}

/** Splits HTML into chapters (h1/h2 or "Chapter N" lines) and scenes (hr or *** lines). */
export function splitHtml(html: string, fallbackTitle: string, chapterWord: string): ParsedManuscript {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const chapters: ParsedManuscript['chapters'] = [];
  let title = '';
  let current: { title: string; scenes: string[] } | null = null;
  let scene = '';
  const flushScene = () => {
    if (scene.replace(/<[^>]+>/g, '').trim()) {
      if (!current) current = { title: `${chapterWord} 1`, scenes: [] };
      current.scenes.push(scene);
    }
    scene = '';
  };
  const startChapter = (t: string) => {
    flushScene();
    if (current) chapters.push(current);
    current = { title: t, scenes: [] };
  };
  const blocks = Array.from(doc.body.children);
  for (const el of blocks) {
    const text = (el.textContent ?? '').trim();
    if (el.tagName === 'H1' && !title && chapters.length === 0 && !current) {
      // A single leading H1 followed by H2 chapters is treated as the book title.
      const hasH2 = doc.body.querySelector('h2');
      if (hasH2) {
        title = text;
        continue;
      }
    }
    if (el.tagName === 'H1' || el.tagName === 'H2' || (el.tagName === 'P' && text.length < 60 && CHAPTER_RE.test(text))) {
      startChapter(text);
      continue;
    }
    if (el.tagName === 'HR' || (text.length < 12 && SCENE_BREAK_RE.test(text))) {
      flushScene();
      continue;
    }
    if (!text && el.tagName === 'P') continue;
    scene += cleanNode(el);
  }
  flushScene();
  if (current) chapters.push(current);
  const nonEmpty = chapters;
  for (const c of nonEmpty) if (!c.scenes.length) c.scenes.push('');
  return { title: title || fallbackTitle, chapters: nonEmpty.length ? nonEmpty : [{ title: `${chapterWord} 1`, scenes: [''] }] };
}

export function txtToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const md = /^#{1,2}\s+(.+)$/.exec(l);
      if (md) return `<h2>${escapeHtml(md[1])}</h2>`;
      if (l.length < 60 && CHAPTER_RE.test(l)) return `<h2>${escapeHtml(l)}</h2>`;
      if (SCENE_BREAK_RE.test(l)) return '<hr>';
      return `<p>${escapeHtml(l)}</p>`;
    })
    .join('');
}

export async function parseManuscriptFile(file: File, chapterWord: string): Promise<ParsedManuscript> {
  const base = file.name.replace(/\.[^.]+$/, '');
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'docx') {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.convertToHtml(
      { arrayBuffer: await file.arrayBuffer() },
      { styleMap: ["p[style-name='Title'] => h1:fresh", "p[style-name='Heading 1'] => h2:fresh", "p[style-name='Heading 2'] => h2:fresh"] },
    );
    return splitHtml(value, base, chapterWord);
  }
  if (ext === 'md' || ext === 'markdown') {
    const { marked } = await import('marked');
    const html = await marked.parse(await file.text(), { gfm: true, breaks: false });
    return splitHtml(html, base, chapterWord);
  }
  if (ext === 'txt' || ext === 'text') return splitHtml(txtToHtml(await file.text()), base, chapterWord);
  throw new Error('UNSUPPORTED_FILE');
}

/** Creates a complete project from a parsed manuscript. */
export async function createProjectFromManuscript(m: ParsedManuscript, lang: 'ar' | 'en') {
  const sample = m.chapters.flatMap((c) => c.scenes).join(' ').slice(0, 2000);
  const project = await createProject({ title: m.title, status: 'writing', language: isRtlText(sample) || !sample ? 'ar' : 'en' }, lang);
  // Remove the default empty chapter created with every new project.
  const defaults = await db.chapters.where('projectId').equals(project.id).toArray();
  for (const d of defaults) {
    await db.scenes.where('chapterId').equals(d.id).delete();
    await db.chapters.delete(d.id);
  }
  const t = Date.now();
  let firstSceneId: string | undefined;
  for (let i = 0; i < m.chapters.length; i++) {
    const c = m.chapters[i];
    const chId = newId();
    await db.chapters.add({ id: chId, projectId: project.id, order: i, title: c.title || `${i + 1}`, summary: '', status: 'draft', createdAt: t, updatedAt: t });
    for (const html of c.scenes) {
      const s = await createScene(project.id, chId, '', { content: html });
      firstSceneId ??= s.id;
    }
  }
  await db.projects.update(project.id, { lastSceneId: firstSceneId });
  await recomputeProjectWords(project.id);
  return project.id;
}
