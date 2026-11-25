import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ShieldCheck, Play, Plus, CheckCircle2, EyeOff, RotateCcw, Trash2, Loader2, Info, Sparkles } from 'lucide-react';
import { db } from '@/db/db';
import type { Issue, IssueKind } from '@/db/types';
import { newId } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { ChipSelect, Empty, Field, Modal, Tabs, toast, useFmt, cx } from '@/components/ui';
import { useEntities, useManuscript, sceneLabel } from '@/hooks/useManuscript';
import { runContinuityChecks, syncIssues } from '@/lib/continuity';
import { useT } from '@/store/settings';
import type { L } from '@/lib/labels';

const KIND: Record<IssueKind, L> = {
  'dead-character': { ar: 'شخصية بعد وفاتها', en: 'After death' },
  'first-appearance': { ar: 'ظهور قبل التقديم', en: 'Before introduction' },
  attribute: { ar: 'صفات الشخصية', en: 'Attributes' },
  age: { ar: 'العمر', en: 'Age' },
  'timeline-order': { ar: 'ترتيب زمني', en: 'Time order' },
  'location-mismatch': { ar: 'مكان الحدث', en: 'Event location' },
  'double-presence': { ar: 'وجود في مكانين', en: 'Two places at once' },
  'unresolved-question': { ar: 'سؤال مفتوح', en: 'Open question' },
  foreshadow: { ar: 'تمهيد بلا إجابة', en: 'Unpaid setup' },
  empty: { ar: 'محتوى فارغ', en: 'Empty content' },
  manual: { ar: 'ملاحظة يدوية', en: 'Manual' },
  ai: { ar: 'من المساعد', en: 'From assistant' },
};

