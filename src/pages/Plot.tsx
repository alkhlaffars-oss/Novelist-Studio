import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Workflow, Plus, Trash2, Sparkles, Link2, Users, Layers, ChevronDown } from 'lucide-react';
import { db } from '@/db/db';
import type { PlotCard, PlotStage, PlotThread } from '@/db/types';
import { createPlotCard, createThread, deleteThread, updatePlotCard } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { ChipSelect, Field, Modal, Tabs, confirmDialog, promptDialog, cx } from '@/components/ui';
import { useEntities, useManuscript } from '@/hooks/useManuscript';
import { PLOT_STAGES } from '@/lib/labels';
import { useT } from '@/store/settings';

const THREAD_COLORS = ['#c9a96e', '#9d8ec7', '#6fb39a', '#6f9fd9', '#d9778f', '#c98a5e', '#8fb3c9'];

export default function Plot() {
  const project = useProject();
  const t = useT();
  const cards = useLiveQuery(() => db.plotCards.where('projectId').equals(project.id).toArray(), [project.id]);
  const threads = useLiveQuery(() => db.plotThreads.where('projectId').equals(project.id).sortBy('order'), [project.id]) ?? [];
  const [view, setView] = useState<'kanban' | 'timeline' | 'tree'>('kanban');
  const [thread, setThread] = useState<string>('');
  const [editing, setEditing] = useState<PlotCard | null>(null);
  const [threadsOpen, setThreadsOpen] = useState(false);
  if (!cards) return <div className="page" />;
  const visible = cards.filter((c) => !thread || c.threadId === thread).sort((a, b) => a.order - b.order);
  const add = async (stage: PlotStage, threadId?: string) => setEditing(await createPlotCard(project.id, { stage, threadId: threadId ?? (thread || undefined) }));

  return (
    <div className="page max-w-[1600px]">
      <PageHeader
        icon={<Workflow size={22} />}
        title={t('لوحة الحبكة', 'Plot board')}
        subtitle={t('خطّط للحبكة الرئيسية والمسارات الفرعية واربطها بالشخصيات والفصول والمشاهد.', 'Plan the main plot and subplots, linked to characters, chapters and scenes.')}
        actions={
          <>
            <button className="btn-outline" onClick={() => setThreadsOpen(true)}>
              <Layers size={16} /> {t('المسارات الفرعية', 'Subplots')} ({threads.length})
            </button>
            <button className="btn-primary" onClick={() => add('setup')}>
              <Plus size={16} /> {t('بطاقة', 'Card')}
            </button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Tabs
          value={view}
          onChange={setView}
          tabs={[
            { key: 'kanban', label: 'Kanban' },
            { key: 'timeline', label: t('خط زمني', 'Timeline') },
            { key: 'tree', label: t('شجرة المخطط', 'Outline tree') },
          ]}
        />
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          <button className={cx('chip', !thread && 'on')} onClick={() => setThread('')}>
            {t('كل المسارات', 'All threads')}
          </button>
          {threads.map((th) => (
            <button key={th.id} className={cx('chip', thread === th.id && 'on')} onClick={() => setThread(th.id)}>
              <span className="w-2 h-2 rounded-full" style={{ background: th.color }} />
              {th.name}
            </button>
          ))}
        </div>
      </div>

      {view === 'kanban' && <Kanban cards={visible} threads={threads} onOpen={setEditing} onAdd={add} />}
      {view === 'timeline' && <PlotTimeline cards={visible} threads={thread ? threads.filter((x) => x.id === thread) : threads} onOpen={setEditing} onAdd={add} />}
      {view === 'tree' && <OutlineTree cards={visible} threads={threads} onOpen={setEditing} />}

      <CardDialog card={editing} onClose={() => setEditing(null)} threads={threads} cards={cards} />
      <ThreadsDialog open={threadsOpen} onClose={() => setThreadsOpen(false)} threads={threads} />
    </div>
  );
}

function CardView({ card, thread, onOpen, dragHandle }: { card: PlotCard; thread?: PlotThread; onOpen: () => void; dragHandle?: React.HTMLAttributes<HTMLElement> }) {
  const t = useT();
  const links = card.characterIds.length + card.chapterIds.length + card.sceneIds.length;
  return (
    <div {...dragHandle} onClick={onOpen} className="group rounded-xl bg-raised/70 border border-line/60 hover:border-line p-3 cursor-pointer touch-manipulation relative overflow-hidden">
      {thread && <span className="absolute inset-y-0 start-0 w-1" style={{ background: thread.color }} />}
      <div className="text-sm text-ink leading-snug" dir="auto">
        {card.title || <span className="text-faint">{t('بلا عنوان', 'Untitled')}</span>}
      </div>
      {card.description && (
        <div className="text-xs text-muted mt-1 line-clamp-3" dir="auto">
          {card.description}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2 text-[10.5px] text-faint">
        {card.foreshadow && (
          <span className={cx('inline-flex items-center gap-1', card.payoffId ? 'text-ok' : 'text-gold')}>
            <Sparkles size={11} /> {card.payoffId ? t('تمهيد مُحقق', 'Paid off') : t('تمهيد', 'Setup')}
          </span>
        )}
        {links > 0 && (
          <span className="inline-flex items-center gap-1">
            <Link2 size={11} /> {links}
          </span>
        )}
        {thread && <span className="truncate">{thread.name}</span>}
      </div>
    </div>
  );
}

function SortableCard({ card, thread, onOpen }: { card: PlotCard; thread?: PlotThread; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id, data: { stage: card.stage } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx(isDragging && 'opacity-30')}>
      <CardView card={card} thread={thread} onOpen={onOpen} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function Column({ stage, children }: { stage: PlotStage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${stage}`, data: { stage } });
  return (
    <div ref={setNodeRef} className={cx('flex-1 space-y-2 min-h-[80px] rounded-lg transition-colors p-1', isOver && 'bg-raised/40')}>
      {children}
    </div>
  );
}

function Kanban({ cards, threads, onOpen, onAdd }: { cards: PlotCard[]; threads: PlotThread[]; onOpen: (c: PlotCard) => void; onAdd: (s: PlotStage) => void }) {
  const t = useT();
  const [active, setActive] = useState<PlotCard | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const threadById = new Map(threads.map((x) => [x.id, x]));
  const byStage = (s: PlotStage) => cards.filter((c) => c.stage === s);

  const onEnd = async (e: DragEndEvent) => {
    setActive(null);
    const card = cards.find((c) => c.id === e.active.id);
    if (!card || !e.over) return;
    const overId = String(e.over.id);
    const stage = (e.over.data.current?.stage as PlotStage) ?? card.stage;
    const col = byStage(stage).filter((c) => c.id !== card.id);
    let idx = overId.startsWith('col:') ? col.length : col.findIndex((c) => c.id === overId);
    if (idx < 0) idx = col.length;
    col.splice(idx, 0, card);
    await db.transaction('rw', db.plotCards, async () => {
      for (let i = 0; i < col.length; i++) await db.plotCards.update(col[i].id, { order: i, ...(col[i].id === card.id ? { stage } : {}) });
    });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(e) => setActive(cards.find((c) => c.id === e.active.id) ?? null)} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
        {PLOT_STAGES.map((st) => {
          const list = byStage(st.key);
          return (
            <div key={st.key} className="w-[260px] shrink-0 snap-start card p-2.5 flex flex-col bg-surface/70">
              <div className="flex items-start justify-between gap-2 px-1.5 pb-2">
                <div>
                  <div className="text-sm font-medium text-ink">{t.l(st.label)}</div>
                  <div className="text-[11px] text-faint">{t.l(st.hint)}</div>
                </div>
                <span className="text-[11px] text-faint">{list.length}</span>
              </div>
              <SortableContext items={list.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <Column stage={st.key}>
                  {list.map((c) => (
                    <SortableCard key={c.id} card={c} thread={c.threadId ? threadById.get(c.threadId) : undefined} onOpen={() => onOpen(c)} />
                  ))}
                </Column>
              </SortableContext>
              <button className="btn-ghost h-8 text-xs mt-1" onClick={() => onAdd(st.key)}>
                <Plus size={14} /> {t('إضافة', 'Add')}
              </button>
            </div>
          );
        })}
      </div>
      <DragOverlay>{active && <div className="w-[240px] rotate-2"><CardView card={active} thread={active.threadId ? threadById.get(active.threadId) : undefined} onOpen={() => {}} /></div>}</DragOverlay>
    </DndContext>
  );
}

/** Stages left→right, one lane per subplot. */
function PlotTimeline({ cards, threads, onOpen, onAdd }: { cards: PlotCard[]; threads: PlotThread[]; onOpen: (c: PlotCard) => void; onAdd: (s: PlotStage, th?: string) => void }) {
  const t = useT();
  const lanes: { id?: string; name: string; color: string }[] = [{ name: t('الحبكة الرئيسية', 'Main plot'), color: 'rgb(var(--gold))' }, ...threads.map((x) => ({ id: x.id, name: x.name, color: x.color }))];
  const shown = threads.length === 1 && cards.every((c) => c.threadId === threads[0].id) ? lanes.slice(1) : lanes;
  return (
    <div className="card overflow-x-auto">
      <div className="grid min-w-[1100px]" style={{ gridTemplateColumns: `160px repeat(${PLOT_STAGES.length}, minmax(140px, 1fr))` }}>
        <div className="sticky start-0 bg-surface z-10 border-b border-line/60" />
        {PLOT_STAGES.map((s, i) => (
          <div key={s.key} className="px-3 py-3 border-b border-line/60 text-xs font-medium text-ink relative">
            <span className="text-faint me-1.5 tabular-nums">{i + 1}</span>
            {t.l(s.label)}
          </div>
        ))}
        {shown.map((lane) => (
          <div key={lane.id ?? 'main'} className="contents">
            <div className="sticky start-0 bg-surface z-10 px-3 py-3 border-b border-line/40 flex items-center gap-2 text-sm text-ink">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: lane.color }} />
              <span className="truncate">{lane.name}</span>
            </div>
            {PLOT_STAGES.map((s) => {
              const list = cards.filter((c) => c.stage === s.key && (c.threadId ?? undefined) === lane.id);
              return (
                <div key={s.key} className="group p-2 border-b border-line/40 border-s border-s-line/30 space-y-1.5 min-h-[72px]">
                  {list.map((c) => (
                    <button key={c.id} onClick={() => onOpen(c)} className="w-full text-start rounded-lg px-2 py-1.5 text-xs text-ink hover:brightness-110" style={{ background: `color-mix(in srgb, ${lane.color} 18%, transparent)` }} dir="auto">
                      {c.title || '…'}
                    </button>
                  ))}
                  <button onClick={() => onAdd(s.key, lane.id)} className="w-full h-7 rounded-lg text-faint hover:text-ink hover:bg-raised/60 opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center">
                    <Plus size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function OutlineTree({ cards, threads, onOpen }: { cards: PlotCard[]; threads: PlotThread[]; onOpen: (c: PlotCard) => void }) {
  const t = useT();
  const project = useProject();
  const ms = useManuscript(project.id);
  const characters = useEntities(project.id, 'character');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const chName = new Map(ms?.map((c) => [c.chapter.id, c.chapter.title]));
  const scName = new Map(ms?.flatMap((c) => c.scenes.map((s, i) => [s.id, s.title || `${c.chapter.title} · ${t('مشهد', 'Scene')} ${i + 1}`])));
  const charName = new Map(characters.map((c) => [c.id, c.name]));
  const threadById = new Map(threads.map((x) => [x.id, x]));
  return (
    <div className="card p-4 max-w-3xl">
      {PLOT_STAGES.map((s, i) => {
        const list = cards.filter((c) => c.stage === s.key);
        const isClosed = closed.has(s.key);
        return (
          <div key={s.key} className="relative">
            <button
              className="flex items-center gap-2 w-full text-start py-2"
              onClick={() => setClosed((x) => { const n = new Set(x); if (n.has(s.key)) n.delete(s.key); else n.add(s.key); return n; })}
            >
              <ChevronDown size={15} className={cx('text-faint transition-transform', isClosed && (t.dir === 'rtl' ? 'rotate-90' : '-rotate-90'))} />
              <span className="text-xs text-faint tabular-nums">{i + 1}</span>
              <span className="font-serif text-lg text-ink">{t.l(s.label)}</span>
              <span className="text-xs text-faint">({list.length})</span>
            </button>
            {!isClosed && (
              <div className="ms-6 border-s border-line/60 ps-4 pb-2 space-y-2">
                {list.length === 0 && <p className="text-xs text-faint py-1">—</p>}
                {list.map((c) => (
                  <div key={c.id}>
                    <button onClick={() => onOpen(c)} className="text-sm text-ink hover:text-accent text-start flex items-center gap-2">
                      {c.threadId && <span className="w-2 h-2 rounded-full" style={{ background: threadById.get(c.threadId)?.color }} />}
                      {c.title || '…'}
                    </button>
                    {(c.chapterIds.length > 0 || c.sceneIds.length > 0 || c.characterIds.length > 0) && (
                      <ul className="ms-4 mt-1 space-y-0.5 text-xs text-muted">
                        {c.chapterIds.map((id) => chName.get(id) && <li key={id}>📖 {chName.get(id)}</li>)}
                        {c.sceneIds.map((id) =>
                          scName.get(id) ? (
                            <li key={id}>
                              <Link className="hover:text-accent" to={`/p/${project.id}/write/${id}`}>
                                ✦ {scName.get(id)}
                              </Link>
                            </li>
                          ) : null,
                        )}
                        {c.characterIds.length > 0 && (
                          <li className="flex items-center gap-1">
                            <Users size={11} /> {c.characterIds.map((id) => charName.get(id)).filter(Boolean).join('، ')}
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardDialog({ card, onClose, threads, cards }: { card: PlotCard | null; onClose: () => void; threads: PlotThread[]; cards: PlotCard[] }) {
  const t = useT();
  const project = useProject();
  const ms = useManuscript(project.id);
  const characters = useEntities(project.id, 'character');
  const [d, setD] = useState<PlotCard | null>(card);
  useEffect(() => setD(card), [card]);
  const chapters = useMemo(() => ms?.map((c) => ({ id: c.chapter.id, name: c.chapter.title })) ?? [], [ms]);
  const scenes = useMemo(() => ms?.flatMap((c) => c.scenes.map((s, i) => ({ id: s.id, name: s.title || `${c.chapter.title} · ${i + 1}` }))) ?? [], [ms]);
  if (!d) return null;
  const set = (p: Partial<PlotCard>) => setD({ ...d, ...p });
  const save = async () => {
    await updatePlotCard(d.id, d);
    onClose();
  };
  return (
    <Modal
      open
      onClose={save}
      size="lg"
      title={t('بطاقة حبكة', 'Plot card')}
      footer={
        <>
          <button
            className="btn-danger me-auto"
            onClick={async () => {
              if (await confirmDialog({ title: t('حذف البطاقة؟', 'Delete card?'), danger: true })) {
                await db.plotCards.delete(d.id);
                onClose();
              }
            }}
          >
            <Trash2 size={15} /> {t('حذف', 'Delete')}
          </button>
          <button className="btn-primary" onClick={save}>
            {t('حفظ', 'Save')}
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('العنوان', 'Title')} className="sm:col-span-2">
          <input dir="auto" autoFocus className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label={t('الوصف', 'Description')} className="sm:col-span-2">
          <textarea dir="auto" rows={4} className="input" value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label={t('المرحلة', 'Stage')}>
          <select className="input" value={d.stage} onChange={(e) => set({ stage: e.target.value as PlotStage })}>
            {PLOT_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {t.l(s.label)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('المسار', 'Thread')}>
          <select className="input" value={d.threadId ?? ''} onChange={(e) => set({ threadId: e.target.value || undefined })}>
            <option value="">{t('الحبكة الرئيسية', 'Main plot')}</option>
            {threads.map((th) => (
              <option key={th.id} value={th.id}>
                {th.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <span className="label">{t('الشخصيات', 'Characters')}</span>
          <ChipSelect options={characters} value={d.characterIds} onChange={(v) => set({ characterIds: v })} empty="—" />
        </div>
        <div className="sm:col-span-2">
          <span className="label">{t('الفصول', 'Chapters')}</span>
          <ChipSelect options={chapters} value={d.chapterIds} onChange={(v) => set({ chapterIds: v })} empty="—" />
        </div>
        <div className="sm:col-span-2">
          <span className="label">{t('المشاهد', 'Scenes')}</span>
          <ChipSelect options={scenes} value={d.sceneIds} onChange={(v) => set({ sceneIds: v })} empty="—" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--accent))]" checked={d.foreshadow} onChange={(e) => set({ foreshadow: e.target.checked })} />
          {t('هذه البطاقة تمهيد/وعد يحتاج إلى إجابة لاحقاً', 'This card is a setup/promise that needs a payoff')}
        </label>
        {d.foreshadow && (
          <Field label={t('البطاقة التي تحقق الوعد', 'Payoff card')} className="sm:col-span-2">
            <select className="input" value={d.payoffId ?? ''} onChange={(e) => set({ payoffId: e.target.value || undefined })}>
              <option value="">{t('— لم يتحقق بعد —', '— not paid off yet —')}</option>
              {cards
                .filter((c) => c.id !== d.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || '…'}
                  </option>
                ))}
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function ThreadsDialog({ open, onClose, threads }: { open: boolean; onClose: () => void; threads: PlotThread[] }) {
  const t = useT();
  const project = useProject();
  const characters = useEntities(project.id, 'character');
  return (
    <Modal open={open} onClose={onClose} title={t('المسارات الفرعية (Subplots)', 'Subplots')} size="lg">
      <div className="space-y-3">
        {threads.map((th) => (
          <div key={th.id} className="rounded-xl border border-line/60 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input type="color" value={th.color} onChange={(e) => db.plotThreads.update(th.id, { color: e.target.value })} className="w-8 h-8 rounded border-0 bg-transparent" />
              <input dir="auto" className="input h-9 flex-1" defaultValue={th.name} onBlur={(e) => db.plotThreads.update(th.id, { name: e.target.value })} />
              <button
                className="icon-btn hover:text-danger"
                onClick={async () => {
                  if (await confirmDialog({ title: t('حذف المسار؟ ستبقى البطاقات في الحبكة الرئيسية.', 'Delete thread? Cards move to the main plot.'), danger: true })) await deleteThread(th.id);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
            <textarea dir="auto" rows={2} className="input" placeholder={t('وصف المسار…', 'Description…')} defaultValue={th.description} onBlur={(e) => db.plotThreads.update(th.id, { description: e.target.value })} />
            <ChipSelect options={characters} value={th.characterIds} onChange={(v) => db.plotThreads.update(th.id, { characterIds: v })} empty="—" />
          </div>
        ))}
        <button
          className="btn-outline w-full"
          onClick={async () => {
            const name = await promptDialog({ title: t('اسم المسار', 'Thread name'), placeholder: t('مثال: قصة الحب، لغز الرسالة', 'e.g. romance, the letter mystery') });
            if (name?.trim()) await createThread(project.id, name.trim(), THREAD_COLORS[threads.length % THREAD_COLORS.length]);
          }}
        >
          <Plus size={15} /> {t('مسار جديد', 'New thread')}
        </button>
      </div>
    </Modal>
  );
}
