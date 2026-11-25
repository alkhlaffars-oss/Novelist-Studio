import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarRange, Plus, GripVertical, ZoomIn, ZoomOut, ShieldAlert, Trash2, ArrowDownUp, MapPin, Users, BookOpenText, CheckCircle2 } from 'lucide-react';
import { db } from '@/db/db';
import type { TimelineEvent } from '@/db/types';
import { createEvent, deleteEvent, updateEvent } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { ChipSelect, Empty, Field, Modal, Tabs, confirmDialog, toast, cx } from '@/components/ui';
import { useEntities, useManuscript, scenePositions, sceneLabel } from '@/hooks/useManuscript';
import { buildSceneIndex } from '@/lib/analysis';
import { timelineFindings, type Finding } from '@/lib/continuity';
import { useT } from '@/store/settings';

const PALETTE = ['#c9a96e', '#9d8ec7', '#6fb39a', '#6f9fd9', '#d9778f', '#c98a5e'];

export default function Timeline() {
  const project = useProject();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const events = useLiveQuery(() => db.events.where('projectId').equals(project.id).toArray(), [project.id]);
  const ms = useManuscript(project.id);
  const characters = useEntities(project.id, 'character');
  const locations = useEntities(project.id, 'location');
  const [view, setView] = useState<'dual' | 'list'>('dual');
  const [zoom, setZoom] = useState(1);
  const [editing, setEditing] = useState<TimelineEvent | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [charFilter, setCharFilter] = useState<string>('');

  useEffect(() => {
    const id = params.get('event');
    if (id && events) {
      const e = events.find((x) => x.id === id);
      if (e) setEditing(e);
      params.delete('event');
      setParams(params, { replace: true });
    }
  }, [params, events, setParams]);

  const chrono = useMemo(() => [...(events ?? [])].filter((e) => !charFilter || e.characterIds.includes(charFilter)).sort((a, b) => a.chronoOrder - b.chronoOrder), [events, charFilter]);
  const scenePos = useMemo(() => scenePositions(ms), [ms]);
  const reader = useMemo(() => chrono.filter((e) => e.sceneId && scenePos.has(e.sceneId)).sort((a, b) => scenePos.get(a.sceneId!)! - scenePos.get(b.sceneId!)! || a.chronoOrder - b.chronoOrder), [chrono, scenePos]);

  if (!events || !ms) return <div className="page" />;

  const add = async () => {
    const e = await createEvent(project.id, { title: '', color: PALETTE[events.length % PALETTE.length] });
    setEditing(e);
  };
  const check = async () => {
    const index = await buildSceneIndex(project.id);
    const ents = await db.entities.where('projectId').equals(project.id).toArray();
    setFindings(timelineFindings(events, index, ents));
  };

  return (
    <div className="page max-w-7xl">
      <PageHeader
        icon={<CalendarRange size={22} />}
        title={t('الخط الزمني', 'Timeline')}
        subtitle={t('رتّب الأحداث كما وقعت في عالم الرواية، وقارنها بترتيب اكتشاف القارئ لها.', 'Order events as they happened in-world and compare with the order the reader discovers them.')}
        actions={
          <>
            <button className="btn-outline" onClick={check} disabled={!events.length}>
              <ShieldAlert size={16} /> {t('فحص التناقضات', 'Check contradictions')}
            </button>
            <button className="btn-primary" onClick={add}>
              <Plus size={16} /> {t('حدث جديد', 'New event')}
            </button>
          </>
        }
      />

      {findings && (
        <div className="card p-4 mb-6 animate-fadeIn">
          {findings.length === 0 ? (
            <p className="text-sm text-ok flex items-center gap-2">
              <CheckCircle2 size={16} /> {t('لم يُعثر على تناقضات زمنية في البيانات المسجّلة.', 'No timeline contradictions found in the recorded data.')}
            </p>
          ) : (
            <ul className="space-y-2">
              {findings.map((f) => (
                <li key={f.fingerprint} className="text-sm">
                  <span className={cx('font-medium', f.severity === 'high' ? 'text-danger' : 'text-gold')}>{f.title}</span>
                  <p className="text-muted text-xs mt-0.5">{f.detail}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-faint mt-3">{t('يعتمد الفحص على ما سجّلته من ترتيب وتواريخ وأماكن وروابط "يقع بعد" — راجع النتائج بنفسك.', 'Checks rely on the order, dates, places and "happens after" links you recorded — review the results yourself.')}</p>
        </div>
      )}

      {events.length === 0 ? (
        <Empty
          icon={<CalendarRange size={40} strokeWidth={1.2} />}
          title={t('لا توجد أحداث بعد', 'No events yet')}
          text={t('أنشئ أحداثاً واربطها بالفصول والمشاهد والشخصيات والأماكن.', 'Create events and link them to chapters, scenes, characters and places.')}
          action={
            <button className="btn-primary" onClick={add}>
              <Plus size={16} /> {t('أول حدث', 'First event')}
            </button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Tabs
              value={view}
              onChange={setView}
              tabs={[
                { key: 'dual', label: t('العرض المرئي', 'Visual') },
                { key: 'list', label: t('ترتيب الأحداث', 'Ordering') },
              ]}
            />
            <select className="input !w-auto !h-9" value={charFilter} onChange={(e) => setCharFilter(e.target.value)}>
              <option value="">{t('كل الشخصيات', 'All characters')}</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {view === 'dual' && (
              <div className="flex items-center gap-1 ms-auto">
                <button className="icon-btn" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} title={t('تصغير', 'Zoom out')}>
                  <ZoomOut size={17} />
                </button>
                <span className="text-xs text-muted w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                <button className="icon-btn" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} title={t('تكبير', 'Zoom in')}>
                  <ZoomIn size={17} />
                </button>
              </div>
            )}
          </div>
          {view === 'dual' ? <DualTimeline chrono={chrono} reader={reader} zoom={zoom} onOpen={setEditing} /> : <OrderList events={chrono} onOpen={setEditing} disabled={!!charFilter} />}
        </>
      )}

      <EventDialog event={editing} onClose={() => setEditing(null)} events={events} characters={characters} locations={locations} />
    </div>
  );
}

/** Two lanes: in-world chronology (top) vs. reading order (bottom), connected per event. Crossing links reveal flashbacks. */
function DualTimeline({ chrono, reader, zoom, onOpen }: { chrono: TimelineEvent[]; reader: TimelineEvent[]; zoom: number; onOpen: (e: TimelineEvent) => void }) {
  const t = useT();
  const slot = 150 * zoom;
  const n = Math.max(chrono.length, 1);
  const width = Math.max(600, n * slot + 40);
  const laneY = { chrono: 70, reader: 290 };
  const cx_ = (i: number) => 20 + i * slot + slot / 2;
  const chronoIdx = new Map(chrono.map((e, i) => [e.id, i]));
  const readerIdx = new Map(reader.map((e, i) => [e.id, i]));
  // reader lane spreads its events across the same width
  const rx = (i: number) => (reader.length <= 1 ? width / 2 : 20 + slot / 2 + (i * (width - 40 - slot)) / (reader.length - 1));
  const rtl = t.dir === 'rtl';
  const X = (x: number) => (rtl ? width - x : x);
  const flashbacks = reader.filter((e, i) => i > 0 && chronoIdx.get(e.id)! < chronoIdx.get(reader[i - 1].id)!).length;

  return (
    <div className="card p-3">
      <div className="overflow-x-auto">
        <svg width={width} height={360} className="block">
          <text x={X(16)} y={24} fontSize={12} fill="rgb(var(--faint))" textAnchor={rtl ? 'end' : 'start'}>
            {t('الزمن الحقيقي داخل عالم الرواية', 'In-world chronology')} →
          </text>
          <text x={X(16)} y={350} fontSize={12} fill="rgb(var(--faint))" textAnchor={rtl ? 'end' : 'start'}>
            {t('ترتيب اكتشاف القارئ (حسب موقع المشهد المرتبط)', 'Reader order (by linked scene)')} →
          </text>
          <line x1={0} x2={width} y1={laneY.chrono} y2={laneY.chrono} stroke="rgb(var(--line))" />
          <line x1={0} x2={width} y1={laneY.reader} y2={laneY.reader} stroke="rgb(var(--line))" />
          {reader.map((e) => {
            const ci = chronoIdx.get(e.id);
            const ri = readerIdx.get(e.id)!;
            if (ci === undefined) return null;
            const x1 = X(cx_(ci));
            const x2 = X(rx(ri));
            return <path key={'l' + e.id} d={`M${x1},${laneY.chrono + 10} C${x1},${180} ${x2},${180} ${x2},${laneY.reader - 10}`} fill="none" stroke={e.color ?? '#c9a96e'} strokeOpacity={0.45} strokeWidth={1.5} />;
          })}
          {chrono.map((e, i) => (
            <g key={e.id} className="cursor-pointer" onClick={() => onOpen(e)}>
              <circle cx={X(cx_(i))} cy={laneY.chrono} r={8} fill={e.color ?? '#c9a96e'} stroke="rgb(var(--surface))" strokeWidth={2} />
              <text x={X(cx_(i))} y={laneY.chrono - 18} fontSize={12} textAnchor="middle" fill="rgb(var(--ink))">
                {(e.title || '…').slice(0, Math.max(8, Math.floor(slot / 8)))}
              </text>
              <text x={X(cx_(i))} y={laneY.chrono + 26} fontSize={10.5} textAnchor="middle" fill="rgb(var(--muted))">
                {[e.dateLabel, e.timeLabel].filter(Boolean).join(' · ').slice(0, Math.floor(slot / 6))}
              </text>
            </g>
          ))}
          {reader.map((e, i) => (
            <g key={'r' + e.id} className="cursor-pointer" onClick={() => onOpen(e)}>
              <rect x={X(rx(i)) - 7} y={laneY.reader - 7} width={14} height={14} rx={3} fill={e.color ?? '#c9a96e'} stroke="rgb(var(--surface))" strokeWidth={2} />
              <text x={X(rx(i))} y={laneY.reader + 26} fontSize={11} textAnchor="middle" fill="rgb(var(--ink))">
                {(e.title || '…').slice(0, Math.max(8, Math.floor(slot / 8)))}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted px-2 pt-2 border-t border-line/60">
        <span>{t(`${chrono.length} حدث`, `${chrono.length} events`)}</span>
        <span>{t(`${reader.length} مرتبط بمشاهد`, `${reader.length} linked to scenes`)}</span>
        <span className={flashbacks ? 'text-violet' : ''}>{t(`${flashbacks} انتقال إلى الماضي (استرجاع)`, `${flashbacks} jumps back in time (flashbacks)`)}</span>
        <span className="text-faint">{t('تقاطع الخطوط يعني أن الرواية لا تُروى بالترتيب الزمني.', 'Crossing lines mean the story is told out of chronological order.')}</span>
      </div>
    </div>
  );
}

function SortableEvent({ e, onOpen, disabled }: { e: TimelineEvent; onOpen: () => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx('flex items-center gap-3 card px-3 py-2.5', isDragging && 'opacity-40')}>
      {!disabled && (
        <button {...attributes} {...listeners} className="text-faint cursor-grab touch-none p-1">
          <GripVertical size={15} />
        </button>
      )}
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: e.color }} />
      <button className="flex-1 min-w-0 text-start" onClick={onOpen}>
        <div className="text-sm text-ink truncate">{e.title || '…'}</div>
        <div className="text-[11px] text-muted truncate">{[e.dateLabel, e.timeLabel].filter(Boolean).join(' · ') || '—'}</div>
      </button>
    </div>
  );
}

function OrderList({ events, onOpen, disabled }: { events: TimelineEvent[]; onOpen: (e: TimelineEvent) => void; disabled: boolean }) {
  const t = useT();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = events.map((x) => x.id);
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    await db.transaction('rw', db.events, async () => {
      for (let i = 0; i < next.length; i++) await db.events.update(next[i], { chronoOrder: i });
    });
  };
  const sortByDate = async () => {
    const key = (s: string) => {
      const d = Date.parse(s);
      if (!Number.isNaN(d)) return d;
      const num = /-?\d+(\.\d+)?/.exec(s.replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))));
      return num ? Number(num[0]) : Number.POSITIVE_INFINITY;
    };
    const sorted = [...events].sort((a, b) => key(a.dateLabel) - key(b.dateLabel) || a.chronoOrder - b.chronoOrder);
    await db.transaction('rw', db.events, async () => {
      for (let i = 0; i < sorted.length; i++) await db.events.update(sorted[i].id, { chronoOrder: i });
    });
    toast(t('رُتبت الأحداث حسب التاريخ حيثما أمكن فهمه', 'Sorted by date where it could be parsed'));
  };
  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-faint">{disabled ? t('أزل تصفية الشخصية لإعادة الترتيب.', 'Clear the character filter to reorder.') : t('اسحب الأحداث لترتيبها كما وقعت فعلاً.', 'Drag events into the order they truly happened.')}</p>
        <button className="btn-ghost h-8 text-xs" onClick={sortByDate} disabled={disabled}>
          <ArrowDownUp size={14} /> {t('ترتيب حسب التاريخ', 'Sort by date')}
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {events.map((e) => (
              <SortableEvent key={e.id} e={e} onOpen={() => onOpen(e)} disabled={disabled} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function EventDialog({
  event,
  onClose,
  events,
  characters,
  locations,
}: {
  event: TimelineEvent | null;
  onClose: () => void;
  events: TimelineEvent[];
  characters: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}) {
  const t = useT();
  const project = useProject();
  const ms = useManuscript(project.id);
  const [d, setD] = useState<TimelineEvent | null>(event);
  useEffect(() => setD(event), [event]);
  if (!d) return null;
  const set = (p: Partial<TimelineEvent>) => setD({ ...d, ...p });
  const save = async () => {
    await updateEvent(d.id, d);
    onClose();
  };
  const sorted = [...events].sort((a, b) => a.chronoOrder - b.chronoOrder);
  const idx = sorted.findIndex((e) => e.id === d.id);
  return (
    <Modal
      open
      onClose={save}
      size="lg"
      title={t('حدث', 'Event')}
      footer={
        <>
          <button
            className="btn-danger me-auto"
            onClick={async () => {
              if (await confirmDialog({ title: t('حذف الحدث؟', 'Delete event?'), danger: true })) {
                await deleteEvent(d.id);
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
        <Field label={t('عنوان الحدث', 'Title')} className="sm:col-span-2">
          <input dir="auto" autoFocus className="input" value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label={t('التاريخ داخل عالم الرواية', 'In-world date')}>
          <input dir="auto" className="input" value={d.dateLabel} onChange={(e) => set({ dateLabel: e.target.value })} placeholder={t('مثال: 1999-03-14 أو "السنة الثالثة للحرب"', 'e.g. 1999-03-14 or "Year 3 of the war"')} />
        </Field>
        <Field label={t('الوقت', 'Time')}>
          <input dir="auto" className="input" value={d.timeLabel} onChange={(e) => set({ timeLabel: e.target.value })} placeholder={t('مثال: الفجر', 'e.g. dawn')} />
        </Field>
        <Field label={t('الوصف', 'Description')} className="sm:col-span-2">
          <textarea dir="auto" rows={3} className="input" value={d.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <Field label={t('المكان', 'Location')}>
          <select className="input" value={d.locationId ?? ''} onChange={(e) => set({ locationId: e.target.value || undefined })}>
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('المشهد الذي يُروى فيه', 'Scene where it is told')}>
          <select
            className="input"
            value={d.sceneId ?? ''}
            onChange={(e) => {
              const sid = e.target.value || undefined;
              const ch = ms?.find((c) => c.scenes.some((s) => s.id === sid));
              set({ sceneId: sid, chapterId: ch?.chapter.id ?? d.chapterId });
            }}
          >
            <option value="">—</option>
            {ms?.map((c) => (
              <optgroup key={c.chapter.id} label={c.chapter.title}>
                {c.scenes.map((s, i) => (
                  <option key={s.id} value={s.id}>
                    {s.title || `${t('مشهد', 'Scene')} ${i + 1}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label={t('الفصل', 'Chapter')}>
          <select className="input" value={d.chapterId ?? ''} onChange={(e) => set({ chapterId: e.target.value || undefined })}>
            <option value="">—</option>
            {ms?.map((c) => (
              <option key={c.chapter.id} value={c.chapter.id}>
                {c.chapter.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('اللون', 'Color')}>
          <div className="flex gap-2 h-10 items-center">
            {PALETTE.map((c) => (
              <button key={c} type="button" onClick={() => set({ color: c })} className={cx('w-7 h-7 rounded-full border-2', d.color === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <div className="sm:col-span-2">
          <span className="label flex items-center gap-1.5">
            <Users size={12} /> {t('الشخصيات', 'Characters')}
          </span>
          <ChipSelect options={characters} value={d.characterIds} onChange={(v) => set({ characterIds: v })} empty={t('لا توجد شخصيات.', 'No characters.')} />
        </div>
        <div className="sm:col-span-2">
          <span className="label">{t('يقع بعد (أحداث يجب أن تسبقه)', 'Happens after (prerequisites)')}</span>
          <ChipSelect options={events.filter((e) => e.id !== d.id).map((e) => ({ id: e.id, name: e.title || '…' }))} value={d.afterIds} onChange={(v) => set({ afterIds: v })} empty="—" />
        </div>
        <div className="sm:col-span-2 grid grid-cols-2 gap-3 text-xs text-muted rounded-lg bg-raised/50 p-3">
          <div>
            <div className="text-faint mb-1">{t('الحدث السابق زمنياً', 'Previous in time')}</div>
            {idx > 0 ? sorted[idx - 1].title || '…' : '—'}
          </div>
          <div>
            <div className="text-faint mb-1">{t('الحدث اللاحق زمنياً', 'Next in time')}</div>
            {idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1].title || '…' : '—'}
          </div>
          {d.sceneId && (
            <Link to={`/p/${project.id}/write/${d.sceneId}`} className="col-span-2 inline-flex items-center gap-1.5 text-accent">
              <BookOpenText size={13} /> {sceneLabel(ms, d.sceneId, t('مشهد', 'Scene'))}
            </Link>
          )}
          {d.locationId && (
            <span className="col-span-2 inline-flex items-center gap-1.5">
              <MapPin size={13} /> {locations.find((l) => l.id === d.locationId)?.name}
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}
