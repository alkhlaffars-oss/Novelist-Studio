import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEditorState, type Editor } from '@tiptap/react';
import { X, Bookmark, History as HistoryIcon, Info, BookOpen, Sparkles, Plus, RotateCcw, Flag, StickyNote } from 'lucide-react';
import { db } from '@/db/db';
import type { ChapterStatus, Entity, Scene } from '@/db/types';
import { createCheckpoint, createNote, restoreSnapshot, updateChapter, updateSceneMeta } from '@/db/repo';
import { CHAPTER_STATUS, CHARACTER_FIELDS, NOTE_TYPES } from '@/lib/labels';
import { useT } from '@/store/settings';
import { ChipSelect, DebouncedInput, Field, Tabs, confirmDialog, promptDialog, toast, useFmt, cx } from '@/components/ui';
import { useEntities, type ManuscriptChapter } from '@/hooks/useManuscript';
import { AISelectionPanel } from '@/ai/AISelectionPanel';

export type InspectorTab = 'scene' | 'reference' | 'markers' | 'history' | 'notes' | 'ai';

export function Inspector({
  projectId,
  scene,
  chapter,
  editor,
  tab,
  setTab,
  onClose,
  onFlush,
}: {
  projectId: string;
  scene: Scene;
  chapter: ManuscriptChapter;
  editor: Editor;
  tab: InspectorTab;
  setTab: (t: InspectorTab) => void;
  onClose: () => void;
  onFlush: () => Promise<unknown>;
}) {
  const t = useT();
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center ps-1 pe-1 border-b border-line/60 shrink-0">
        <Tabs
          className="flex-1 border-b-0"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'scene', label: '', icon: <Info size={16} /> },
            { key: 'reference', label: '', icon: <BookOpen size={16} /> },
            { key: 'notes', label: '', icon: <StickyNote size={16} /> },
            { key: 'markers', label: '', icon: <Bookmark size={16} /> },
            { key: 'history', label: '', icon: <HistoryIcon size={16} /> },
            { key: 'ai', label: '', icon: <Sparkles size={16} /> },
          ]}
        />
        <button className="icon-btn w-8 h-8" onClick={onClose} aria-label={t('إغلاق', 'Close')}>
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'scene' && <SceneMeta projectId={projectId} scene={scene} chapter={chapter} />}
        {tab === 'reference' && <Reference projectId={projectId} scene={scene} />}
        {tab === 'notes' && <QuickNotes projectId={projectId} />}
        {tab === 'markers' && <Markers editor={editor} />}
        {tab === 'history' && <SceneHistory projectId={projectId} scene={scene} onFlush={onFlush} />}
        {tab === 'ai' && <AISelectionPanel projectId={projectId} scene={scene} editor={editor} onFlush={onFlush} />}
      </div>
    </div>
  );
}

