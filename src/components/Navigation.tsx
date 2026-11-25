import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { cx } from './ui';

export type NavItem = { to: string; label: string; icon: ReactNode; end?: boolean };

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg viewBox="0 0 512 512" className="w-8 h-8 shrink-0" aria-hidden>
        <rect width="512" height="512" rx="112" fill="rgb(var(--raised))" />
        <path d="M152 380V132l208 248V132" fill="none" stroke="rgb(var(--gold))" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="360" cy="132" r="18" fill="rgb(var(--violet))" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="font-serif text-[17px] text-ink tracking-wide">Novelist</div>
          <div className="text-[9px] tracking-[0.35em] text-faint mt-0.5">STUDIO</div>
        </div>
      )}
    </div>
  );
}

/** Vertical rail for tablets/desktop. */
export function Rail({ items, top, bottom }: { items: NavItem[]; top?: ReactNode; bottom?: ReactNode }) {
  return (
    <nav className="hidden md:flex flex-col w-[76px] shrink-0 border-e border-line/60 bg-surface/60 py-3 items-center gap-1 overflow-y-auto no-scrollbar">
      {top}
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          title={it.label}
          className={({ isActive }) =>
            cx(
              'group w-[64px] flex flex-col items-center gap-1 rounded-xl py-2 text-[10.5px] leading-tight transition-colors',
              isActive ? 'bg-raised text-accent' : 'text-muted hover:text-ink hover:bg-raised/60',
            )
          }
        >
          {it.icon}
          <span className="truncate max-w-full px-1">{it.label}</span>
        </NavLink>
      ))}
      <div className="flex-1" />
      {bottom}
    </nav>
  );
}

/** Touch-friendly bottom navigation for phones. */
export function BottomNav({ items, extra }: { items: NavItem[]; extra?: ReactNode }) {
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line/70 safe-bottom">
      <div className="flex items-stretch justify-around h-16">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => cx('flex-1 flex flex-col items-center justify-center gap-1 text-[11px]', isActive ? 'text-accent' : 'text-muted')}
          >
            {it.icon}
            <span>{it.label}</span>
          </NavLink>
        ))}
        {extra}
      </div>
    </nav>
  );
}
