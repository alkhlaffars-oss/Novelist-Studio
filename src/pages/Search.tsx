import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search as SearchIcon, FileText, Users, MapPin, Gem, Globe2, CalendarRange, StickyNote, Workflow, Replace, Loader2 } from 'lucide-react';
import { db } from '@/db/db';
import { getSceneHtml, saveSceneContent } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { Empty, Modal, confirmDialog, toast, useFmt, cx } from '@/components/ui';
import { buildSceneIndex, sceneLabelOf } from '@/lib/analysis';
import { findAll, snippet } from '@/lib/text';
import { useT } from '@/store/settings';

type Kind = 'scene' | 'chapter' | 'character' | 'location' | 'object' | 'lore' | 'event' | 'note' | 'plot';
interface Result {
  kind: Kind;
  id: string;
  title: string;
  where: string;
  to: string;
  snippets: { before: string; match: string; after: string }[];
  count: number;
}

export default function Search() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [whole, setWhole] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Kind | ''>('');
  const [replaceOpen, setReplaceOpen] = useState(false);

  const run = async (query: string) => {
    if (!query.trim()) return setResults(null);
    setBusy(true);
    const sceneWord = t('مشهد', 'Scene');
    const out: Result[] = [];
    const push = (r: Omit<Result, 'snippets' | 'count'>, text: string, limit = 3) => {
      const hits = findAll(text, query, { wholeWord: whole });
      if (hits.length) out.push({ ...r, count: hits.length, snippets: hits.slice(0, limit).map((h) => snippet(text, h.start, h.end, 70)) });
    };
    const index = await buildSceneIndex(project.id);
    for (const s of index) {
      const where = sceneLabelOf(s, sceneWord);
      push({ kind: 'scene', id: s.scene.id, title: where, where: `${t('الفصل', 'Chapter')} ${s.chapterIndex + 1} · ${sceneWord} ${s.sceneIndex + 1}`, to: `/p/${project.id}/write/${s.scene.id}?q=${encodeURIComponent(query)}` }, s.text);
      push({ kind: 'scene', id: s.scene.id + ':meta', title: where, where: t('بيانات المشهد', 'Scene details'), to: `/p/${project.id}/write/${s.scene.id}` }, [s.scene.title, s.scene.synopsis, s.scene.goal, s.scene.conflict, s.scene.outcome].join('\n'));
    }
    const seenCh = new Set<string>();
    for (const s of index) {
      if (seenCh.has(s.chapter.id)) continue;
      seenCh.add(s.chapter.id);
      push({ kind: 'chapter', id: s.chapter.id, title: s.chapter.title, where: `${t('الفصل', 'Chapter')} ${s.chapterIndex + 1}`, to: `/p/${project.id}/write/${s.scene.id}` }, `${s.chapter.title}\n${s.chapter.summary}`);
    }
    const [ents, events, notes, cards, sections] = await Promise.all([
      db.entities.where('projectId').equals(project.id).toArray(),
      db.events.where('projectId').equals(project.id).toArray(),
      db.notes.where('projectId').equals(project.id).toArray(),
      db.plotCards.where('projectId').equals(project.id).toArray(),
      db.loreSections.where('projectId').equals(project.id).toArray(),
    ]);
    const secName = new Map(sections.map((s) => [s.id, s.name]));
    for (const e of ents)
      push(
        { kind: e.type, id: e.id, title: e.name, where: e.type === 'lore' ? secName.get(e.sectionId ?? '') ?? '' : '', to: `/p/${project.id}/bible/${e.type}/${e.id}` },
        [e.name, ...Object.values(e.fields), e.tags.join(' ')].join('\n'),
      );
    for (const e of events) push({ kind: 'event', id: e.id, title: e.title || '…', where: [e.dateLabel, e.timeLabel].filter(Boolean).join(' · '), to: `/p/${project.id}/timeline?event=${e.id}` }, [e.title, e.description, e.dateLabel].join('\n'));
    for (const n of notes) push({ kind: 'note', id: n.id, title: n.title || n.content.slice(0, 40), where: n.tags.map((x) => '#' + x).join(' '), to: `/p/${project.id}/notes` }, [n.title, n.content, n.tags.join(' ')].join('\n'));
    for (const c of cards) push({ kind: 'plot', id: c.id, title: c.title || '…', where: '', to: `/p/${project.id}/plot` }, [c.title, c.description].join('\n'));
    setResults(out);
    setBusy(false);
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      run(q);
      if (q) setParams({ q }, { replace: true });
    }, 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, whole]);

  const meta: Record<Kind, { icon: React.ReactNode; label: string }> = useMemo(
    () => ({
      scene: { icon: <FileText size={15} />, label: t('نص الرواية', 'Manuscript') },
      chapter: { icon: <FileText size={15} />, label: t('الفصول', 'Chapters') },
      character: { icon: <Users size={15} />, label: t('الشخصيات', 'Characters') },
      location: { icon: <MapPin size={15} />, label: t('الأماكن', 'Locations') },
      object: { icon: <Gem size={15} />, label: t('العناصر', 'Objects') },
      lore: { icon: <Globe2 size={15} />, label: t('العالم والمصطلحات', 'World & glossary') },
      event: { icon: <CalendarRange size={15} />, label: t('الأحداث', 'Events') },
      note: { icon: <StickyNote size={15} />, label: t('الملاحظات', 'Notes') },
      plot: { icon: <Workflow size={15} />, label: t('الحبكة', 'Plot') },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.lang],
  );
  const kinds = [...new Set((results ?? []).map((r) => r.kind))];
  const shown = (results ?? []).filter((r) => !filter || r.kind === filter);
  const total = shown.reduce((a, r) => a + r.count, 0);
  const manuscriptHits = (results ?? []).filter((r) => r.kind === 'scene' && !r.id.endsWith(':meta')).reduce((a, r) => a + r.count, 0);

  return (
    <div className="page max-w-4xl">
      <PageHeader icon={<SearchIcon size={22} />} title={t('البحث الشامل', 'Search everything')} />
      <div className="relative mb-3">
        <SearchIcon size={18} className="absolute top-1/2 -translate-y-1/2 start-4 text-faint" />
        <input autoFocus dir="auto" className="input h-12 ps-11 text-base" placeholder={t('ابحث في الفصول والمشاهد والشخصيات والأماكن والأحداث والملاحظات…', 'Search chapters, scenes, characters, places, events, notes…')} value={q} onChange={(e) => setQ(e.target.value)} />
        {busy && <Loader2 size={16} className="absolute top-1/2 -translate-y-1/2 end-4 animate-spin text-faint" />}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button className={cx('chip', whole && 'on')} onClick={() => setWhole((w) => !w)}>
          {t('كلمة كاملة', 'Whole word')}
        </button>
        <span className="text-[11px] text-faint">{t('يتجاهل البحث التشكيل والفروق بين أ/إ/آ/ا و ة/ه و ى/ي.', 'Ignores Arabic diacritics and letter-form variants.')}</span>
        {manuscriptHits > 0 && (
          <button className="btn-ghost h-8 text-xs ms-auto" onClick={() => setReplaceOpen(true)}>
            <Replace size={14} /> {t('استبدال في الرواية كلها', 'Replace in whole novel')}
          </button>
        )}
      </div>

      {results && (
        <>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-4">
            <button className={cx('chip', !filter && 'on')} onClick={() => setFilter('')}>
              {t('الكل', 'All')} · {f.n((results ?? []).reduce((a, r) => a + r.count, 0))}
            </button>
            {kinds.map((k) => (
              <button key={k} className={cx('chip', filter === k && 'on')} onClick={() => setFilter(k)}>
                {meta[k].label} · {f.n(results.filter((r) => r.kind === k).reduce((a, r) => a + r.count, 0))}
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <Empty title={t('لا نتائج', 'No results')} />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted mb-2">{t(`${f.n(total)} تطابق في ${f.n(shown.length)} موضع`, `${f.n(total)} matches in ${f.n(shown.length)} places`)}</p>
              {shown.map((r) => (
                <Link key={r.kind + r.id} to={r.to} className="block card p-4 hover:border-line">
                  <div className="flex items-center gap-2 text-xs text-muted mb-1.5">
                    <span className="text-accent">{meta[r.kind].icon}</span>
                    <span className="text-ink font-medium text-sm truncate">{r.title}</span>
                    {r.where && <span className="truncate">· {r.where}</span>}
                    <span className="ms-auto shrink-0">× {f.n(r.count)}</span>
                  </div>
                  {r.snippets.map((s, i) => (
                    <p key={i} className="text-sm text-muted leading-relaxed font-serif" dir="auto">
                      {s.before}
                      <mark className="bg-gold/30 text-ink rounded px-0.5">{s.match}</mark>
                      {s.after}
                    </p>
                  ))}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      <ReplaceAll open={replaceOpen} onClose={() => setReplaceOpen(false)} query={q} whole={whole} onDone={() => run(q)} />
    </div>
  );
}

/** Replaces text across all scenes. Each changed scene gets a "before replace" version first. */
function ReplaceAll({ open, onClose, query, whole, onDone }: { open: boolean; onClose: () => void; query: string; whole: boolean; onDone: () => void }) {
  const t = useT();
  const project = useProject();
  const [rep, setRep] = useState('');
  const [busy, setBusy] = useState(false);
  const exec = async () => {
    if (!(await confirmDialog({ title: t('تأكيد الاستبدال', 'Confirm replace'), message: t(`سيُستبدل "${query}" بـ "${rep}" في كل مشاهد الرواية. تُحفظ نسخة من كل مشهد يتغير في سجل التعديلات أولاً.`, `"${query}" will be replaced with "${rep}" in every scene. A version of each changed scene is saved to history first.`) }))) return;
    setBusy(true);
    let changed = 0;
    let n = 0;
    const scenes = await db.scenes.where('projectId').equals(project.id).toArray();
    for (const s of scenes) {
      const html = await getSceneHtml(s.id);
      // Replace only inside text nodes, never inside tags.
      const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let hit = false;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue ?? '';
        const ranges = findAll(text, query, { wholeWord: whole });
        if (!ranges.length) continue;
        let out = '';
        let last = 0;
        for (const r of ranges) {
          out += text.slice(last, r.start) + rep;
          last = r.end;
          n++;
        }
        node.nodeValue = out + text.slice(last);
        hit = true;
      }
      if (hit) {
        await saveSceneContent(s.id, doc.body.innerHTML, { snapshot: true, kind: 'pre-replace', label: `${query} → ${rep}`, track: false });
        changed++;
      }
    }
    setBusy(false);
    toast(t(`استُبدل ${n} تطابقاً في ${changed} مشهد`, `Replaced ${n} matches in ${changed} scenes`));
    onClose();
    onDone();
  };
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('استبدال في الرواية كلها', 'Replace in whole novel')} footer={<button className="btn-primary" disabled={busy} onClick={exec}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Replace size={15} />} {t('استبدال الكل', 'Replace all')}</button>}>
      <p className="text-sm text-muted mb-3">
        {t('البحث عن', 'Find')}: <b className="text-ink">{query}</b>
      </p>
      <input dir="auto" autoFocus className="input" placeholder={t('استبدال بـ…', 'Replace with…')} value={rep} onChange={(e) => setRep(e.target.value)} />
    </Modal>
  );
}
