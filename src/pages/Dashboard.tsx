import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Flame, PenLine, BookMarked, CheckCircle2, CalendarDays, Feather, Upload } from 'lucide-react';
import { db } from '@/db/db';
import type { Chapter, Project, Scene } from '@/db/types';
import { useSettings, useT } from '@/store/settings';
import { NewProjectDialog } from '@/components/ProjectForm';
import { BarChart } from '@/components/Charts';
import { Logo } from '@/components/Navigation';
import { ProgressBar, ProgressRing, useFmt, cx } from '@/components/ui';
import { dailyTotals, lastNDays, monthStartKey, streak, sumSince, weekStartKey } from '@/lib/stats';
import { htmlToText, todayKey } from '@/lib/text';
import { PROJECT_STATUS } from '@/lib/labels';

export default function Dashboard() {
  const t = useT();
  const f = useFmt();
  const goals = useSettings((s) => s.goals);
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const projects = (await db.projects.toArray()).filter((p) => !p.archived).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    const stats = await db.dailyStats.toArray();
    const completedChapters = await db.chapters.filter((c) => c.status === 'complete').count();
    const lastEdited = await db.scenes.orderBy('updatedAt').last();
    const lastScenes = new Map<string, { scene: Scene; chapter?: Chapter; html: string }>();
    for (const p of projects) {
      const scene = p.lastSceneId ? await db.scenes.get(p.lastSceneId) : undefined;
      if (scene) lastScenes.set(p.id, { scene, chapter: await db.chapters.get(scene.chapterId), html: (await db.sceneTexts.get(scene.id))?.html ?? '' });
    }
    const lastEditedChapter = lastEdited ? await db.chapters.get(lastEdited.chapterId) : undefined;
    const lastEditedHtml = lastEdited ? (await db.sceneTexts.get(lastEdited.id))?.html ?? '' : '';
    return { projects, stats, completedChapters, lastEdited, lastEditedChapter, lastEditedHtml, lastScenes };
  }, []);

  if (!data) return <div className="page" />;
  const { projects, stats, completedChapters, lastEdited, lastEditedChapter, lastEditedHtml, lastScenes } = data;
  const totals = dailyTotals(stats);
  const today = totals.get(todayKey())?.added ?? 0;
  const week = sumSince(totals, weekStartKey(t.lang));
  const month = sumSince(totals, monthStartKey());
  const currentStreak = streak(totals);
  const totalWords = projects.reduce((a, p) => a + p.wordCount, 0);
  const days = lastNDays(14).map((d) => ({
    key: d,
    label: new Date(d + 'T00:00:00').toLocaleDateString(t.lang === 'ar' ? 'ar-u-nu-latn' : 'en-US', { day: 'numeric' }),
    tip: f.date(d + 'T00:00:00', { weekday: 'long', day: 'numeric', month: 'short' }),
    value: totals.get(d)?.added ?? 0,
  }));
  const recent = projects[0];
  const recentLast = recent ? lastScenes.get(recent.id) : undefined;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('صباح الخير', 'Good morning') : hour < 18 ? t('طاب يومك', 'Good afternoon') : t('مساء الخير', 'Good evening');

  if (projects.length === 0) return <Welcome onCreate={() => setNewOpen(true)} newOpen={newOpen} close={() => setNewOpen(false)} />;

  return (
    <div className="page space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{f.date(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="h1 mt-1">{greeting}</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => setNewOpen(true)}>
            <Plus size={16} /> {t('رواية جديدة', 'New novel')}
          </button>
          {recent && (
            <button className="btn-primary" onClick={() => navigate(`/p/${recent.id}/write/${recent.lastSceneId ?? ''}`)}>
              <PenLine size={16} /> {t('استكمال آخر جلسة', 'Resume last session')}
            </button>
          )}
        </div>
      </header>

      {/* Hero: last session + today's goal */}
      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        {recent && (
          <Link to={`/p/${recent.id}/write/${recent.lastSceneId ?? ''}`} className="card group relative overflow-hidden p-5 sm:p-6 flex gap-5 hover:border-line transition-colors">
            <Cover project={recent} className="w-20 sm:w-24 shrink-0" />
            <div className="min-w-0 flex-1 flex flex-col">
              <span className="section-title">{t('آخر رواية فتحتها', 'Last opened')}</span>
              <h2 className="font-serif text-2xl text-ink mt-1 truncate">{recent.title}</h2>
              {recentLast && (
                <p className="text-xs text-muted mt-1 truncate">
                  {recentLast.chapter?.title}
                  {recentLast.scene.title ? ` · ${recentLast.scene.title}` : ''}
                </p>
              )}
              <p className="font-serif text-[15px] text-muted/90 leading-relaxed mt-3 line-clamp-2" dir="auto">
                {lastParagraph(recentLast?.html) || t('صفحة بيضاء تنتظر كلماتك الأولى…', 'A blank page awaits your first words…')}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-3">
                <ProgressBar value={recent.targetWords ? recent.wordCount / recent.targetWords : 0} className="flex-1" />
                <span className="text-xs text-muted tabular-nums">
                  {f.n(recent.wordCount)} / {f.n(recent.targetWords)}
                </span>
              </div>
            </div>
          </Link>
        )}
        <div className="card p-5 sm:p-6 flex items-center gap-5">
          <ProgressRing value={goals.daily ? today / goals.daily : 0} size={108} stroke={7}>
            <div className="text-center">
              <div className="text-xl font-semibold text-ink tabular-nums">{f.n(today)}</div>
              <div className="text-[10px] text-faint">/ {f.n(goals.daily)}</div>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <span className="section-title">{t('هدف اليوم', "Today's goal")}</span>
            <p className="text-sm text-muted mt-2 leading-relaxed">
              {today >= goals.daily
                ? t('أحسنت! حققت هدفك اليوم.', 'Well done — goal reached today.')
                : t(`تبقّى ${f.n(goals.daily - today)} كلمة`, `${f.n(goals.daily - today)} words to go`)}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Flame size={18} className={currentStreak ? 'text-gold' : 'text-faint'} />
              <span className="text-ink font-medium">{f.n(currentStreak)}</span>
              <span className="text-xs text-muted">{t('أيام كتابة متتالية', 'day writing streak')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Key numbers */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={<Feather size={16} />} label={t('إجمالي الكلمات', 'Total words')} value={f.n(totalWords)} />
        <Stat icon={<CheckCircle2 size={16} />} label={t('فصول مكتملة', 'Chapters complete')} value={f.n(completedChapters)} />
        <Stat icon={<CalendarDays size={16} />} label={t('هذا الأسبوع', 'This week')} value={f.n(week)} goal={goals.weekly} />
        <Stat icon={<BookMarked size={16} />} label={t('هذا الشهر', 'This month')} value={f.n(month)} goal={goals.monthly} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-4">
            <span className="section-title">{t('آخر ١٤ يوماً', 'Last 14 days')}</span>
            <span className="text-xs text-muted">{t('كلمات مضافة يومياً', 'Words added per day')}</span>
          </div>
          <BarChart data={days} goal={goals.daily} goalLabel={t('الهدف', 'Goal')} format={(n) => `${f.n(n)} ${t('كلمة', 'words')}`} height={150} />
        </div>
        <div className="card p-5">
          <span className="section-title">{t('آخر فصل تم تعديله', 'Last edited chapter')}</span>
          {lastEdited && lastEditedChapter ? (
            <Link to={`/p/${lastEdited.projectId}/write/${lastEdited.id}`} className="block mt-3 group">
              <div className="font-serif text-lg text-ink group-hover:text-accent">{lastEditedChapter.title}</div>
              <div className="text-xs text-muted mt-1">
                {projects.find((p) => p.id === lastEdited.projectId)?.title} · {f.rel(lastEdited.updatedAt)}
              </div>
              <p className="text-sm text-muted mt-3 line-clamp-3 font-serif leading-relaxed" dir="auto">
                {lastParagraph(lastEditedHtml)}
              </p>
            </Link>
          ) : (
            <p className="text-sm text-faint mt-3">{t('لم تبدأ الكتابة بعد.', 'Nothing written yet.')}</p>
          )}
        </div>
      </section>

      {/* Continue writing per novel */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-serif text-xl text-ink">{t('تابع الكتابة', 'Continue writing')}</h2>
          <Link to="/projects" className="text-sm text-muted hover:text-accent">
            {t('كل الروايات', 'All novels')}
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.slice(0, 6).map((p) => {
            const last = lastScenes.get(p.id);
            return (
              <Link key={p.id} to={`/p/${p.id}/write/${p.lastSceneId ?? ''}`} className="card p-4 flex gap-4 hover:border-line transition-colors group">
                <Cover project={p} className="w-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg text-ink truncate group-hover:text-accent">{p.title}</h3>
                  </div>
                  <p className="text-xs text-muted truncate">
                    {t.l(PROJECT_STATUS[p.status])}
                    {last && ` · ${last.chapter?.title ?? ''}${last.scene.title ? ' — ' + last.scene.title : ''}`}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <ProgressBar value={p.targetWords ? p.wordCount / p.targetWords : 0} className="flex-1" />
                    <span className="text-[11px] text-muted tabular-nums">{p.targetWords ? Math.min(100, Math.round((p.wordCount / p.targetWords) * 100)) : 0}%</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
      <NewProjectDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function Stat({ icon, label, value, goal }: { icon: React.ReactNode; label: string; value: string; goal?: number }) {
  const f = useFmt();
  const t = useT();
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-muted text-xs">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-semibold text-ink mt-2 tabular-nums">{value}</div>
      {goal ? <div className="text-[11px] text-faint mt-1">{t('الهدف', 'Goal')}: {f.n(goal)}</div> : <div className="h-[18px]" />}
    </div>
  );
}

export function Cover({ project, className }: { project: Project; className?: string }) {
  return (
    <div className={cx('aspect-[2/3] rounded-md overflow-hidden border border-line/70 shadow-soft', className)}>
      {project.cover ? (
        <img src={project.cover} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-1.5 text-center bg-gradient-to-br from-raised to-surface">
          <span className="font-serif text-[11px] leading-tight text-gold/90 line-clamp-4" dir="auto">
            {project.title}
          </span>
        </div>
      )}
    </div>
  );
}

function lastParagraph(html?: string) {
  if (!html) return '';
  const text = htmlToText(html).split('\n').filter((l) => l.trim() && l.trim() !== '* * *');
  const last = text[text.length - 1] ?? '';
  return last.length > 220 ? '…' + last.slice(-220) : last;
}

function Welcome({ onCreate, newOpen, close }: { onCreate: () => void; newOpen: boolean; close: () => void }) {
  const t = useT();
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-16">
      <div className="max-w-lg text-center animate-fadeIn">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl text-ink leading-tight">{t('كل رواية عظيمة بدأت بصفحة بيضاء', 'Every great novel began with a blank page')}</h1>
        <p className="text-muted mt-5 leading-relaxed">
          {t(
            'استوديو هادئ للكتابة والتخطيط: فصول ومشاهد، موسوعة للعالم والشخصيات، خط زمني، لوحة حبكة، وسجل نسخ يحمي كل كلمة. كل شيء يُحفظ على جهازك ويعمل دون إنترنت.',
            'A calm studio for writing and planning: chapters and scenes, a world & character bible, timelines, a plot board and version history that protects every word. Everything is stored on your device and works offline.',
          )}
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          <button className="btn-primary h-11 px-5" onClick={onCreate}>
            <Plus size={18} /> {t('ابدأ روايتك الأولى', 'Start your first novel')}
          </button>
          <Link to="/projects?import=1" className="btn-outline h-11 px-5">
            <Upload size={16} /> {t('استيراد مخطوطة أو نسخة احتياطية', 'Import a manuscript or backup')}
          </Link>
        </div>
      </div>
      <NewProjectDialog open={newOpen} onClose={close} />
    </div>
  );
}