function SceneMeta({ projectId, scene, chapter }: { projectId: string; scene: Scene; chapter: ManuscriptChapter }) {
  const t = useT();
  const characters = useEntities(projectId, 'character');
  const locations = useEntities(projectId, 'location');
  const up = (patch: Partial<Scene>) => updateSceneMeta(scene.id, patch);
  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h3 className="section-title">{t('المشهد', 'Scene')}</h3>
        <Field label={t('العنوان', 'Title')}>
          <DebouncedInput value={scene.title} onCommit={(v) => up({ title: v })} />
        </Field>
        <Field label={t('وصف مختصر', 'Synopsis')}>
          <DebouncedInput multiline rows={2} value={scene.synopsis} onCommit={(v) => up({ synopsis: v })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('الحالة', 'Status')}>
            <select className="input" value={scene.status} onChange={(e) => up({ status: e.target.value as ChapterStatus })}>
              {Object.entries(CHAPTER_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {t.l(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('الزمن داخل الرواية', 'Story time')}>
            <DebouncedInput value={scene.storyTime} onCommit={(v) => up({ storyTime: v })} />
          </Field>
        </div>
        <Field label={t('المكان', 'Location')}>
          <select className="input" value={scene.locationId ?? ''} onChange={(e) => up({ locationId: e.target.value || undefined })}>
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('الراوي / وجهة النظر', 'Point of view')}>
          <select className="input" value={scene.povId ?? ''} onChange={(e) => up({ povId: e.target.value || undefined })}>
            <option value="">—</option>
            {characters.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="label">{t('الشخصيات المشاركة', 'Characters in scene')}</span>
          <ChipSelect options={characters} value={scene.characterIds} onChange={(v) => up({ characterIds: v })} empty={t('أضف شخصيات من الموسوعة أولاً.', 'Add characters in the Bible first.')} />
        </div>
        <Field label={t('الهدف الدرامي', 'Dramatic goal')}>
          <DebouncedInput multiline rows={2} value={scene.goal} onCommit={(v) => up({ goal: v })} />
        </Field>
        <Field label={t('الصراع', 'Conflict')}>
          <DebouncedInput multiline rows={2} value={scene.conflict} onCommit={(v) => up({ conflict: v })} />
        </Field>
        <Field label={t('النتيجة', 'Outcome')}>
          <DebouncedInput multiline rows={2} value={scene.outcome} onCommit={(v) => up({ outcome: v })} />
        </Field>
      </section>
      <section className="space-y-3 pt-4 border-t border-line/60">
        <h3 className="section-title">{t('الفصل', 'Chapter')}</h3>
        <Field label={t('اسم الفصل', 'Chapter title')}>
          <DebouncedInput value={chapter.chapter.title} onCommit={(v) => updateChapter(chapter.chapter.id, { title: v })} />
        </Field>
        <Field label={t('ملخص الفصل', 'Chapter summary')}>
          <DebouncedInput multiline rows={3} value={chapter.chapter.summary} onCommit={(v) => updateChapter(chapter.chapter.id, { summary: v })} />
        </Field>
        <Field label={t('حالة الفصل', 'Chapter status')}>
          <select className="input" value={chapter.chapter.status} onChange={(e) => updateChapter(chapter.chapter.id, { status: e.target.value as ChapterStatus })}>
            {Object.entries(CHAPTER_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {t.l(v)}
              </option>
            ))}
          </select>
        </Field>
      </section>
    </div>
  );
}

/** Quick read-only reference to the bible while writing (second "window" next to the text). */
function Reference({ projectId, scene }: { projectId: string; scene: Scene }) {
  const t = useT();
  const all = useEntities(projectId);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Entity | null>(null);
  const inScene = new Set([...scene.characterIds, scene.locationId, scene.povId].filter(Boolean) as string[]);
  const list = all.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => Number(inScene.has(b.id)) - Number(inScene.has(a.id)));
  if (open) {
    const fields = open.type === 'character' ? CHARACTER_FIELDS.flatMap((g) => g.fields) : [];
    return (
      <div className="space-y-3 animate-fadeIn">
        <button className="text-xs text-muted hover:text-accent" onClick={() => setOpen(null)}>
          ← {t('رجوع', 'Back')}
        </button>
        <div className="flex items-center gap-3">
          {open.image && <img src={open.image} alt="" className="w-14 h-14 rounded-lg object-cover" />}
          <div>
            <h3 className="font-serif text-xl text-ink">{open.name}</h3>
            <Link to={`/p/${projectId}/bible/${open.type}/${open.id}`} className="text-xs text-accent">
              {t('فتح في الموسوعة', 'Open in Bible')}
            </Link>
          </div>
        </div>
        {Object.entries(open.fields)
          .filter(([, v]) => v && v.length < 2000)
          .map(([k, v]) => {
            const label = fields.find((f) => f.key === k)?.label;
            if (['firstScene', 'lastScene', 'deathScene'].includes(k)) return null;
            return (
              <div key={k}>
                <div className="text-[11px] text-faint">{label ? t.l(label) : k}</div>
                <div className="text-sm text-ink whitespace-pre-line" dir="auto">
                  {v}
                </div>
              </div>
            );
          })}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <input className="input h-9" placeholder={t('ابحث في الموسوعة…', 'Search the bible…')} value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <p className="text-xs text-faint">{t('الموسوعة فارغة.', 'The bible is empty.')}</p>}
      <div className="space-y-1">
        {list.map((e) => (
          <button key={e.id} onClick={() => setOpen(e)} className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-raised text-start">
            {e.image ? <img src={e.image} alt="" className="w-8 h-8 rounded-md object-cover" /> : <div className="w-8 h-8 rounded-md bg-raised flex items-center justify-center text-xs text-faint">{e.name.slice(0, 1)}</div>}
            <span className="flex-1 min-w-0 text-sm text-ink truncate">{e.name}</span>
            {inScene.has(e.id) && <span className="w-1.5 h-1.5 rounded-full bg-accent" title={t('في هذا المشهد', 'In this scene')} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickNotes({ projectId }: { projectId: string }) {
  const t = useT();
  const notes = useLiveQuery(() => db.notes.where('projectId').equals(projectId).reverse().sortBy('updatedAt'), [projectId]) ?? [];
  const [text, setText] = useState('');
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea dir="auto" rows={2} className="input flex-1" placeholder={t('فكرة سريعة…', 'Quick idea…')} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <button
        className="btn-outline h-9 w-full"
        disabled={!text.trim()}
        onClick={async () => {
          const [first, ...rest] = text.trim().split('\n');
          await createNote(projectId, { type: 'idea', title: first.slice(0, 80), content: rest.join('\n') || (first.length > 80 ? first : '') });
          setText('');
          toast(t('أضيفت الملاحظة', 'Note added'));
        }}
      >
        <Plus size={14} /> {t('حفظ في الملاحظات', 'Save to notes')}
      </button>
      <div className="space-y-2">
        {notes.slice(0, 30).map((n) => (
          <div key={n.id} className="rounded-lg bg-raised/50 p-2.5">
            <div className={cx('text-[10px] mb-0.5', NOTE_TYPES[n.type].color)}>{t.l(NOTE_TYPES[n.type])}</div>
            <div className="text-sm text-ink" dir="auto">
              {n.title}
            </div>
            {n.content && (
              <div className="text-xs text-muted mt-1 line-clamp-3 whitespace-pre-line" dir="auto">
                {n.content}
              </div>
            )}
          </div>
        ))}
      </div>
      <Link to={`/p/${projectId}/notes`} className="text-xs text-accent">
        {t('كل الملاحظات ←', 'All notes →')}
      </Link>
    </div>
  );
}

/** Writer's markers (highlights) in the current scene, for quick navigation. */
function Markers({ editor }: { editor: Editor }) {
  const t = useT();
  const marks = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const out: { pos: number; text: string; color: string; heading?: boolean }[] = [];
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') out.push({ pos, text: node.textContent, color: '', heading: true });
        if (node.isText) {
          const m = node.marks.find((mk) => mk.type.name === 'highlight');
          if (m) {
            const last = out[out.length - 1];
            if (last && !last.heading && last.pos + last.text.length === pos && last.color === (m.attrs.color ?? 'gold')) last.text += node.text;
            else out.push({ pos, text: node.text ?? '', color: m.attrs.color ?? 'gold' });
          }
        }
        return true;
      });
      return out;
    },
  });
  if (!marks.length)
    return (
      <p className="text-sm text-muted leading-relaxed">
        {t('ظلّل مقاطع بأداة "علامات الكاتب" من شريط الأدوات لتظهر هنا للتنقل السريع، وستظهر العناوين داخل المشهد أيضاً.', 'Highlight passages with the Markers tool to list them here for quick navigation. Headings appear here too.')}
      </p>
    );
  const colors: Record<string, string> = { gold: 'bg-gold/60', violet: 'bg-violet/60', red: 'bg-danger/60', green: 'bg-ok/60' };
  return (
    <div className="space-y-1">
      {marks.map((m, i) => (
        <button
          key={i}
          onClick={() => {
            editor.chain().focus().setTextSelection(m.pos + (m.heading ? 1 : 0)).scrollIntoView().run();
          }}
          className="w-full flex items-start gap-2.5 text-start rounded-lg px-2 py-2 hover:bg-raised"
        >
          {m.heading ? <Flag size={13} className="text-accent mt-1 shrink-0" /> : <span className={cx('w-2.5 h-2.5 rounded-sm mt-1.5 shrink-0', colors[m.color] ?? colors.gold)} />}
          <span className={cx('text-sm line-clamp-2', m.heading ? 'text-ink font-medium' : 'text-muted')} dir="auto">
            {m.text}
          </span>
        </button>
      ))}
    </div>
  );
}

