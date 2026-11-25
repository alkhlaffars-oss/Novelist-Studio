import type { DailyStat, WritingSession } from '@/db/types';
import { dayKeyOffset, todayKey } from './text';

export function dailyTotals(stats: DailyStat[]) {
  const m = new Map<string, { added: number; removed: number; seconds: number }>();
  for (const s of stats) {
    const v = m.get(s.date) ?? { added: 0, removed: 0, seconds: 0 };
    v.added += s.added;
    v.removed += s.removed;
    v.seconds += s.seconds;
    m.set(s.date, v);
  }
  return m;
}

/** Consecutive days with writing, ending today (or yesterday if nothing written yet today). */
export function streak(totals: Map<string, { added: number }>) {
  let n = 0;
  let offset = (totals.get(todayKey())?.added ?? 0) > 0 ? 0 : -1;
  while ((totals.get(dayKeyOffset(offset))?.added ?? 0) > 0) {
    n++;
    offset--;
  }
  return n;
}

export function longestStreak(totals: Map<string, { added: number }>) {
  const days = [...totals.entries()].filter(([, v]) => v.added > 0).map(([d]) => d).sort();
  let best = 0;
  let cur = 0;
  let prev: Date | null = null;
  for (const d of days) {
    const date = new Date(d + 'T00:00:00');
    cur = prev && Math.round((date.getTime() - prev.getTime()) / 86400000) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = date;
  }
  return best;
}

export function lastNDays(n: number) {
  return Array.from({ length: n }, (_, i) => dayKeyOffset(i - n + 1));
}

/** Start of the current calendar week. Arabic locale weeks start on Saturday, English on Monday. */
export function weekStartKey(lang: 'ar' | 'en') {
  const d = new Date();
  const startDay = lang === 'ar' ? 6 : 1;
  const diff = (d.getDay() - startDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return todayKey(d);
}

export function monthStartKey() {
  const d = new Date();
  d.setDate(1);
  return todayKey(d);
}

export function sumSince(totals: Map<string, { added: number }>, fromKey: string) {
  let s = 0;
  for (const [d, v] of totals) if (d >= fromKey) s += v.added;
  return s;
}

export function sessionStats(sessions: WritingSession[]) {
  const valid = sessions.filter((s) => s.end > s.start && s.added > 0);
  const totalMs = valid.reduce((a, s) => a + (s.end - s.start), 0);
  const totalWords = valid.reduce((a, s) => a + s.added, 0);
  const longest = valid.reduce<WritingSession | null>((best, s) => (!best || s.end - s.start > best.end - best.start ? s : best), null);
  return {
    count: valid.length,
    wpm: totalMs > 60000 ? totalWords / (totalMs / 60000) : 0,
    longest,
    avgMinutes: valid.length ? totalMs / valid.length / 60000 : 0,
  };
}

/** Projects remaining words at the recent average daily pace (last 30 days, counting only active days and idle days alike). */
export function projectFinish(remaining: number, totals: Map<string, { added: number }>) {
  if (remaining <= 0) return { days: 0, perDay: 0 };
  const days = lastNDays(30);
  const sum = days.reduce((a, d) => a + (totals.get(d)?.added ?? 0), 0);
  const firstActive = days.findIndex((d) => (totals.get(d)?.added ?? 0) > 0);
  if (firstActive === -1) return { days: Infinity, perDay: 0 };
  const span = days.length - firstActive; // average from first active day, so new projects are not penalized
  const perDay = sum / span;
  return { days: perDay > 0 ? Math.ceil(remaining / perDay) : Infinity, perDay };
}
