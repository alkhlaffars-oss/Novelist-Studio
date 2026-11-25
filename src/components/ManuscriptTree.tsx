import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Scissors,
  Merge,
  FileText,
  FolderInput,
} from 'lucide-react';
import type { ChapterStatus, Scene } from '@/db/types';
import type { ManuscriptChapter } from '@/hooks/useManuscript';
import {
  createChapter,
  createScene,
  deleteChapter,
  deleteScene,
  duplicateChapter,
  duplicateScene,
  getOrderedScenes,
  mergeChapters,
  reorderChapters,
  reorderScenes,
  splitChapter,
  updateChapter,
  updateSceneMeta,
} from '@/db/repo';
import { CHAPTER_STATUS, STATUS_COLOR } from '@/lib/labels';
import { useT } from '@/store/settings';
import { Menu, Modal, confirmDialog, promptDialog, toast, useFmt, cx, type MenuItem } from './ui';

type Item = { id: string; kind: 'chapter' | 'scene'; chapterId: string };

/** Shared drag & drop logic for chapters and scenes (scenes may move across chapters). */
export function useManuscriptDnd(ms: ManuscriptChapter[]) {
  const [dragging, setDragging] = useState<Item | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const draggingChapter = dragging?.kind === 'chapter';
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const c of ms) {
      out.push({ id: `c:${c.chapter.id}`, kind: 'chapter', chapterId: c.chapter.id });
      if (!draggingChapter) for (const s of c.scenes) out.push({ id: `s:${s.id}`, kind: 'scene', chapterId: c.chapter.id });
    }
    return out;
  }, [ms, draggingChapter]);

  const onDragStart = (e: DragStartEvent) => setDragging(items.find((i) => i.id === e.active.id) ?? null);
  const onDragEnd = async (e: DragEndEvent) => {
    const active = dragging;
    setDragging(null);
    if (!active || !e.over || e.over.id === e.active.id) return;
    if (active.kind === 'chapter') {
      const ids = ms.map((c) => c.chapter.id);
      const overItem = String(e.over.id);
      const overChapter = overItem.startsWith('c:') ? overItem.slice(2) : items.find((i) => i.id === overItem)?.chapterId;
      const from = ids.indexOf(active.chapterId);
      const to = ids.indexOf(overChapter ?? '');
      if (from < 0 || to < 0) return;
      await reorderChapters(arrayMove(ids, from, to));
      return;
    }
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    const moved = arrayMove(items, from, to);
    if (moved[0]?.kind !== 'chapter') return; // cannot drop above the first chapter
    const layout: { chapterId: string; sceneIds: string[] }[] = [];
    for (const it of moved) {
      if (it.kind === 'chapter') layout.push({ chapterId: it.chapterId, sceneIds: [] });
      else layout[layout.length - 1].sceneIds.push(it.id.slice(2));
    }
    await reorderScenes(layout);
  };
  const onDragCancel = () => setDragging(null);
  return { sensors, items, dragging, onDragStart, onDragEnd, onDragCancel };
}

