import { diffArrays } from 'diff';

export type DiffPart = { value: string; added?: boolean; removed?: boolean };

/** Word-level diff that works for any script (tokenizes on whitespace, keeping it). */
export function wordDiff(a: string, b: string): { parts: DiffPart[]; added: number; removed: number } {
  const tok = (s: string) => s.split(/(\s+)/).filter((x) => x !== '');
  const res = diffArrays(tok(a), tok(b));
  let added = 0;
  let removed = 0;
  const parts = res.map((r) => {
    const words = r.value.filter((x) => x.trim()).length;
    if (r.added) added += words;
    if (r.removed) removed += words;
    return { value: r.value.join(''), added: r.added, removed: r.removed };
  });
  return { parts, added, removed };
}
