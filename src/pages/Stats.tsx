import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart3, Flame, Timer, Gauge, CalendarCheck, Target, Trophy, Pencil } from 'lucide-react';
import { db } from '@/db/db';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { BarChart, HBarList, Heatmap } from '@/components/Charts';
import { Field, Modal, ProgressRing, Tabs, useFmt } from '@/components/ui';
import { useManuscript } from '@/hooks/useManuscript';
import { dailyTotals, lastNDays, longestStreak, monthStartKey, projectFinish, sessionStats, streak, sumSince, weekStartKey } from '@/lib/stats';
import { todayKey } from '@/lib/text';
import { useSettings, useT } from '@/store/settings';

export default function Stats() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const navigate = useNavigate();
  const goals = useSettings((s) => s.goals);
  const [range, setRange] = useState<'days' | 'weeks' | 'months'>('days');
  const [goalsOpen, setGoalsOpen] = useState(false);
  const ms = useManuscript(project.id);
  const data = useLiveQuery(async () => ({
    stats: await db.dailyStats.where('projectId').equals(project.id).toArray(),
    sessions: await db.sessions.where('projectId').equals(project.id).toArray(),
  }), [project.id]);
  if (!data || !ms) return <div className="page" />;

  const totals = dailyTotals(data.stats);
  const ss = sessionStats(data.sessions);
  const remaining = Math.max(0, project.targetWords - project.wordCount);
  const finish = projectFinish(remaining, totals);
  const today = totals.get(todayKey())?.added ?? 0;
  const week = sumSince(totals, weekStartKey(t.lang));
  const month = sumSince(totals, monthStartKey());
  const totalAdded = [...totals.values()].reduce((a, v) => a + v.added, 0);
  const activeDays = [...totals.values()].filter((v) => v.added > 0).length;
  const etaDate = Number.isFinite(finish.days) && finish.days > 0 ? new Date(Date.now() + finish.days * 86400000) : null;
  const deadline = project.targetDate ? new Date(project.targetDate + 'T00:00:00') : null;
  const daysToDeadline = deadline ? Math.ceil((deadline.getTime() - Date.now()) / 86400000) : null;
  const neededPerDay = daysToDeadline && daysToDeadline > 0 ? Math.ceil(remaining / daysToDeadline) : null;

  const series = (() => {
    if (range === 'days')
      return lastNDays(30).map((d) => ({ key: d, label: String(new Date(d + 'T00:00:00').getDate()), tip: f.date(d + 'T00:00:00', { weekday: 'short', day: 'numeric', month: 'short' }), value: totals.get(d)?.added ?? 0 }));
    if (range === 'weeks')
      return Array.from({ length: 12 }, (_, i) => {
        const start = new Date();
        start.setDate(start.getDate() - (11 - i) * 7 - 6);
        const days = Array.from({ length: 7 }, (_, k) => {
          const d = new Date(start);
          d.setDate(start.getDate() + k);
          return todayKey(d);
        });
        return { key: days[0], label: f.date(days[0] + 'T00:00:00', { day: 'numeric', month: 'numeric' }), tip: `${f.date(days[0] + 'T00:00:00', { day: 'numeric', month: 'short' })} – ${f.date(days[6] + 'T00:00:00', { day: 'numeric', month: 'short' })}`, value: days.reduce((a, d) => a + (totals.get(d)?.added ?? 0), 0) };
      });
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (11 - i));
      const prefix = todayKey(d).slice(0, 7);
      let v = 0;
      for (const [k, x] of totals) if (k.startsWith(prefix)) v += x.added;
      return { key: prefix, label: f.date(d, { month: 'short' }), tip: f.date(d, { month: 'long', year: 'numeric' }), value: v };
    });
  })();
  const goal = range === 'days' ? goals.daily : range === 'weeks' ? goals.weekly : goals.monthly;

  return (
    <div className="page max-w-6xl space-y-6">
      <PageHeader
        icon={<BarChart3 size={22} />}
        title={t('الإحصاءات والأهداف', 'Statistics & goals')}
        actions={
          <button className="btn-outline" onClick={() => setGoalsOpen(true)}>
            <Pencil size={15} /> {t('تعديل الأهداف', 'Edit goals')}
          </button>
        }
      />

      <section className="grid gap-4 md:grid-cols-[1fr_1.3fr]">
        <div className="card p-5 flex items-center gap-6">
          <ProgressRing value={project.targetWords ? project.wordCount / project.targetWords : 0} size={128} stroke={8}>
            <div className="text-center">
              <div className="text-2xl font-semibold text-ink tabular-nums">{project.targetWords ? Math.min(100, Math.round((project.wordCount / project.targetWords) * 100)) : 0}%</div>
              <div className="text-[10px] text-faint">{t('من الهدف', 'of target')}</div>
            </div>
          </ProgressRing>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-2xl font-semibold text-ink tabular-nums">{f.n(project.wordCount)}</span> <span className="text-muted">/ {f.n(project.targetWords)}</span>
            </div>
            <div className="text-muted">
              {t('المتبقي', 'Remaining')}: <b className="text-ink">{f.n(remaining)}</b> {t('كلمة', 'words')}
            </div>
            <div className="text-muted">
              {t('الإنجاز المتوقع', 'Projected finish')}:{' '}
              <b className="text-ink">{remaining === 0 ? t('اكتمل الهدف 🎉', 'Target reached 🎉') : etaDate ? f.date(etaDate, { dateStyle: 'long' }) : t('اكتب بضعة أيام لنحسب', 'Write a few days to estimate')}</b>
            </div>
            {finish.perDay > 0 && (
              <div className="text-[11px] text-faint">
                {t('على أساس متوسطك الفعلي', 'Based on your actual average of')} {f.n(finish.perDay)} {t('كلمة يومياً (آخر ٣٠ يوماً)', 'words/day (last 30 days)')}
              </div>
            )}
            {neededPerDay !== null && (
              <div className="text-[11px] text-gold">
                {t(`لبلوغ الموعد المستهدف تحتاج ${f.n(neededPerDay)} كلمة يومياً`, `To meet your target date you need ${f.n(neededPerDay)} words/day`)}
              </div>
            )}
          </div>
        </div>
        <div className="card p-5 grid grid-cols-3 gap-3">
          {[
            { label: t('اليوم', 'Today'), v: today, g: goals.daily },
            { label: t('هذا الأسبوع', 'This week'), v: week, g: goals.weekly },
            { label: t('هذا الشهر', 'This month'), v: month, g: goals.monthly },
          ].map((x) => (
            <div key={x.label} className="flex flex-col items-center text-center gap-2">
              <ProgressRing value={x.g ? x.v / x.g : 0} size={84} stroke={6}>
                <span className="text-sm font-semibold text-ink tabular-nums">{f.n(x.v)}</span>
              </ProgressRing>
              <div className="text-xs text-muted">{x.label}</div>
              <div className="text-[10.5px] text-faint">
                {t('الهدف', 'Goal')} {f.n(x.g)}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon={<Flame size={16} />} label={t('أيام متتالية', 'Current streak')} value={f.n(streak(totals))} sub={`${t('الأطول', 'Best')}: ${f.n(longestStreak(totals))}`} />
        <Tile icon={<Gauge size={16} />} label={t('متوسط السرعة', 'Average speed')} value={`${f.n(ss.wpm)}`} sub={t('كلمة/دقيقة أثناء الجلسات', 'words/min in sessions')} />
        <Tile icon={<Timer size={16} />} label={t('أطول جلسة', 'Longest session')} value={ss.longest ? `${f.n((ss.longest.end - ss.longest.start) / 60000)} ${t('د', 'min')}` : '—'} sub={ss.longest ? `+${f.n(ss.longest.added)} ${t('كلمة', 'words')} · ${f.date(ss.longest.start)}` : ''} />
        <Tile icon={<CalendarCheck size={16} />} label={t('جلسات الكتابة', 'Writing sessions')} value={f.n(ss.count)} sub={`${f.n(activeDays)} ${t('يوم كتابة', 'writing days')} · ${f.n(totalAdded)} ${t('كلمة مضافة', 'added')}`} />
      </section>

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="section-title">{t('الكلمات المكتوبة', 'Words written')}</h2>
          <Tabs
            value={range}
            onChange={setRange}
            className="border-b-0"
            tabs={[
              { key: 'days', label: t('يومياً', 'Daily') },
              { key: 'weeks', label: t('أسبوعياً', 'Weekly') },
              { key: 'months', label: t('شهرياً', 'Monthly') },
            ]}
          />
        </div>
        <BarChart data={series} goal={goal} goalLabel={t('الهدف', 'Goal')} format={(n) => `${f.n(n)} ${t('كلمة', 'words')}`} height={200} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="section-title mb-4">{t('كلمات كل فصل', 'Words per chapter')}</h2>
          {ms.length ? (
            <HBarList
              rows={ms.map((c) => ({ id: c.scenes[0]?.id ?? c.chapter.id, label: c.chapter.title, value: c.words, sub: `${c.scenes.length} ${t('مشهد', 'sc.')}` }))}
              format={f.n}
              onClick={(id) => navigate(`/p/${project.id}/write/${id}`)}
            />
          ) : (
            <p className="text-sm text-faint">—</p>
          )}
        </div>
        <div className="card p-5">
          <h2 className="section-title mb-4">{t('نشاط الكتابة', 'Writing activity')}</h2>
          <Heatmap totals={totals} weeks={20} format={(n) => `${f.n(n)} ${t('كلمة', 'words')}`} lang={t.lang} />
          <div className="flex items-center gap-2 mt-4 text-xs text-muted">
            <Trophy size={14} className="text-gold" />
            {(() => {
              const best = [...totals.entries()].sort((a, b) => b[1].added - a[1].added)[0];
              return best ? t(`أفضل يوم: ${f.n(best[1].added)} كلمة في ${f.date(best[0] + 'T00:00:00')}`, `Best day: ${f.n(best[1].added)} words on ${f.date(best[0] + 'T00:00:00')}`) : t('لا توجد بيانات بعد', 'No data yet');
            })()}
          </div>
        </div>
      </section>
      <p className="text-[11px] text-faint">{t('تُحسب الكلمات المضافة من الفرق بين كل حفظ وما قبله؛ والحذف يُسجل منفصلاً ولا يُخصم من إنتاجك اليومي. الجلسة تنتهي بعد ٥ دقائق من التوقف.', 'Added words are computed per save; deletions are tracked separately and not subtracted from daily output. A session ends after 5 idle minutes.')}</p>
      <GoalsDialog open={goalsOpen} onClose={() => setGoalsOpen(false)} />
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink mt-2 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-faint mt-1 truncate">{sub}</div>}
    </div>
  );
}

export function GoalsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const project = useProject();
  const { goals, set } = useSettings();
  return (
    <Modal open={open} onClose={onClose} size="sm" title={t('أهداف الكتابة', 'Writing goals')} footer={<button className="btn-primary" onClick={onClose}>{t('تم', 'Done')}</button>}>
      <div className="space-y-3">
        {(['daily', 'weekly', 'monthly'] as const).map((k) => (
          <Field key={k} label={{ daily: t('الهدف اليومي (كلمات)', 'Daily goal (words)'), weekly: t('الهدف الأسبوعي', 'Weekly goal'), monthly: t('الهدف الشهري', 'Monthly goal') }[k]}>
            <input type="number" min={0} step={100} className="input" value={goals[k]} onChange={(e) => set({ goals: { ...goals, [k]: Math.max(0, Number(e.target.value) || 0) } })} />
          </Field>
        ))}
        <Field label={t('الهدف النهائي لهذه الرواية', 'Target for this novel')}>
          <input type="number" min={0} step={1000} className="input" defaultValue={project.targetWords} onBlur={(e) => db.projects.update(project.id, { targetWords: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <p className="text-[11px] text-faint flex gap-1.5">
          <Target size={13} /> {t('الأهداف اليومية والأسبوعية والشهرية مشتركة بين كل رواياتك.', 'Daily, weekly and monthly goals apply across all novels.')}
        </p>
      </div>
    </Modal>
  );
}
