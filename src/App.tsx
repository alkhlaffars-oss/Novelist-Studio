import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useSettings } from '@/store/settings';
import { DialogHost, ToastHost } from '@/components/ui';
import { AppShell } from '@/components/AppShell';
import { ProjectLayout } from '@/components/ProjectLayout';
import { requestPersistentStorage } from '@/db/db';
import { runAutoBackupIfDue } from '@/lib/backup';
import { recoverEmergencyBuffer } from '@/lib/emergency';
import { PwaPrompt } from '@/components/PwaPrompt';
import { DbStatus } from '@/components/DbStatus';
import Dashboard from '@/pages/Dashboard';
import { initCloud } from '@/cloud/account';
import { startSyncEngine } from '@/cloud/sync';

const Projects = lazy(() => import('@/pages/Projects'));
const Settings = lazy(() => import('@/pages/Settings'));
const Write = lazy(() => import('@/pages/Write'));
const Structure = lazy(() => import('@/pages/Structure'));
const Bible = lazy(() => import('@/pages/Bible'));
const Timeline = lazy(() => import('@/pages/Timeline'));
const Plot = lazy(() => import('@/pages/Plot'));
const Notes = lazy(() => import('@/pages/Notes'));
const Continuity = lazy(() => import('@/pages/Continuity'));
const Stats = lazy(() => import('@/pages/Stats'));
const History = lazy(() => import('@/pages/History'));
const Search = lazy(() => import('@/pages/Search'));
const Export = lazy(() => import('@/pages/Export'));
const Assistant = lazy(() => import('@/pages/Assistant'));
const ProjectDetails = lazy(() => import('@/pages/ProjectDetails'));
const Admin = lazy(() => import('@/pages/Admin'));

function useThemeAndLanguage() {
  const { theme, lang, accent, uiScale } = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
      root.classList.toggle('dark', dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121214' : '#f6f3ed');
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    document.documentElement.style.fontSize = `${uiScale * 100}%`;
  }, [accent, uiScale]);
}

export function App() {
  useThemeAndLanguage();
  useEffect(() => {
    requestPersistentStorage();
    recoverEmergencyBuffer().catch(console.error);
    startSyncEngine();
    initCloud().catch(console.error);
    const id = window.setTimeout(() => runAutoBackupIfDue().catch(console.error), 4000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <HashRouter>
      <Suspense fallback={<div className="h-full flex items-center justify-center text-faint">…</div>}>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="settings" element={<Settings />} />
            <Route path="admin" element={<Admin />} />
          </Route>
          <Route path="p/:pid" element={<ProjectLayout />}>
            <Route index element={<Navigate to="write" replace />} />
            <Route path="write/:sceneId?" element={<Write />} />
            <Route path="structure" element={<Structure />} />
            <Route path="bible/:tab?/:eid?" element={<Bible />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="plot" element={<Plot />} />
            <Route path="notes" element={<Notes />} />
            <Route path="continuity" element={<Continuity />} />
            <Route path="stats" element={<Stats />} />
            <Route path="history" element={<History />} />
            <Route path="search" element={<Search />} />
            <Route path="export" element={<Export />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="details" element={<ProjectDetails />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <DialogHost />
      <ToastHost />
      <PwaPrompt />
      <DbStatus />
    </HashRouter>
  );
}