function SortableRow({ id, children, className }: { id: string; children: (handle: React.HTMLAttributes<HTMLElement>) => React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx(className, isDragging && 'opacity-40')}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

/** Actions shared by sidebar and outline views. */
export function useStructureActions(projectId: string, ms: ManuscriptChapter[], onOpenScene?: (id: string) => void) {
  const t = useT();
  const [moving, setMoving] = useState<Scene | null>(null);

  const chapterItems = (c: ManuscriptChapter, idx: number): MenuItem[] => [
    {
      label: t('إضافة مشهد', 'Add scene'),
      icon: <Plus size={15} />,
      onClick: async () => {
        const s = await createScene(projectId, c.chapter.id, '');
        onOpenScene?.(s.id);
      },
    },
    {
      label: t('إعادة التسمية', 'Rename'),
      icon: <Pencil size={15} />,
      onClick: async () => {
        const v = await promptDialog({ title: t('اسم الفصل', 'Chapter title'), initial: c.chapter.title });
        if (v !== null) await updateChapter(c.chapter.id, { title: v.trim() || c.chapter.title });
      },
    },
    {
      label: t('إضافة فصل بعده', 'Insert chapter after'),
      icon: <FileText size={15} />,
      onClick: async () => {
        const ch = await createChapter(projectId, t(`فصل جديد`, 'New chapter'), c.chapter.order);
        const first = (await getOrderedScenes(ch.id))[0];
        if (first) onOpenScene?.(first.id);
      },
    },
    { label: t('نسخ الفصل', 'Duplicate chapter'), icon: <Copy size={15} />, onClick: () => duplicateChapter(c.chapter.id, t(' (نسخة)', ' (copy)')) },
    {
      label: t('دمج مع الفصل التالي', 'Merge with next chapter'),
      icon: <Merge size={15} />,
      disabled: idx >= ms.length - 1,
      onClick: async () => {
        const next = ms[idx + 1];
        if (await confirmDialog({ title: t('دمج الفصلين', 'Merge chapters'), message: t(`ستُنقل مشاهد "${next.chapter.title}" إلى نهاية "${c.chapter.title}" ويُحذف الفصل الفارغ.`, `Scenes of "${next.chapter.title}" will be appended to "${c.chapter.title}".`) })) {
          await mergeChapters(c.chapter.id, next.chapter.id);
          toast(t('تم الدمج', 'Merged'));
        }
      },
    },
    'sep',
    ...(Object.keys(CHAPTER_STATUS) as ChapterStatus[]).map<MenuItem>((st) => ({
      label: `${c.chapter.status === st ? '✓ ' : ''}${t.l(CHAPTER_STATUS[st])}`,
      icon: <span className={cx('block w-2 h-2 rounded-full', STATUS_COLOR[st])} />,
      onClick: () => updateChapter(c.chapter.id, { status: st }),
    })),
    'sep',
    {
      label: t('حذف الفصل', 'Delete chapter'),
      icon: <Trash2 size={15} />,
      danger: true,
      onClick: async () => {
        if (
          await confirmDialog({
            title: t('حذف الفصل', 'Delete chapter'),
            message: t(
              `سيُحذف "${c.chapter.title}" مع ${c.scenes.length} مشهد (${c.words} كلمة). تبقى النسخ السابقة في سجل التعديلات.`,
              `"${c.chapter.title}" and its ${c.scenes.length} scenes (${c.words} words) will be deleted. Earlier versions remain in History.`,
            ),
            danger: true,
            confirmText: t('حذف', 'Delete'),
          })
        )
          await deleteChapter(c.chapter.id);
      },
    },
  ];

  const sceneItems = (c: ManuscriptChapter, s: Scene, idx: number): MenuItem[] => [
    {
      label: t('إعادة التسمية', 'Rename'),
      icon: <Pencil size={15} />,
      onClick: async () => {
        const v = await promptDialog({ title: t('عنوان المشهد', 'Scene title'), initial: s.title });
        if (v !== null) await updateSceneMeta(s.id, { title: v.trim() });
      },
    },
    { label: t('نسخ المشهد', 'Duplicate scene'), icon: <Copy size={15} />, onClick: () => duplicateScene(s.id, t(' (نسخة)', ' (copy)')) },
    { label: t('نقل إلى فصل آخر', 'Move to chapter…'), icon: <FolderInput size={15} />, onClick: () => setMoving(s) },
    {
      label: t('تقسيم الفصل من هنا', 'Split chapter here'),
      icon: <Scissors size={15} />,
      disabled: idx === 0,
      onClick: async () => {
        const title = await promptDialog({ title: t('اسم الفصل الجديد', 'New chapter title'), message: t('سينتقل هذا المشهد وما بعده إلى فصل جديد.', 'This scene and the following ones move to a new chapter.'), initial: t('فصل جديد', 'New chapter') });
        if (title !== null) await splitChapter(c.chapter.id, s.id, title.trim() || t('فصل جديد', 'New chapter'));
      },
    },
    'sep',
    ...(Object.keys(CHAPTER_STATUS) as ChapterStatus[]).map<MenuItem>((st) => ({
      label: `${s.status === st ? '✓ ' : ''}${t.l(CHAPTER_STATUS[st])}`,
      icon: <span className={cx('block w-2 h-2 rounded-full', STATUS_COLOR[st])} />,
      onClick: () => updateSceneMeta(s.id, { status: st }),
    })),
    'sep',
    {
      label: t('حذف المشهد', 'Delete scene'),
      icon: <Trash2 size={15} />,
      danger: true,
      disabled: c.scenes.length <= 1 && ms.length <= 1,
      onClick: async () => {
        if (
          await confirmDialog({
            title: t('حذف المشهد', 'Delete scene'),
            message: t(`سيُحذف المشهد (${s.wordCount} كلمة). تبقى نسخه السابقة في سجل التعديلات.`, `The scene (${s.wordCount} words) will be deleted. Earlier versions remain in History.`),
            danger: true,
            confirmText: t('حذف', 'Delete'),
          })
        )
          await deleteScene(s.id);
      },
    },
  ];

  const moveDialog = (
    <Modal open={!!moving} onClose={() => setMoving(null)} title={t('نقل المشهد إلى', 'Move scene to')} size="sm">
      <div className="space-y-1">
        {ms.map((c) => (
          <button
            key={c.chapter.id}
            disabled={c.chapter.id === moving?.chapterId}
            className="w-full text-start rounded-lg px-3 h-11 hover:bg-raised disabled:opacity-40 text-sm"
            onClick={async () => {
              if (!moving) return;
              const layout = ms.map((x) => ({ chapterId: x.chapter.id, sceneIds: x.scenes.map((s) => s.id).filter((id) => id !== moving.id) }));
              layout.find((l) => l.chapterId === c.chapter.id)!.sceneIds.push(moving.id);
              await reorderScenes(layout);
              setMoving(null);
            }}
          >
            {c.chapter.title}
          </button>
        ))}
      </div>
    </Modal>
  );

  return { chapterItems, sceneItems, moveDialog };
}

/** Compact chapter/scene navigator used in the editor sidebar. */
export function ManuscriptTree({
  projectId,
  ms,
  activeSceneId,
  onOpenScene,
}: {
  projectId: string;
  ms: ManuscriptChapter[];
  activeSceneId?: string;
  onOpenScene: (id: string) => void;
}) {
  const t = useT();
  const f = useFmt();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { sensors, items, dragging, onDragStart, onDragEnd, onDragCancel } = useManuscriptDnd(ms);
  const { chapterItems, sceneItems, moveDialog } = useStructureActions(projectId, ms, onOpenScene);
  const chapterById = new Map(ms.map((c, i) => [c.chapter.id, { c, i }]));
  const sceneById = new Map(ms.flatMap((c) => c.scenes.map((s, i) => [s.id, { s, i, c }] as const)));

  const addChapter = async () => {
    const ch = await createChapter(projectId, t(`الفصل ${ms.length + 1}`, `Chapter ${ms.length + 1}`));
    const first = (await getOrderedScenes(ch.id))[0];
    if (first) onOpenScene(first.id);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 h-12 border-b border-line/60 shrink-0">
        <span className="section-title">{t('الفصول والمشاهد', 'Chapters & scenes')}</span>
        <button className="icon-btn w-8 h-8" onClick={addChapter} title={t('فصل جديد', 'New chapter')}>
          <Plus size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2 px-1.5">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {items.map((it) => {
              if (it.kind === 'chapter') {
                const { c, i } = chapterById.get(it.chapterId)!;
                const isCollapsed = collapsed.has(c.chapter.id);
                return (
                  <SortableRow key={it.id} id={it.id} className="mt-1 first:mt-0">
                    {(handle) => (
                      <div className="group flex items-center gap-1 rounded-lg hover:bg-raised/70 ps-1 pe-0.5 h-10">
                        <button {...handle} className="text-faint opacity-60 md:opacity-0 group-hover:opacity-100 cursor-grab touch-none p-1" aria-label="drag">
                          <GripVertical size={14} />
                        </button>
                        <button
                          className="flex-1 min-w-0 flex items-center gap-1.5 text-start h-full"
                          onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(c.chapter.id)) n.delete(c.chapter.id); else n.add(c.chapter.id); return n; })}
                        >
                          <ChevronDown size={14} className={cx('text-faint shrink-0 transition-transform', isCollapsed && (t.dir === 'rtl' ? 'rotate-90' : '-rotate-90'))} />
                          <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', STATUS_COLOR[c.chapter.status])} />
                          <span className="truncate text-sm font-medium text-ink">{c.chapter.title}</span>
                        </button>
                        <span className="text-[10.5px] text-faint tabular-nums">{f.n(c.words)}</span>
                        <Menu items={chapterItems(c, i)} trigger={(tp) => <button {...tp} className="icon-btn w-7 h-7 md:opacity-0 group-hover:opacity-100"><MoreHorizontal size={15} /></button>} />
                      </div>
                    )}
                  </SortableRow>
                );
              }
              const { s, i, c } = sceneById.get(it.id.slice(2))!;
              if (collapsed.has(c.chapter.id)) return null;
              const active = s.id === activeSceneId;
              return (
                <SortableRow key={it.id} id={it.id}>
                  {(handle) => (
                    <div className={cx('group flex items-center gap-1 rounded-lg ps-5 pe-0.5 h-9', active ? 'bg-raised' : 'hover:bg-raised/50')}>
                      <button {...handle} className="text-faint opacity-60 md:opacity-0 group-hover:opacity-100 cursor-grab touch-none p-1" aria-label="drag">
                        <GripVertical size={13} />
                      </button>
                      <button className="flex-1 min-w-0 text-start h-full flex items-center gap-2" onClick={() => onOpenScene(s.id)}>
                        <span className={cx('text-[13px] truncate', active ? 'text-accent' : 'text-muted')}>
                          {s.title || `${t('مشهد', 'Scene')} ${i + 1}`}
                        </span>
                      </button>
                      <span className="text-[10px] text-faint tabular-nums">{f.n(s.wordCount)}</span>
                      <Menu items={sceneItems(c, s, i)} trigger={(tp) => <button {...tp} className="icon-btn w-7 h-7 md:opacity-0 group-hover:opacity-100"><MoreHorizontal size={14} /></button>} />
                    </div>
                  )}
                </SortableRow>
              );
            })}
          </SortableContext>
          <DragOverlay>
            {dragging && (
              <div className="rounded-lg bg-raised border border-line shadow-lift px-3 h-9 flex items-center text-sm text-ink">
                {dragging.kind === 'chapter' ? chapterById.get(dragging.chapterId)?.c.chapter.title : sceneById.get(dragging.id.slice(2))?.s.title || t('مشهد', 'Scene')}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
      <div className="p-2 border-t border-line/60 shrink-0 grid grid-cols-2 gap-1.5">
        <button className="btn-ghost h-9 text-xs" onClick={addChapter}>
          <Plus size={14} /> {t('فصل', 'Chapter')}
        </button>
        <button
          className="btn-ghost h-9 text-xs"
          onClick={async () => {
            const chId = sceneById.get(activeSceneId ?? '')?.c.chapter.id ?? ms[ms.length - 1]?.chapter.id;
            if (!chId) return addChapter();
            const s = await createScene(projectId, chId, '');
            onOpenScene(s.id);
          }}
        >
          <Plus size={14} /> {t('مشهد', 'Scene')}
        </button>
      </div>
      {moveDialog}
    </div>
  );
}

