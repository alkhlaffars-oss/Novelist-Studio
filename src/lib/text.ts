// Text utilities with first-class Arabic support.

const WORD_RE = /[\p{L}\p{N}\p{M}]+(?:['’\-_][\p{L}\p{N}\p{M}]+)*/gu;

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Fast HTML → plain text (keeps paragraph breaks). Safe for large documents. */
export function htmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr[^>]*>/gi, '\n* * *\n')
    .replace(/<\/(p|h[1-6]|li|blockquote|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countWords(text: string): number {
  if (!text) return 0;
  let n = 0;
  WORD_RE.lastIndex = 0;
  while (WORD_RE.exec(text)) n++;
  return n;
}

export function countChars(text: string, withSpaces = true): number {
  return withSpaces ? text.replace(/\n/g, '').length : text.replace(/\s/g, '').length;
}

/** ~250 words per printed novel page. */
export const WORDS_PER_PAGE = 250;
export const estimatePages = (words: number) => (words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_PAGE)));

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Normalizes Arabic for searching: removes diacritics/tatweel, unifies alef, ya and ta marbuta forms. */
export function normalizeArabic(s: string): string {
  return s
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase();
}

/**
 * Builds the normalized form of `text` along with a map from each normalized index
 * back to the original index, so matches can be highlighted in the original text.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalizeArabic(text[i]);
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      map.push(i);
    }
  }
  map.push(text.length);
  return { norm, map };
}

/** Finds all occurrences of `query` in `text` (Arabic-normalized). Returns original-text ranges. */
export function findAll(text: string, query: string, opts: { normalize?: boolean; wholeWord?: boolean } = {}) {
  const res: { start: number; end: number }[] = [];
  if (!query.trim()) return res;
  const normalize = opts.normalize !== false;
  const { norm, map } = normalize ? normalizeWithMap(text) : { norm: text, map: [] as number[] };
  const q = normalize ? normalizeArabic(query) : query;
  if (!q) return res;
  let idx = 0;
  while ((idx = norm.indexOf(q, idx)) !== -1) {
    const endN = idx + q.length;
    const start = normalize ? map[idx] : idx;
    const end = normalize ? map[endN] ?? text.length : endN;
    if (!opts.wholeWord || isWordBoundary(text, start, end)) res.push({ start, end });
    idx = endN;
  }
  return res;
}

const LETTER = /[\p{L}\p{N}\p{M}]/u;
function isWordBoundary(text: string, start: number, end: number) {
  const before = start > 0 ? text[start - 1] : ' ';
  const after = end < text.length ? text[end] : ' ';
  // Arabic attached prefixes (و، ف، ب، ل، ال) are common: allow them before a match.
  const arabicPrefix = /[وفبلك]/.test(before) && (start < 2 || !LETTER.test(text[start - 2]));
  return (!LETTER.test(before) || arabicPrefix) && !LETTER.test(after);
}

export function snippet(text: string, start: number, end: number, radius = 60) {
  const s = Math.max(0, start - radius);
  const e = Math.min(text.length, end + radius);
  return {
    before: (s > 0 ? '…' : '') + text.slice(s, start).replace(/\s+/g, ' '),
    match: text.slice(start, end),
    after: text.slice(end, e).replace(/\s+/g, ' ') + (e < text.length ? '…' : ''),
  };
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Converts plain text (paragraphs separated by blank lines or newlines) into editor HTML. */
export function textToHtml(text: string): string {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^(\*\s*){3,}$|^[-—–]{3,}$|^[✦◆•]\s*[✦◆•]\s*[✦◆•]$/.test(l) ? '<hr>' : `<p>${escapeHtml(l)}</p>`))
    .join('');
}

export const isRtlText = (s: string) => /[֐-ࣿ]/.test(s.slice(0, 200));

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayKeyOffset(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return todayKey(d);
}
