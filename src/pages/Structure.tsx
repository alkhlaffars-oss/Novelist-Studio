import { Link, useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Plus, PenLine, LayoutList, MapPin, Users } from 'lucide-react';
import type { ChapterStatus } from '@/db/types';
import { createChapter, createScene, updateChapter, updateSceneMeta } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { useManuscriptDnd, useStructureActions } from '@/components/ManuscriptTree';
import { DebouncedInput, Empty, Menu, ProgressBar, useFmt, cx } from '@/components/ui';
import { useEntities, useManuscript } from '@/hooks/useManuscript';
import { CHAPTER_STATUS, STATUS_COLOR } from '@/lib/labels';
import { useT } from '@/store/settings';
import { estimatePages } from '@/lib/text';

function Sortable({ id, children }: { id: string; children: (h: React.HTMLAttributes<HTMLElement>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx(isDragging && 'opacity-40')}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

export default function Structure() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const navigate = useNavigate();
  const ms = useManuscript(project.id);
  const characters = useEntities(project.id, 'character');
  const locations = useEntities(project.id, 'location');
  const dnd = useManuscriptDnd(ms ?? []);
  const actions = useStructureActions(project.id, ms ?? [], (id) => navigate(`/p/${project.id}/write/${id}`));
  if (!ms) return <div className="page" />;

  const total = ms.reduce((a, c) => a + c.words, 0);
  const done = ms.filter((c) => c.chapter.status === 'complete').length;
  const sceneCount = ms.reduce((a, c) => a + c.scenes.length, 0);
  const charName = new Map(characters.map((c) => [c.id, c.name]));
  const locName = new Map(locations.map((c) => [c.id, c.name]));
  const chapterById = new Map(ms.map((c, i) => [c.chapter.id, { c, i }]));
  const sceneById = new Map(ms.flatMap((c) => c.scenes.map((s, i) => [s.id, { s, i, c }] as const)));

  return (
    <div className="page max-w-5xl">
      <PageHeader
        icon={<LayoutList size={22} />}
        title={t('بنية الرواية', 'Structure')}
        subtitle={t(
          `${ms.length} فصل · ${sceneCount} مشهد · ${f.n(total)} كلمة · ≈ ${f.n(estimatePages(total))} صفحة · ${done} فصل مكتمل`,
          `${ms.length} chapters · ${sceneCount} scenes · ${f.n(total)} words · ≈ ${f.n(estimatePages(total))} pages · ${done} complete`,
        )}
        actions={
          <button className="btn-primary" onClick={() => createChapter(project.id, t(`الفصل ${ms.length + 1}`, `Chapter ${ms.length + 1}`))}>
            <Plus size={16} /> {t('فصل جديد', 'New chapter')}
          </button>
        }
      />
      <div className="flex items-center gap-3 mb-8">
        <ProgressBar value={project.targetWords ? total / project.targetWords : 0} className="flex-1" />
        <span className="text-xs text-muted tabular-nums">
          {project.targetWords ? Math.round((total / project.targetWords) * 100) : 0}% {t('من الهدف', 'of target')}
        </span>
      </div>
      <p className="text-xs text-faint mb-4">{t('اسحب المقبض لإعادة ترتيب الفصول والمشاهد. يمكن نقل المشهد إلى فصل آخر بالسحب.', 'Drag the handles to reorder chapters and scenes; drop a scene under another chapter to move it.')}</p>

      {ms.length === 0 ? (
        <Empty title={t('لا توجد فصول', 'No chapters')} />
      ) : (
        <DndContext sensors={dnd.sensors} collisionDetection={closestCenter} onDragStart={dnd.onDragStart} onDragEnd={dnd.onDragEnd} onDragCancel={dnd.onDragCancel}>
          <SortableContext items={dnd.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {dnd.items.map((it) => {
                if (it.kind === 'chapter') {
                  const { c, i } = chapterById.get(it.chapterId)!;
                  return (
                    <Sortable key={it.id} id={it.id}>
                      {(h) => (
                        <div className="card p-4 mt-4 first:mt-0">
                          <div className="flex items-start gap-2">
                            <button {...h} className="text-faint cursor-grab touch-none p-1 mt-1.5" aria-label="drag">
                              <GripVertical size={16} />
                            </button>
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs text-faint tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                                <DebouncedInput value={c.chapter.title} onCommit={(v) => updateChapter(c.chapter.id, { title: v })} className="!h-9 !border-transparent hover:!border-line !bg-transparent font-serif !text-xl flex-1 min-w-[160px]" />
                                <select
                                  className="input !h-8 !w-auto text-xs"
                                  value={c.chapter.status}
                                  onChange={(e) => updateChapter(c.chapter.id, { status: e.target.value as ChapterStatus })}
                                >
                                  {Object.entries(CHAPTER_STATUS).map(([k, v]) => (
                                    <option key={k} value={k}>
                                      {t.l(v)}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-xs text-muted tabular-nums">
                                  {f.n(c.words)} {t('كلمة', 'words')}
                                </span>
                                <Menu items={actions.chapterItems(c, i)} trigger={(tp) => <button {...tp} className="icon-btn w-8 h-8"><MoreHorizontal size={16} /></button>} />
                              </div>
                              <DebouncedInput
                                multiline
                                rows={2}
                                value={c.chapter.summary}
                                onCommit={(v) => updateChapter(c.chapter.id, { summary: v })}
                                placeholder={t('ملخص الفصل…', 'Chapter summary…')}
                                className="!bg-transparent text-muted"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </Sortable>
                  );
                }
                const { s, i, c } = sceneById.get(it.id.slice(2))!;
                return (
                  <Sortable key={it.id} id={it.id}>
                    {(h) => (
                      <div className="group ms-6 sm:ms-10 rounded-xl border border-line/50 bg-surface/60 hover:border-line p-3 flex items-start gap-2">
                        <button {...h} className="text-faint cursor-grab touch-none p-1 mt-0.5" aria-label="drag">
                          <GripVertical size={14} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={cx('w-2 h-2 rounded-full', STATUS_COLOR[s.status])} title={t.l(CHAPTER_STATUS[s.status])} />
                            <Link to={`/p/${project.id}/write/${s.id}`} className="text-sm font-medium text-ink hover:text-accent truncate">
                              {s.title || `${t('مشهد', 'Scene')} ${i + 1}`}
                            </Link>
                            <span className="text-[11px] text-faint tabular-nums">
                              {f.n(s.wordCount)} {t('كلمة', 'words')}
                            </span>
                            {s.storyTime && <span className="chip h-6">{s.storyTime}</span>}
                          </div>
                          <DebouncedInput
                            multiline
                            rows={1}
                            value={s.synopsis}
                            onCommit={(v) => updateSceneMeta(s.id, { synopsis: v })}
                            placeholder={t('وصف مختصر للمشهد…', 'Scene synopsis…')}
                            className="!bg-transparent !border-transparent hover:!border-line !px-1 mt-1 text-sm text-muted"
                          />
                          {(s.characterIds.length > 0 || s.locationId) && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11px] text-muted">
                              {s.locationId && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin size={11} /> {locName.get(s.locationId)}
                                </span>
                              )}
                              {s.characterIds.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <Users size={11} /> {s.characterIds.map((id) => charName.get(id)).filter(Boolean).join('، ')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <Link to={`/p/${project.id}/write/${s.id}`} className="icon-btn w-8 h-8" title={t('اكتب', 'Write')}>
                          <PenLine size={15} />
                        </Link>
                        <Menu items={actions.sceneItems(c, s, i)} trigger={(tp) => <button {...tp} className="icon-btn w-8 h-8"><MoreHorizontal size={15} /></button>} />
                      </div>
                    )}
                  </Sortable>
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>
            {dnd.dragging && (
              <div className="rounded-xl bg-raised border border-line shadow-lift px-4 h-11 flex items-center text-sm text-ink">
                {dnd.dragging.kind === 'chapter' ? chapterById.get(dnd.dragging.chapterId)?.c.chapter.title : sceneById.get(dnd.dragging.id.slice(2))?.s.title || t('مشهد', 'Scene')}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      <div className="flex gap-2 mt-6">
        <button className="btn-outline" onClick={() => createChapter(project.id, t(`الفصل ${ms.length + 1}`, `Chapter ${ms.length + 1}`))}>
          <Plus size={16} /> {t('فصل جديد', 'New chapter')}
        </button>
        {ms.length > 0 && (
          <button className="btn-ghost" onClick={() => createScene(project.id, ms[ms.length - 1].chapter.id, '')}>
            <Plus size={16} /> {t('مشهد في آخر فصل', 'Scene in last chapter')}
          </button>
        )}
      </div>
      {actions.moveDialog}
    </div>
  );
}
