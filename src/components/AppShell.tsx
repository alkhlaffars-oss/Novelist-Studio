import { Outlet } from 'react-router-dom';
import { Home, Library, Settings as SettingsIcon } from 'lucide-react';
import { useT } from '@/store/settings';
import { BottomNav, Logo, Rail } from './Navigation';

export function AppShell() {
  const t = useT();
  const items = [
    { to: '/', end: true, label: t('الرئيسية', 'Home'), icon: <Home size={20} strokeWidth={1.6} /> },
    { to: '/projects', label: t('رواياتي', 'Novels'), icon: <Library size={20} strokeWidth={1.6} /> },
    { to: '/settings', label: t('الإعدادات', 'Settings'), icon: <SettingsIcon size={20} strokeWidth={1.6} /> },
  ];
  return (
    <div className="h-full flex">
      <Rail items={items} top={<div className="mb-4 mt-1"><Logo compact /></div>} />
      <main className="flex-1 min-w-0 overflow-y-auto pb-20 md:pb-0">
        <Outlet />
      </main>
      <BottomNav items={items} />
    </div>
  );
}
