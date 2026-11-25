// Crash safety net: unsaved scene text is mirrored synchronously into a tiny localStorage buffer
// until IndexedDB confirms the write. If the tab is killed in between, it is recovered on next launch.
// Only the text being actively edited lives here — never whole manuscripts.
import { db } from '@/db/db';
import { getSceneHtml, saveSceneContent } from '@/db/repo';

const KEY = 'ns-emergency';

interface Buffer {
  sceneId: string;
  html: string;
  at: number;
}

export function writeEmergency(sceneId: string, html: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sceneId, html, at: Date.now() } satisfies Buffer));
  } catch {
    /* quota exceeded: IndexedDB save is still in flight */
  }
}

export function clearEmergency(sceneId: string) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && (JSON.parse(raw) as Buffer).sceneId === sceneId) localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export async function recoverEmergencyBuffer(): Promise<boolean> {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const buf = JSON.parse(raw) as Buffer;
    const scene = await db.scenes.get(buf.sceneId);
    if (scene && (await getSceneHtml(scene.id)) !== buf.html && buf.at >= scene.updatedAt) {
      await saveSceneContent(buf.sceneId, buf.html, { snapshot: true, kind: 'conflict', label: 'Recovered after unexpected close', track: false });
    }
    localStorage.removeItem(KEY);
    return true;
  } catch (e) {
    console.error('Emergency recovery failed', e);
    return false;
  }
}
