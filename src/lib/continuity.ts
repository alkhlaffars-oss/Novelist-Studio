// Heuristic continuity checks. These flag *possible* problems for the writer to review —
// they cannot (and do not claim to) find every error.
import { db } from '@/db/db';
import type { Entity, Issue, IssueKind, TimelineEvent } from '@/db/types';
import { newId } from '@/db/repo';
import { buildSceneIndex, entityNames, findMentions, sentences, sceneLabelOf, type IndexedScene } from './analysis';
import { findAll, normalizeArabic } from './text';
import { tr } from '@/store/settings';

export type Finding = Omit<Issue, 'id' | 'projectId' | 'status' | 'source' | 'createdAt' | 'updatedAt' | 'severity'> & { severity: 'high' | 'medium' | 'low' };

const COLORS: [string, RegExp][] = [
  ['blue', /^(ازرق|زرق|blue)/],
  ['green', /^(اخضر|خضر|green)/],
  ['hazel', /^(عسلي|hazel|amber)/],
  ['brown', /^(بني|brown|chestnut)/],
  ['black', /^(اسود|سود|black|raven)/],
  ['grey', /^(رمادي|grey|gray)/],
  ['red', /^(احمر|حمر|اصهب|صهب|red|ginger|auburn)/],
  ['blond', /^(اشقر|شقر|ذهبي|blond|golden)/],
  ['white', /^(ابيض|بيض|اشيب|شيب|فضي|white|silver)/],
];
const EYE_RE = /^(عين|عيون|عينا|عيني|eye)/;
const HAIR_RE = /^(شعر|ضفير|خصل|hair|braid|curls)/;
const AGE_RE = /(\d{1,3})\s*(عام|عاما|سنه|سنوات|سنين|ربيعا|ربيع|years?\s*old|year-old)/;
const PREFIXES = ['وبال', 'فبال', 'وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ل', 'ك'];

function tokens(sentence: string) {
  return normalizeArabic(sentence)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .flatMap((w) => {
      const out = [w];
      for (const p of PREFIXES) if (w.startsWith(p) && w.length - p.length >= 2) out.push(w.slice(p.length));
      return out;
    });
}

function colorsIn(text: string) {
  const set = new Set<string>();
  for (const tk of tokens(text)) for (const [c, re] of COLORS) if (re.test(tk)) set.add(c);
  return set;
}