export default function Continuity() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const ms = useManuscript(project.id);
  const issues = useLiveQuery(() => db.issues.where('projectId').equals(project.id).toArray(), [project.id]);
  const [status, setStatus] = useState<Issue['status']>('open');
  const [running, setRunning] = useState(false);
  const [adding, setAdding] = useState(false);
  const lastRun = useLiveQuery(() => db.kv.get(`continuity:${project.id}`), [project.id]);

  const run = async () => {
    setRunning(true);
    try {
      const findings = await runContinuityChecks(project.id);
      const n = await syncIssues(project.id, findings);
      await db.kv.put({ key: `continuity:${project.id}`, value: Date.now() });
      toast(n ? t(`عُثر على ${n} ملاحظة محتملة`, `${n} possible issues found`) : t('لم يُعثر على مشكلات في البيانات المتاحة', 'No issues found in the available data'), n ? 'info' : 'ok');
      setStatus('open');
    } finally {
      setRunning(false);
    }
  };

  if (!issues) return <div className="page" />;
  const sev = { high: 0, medium: 1, low: 2 };
  const list = issues.filter((i) => i.status === status).sort((a, b) => sev[a.severity ?? 'medium'] - sev[b.severity ?? 'medium'] || b.updatedAt - a.updatedAt);
  const count = (s: Issue['status']) => issues.filter((i) => i.status === s).length;

  return (
    <div className="page max-w-5xl">
      <PageHeader
        icon={<ShieldCheck size={22} />}
        title={t('التدقيق والاستمرارية', 'Continuity')}
        subtitle={lastRun?.value ? `${t('آخر فحص', 'Last check')}: ${f.rel(lastRun.value as number)}` : t('لم يُجرَ فحص بعد', 'Not checked yet')}
        actions={
          <>
            <button className="btn-outline" onClick={() => setAdding(true)}>
              <Plus size={16} /> {t('ملاحظة يدوية', 'Manual issue')}
            </button>
            <button className="btn-primary" onClick={run} disabled={running}>
              {running ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} {t('تشغيل الفحص', 'Run checks')}
            </button>
          </>
        }
      />

      <div className="card p-4 mb-6 flex gap-3 text-sm text-muted leading-relaxed">
        <Info size={18} className="text-accent shrink-0 mt-0.5" />
        <div>
          {t(
            'الفحص التلقائي مساعدة وليس ضماناً: يقارن نص الرواية ببيانات الموسوعة والخط الزمني ولوحة الحبكة ليكتشف: ظهور شخصية بعد مشهد وفاتها، ذكر عنصر قبل أول ظهور مسجّل له، اختلاف لون العينين أو الشعر أو العمر عن الموسوعة، تناقض ترتيب الأحداث، اختلاف مكان الحدث عن مشهده، وجود شخصية في مكانين في الوقت نفسه، الأسئلة المفتوحة، والتمهيدات التي لم تتحقق.',
            'Automatic checks are an aid, not a guarantee. They compare the text with the bible, timeline and plot board to flag: characters appearing after their death scene, items mentioned before their recorded first appearance, eye/hair colour or age differing from the bible, event order conflicts, event/scene location mismatches, a character in two places at once, open questions and unpaid setups.',
          )}{' '}
          {t('أما مشكلات مثل "شخصية تعرف معلومة لم يكن من المفترض أن تعرفها" أو اختلاف قواعد العالم فتحتاج إلى قراءة بشرية — سجّلها يدوياً أو اسأل', 'Problems like a character knowing something they should not, or broken world rules, need human reading — log them manually or ask the')}{' '}
          <Link className="text-accent inline-flex items-center gap-1" to={`/p/${project.id}/assistant?task=consistency`}>
            <Sparkles size={13} />
            {t('المساعد الأدبي', 'assistant')}
          </Link>
          .
        </div>
      </div>

      <Tabs
        className="mb-4"
        value={status}
        onChange={setStatus}
        tabs={[
          { key: 'open', label: t('مفتوحة', 'Open'), count: count('open') },
          { key: 'resolved', label: t('محلولة', 'Resolved'), count: count('resolved') },
          { key: 'ignored', label: t('متجاهلة', 'Ignored'), count: count('ignored') },
        ]}
      />

      {list.length === 0 ? (
        <Empty icon={<ShieldCheck size={40} strokeWidth={1.2} />} title={status === 'open' ? t('لا توجد ملاحظات مفتوحة', 'No open issues') : t('لا شيء هنا', 'Nothing here')} />
      ) : (
        <div className="space-y-2">
          {list.map((i) => (
            <div key={i.id} className="card p-4">
              <div className="flex items-start gap-3">
                <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', i.severity === 'high' ? 'bg-danger' : i.severity === 'low' ? 'bg-faint' : 'bg-gold')} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{i.title}</span>
                    <span className="chip h-5 text-[10px]">{t.l(KIND[i.kind])}</span>
                  </div>
                  {i.detail && (
                    <p className="text-sm text-muted mt-1 whitespace-pre-line" dir="auto">
                      {i.detail}
                    </p>
                  )}
                  {i.sceneIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[...new Set(i.sceneIds)].map((sid) => {
                        const label = sceneLabel(ms, sid, t('مشهد', 'Scene'));
                        return label ? (
                          <Link key={sid} to={`/p/${project.id}/write/${sid}`} className="chip hover:text-ink">
                            {label}
                          </Link>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0">
                  {i.status === 'open' ? (
                    <>
                      <button className="icon-btn w-8 h-8 hover:text-ok" title={t('تم الحل', 'Resolve')} onClick={() => db.issues.update(i.id, { status: 'resolved', updatedAt: Date.now() })}>
                        <CheckCircle2 size={16} />
                      </button>
                      <button className="icon-btn w-8 h-8" title={t('تجاهل (مقصود)', 'Ignore (intentional)')} onClick={() => db.issues.update(i.id, { status: 'ignored', updatedAt: Date.now() })}>
                        <EyeOff size={16} />
                      </button>
                    </>
                  ) : (
                    <button className="icon-btn w-8 h-8" title={t('إعادة فتح', 'Reopen')} onClick={() => db.issues.update(i.id, { status: 'open', updatedAt: Date.now() })}>
                      <RotateCcw size={16} />
                    </button>
                  )}
                  {i.source !== 'auto' && (
                    <button className="icon-btn w-8 h-8 hover:text-danger" title={t('حذف', 'Delete')} onClick={() => db.issues.delete(i.id)}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ManualIssue open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ManualIssue({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const project = useProject();
  const ms = useManuscript(project.id);
  const entities = useEntities(project.id);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [scenes, setScenes] = useState<string[]>([]);
  const [ents, setEnts] = useState<string[]>([]);
  const sceneOpts = ms?.flatMap((c) => c.scenes.map((s, i) => ({ id: s.id, name: `${c.chapter.title} · ${s.title || i + 1}` }))) ?? [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ملاحظة استمرارية يدوية', 'Manual continuity issue')}
      footer={
        <button
          className="btn-primary"
          disabled={!title.trim()}
          onClick={async () => {
            const now = Date.now();
            await db.issues.add({ id: newId(), projectId: project.id, kind: 'manual', fingerprint: newId(), title: title.trim(), detail, sceneIds: scenes, chapterIds: [], entityIds: ents, status: 'open', severity: 'medium', source: 'manual', createdAt: now, updatedAt: now });
            setTitle('');
            setDetail('');
            setScenes([]);
            setEnts([]);
            onClose();
          }}
        >
          {t('إضافة', 'Add')}
        </button>
      }
    >
      <div className="space-y-3">
        <Field label={t('المشكلة', 'Issue')}>
          <input dir="auto" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('مثال: سارة تعرف بالرسالة قبل أن تقرأها', 'e.g. Sara knows about the letter before reading it')} />
        </Field>
        <Field label={t('التفاصيل', 'Details')}>
          <textarea dir="auto" rows={3} className="input" value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
        <div>
          <span className="label">{t('المشاهد ذات الصلة', 'Related scenes')}</span>
          <ChipSelect options={sceneOpts} value={scenes} onChange={setScenes} empty="—" />
        </div>
        <div>
          <span className="label">{t('عناصر الموسوعة', 'Bible entries')}</span>
          <ChipSelect options={entities} value={ents} onChange={setEnts} empty="—" />
        </div>
      </div>
    </Modal>
  );
}
