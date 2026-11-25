import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { History as HistoryIcon, RotateCcw, Columns2, AlignJustify, Plus, Undo2, PenLine } from 'lucide-react';
import { db } from '@/db/db';
import type { Snapshot } from '@/db/types';
import { createCheckpoint, createScene, getSceneHtml, restoreSnapshot } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { Empty, Modal, confirmDialog, promptDialog, toast, useFmt, cx } from '@/components/ui';
import { useManuscript, sceneLabel } from '@/hooks/useManuscript';
import { wordDiff } from '@/lib/diff';
import { htmlToText } from '@/lib/text';
import { useT } from '@/store/settings';

const CURRENT = 'current';

export default function History() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const [params, setParams] = useSearchParams();
  const ms = useManuscript(project.id);
  const snaps = useLiveQuery(() => db.snapshots.where('projectId').equals(project.id).toArray(), [project.id]);
  const sceneId = params.get('scene') ?? '';
  const [left, setLeft] = useState<string>(params.get('snap') ?? '');
  const [right, setRight] = useState<string>(CURRENT);
  const [mode, setMode] = useState<'split' | 'inline'>('split');
  const [recovering, setRecovering] = useState<Snapshot | null>(null);
  const current = useLiveQuery(() => (sceneId ? getSceneHtml(sceneId) : Promise.resolve('')), [sceneId]);

  const allScenes = useMemo(() => ms?.flatMap((c) => c.scenes) ?? [], [ms]);
  const sceneSnaps = useMemo(() => (snaps ?? []).filter((s) => s.sceneId === sceneId).sort((a, b) => b.createdAt - a.createdAt), [snaps, sceneId]);
  const orphanGroups = useMemo(() => {
    const live = new Set(allScenes.map((s) => s.id));
    const m = new Map<string, Snapshot[]>();
    for (const s of snaps ?? []) if (!live.has(s.sceneId)) m.set(s.sceneId, [...(m.get(s.sceneId) ?? []), s]);
    return [...m.values()].map((l) => l.sort((a, b) => b.createdAt - a.createdAt));
  }, [snaps, allScenes]);
  const isOrphan = !!sceneId && !allScenes.some((s) => s.id === sceneId);

  useEffect(() => {
    if (sceneSnaps.length && !sceneSnaps.some((s) => s.id === left)) setLeft(sceneSnaps[0].id);
  }, [sceneSnaps, left]);
  useEffect(() => {
    if (isOrphan && right === CURRENT && sceneSnaps[0]) setRight(sceneSnaps[0].id);
  }, [isOrphan, right, sceneSnaps]);

  const textOf = (id: string) => (id === CURRENT ? htmlToText(current ?? '') : htmlToText(sceneSnaps.find((s) => s.id === id)?.content ?? ''));
  const diff = useMemo(() => (sceneId && left ? wordDiff(textOf(left), textOf(right)) : null), [sceneId, left, right, current, sceneSnaps]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!snaps || !ms) return <div className="page" />;
  const counts = new Map<string, number>();
  for (const s of snaps) counts.set(s.sceneId, (counts.get(s.sceneId) ?? 0) + 1);
  const kindLabel: Record<Snapshot['kind'], string> = {
    auto: t('تلقائية', 'Auto'),
    manual: t('نقطة حفظ', 'Checkpoint'),
    'pre-restore': t('قبل الاسترجاع', 'Before restore'),
    'pre-ai': t('قبل اقتراح الذكاء', 'Before AI edit'),
    conflict: t('نسخة متعارضة', 'Conflict copy'),
    'pre-replace': t('قبل الاستبدال', 'Before replace'),
  };
  const snapLabel = (s: Snapshot) => `${s.label || kindLabel[s.kind]} — ${f.date(s.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}`;
  const select = (id: string) => {
    setParams({ scene: id });
    setLeft('');
    setRight(CURRENT);
  };

  return (
    <div className="page max-w-7xl">
      <PageHeader icon={<HistoryIcon size={22} />} title={t('سجل التعديلات', 'Version history')} subtitle={t('كل نسخة محفوظة لكل مشهد. الاسترجاع لا يحذف النسخة الحالية أبداً — بل يحفظها في السجل أولاً.', 'Every saved version of every scene. Restoring never deletes the current text — it is saved to history first.')} />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className={cx('space-y-4', sceneId && 'hidden lg:block')}>
          {ms.map((c) => (
            <div key={c.chapter.id}>
              <div className="section-title mb-1.5">{c.chapter.title}</div>
              {c.scenes.map((s, i) => (
                <button key={s.id} onClick={() => select(s.id)} className={cx('w-full flex items-center justify-between gap-2 rounded-lg px-3 h-9 text-sm text-start', s.id === sceneId ? 'bg-raised text-accent' : 'text-muted hover:bg-raised/60 hover:text-ink')}>
                  <span className="truncate">{s.title || `${t('مشهد', 'Scene')} ${i + 1}`}</span>
                  <span className="text-[10.5px] text-faint">{counts.get(s.id) ?? 0}</span>
                </button>
              ))}
            </div>
          ))}
          {orphanGroups.length > 0 && (
            <div>
              <div className="section-title mb-1.5 text-danger/80">{t('مشاهد محذوفة', 'Deleted scenes')}</div>
              {orphanGroups.map((g) => (
                <button key={g[0].sceneId} onClick={() => select(g[0].sceneId)} className={cx('w-full flex items-center justify-between gap-2 rounded-lg px-3 h-9 text-sm text-start', g[0].sceneId === sceneId ? 'bg-raised text-accent' : 'text-muted hover:bg-raised/60')}>
                  <span className="truncate">{htmlToText(g[0].content).slice(0, 30) || '…'}</span>
                  <span className="text-[10.5px] text-faint">{g.length}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section className={cx(!sceneId && 'hidden lg:block')}>
          {!sceneId ? (
            <Empty icon={<HistoryIcon size={40} strokeWidth={1.2} />} title={t('اختر مشهداً لعرض نسخه', 'Choose a scene to see its versions')} />
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <button className="lg:hidden btn-ghost h-9" onClick={() => setParams({})}>
                  ← {t('المشاهد', 'Scenes')}
                </button>
                <h2 className="font-serif text-xl text-ink me-auto">{isOrphan ? t('مشهد محذوف', 'Deleted scene') : sceneLabel(ms, sceneId, t('مشهد', 'Scene'))}</h2>
                {!isOrphan && (
                  <>
                    <Link to={`/p/${project.id}/write/${sceneId}`} className="btn-ghost h-9">
                      <PenLine size={15} /> {t('فتح في المحرر', 'Open in editor')}
                    </Link>
                    <button
                      className="btn-outline h-9"
                      onClick={async () => {
                        const name = await promptDialog({ title: t('نقطة حفظ يدوية', 'Manual checkpoint'), placeholder: t('اسم مخصص', 'Custom name') });
                        if (name === null) return;
                        await createCheckpoint(sceneId, name.trim() || t('نقطة حفظ', 'Checkpoint'));
                        toast(t('تم إنشاء نقطة الحفظ', 'Checkpoint created'));
                      }}
                    >
                      <Plus size={15} /> {t('نقطة حفظ', 'Checkpoint')}
                    </button>
                  </>
                )}
              </div>

              {sceneSnaps.length === 0 ? (
                <div className="card p-6 text-sm text-muted">{t('لا توجد نسخ سابقة لهذا المشهد بعد. تُنشأ نسخة تلقائية كل ١٠ دقائق من التعديل، ويمكنك إنشاء نقاط حفظ يدوية في أي وقت.', 'No versions yet. An automatic version is kept every 10 minutes of editing; you can add checkpoints at any time.')}</div>
              ) : (
                <>
                  <div className="card p-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
                    <label className="block">
                      <span className="label">{t('النسخة الأقدم', 'Older version')}</span>
                      <select className="input" value={left} onChange={(e) => setLeft(e.target.value)}>
                        {sceneSnaps.map((s) => (
                          <option key={s.id} value={s.id}>
                            {snapLabel(s)} ({f.n(s.wordCount)})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="label">{t('مقارنة مع', 'Compare with')}</span>
                      <select className="input" value={right} onChange={(e) => setRight(e.target.value)}>
                        {!isOrphan && <option value={CURRENT}>{t('النص الحالي', 'Current text')}</option>}
                        {sceneSnaps.map((s) => (
                          <option key={s.id} value={s.id}>
                            {snapLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-1">
                      <button className={cx('icon-btn', mode === 'split' && 'active')} onClick={() => setMode('split')} title={t('جنباً إلى جنب', 'Side by side')}>
                        <Columns2 size={17} />
                      </button>
                      <button className={cx('icon-btn', mode === 'inline' && 'active')} onClick={() => setMode('inline')} title={t('عرض موحد', 'Inline')}>
                        <AlignJustify size={17} />
                      </button>
                    </div>
                  </div>

                  {diff && (
                    <>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="text-ok">
                          +{f.n(diff.added)} {t('كلمة مضافة', 'words added')}
                        </span>
                        <span className="text-danger">
                          −{f.n(diff.removed)} {t('كلمة محذوفة', 'words removed')}
                        </span>
                        <div className="ms-auto flex gap-2">
                          {isOrphan ? (
                            <button className="btn-primary h-9" onClick={() => setRecovering(sceneSnaps.find((s) => s.id === left) ?? null)}>
                              <Undo2 size={15} /> {t('استعادة كمشهد جديد', 'Recover as new scene')}
                            </button>
                          ) : (
                            <button
                              className="btn-primary h-9"
                              onClick={async () => {
                                const snap = sceneSnaps.find((s) => s.id === left);
                                if (!snap) return;
                                if (!(await confirmDialog({ title: t('استرجاع النسخة الأقدم؟', 'Restore the older version?'), message: t('سيُحفظ النص الحالي كنسخة في السجل قبل الاسترجاع، فيمكنك العودة إليه متى شئت.', 'The current text will be kept in history first so you can always return to it.') }))) return;
                                await restoreSnapshot(snap.id, t('قبل استرجاع نسخة', 'Before restoring a version'));
                                setRight(CURRENT);
                                toast(t('تم الاسترجاع — النص السابق محفوظ في السجل', 'Restored — previous text kept in history'));
                              }}
                            >
                              <RotateCcw size={15} /> {t('استرجاع النسخة الأقدم', 'Restore older version')}
                            </button>
                          )}
                        </div>
                      </div>
                      {mode === 'split' ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <DiffPane title={t('قبل', 'Before')} parts={diff.parts.filter((p) => !p.added)} />
                          <DiffPane title={t('بعد', 'After')} parts={diff.parts.filter((p) => !p.removed)} />
                        </div>
                      ) : (
                        <DiffPane title={t('التغييرات', 'Changes')} parts={diff.parts} />
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      </div>
      <RecoverDialog snap={recovering} onClose={() => setRecovering(null)} />
    </div>
  );
}

function DiffPane({ title, parts }: { title: string; parts: { value: string; added?: boolean; removed?: boolean }[] }) {
  return (
    <div className="card p-4 max-h-[65vh] overflow-y-auto">
      <div className="section-title mb-3">{title}</div>
      <div className="font-serif text-[17px] leading-loose whitespace-pre-wrap text-ink" dir="auto">
        {parts.map((p, i) => (
          <span key={i} className={p.added ? 'diff-add' : p.removed ? 'diff-del' : undefined}>
            {p.value}
          </span>
        ))}
      </div>
    </div>
  );
}

function RecoverDialog({ snap, onClose }: { snap: Snapshot | null; onClose: () => void }) {
  const t = useT();
  const project = useProject();
  const ms = useManuscript(project.id);
  const [chapterId, setChapterId] = useState('');
  if (!snap) return null;
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={t('استعادة المشهد المحذوف', 'Recover deleted scene')}
      footer={
        <button
          className="btn-primary"
          disabled={!ms?.length}
          onClick={async () => {
            const ch = chapterId || ms![ms!.length - 1].chapter.id;
            await createScene(project.id, ch, t('مشهد مستعاد', 'Recovered scene'), { content: snap.content });
            toast(t('استُعيد المشهد', 'Scene recovered'));
            onClose();
          }}
        >
          {t('استعادة', 'Recover')}
        </button>
      }
    >
      <label className="label">{t('إلى الفصل', 'Into chapter')}</label>
      <select className="input" value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
        <option value="">{t('آخر فصل', 'Last chapter')}</option>
        {ms?.map((c) => (
          <option key={c.chapter.id} value={c.chapter.id}>
            {c.chapter.title}
          </option>
        ))}
      </select>
    </Modal>
  );
}
