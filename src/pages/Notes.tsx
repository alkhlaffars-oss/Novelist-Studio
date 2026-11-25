import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { StickyNote, Plus, Pin, Search, Trash2, ArrowRightLeft, CheckCircle2, Circle, FileText, Clapperboard, UserRound, CalendarRange, Workflow, Tag } from 'lucide-react';
import { db } from '@/db/db';
import type { Note, NoteType } from '@/db/types';
import { createChapter, createEntity, createEvent, createNote, createPlotCard, createScene, getOrderedScenes, saveSceneContent, updateNote } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { Empty, Field, Modal, confirmDialog, toast, useFmt, cx } from '@/components/ui';
import { useManuscript } from '@/hooks/useManuscript';
import { NOTE_TYPES } from '@/lib/labels';
import { escapeHtml, normalizeArabic } from '@/lib/text';
import { useT } from '@/store/settings';

export default function Notes() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const notes = useLiveQuery(() => db.notes.where('projectId').equals(project.id).toArray(), [project.id]);
  const [type, setType] = useState<NoteType | ''>('');
  const [tag, setTag] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [converting, setConverting] = useState<Note | null>(null);

  const tags = useMemo(() => [...new Set((notes ?? []).flatMap((n) => n.tags))].sort(), [notes]);
  if (!notes) return <div className="page" />;
  const nq = normalizeArabic(q);
  const list = notes
    .filter((n) => (!type || n.type === type) && (!tag || n.tags.includes(tag)) && (!q || normalizeArabic(n.title + ' ' + n.content + ' ' + n.tags.join(' ')).includes(nq)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  const add = async () => setEditing(await createNote(project.id, { type: type || 'idea', tags: tag ? [tag] : [] }));

  return (
    <div className="page max-w-6xl">
      <PageHeader
        icon={<StickyNote size={22} />}
        title={t('الملاحظات والأفكار', 'Notes & ideas')}
        subtitle={t('دفتر الرواية: أفكار، حوارات، نهايات بديلة، أبحاث وأسئلة مفتوحة.', 'The novel notebook: ideas, dialogue, alternate endings, research and open questions.')}
        actions={
          <button className="btn-primary" onClick={add}>
            <Plus size={16} /> {t('ملاحظة', 'Note')}
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-faint" />
          <input className="input ps-8 h-9" placeholder={t('ابحث في الملاحظات…', 'Search notes…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button className={cx('chip', !type && 'on')} onClick={() => setType('')}>
            {t('الكل', 'All')} <span className="text-faint">{notes.length}</span>
          </button>
          {(Object.keys(NOTE_TYPES) as NoteType[]).map((k) => (
            <button key={k} className={cx('chip', type === k && 'on')} onClick={() => setType(k)}>
              {t.l(NOTE_TYPES[k])} <span className="text-faint">{notes.filter((n) => n.type === k).length || ''}</span>
            </button>
          ))}
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-5">
          <Tag size={14} className="text-faint mt-1.5" />
          {tags.map((tg) => (
            <button key={tg} className={cx('chip h-6', tag === tg && 'on')} onClick={() => setTag(tag === tg ? '' : tg)}>
              #{tg}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <Empty icon={<StickyNote size={40} strokeWidth={1.2} />} title={t('لا توجد ملاحظات', 'No notes')} text={t('دوّن أي فكرة قبل أن تهرب. يمكنك لاحقاً تحويلها إلى فصل أو مشهد أو شخصية أو حدث.', 'Capture ideas before they fly away — later turn them into chapters, scenes, characters or events.')} />
      ) : (
        <div className="columns-1 sm:columns-2 xl:columns-3 gap-3 [&>*]:mb-3">
          {list.map((n) => (
            <div key={n.id} className={cx('break-inside-avoid card p-4 group cursor-pointer hover:border-line', n.resolved && 'opacity-60')} onClick={() => setEditing(n)}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cx('text-[11px] font-medium', NOTE_TYPES[n.type].color)}>{t.l(NOTE_TYPES[n.type])}</span>
                {n.pinned && <Pin size={12} className="text-accent" />}
                {n.type === 'question' && (n.resolved ? <CheckCircle2 size={13} className="text-ok" /> : <Circle size={13} className="text-faint" />)}
                <span className="ms-auto text-[10.5px] text-faint">{f.rel(n.updatedAt)}</span>
              </div>
              {n.title && (
                <h3 className="text-ink font-medium leading-snug" dir="auto">
                  {n.title}
                </h3>
              )}
              {n.content && (
                <p className={cx('text-sm text-muted mt-1 whitespace-pre-line line-clamp-6', n.type === 'quote' && 'font-serif text-base')} dir="auto">
                  {n.content}
                </p>
              )}
              <div className="flex items-center gap-1 mt-2" onClick={(e) => e.stopPropagation()}>
                {n.tags.map((tg) => (
                  <span key={tg} className="text-[10.5px] text-faint">
                    #{tg}
                  </span>
                ))}
                <div className="ms-auto flex opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className={cx('icon-btn w-8 h-8', n.pinned && 'active')} title={t('تثبيت', 'Pin')} onClick={() => updateNote(n.id, { pinned: !n.pinned })}>
                    <Pin size={14} />
                  </button>
                  <button className="icon-btn w-8 h-8" title={t('تحويل إلى…', 'Convert to…')} onClick={() => setConverting(n)}>
                    <ArrowRightLeft size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <NoteDialog note={editing} onClose={() => setEditing(null)} onConvert={(n) => { setEditing(null); setConverting(n); }} />
      <ConvertDialog note={converting} onClose={() => setConverting(null)} />
    </div>
  );
}

function NoteDialog({ note, onClose, onConvert }: { note: Note | null; onClose: () => void; onConvert: (n: Note) => void }) {
  const t = useT();
  const [d, setD] = useState<Note | null>(note);
  const [tags, setTags] = useState('');
  if (note && d?.id !== note.id) {
    setD(note);
    setTags(note.tags.join('، '));
  }
  if (!note || !d) return null;
  const save = async () => {
    const tagList = tags.split(/[،,#]/).map((x) => x.trim()).filter(Boolean);
    if (!d.title.trim() && !d.content.trim()) await db.notes.delete(d.id);
    else await updateNote(d.id, { ...d, tags: tagList });
    onClose();
  };
  return (
    <Modal
      open
      onClose={save}
      title={t('ملاحظة', 'Note')}
      footer={
        <>
          <button
            className="btn-danger me-auto"
            onClick={async () => {
              if (await confirmDialog({ title: t('حذف الملاحظة؟', 'Delete note?'), danger: true })) {
                await db.notes.delete(d.id);
                onClose();
              }
            }}
          >
            <Trash2 size={15} />
          </button>
          <button
            className="btn-outline"
            onClick={async () => {
              await updateNote(d.id, d);
              onConvert(d);
            }}
          >
            <ArrowRightLeft size={15} /> {t('تحويل', 'Convert')}
          </button>
          <button className="btn-primary" onClick={save}>
            {t('حفظ', 'Save')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(NOTE_TYPES) as NoteType[]).map((k) => (
            <button key={k} className={cx('chip', d.type === k && 'on')} onClick={() => setD({ ...d, type: k })}>
              {t.l(NOTE_TYPES[k])}
            </button>
          ))}
        </div>
        <input dir="auto" autoFocus={!d.title} className="input text-base" placeholder={t('العنوان', 'Title')} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} />
        <textarea dir="auto" rows={9} className={cx('input', d.type === 'quote' && 'font-serif text-lg')} placeholder={t('اكتب ملاحظتك…', 'Write your note…')} value={d.content} onChange={(e) => setD({ ...d, content: e.target.value })} />
        <Field label={t('وسوم (افصل بفاصلة)', 'Tags (comma separated)')}>
          <input dir="auto" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        {d.type === 'question' && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--accent))]" checked={d.resolved} onChange={(e) => setD({ ...d, resolved: e.target.checked })} />
            {t('تمت الإجابة عن هذا السؤال في الرواية', 'This question has been answered in the novel')}
          </label>
        )}
      </div>
    </Modal>
  );
}

function ConvertDialog({ note, onClose }: { note: Note | null; onClose: () => void }) {
  const t = useT();
  const project = useProject();
  const navigate = useNavigate();
  const ms = useManuscript(project.id);
  const [chapterId, setChapterId] = useState('');
  if (!note) return null;
  const html = note.content
    .split(/\n+/)
    .filter(Boolean)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('');
  const title = note.title || note.content.slice(0, 40);
  const done = async (msg: string, to: string, markUsed = true) => {
    if (markUsed && note.type !== 'question') await updateNote(note.id, { tags: [...new Set([...note.tags, t('مستخدمة', 'used')])] });
    toast(msg);
    onClose();
    navigate(to);
  };
  const actions = [
    {
      icon: <FileText size={18} />,
      label: t('فصل جديد', 'New chapter'),
      run: async () => {
        const ch = await createChapter(project.id, title);
        const [first] = await getOrderedScenes(ch.id);
        if (first && html) await saveSceneContent(first.id, html, { track: false });
        await db.chapters.update(ch.id, { summary: note.content });
        done(t('أُنشئ الفصل', 'Chapter created'), `/p/${project.id}/write/${first?.id ?? ''}`);
      },
    },
    {
      icon: <Clapperboard size={18} />,
      label: t('مشهد في الفصل المختار', 'Scene in selected chapter'),
      disabled: !chapterId && !ms?.length,
      run: async () => {
        const ch = chapterId || ms![ms!.length - 1].chapter.id;
        const s = await createScene(project.id, ch, note.title, { synopsis: note.type === 'future' ? note.content : '', content: note.type === 'future' ? '' : html });
        done(t('أُنشئ المشهد', 'Scene created'), `/p/${project.id}/write/${s.id}`);
      },
    },
    {
      icon: <UserRound size={18} />,
      label: t('شخصية', 'Character'),
      run: async () => {
        const e = await createEntity(project.id, 'character', title, { fields: { notes: note.content, fate: 'alive' } });
        done(t('أُنشئت الشخصية', 'Character created'), `/p/${project.id}/bible/character/${e.id}`);
      },
    },
    {
      icon: <CalendarRange size={18} />,
      label: t('حدث في الخط الزمني', 'Timeline event'),
      run: async () => {
        const e = await createEvent(project.id, { title, description: note.content, color: '#c9a96e' });
        done(t('أُنشئ الحدث', 'Event created'), `/p/${project.id}/timeline?event=${e.id}`);
      },
    },
    {
      icon: <Workflow size={18} />,
      label: t('بطاقة في لوحة الحبكة', 'Plot card'),
      run: async () => {
        await createPlotCard(project.id, { title, description: note.content, stage: 'rising', foreshadow: note.type === 'question' });
        done(t('أُنشئت البطاقة', 'Card created'), `/p/${project.id}/plot`);
      },
    },
  ];
  return (
    <Modal open onClose={onClose} size="sm" title={t('تحويل الملاحظة إلى…', 'Convert note to…')}>
      <p className="text-xs text-muted mb-3">{t('تبقى الملاحظة الأصلية كما هي وتُوسم بـ "مستخدمة".', 'The original note stays and is tagged "used".')}</p>
      {ms && ms.length > 0 && (
        <Field label={t('الفصل (للمشهد)', 'Chapter (for scene)')} className="mb-3">
          <select className="input" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
            <option value="">{t('آخر فصل', 'Last chapter')}</option>
            {ms.map((c) => (
              <option key={c.chapter.id} value={c.chapter.id}>
                {c.chapter.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="space-y-1.5">
        {actions.map((a) => (
          <button key={a.label} disabled={a.disabled} onClick={a.run} className="w-full flex items-center gap-3 rounded-xl px-3 h-12 bg-raised/50 hover:bg-raised text-sm text-ink disabled:opacity-40">
            <span className="text-accent">{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}

