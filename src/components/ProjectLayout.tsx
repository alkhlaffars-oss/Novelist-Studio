import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  PenLine,
  LayoutList,
  BookOpen,
  CalendarRange,
  Workflow,
  StickyNote,
  ShieldCheck,
  BarChart3,
  History,
  Search,
  Sparkles,
  Download,
  Settings2,
  ChevronRight,
  ChevronLeft,
  MoreHorizontal,
  Home,
} from 'lucide-react';
import { db } from '@/db/db';
import type { Project } from '@/db/types';
import { touchProject } from '@/db/repo';
import { useT } from '@/store/settings';
import { useUI } from '@/store/ui';
import { BottomNav, Rail, type NavItem } from './Navigation';
import { Empty, Modal, cx } from './ui';

const ProjectCtx = createContext<Project | null>(null);
export function useProject(): Project {
  const p = useContext(ProjectCtx);
  if (!p) throw new Error('useProject outside ProjectLayout');
  return p;
}

export function useProjectNav(): (NavItem & { key: string })[] {
  const t = useT();
  const p = useParams().pid;
  const ic = (I: typeof PenLine) => <I size={20} strokeWidth={1.6} />;
  return useMemo(
    () => [
      { key: 'write', to: `/p/${p}/write`, label: t('الكتابة', 'Write'), icon: ic(PenLine) },
      { key: 'structure', to: `/p/${p}/structure`, label: t('البنية', 'Structure'), icon: ic(LayoutList) },
      { key: 'bible', to: `/p/${p}/bible`, label: t('الموسوعة', 'Bible'), icon: ic(BookOpen) },
      { key: 'timeline', to: `/p/${p}/timeline`, label: t('الزمن', 'Timeline'), icon: ic(CalendarRange) },
      { key: 'plot', to: `/p/${p}/plot`, label: t('الحبكة', 'Plot'), icon: ic(Workflow) },
      { key: 'notes', to: `/p/${p}/notes`, label: t('الملاحظات', 'Notes'), icon: ic(StickyNote) },
      { key: 'continuity', to: `/p/${p}/continuity`, label: t('التدقيق', 'Continuity'), icon: ic(ShieldCheck) },
      { key: 'assistant', to: `/p/${p}/assistant`, label: t('المساعد', 'Assistant'), icon: ic(Sparkles) },
      { key: 'stats', to: `/p/${p}/stats`, label: t('الإحصاءات', 'Stats'), icon: ic(BarChart3) },
      { key: 'history', to: `/p/${p}/history`, label: t('السجل', 'History'), icon: ic(History) },
      { key: 'search', to: `/p/${p}/search`, label: t('البحث', 'Search'), icon: ic(Search) },
      { key: 'export', to: `/p/${p}/export`, label: t('التصدير', 'Export'), icon: ic(Download) },
      { key: 'details', to: `/p/${p}/details`, label: t('المشروع', 'Project'), icon: ic(Settings2) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p, t.lang],
  );
}

export function ProjectLayout() {
  const { pid } = useParams();
  const t = useT();
  const nav = useProjectNav();
  const navigate = useNavigate();
  const focus = useUI((s) => s.focus);
  const moreOpen = useUI((s) => s.moreOpen);
  const setUI = useUI((s) => s.set);
  const location = useLocation();
  const project = useLiveQuery(() => (pid ? db.projects.get(pid) : undefined), [pid], null);

  useEffect(() => {
    if (pid) touchProject(pid);
  }, [pid]);

  useEffect(() => setUI({ moreOpen: false }), [location.pathname, setUI]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        navigate(`/p/${pid}/search`);
      }
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const item = nav[Number(e.key) - 1];
        if (item) {
          e.preventDefault();
          navigate(item.to);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, nav, pid]);

  if (project === null) return <div className="h-full" />;
  if (!project)
    return (
      <Empty
        title={t('لم يتم العثور على الرواية', 'Novel not found')}
        action={
          <Link to="/projects" className="btn-primary">
            {t('العودة إلى رواياتي', 'Back to novels')}
          </Link>
        }
      />
    );

  const Back = t.dir === 'rtl' ? ChevronRight : ChevronLeft;
  const primary = nav.filter((n) => ['write', 'structure', 'bible', 'plot'].includes(n.key));

  return (
    <ProjectCtx.Provider value={project}>
      <div className="h-full flex">
        {!focus && (
          <Rail
            items={nav}
            top={
              <Link to="/" title={t('الرئيسية', 'Home')} className="icon-btn mb-2">
                <Back size={20} />
              </Link>
            }
          />
        )}
        <main className={cx('flex-1 min-w-0 relative', !focus && 'pb-16 md:pb-0')}>
          <Outlet />
        </main>
        {!focus && (
          <BottomNav
            items={primary}
            extra={
              <button className={cx('flex-1 flex flex-col items-center justify-center gap-1 text-[11px]', moreOpen ? 'text-accent' : 'text-muted')} onClick={() => setUI({ moreOpen: true })}>
                <MoreHorizontal size={20} strokeWidth={1.6} />
                <span>{t('المزيد', 'More')}</span>
              </button>
            }
          />
        )}
        <Modal open={moreOpen} onClose={() => setUI({ moreOpen: false })} title={project.title}>
          <div className="grid grid-cols-3 gap-2 pb-2">
            <MoreLink to="/" icon={<Home size={20} strokeWidth={1.6} />} label={t('الرئيسية', 'Home')} />
            {nav
              .filter((n) => !primary.includes(n))
              .map((n) => (
                <MoreLink key={n.key} to={n.to} icon={n.icon} label={n.label} />
              ))}
          </div>
        </Modal>
      </div>
    </ProjectCtx.Provider>
  );
}

function MoreLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <Link to={to} className="flex flex-col items-center justify-center gap-2 rounded-xl bg-raised/60 hover:bg-raised h-20 text-xs text-muted hover:text-ink">
      {icon}
      {label}
    </Link>
  );
}

/** Standard page header used across project pages. */
export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-accent">{icon}</span>}
          <h1 className="h1 truncate">{title}</h1>
        </div>
        {subtitle && <div className="text-sm text-muted mt-1.5">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