const ARABIC_DIGITS = /[٠-٩]/g;
const toLatinDigits = (s: string) => s.replace(ARABIC_DIGITS, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

export async function runContinuityChecks(projectId: string): Promise<Finding[]> {
  const [index, entities, events, notes, cards] = await Promise.all([
    buildSceneIndex(projectId),
    db.entities.where('projectId').equals(projectId).toArray(),
    db.events.where('projectId').equals(projectId).toArray(),
    db.notes.where('projectId').equals(projectId).toArray(),
    db.plotCards.where('projectId').equals(projectId).toArray(),
  ]);
  const sceneWord = tr('مشهد', 'Scene');
  const pos = new Map(index.map((s) => [s.scene.id, s]));
  const label = (id?: string) => (id && pos.get(id) ? sceneLabelOf(pos.get(id)!, sceneWord) : '');
  const out: Finding[] = [];
  const add = (kind: IssueKind, key: string, f: Omit<Finding, 'kind' | 'fingerprint'>) => out.push({ kind, fingerprint: `${kind}:${key}`, ...f });

  for (const e of entities.filter((x) => x.type !== 'lore')) {
    const names = entityNames(e);
    const mentions = findMentions(index, names);

    // 1. Dead / exited characters appearing later.
    if (e.type === 'character' && (e.fields.fate === 'dead' || e.fields.fate === 'missing') && e.fields.deathScene && pos.has(e.fields.deathScene)) {
      const death = pos.get(e.fields.deathScene)!.position;
      for (const s of index.filter((x) => x.position > death)) {
        const linked = s.scene.characterIds.includes(e.id) || s.scene.povId === e.id;
        const mentioned = mentions.find((m) => m.sceneId === s.scene.id);
        if (linked || mentioned)
          add('dead-character', `${e.id}:${s.scene.id}`, {
            severity: linked ? 'high' : 'low',
            title: tr(`"${e.name}" تظهر بعد مشهد وفاتها/خروجها`, `"${e.name}" appears after their death/exit scene`),
            detail: linked
              ? tr(`الشخصية مرتبطة بالمشهد "${label(s.scene.id)}" رغم أن وفاتها في "${label(e.fields.deathScene)}".`, `Linked to "${label(s.scene.id)}" although they died in "${label(e.fields.deathScene)}".`)
              : tr(`ذُكر الاسم في "${label(s.scene.id)}". قد تكون ذكرى أو إشارة مقصودة — تحقق.`, `Name mentioned in "${label(s.scene.id)}". May be an intentional reference — please verify.`) + (mentioned ? `\n«${mentioned.excerpt}»` : ''),
            sceneIds: [s.scene.id, e.fields.deathScene],
            chapterIds: [s.chapter.id],
            entityIds: [e.id],
          });
      }
    }

    // 2. Mentioned before its declared first appearance.
    if (e.fields.firstScene && pos.has(e.fields.firstScene)) {
      const first = pos.get(e.fields.firstScene)!.position;
      const early = mentions.filter((m) => m.position < first);
      if (early.length)
        add('first-appearance', `${e.id}:${early[0].sceneId}`, {
          severity: 'medium',
          title: tr(`"${e.name}" يُذكر قبل تقديمه`, `"${e.name}" is mentioned before being introduced`),
          detail: tr(`أول ظهور مسجل: "${label(e.fields.firstScene)}"، لكنه ذُكر في: `, `Declared first appearance is "${label(e.fields.firstScene)}" but it is mentioned in: `) + early.map((m) => `"${label(m.sceneId)}"`).join('، ') + `\n«${early[0].excerpt}»`,
          sceneIds: early.map((m) => m.sceneId),
          chapterIds: early.map((m) => pos.get(m.sceneId)!.chapter.id),
          entityIds: [e.id],
        });
    }

    if (e.type !== 'character') continue;

    // 3. Eye / hair colour contradictions and 4. age mismatches, scanned sentence by sentence.
    const eyeColors = e.fields.eyes ? colorsIn(e.fields.eyes) : null;
    const hairColors = e.fields.hair ? colorsIn(e.fields.hair) : null;
    const age = e.fields.age ? Number(toLatinDigits(e.fields.age)) : NaN;
    if (!eyeColors?.size && !hairColors?.size && !Number.isFinite(age)) continue;
    for (const m of mentions) {
      const s = pos.get(m.sceneId)!;
      for (const sent of sentences(s.text)) {
        if (!names.some((n) => findAll(sent, n, { wholeWord: true }).length)) continue;
        const tks = tokens(sent);
        const sentColors = colorsIn(sent);
        const check = (field: 'eyes' | 'hair', expected: Set<string> | null, re: RegExp, what: [string, string]) => {
          if (!expected?.size || !tks.some((x) => re.test(x)) || !sentColors.size) return;
          if ([...sentColors].some((c) => expected.has(c))) return;
          add('attribute', `${e.id}:${field}:${s.scene.id}:${normalizeArabic(sent).slice(0, 40)}`, {
            severity: 'medium',
            title: tr(`اختلاف محتمل في ${what[0]} "${e.name}"`, `Possible ${what[1]} mismatch for "${e.name}"`),
            detail: tr(`في الموسوعة: "${e.fields[field]}". في "${label(s.scene.id)}":`, `Bible says "${e.fields[field]}". In "${label(s.scene.id)}":`) + `\n«${sent.trim()}»`,
            sceneIds: [s.scene.id],
            chapterIds: [s.chapter.id],
            entityIds: [e.id],
          });
        };
        check('eyes', eyeColors, EYE_RE, ['لون عيني', 'eye colour']);
        check('hair', hairColors, HAIR_RE, ['لون شعر', 'hair colour']);
        if (Number.isFinite(age)) {
          const am = AGE_RE.exec(normalizeArabic(toLatinDigits(sent)));
          if (am && Number(am[1]) !== age && Number(am[1]) > 0)
            add('age', `${e.id}:${s.scene.id}:${am[1]}`, {
              severity: 'low',
              title: tr(`عمر "${e.name}" مختلف عن الموسوعة`, `Age of "${e.name}" differs from the bible`),
              detail: tr(`الموسوعة: ${age}. النص في "${label(s.scene.id)}" يذكر ${am[1]} — قد يكون مقصوداً إن مرّ الزمن.`, `Bible: ${age}. "${label(s.scene.id)}" says ${am[1]} — fine if time has passed.`) + `\n«${sent.trim()}»`,
              sceneIds: [s.scene.id],
              chapterIds: [s.chapter.id],
              entityIds: [e.id],
            });
        }
      }
    }
  }

  out.push(...timelineFindings(events, index, entities));

  // 8. Open questions in the notebook.
  for (const n of notes.filter((x) => x.type === 'question' && !x.resolved))
    add('unresolved-question', n.id, {
      severity: 'low',
      title: tr(`سؤال لم تُجب عنه الرواية بعد: ${n.title || '…'}`, `Unanswered question: ${n.title || '…'}`),
      detail: n.content,
      sceneIds: [],
      chapterIds: [],
      entityIds: [],
    });

  // 9. Foreshadowing without a payoff.
  for (const c of cards.filter((x) => x.foreshadow && !x.payoffId))
    add('foreshadow', c.id, {
      severity: 'medium',
      title: tr(`تمهيد بلا إجابة: ${c.title || '…'}`, `Setup without payoff: ${c.title || '…'}`),
      detail: tr('هذه البطاقة في لوحة الحبكة معلَّمة كتمهيد ولم تُربط ببطاقة تحقق الوعد.', 'This plot card is marked as foreshadowing but has no payoff card linked.') + (c.description ? `\n${c.description}` : ''),
      sceneIds: c.sceneIds,
      chapterIds: c.chapterIds,
      entityIds: c.characterIds,
    });

  // 10. Items marked complete but empty.
  for (const s of index.filter((x) => x.scene.status === 'complete' && x.scene.wordCount === 0))
    add('empty', s.scene.id, {
      severity: 'low',
      title: tr('مشهد مكتمل لكنه فارغ', 'Scene marked complete but empty'),
      detail: label(s.scene.id),
      sceneIds: [s.scene.id],
      chapterIds: [s.chapter.id],
      entityIds: [],
    });

  return out;
}

/** Timeline-specific checks (also shown on the Timeline page). */
export function timelineFindings(events: TimelineEvent[], index: IndexedScene[], entities: Entity[]): Finding[] {
  const out: Finding[] = [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const pos = new Map(index.map((s) => [s.scene.id, s]));
  const ent = new Map(entities.map((e) => [e.id, e]));
  const sceneWord = tr('مشهد', 'Scene');
  const t = (e?: TimelineEvent) => `"${e?.title || '…'}"`;

  // 5. "Must happen after" violated by chronological order.
  for (const e of events)
    for (const a of e.afterIds) {
      const before = byId.get(a);
      if (before && before.chronoOrder > e.chronoOrder)
        out.push({
          kind: 'timeline-order',
          fingerprint: `timeline-order:${a}:${e.id}`,
          severity: 'high',
          title: tr(`ترتيب زمني متناقض: ${t(e)} قبل ${t(before)}`, `Order conflict: ${t(e)} placed before ${t(before)}`),
          detail: tr(`الحدث ${t(e)} يجب أن يقع بعد ${t(before)} لكنه يسبقه في الخط الزمني.`, `${t(e)} must happen after ${t(before)} but comes earlier in the chronology.`),
          sceneIds: [e.sceneId, before.sceneId].filter(Boolean) as string[],
          chapterIds: [],
          entityIds: [],
        });
    }

  // 6. Event location differs from the linked scene's location.
  for (const e of events) {
    const s = e.sceneId ? pos.get(e.sceneId) : undefined;
    if (s && e.locationId && s.scene.locationId && s.scene.locationId !== e.locationId)
      out.push({
        kind: 'location-mismatch',
        fingerprint: `location-mismatch:${e.id}:${s.scene.id}`,
        severity: 'medium',
        title: tr(`اختلاف مكان الحدث ${t(e)}`, `Location mismatch for ${t(e)}`),
        detail: tr(
          `الحدث في "${ent.get(e.locationId)?.name}" بينما المشهد المرتبط "${sceneLabelOf(s, sceneWord)}" في "${ent.get(s.scene.locationId)?.name}".`,
          `Event is at "${ent.get(e.locationId)?.name}" but its scene "${sceneLabelOf(s, sceneWord)}" is at "${ent.get(s.scene.locationId)?.name}".`,
        ),
        sceneIds: [s.scene.id],
        chapterIds: [s.chapter.id],
        entityIds: [e.locationId, s.scene.locationId],
      });
  }

  // 7. Same character in two places at the same moment.
  const timed = events.filter((e) => e.dateLabel.trim() && e.locationId);
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i];
      const b = timed[j];
      if (a.dateLabel.trim() !== b.dateLabel.trim() || (a.timeLabel || '').trim() !== (b.timeLabel || '').trim() || a.locationId === b.locationId) continue;
      const both = a.characterIds.filter((c) => b.characterIds.includes(c));
      for (const c of both)
        out.push({
          kind: 'double-presence',
          fingerprint: `double-presence:${c}:${[a.id, b.id].sort().join(':')}`,
          severity: 'high',
          title: tr(`"${ent.get(c)?.name}" في مكانين في الوقت نفسه`, `"${ent.get(c)?.name}" in two places at once`),
          detail: tr(
            `${t(a)} في "${ent.get(a.locationId!)?.name}" و${t(b)} في "${ent.get(b.locationId!)?.name}" — كلاهما في ${a.dateLabel} ${a.timeLabel}.`,
            `${t(a)} at "${ent.get(a.locationId!)?.name}" and ${t(b)} at "${ent.get(b.locationId!)?.name}", both on ${a.dateLabel} ${a.timeLabel}.`,
          ),
          sceneIds: [a.sceneId, b.sceneId].filter(Boolean) as string[],
          chapterIds: [],
          entityIds: [c],
        });
    }
  return out;
}

/** Saves findings as issues, preserving the writer's resolved/ignored decisions. */
export async function syncIssues(projectId: string, findings: Finding[]) {
  const existing = await db.issues.where('projectId').equals(projectId).filter((i) => i.source === 'auto').toArray();
  const byFp = new Map(existing.map((i) => [i.fingerprint, i]));
  const seen = new Set<string>();
  const t = Date.now();
  await db.transaction('rw', db.issues, async () => {
    for (const f of findings) {
      if (seen.has(f.fingerprint)) continue;
      seen.add(f.fingerprint);
      const data = f;
      const prev = byFp.get(f.fingerprint);
      if (prev) await db.issues.update(prev.id, { ...data, status: prev.status === 'resolved' ? 'open' : prev.status, updatedAt: t });
      else await db.issues.add({ ...data, id: newId(), projectId, status: 'open', source: 'auto', createdAt: t, updatedAt: t });
    }
    // Issues that no longer reproduce are considered fixed.
    for (const i of existing) if (!seen.has(i.fingerprint) && i.status === 'open') await db.issues.update(i.id, { status: 'resolved', updatedAt: t });
  });
  return seen.size;
}