function SceneHistory({ projectId, scene, onFlush }: { projectId: string; scene: Scene; onFlush: () => Promise<unknown> }) {
  const t = useT();
  const f = useFmt();
  const snaps = useLiveQuery(() => db.snapshots.where('[sceneId+createdAt]').between([scene.id, -Infinity], [scene.id, Infinity]).reverse().toArray(), [scene.id]) ?? [];
  const kindLabel = useMemo(
    () => ({ auto: t('تلقائية', 'Auto'), manual: t('نقطة حفظ', 'Checkpoint'), 'pre-restore': t('قبل الاسترجاع', 'Before restore'), 'pre-ai': t('قبل اقتراح الذكاء', 'Before AI edit'), conflict: t('نسخة متعارضة', 'Conflict copy'), 'pre-replace': t('قبل الاستبدال', 'Before replace') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t.lang],
  );
  useEffect(() => void onFlush(), [onFlush]);
  return (
    <div className="space-y-3">
      <button
        className="btn-primary h-9 w-full"
        onClick={async () => {
          const name = await promptDialog({ title: t('نقطة حفظ يدوية', 'Manual checkpoint'), placeholder: t('مثال: قبل إعادة كتابة النهاية', 'e.g. Before rewriting the ending') });
          if (name === null) return;
          await onFlush();
          await createCheckpoint(scene.id, name.trim() || t('نقطة حفظ', 'Checkpoint'));
          toast(t('تم إنشاء نقطة الحفظ', 'Checkpoint created'));
        }}
      >
        <Plus size={14} /> {t('نقطة حفظ باسم مخصص', 'Named checkpoint')}
      </button>
      <p className="text-[11px] text-faint leading-relaxed">{t('تُحفظ نسخة تلقائية كل ١٠ دقائق من التعديل. الاسترجاع يحفظ النص الحالي أولاً فلا يضيع شيء.', 'An automatic version is kept every 10 minutes of editing. Restoring saves the current text first, so nothing is lost.')}</p>
      {snaps.length === 0 && <p className="text-sm text-muted">{t('لا توجد نسخ سابقة بعد.', 'No earlier versions yet.')}</p>}
      {snaps.map((s) => {
        const diff = s.wordCount - scene.wordCount;
        return (
          <div key={s.id} className="rounded-lg bg-raised/50 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink truncate">{s.label || kindLabel[s.kind]}</span>
              <span className="text-[10px] text-faint shrink-0">{f.rel(s.createdAt)}</span>
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {kindLabel[s.kind]} · {f.n(s.wordCount)} {t('كلمة', 'words')}{' '}
              <span className={diff > 0 ? 'text-ok' : diff < 0 ? 'text-danger' : ''}>
                ({diff > 0 ? '+' : ''}
                {f.n(diff)})
              </span>
            </div>
            <div className="flex gap-1.5 mt-2">
              <Link to={`/p/${projectId}/history?scene=${scene.id}&snap=${s.id}`} className="btn-ghost h-7 px-2 text-xs">
                {t('مقارنة', 'Compare')}
              </Link>
              <button
                className="btn-ghost h-7 px-2 text-xs"
                onClick={async () => {
                  if (!(await confirmDialog({ title: t('استرجاع هذه النسخة؟', 'Restore this version?'), message: t('سيُحفظ النص الحالي في السجل قبل الاسترجاع.', 'The current text will be saved to history first.') }))) return;
                  await onFlush();
                  await restoreSnapshot(s.id, t('قبل استرجاع نسخة', 'Before restoring a version'));
                  toast(t('تم الاسترجاع', 'Restored'));
                }}
              >
                <RotateCcw size={12} /> {t('استرجاع', 'Restore')}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
