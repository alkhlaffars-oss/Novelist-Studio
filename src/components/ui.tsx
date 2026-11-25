import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { useT } from '@/store/settings';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ───────────── Modal ─────────────

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-6xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />
      <div
        className={cx(
          'relative w-full bg-surface border border-line shadow-lift flex flex-col animate-fadeIn',
          'rounded-t-2xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[88dvh]',
          w,
        )}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-line/60">
            <h2 className="text-base font-semibold text-ink truncate">{title}</h2>
            <button className="icon-btn -me-2" onClick={onClose} aria-label="close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 px-5 py-3 border-t border-line/60 safe-bottom">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ───────────── Confirm / prompt dialogs (promise based) ─────────────

type DialogReq =
  | { kind: 'confirm'; title: string; message?: string; danger?: boolean; confirmText?: string; resolve: (v: boolean) => void }
  | { kind: 'prompt'; title: string; message?: string; initial?: string; placeholder?: string; resolve: (v: string | null) => void };

const useDialogStore = create<{ req: DialogReq | null; set: (r: DialogReq | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

export function confirmDialog(opts: { title: string; message?: string; danger?: boolean; confirmText?: string }) {
  return new Promise<boolean>((resolve) => useDialogStore.getState().set({ kind: 'confirm', ...opts, resolve }));
}
export function promptDialog(opts: { title: string; message?: string; initial?: string; placeholder?: string }) {
  return new Promise<string | null>((resolve) => useDialogStore.getState().set({ kind: 'prompt', ...opts, resolve }));
}

export function DialogHost() {
  const { req, set } = useDialogStore();
  const t = useT();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (req?.kind === 'prompt') setValue(req.initial ?? '');
  }, [req]);
  if (!req) return null;
  const close = (ok: boolean) => {
    if (req.kind === 'confirm') req.resolve(ok);
    else req.resolve(ok ? value : null);
    set(null);
  };
  return (
    <Modal
      open
      size="sm"
      onClose={() => close(false)}
      title={req.title}
      footer={
        <>
          <button className="btn-ghost" onClick={() => close(false)}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            className={req.kind === 'confirm' && req.danger ? 'btn bg-danger text-white hover:bg-danger/90' : 'btn-primary'}
            onClick={() => close(true)}
            autoFocus={req.kind === 'confirm'}
          >
            {(req.kind === 'confirm' && req.confirmText) || t('تأكيد', 'Confirm')}
          </button>
        </>
      }
    >
      {req.message && <p className="text-sm text-muted leading-relaxed whitespace-pre-line">{req.message}</p>}
      {req.kind === 'prompt' && (
        <input
          autoFocus
          className="input mt-3"
          value={value}
          placeholder={req.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && close(true)}
        />
      )}
    </Modal>
  );
}

// ───────────── Toasts ─────────────

type Toast = { id: number; text: string; kind: 'ok' | 'error' | 'info'; action?: { label: string; run: () => void } };
const useToasts = create<{ list: Toast[]; push: (t: Omit<Toast, 'id'>) => void; drop: (id: number) => void }>((set) => ({
  list: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set((s) => ({ list: [...s.list, { ...t, id }] }));
    setTimeout(() => set((s) => ({ list: s.list.filter((x) => x.id !== id) })), t.action ? 7000 : 3800);
  },
  drop: (id) => set((s) => ({ list: s.list.filter((x) => x.id !== id) })),
}));
export const toast = (text: string, kind: Toast['kind'] = 'ok', action?: Toast['action']) => useToasts.getState().push({ text, kind, action });

export function ToastHost() {
  const { list, drop } = useToasts();
  return createPortal(
    <div className="fixed z-[60] bottom-20 lg:bottom-6 inset-x-0 flex flex-col items-center gap-2 pointer-events-none px-4">
      {list.map((t) => (
        <div key={t.id} className="pointer-events-auto flex items-center gap-3 rounded-xl bg-raised border border-line shadow-lift px-4 py-2.5 text-sm animate-fadeIn max-w-md">
          {t.kind === 'ok' ? <CheckCircle2 size={16} className="text-ok shrink-0" /> : t.kind === 'error' ? <AlertTriangle size={16} className="text-danger shrink-0" /> : <Info size={16} className="text-accent shrink-0" />}
          <span className="text-ink">{t.text}</span>
          {t.action && (
            <button
              className="text-accent font-medium ms-2"
              onClick={() => {
                t.action!.run();
                drop(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ───────────── Dropdown menu ─────────────

export type MenuItem = { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | 'sep';

export function Menu({ trigger, items, align = 'end' }: { trigger: (p: { onClick: (e: React.MouseEvent) => void }) => ReactNode; items: MenuItem[]; align?: 'start' | 'end' }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const t = useT();

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const m = menuRef.current.getBoundingClientRect();
    const rtl = t.dir === 'rtl';
    const alignStartEdge = (align === 'end') === rtl; // left edge aligned
    let left = alignStartEdge ? anchor.left : anchor.right - m.width;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = anchor.bottom + 6;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, anchor.top - m.height - 6);
    setPos({ top, left });
  }, [anchor, align, t.dir]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [anchor]);

  return (
    <>
      {trigger({
        onClick: (e) => {
          e.stopPropagation();
          e.preventDefault();
          setPos(null);
          setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
        },
      })}
      {anchor &&
        createPortal(
          <div className="fixed inset-0 z-[55]" onClick={() => setAnchor(null)} onContextMenu={(e) => { e.preventDefault(); setAnchor(null); }}>
            <div
              ref={menuRef}
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
              className="fixed min-w-[200px] max-w-[280px] rounded-xl bg-raised border border-line shadow-lift py-1.5 animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              {items.map((it, i) =>
                it === 'sep' ? (
                  <div key={i} className="my-1 h-px bg-line/70" />
                ) : (
                  <button
                    key={i}
                    disabled={it.disabled}
                    className={cx(
                      'w-full flex items-center gap-2.5 px-3.5 h-10 text-sm text-start hover:bg-line/40 disabled:opacity-40',
                      it.danger ? 'text-danger' : 'text-ink',
                    )}
                    onClick={() => {
                      setAnchor(null);
                      it.onClick();
                    }}
                  >
                    <span className="w-4 shrink-0 opacity-80">{it.icon}</span>
                    <span className="truncate">{it.label}</span>
                  </button>
                ),
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// ───────────── Small building blocks ─────────────

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function ProgressRing({ value, size = 56, stroke = 5, children, color = 'rgb(var(--accent))' }: { value: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx('h-1.5 rounded-full bg-line/70 overflow-hidden', className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fadeIn">
      {icon && <div className="mb-4 text-faint">{icon}</div>}
      <h3 className="font-serif text-xl text-ink mb-1.5">{title}</h3>
      {text && <p className="text-sm text-muted max-w-sm leading-relaxed">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange, className }: { tabs: { key: K; label: string; icon?: ReactNode; count?: number }[]; value: K; onChange: (k: K) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 overflow-x-auto no-scrollbar border-b border-line/70', className)}>
      {tabs.map((tb) => (
        <button
          key={tb.key}
          onClick={() => onChange(tb.key)}
          className={cx(
            'flex items-center gap-2 px-3 h-10 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors',
            value === tb.key ? 'border-current text-accent' : 'border-transparent text-muted hover:text-ink',
          )}
        >
          {tb.icon}
          {tb.label}
          {tb.count !== undefined && <span className="text-[11px] text-faint">{tb.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ open, onClose, side, children, className }: { open: boolean; onClose: () => void; side: 'start' | 'end'; children: ReactNode; className?: string }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-black/50 animate-fadeIn" onClick={onClose} />
      <div
        className={cx(
          'absolute top-0 bottom-0 w-[86vw] max-w-sm bg-surface border-line shadow-lift flex flex-col animate-fadeIn safe-top safe-bottom',
          side === 'start' ? 'start-0 border-e' : 'end-0 border-s',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Multi-select of entities rendered as toggle chips. */
export function ChipSelect({ options, value, onChange, empty }: { options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; empty?: string }) {
  if (!options.length) return <p className="text-xs text-faint">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button key={o.id} type="button" className={cx('chip', on && 'on')} onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}>
            {o.name || '—'}
          </button>
        );
      })}
    </div>
  );
}

/** Text input that commits on blur / debounce, avoiding a DB write per keystroke. */
export function DebouncedInput({
  value,
  onCommit,
  multiline,
  className,
  delay = 400,
  ...rest
}: { value: string; onCommit: (v: string) => void; multiline?: boolean; className?: string; delay?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { rows?: number }) {
  const [v, setV] = useState(value);
  const timer = useRef<number>();
  const latest = useRef(value);
  useEffect(() => {
    if (value !== latest.current) {
      setV(value);
      latest.current = value;
    }
  }, [value]);
  const commit = (nv: string) => {
    window.clearTimeout(timer.current);
    if (nv !== latest.current) {
      latest.current = nv;
      onCommit(nv);
    }
  };
  const onChange = (nv: string) => {
    setV(nv);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => commit(nv), delay);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (multiline)
    return (
      <textarea
        dir={v ? 'auto' : undefined}
        className={cx('input', className)}
        value={v}
        rows={rest.rows ?? 3}
        placeholder={rest.placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => commit(v)}
      />
    );
  return <input dir={v ? 'auto' : undefined} {...rest} className={cx('input', className)} value={v} onChange={(e) => onChange(e.target.value)} onBlur={() => commit(v)} />;
}

/** Arabic locale with Western digits, matching how digits appear in the manuscript. */
export const LOCALE_AR = 'ar-u-nu-latn';

export function formatNumber(n: number, lang: 'ar' | 'en') {
  return new Intl.NumberFormat(lang === 'ar' ? LOCALE_AR : 'en-US').format(Math.round(n));
}

export function useFmt() {
  const t = useT();
  return {
    n: (n: number) => formatNumber(n, t.lang),
    date: (d: number | string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) =>
      new Intl.DateTimeFormat(t.lang === 'ar' ? LOCALE_AR : 'en-US', opts).format(new Date(d)),
    rel: (ts: number) => relativeTime(ts, t.lang),
  };
}

export function relativeTime(ts: number, lang: 'ar' | 'en') {
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  const diff = (ts - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return rtf.format(Math.round(diff / (86400 * 30)), 'month');
}

/** Reads an image file and downsizes it to keep the database small. */
export function readImageFile(file: File, maxSize = 900, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('bad image'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function ImagePicker({ value, onChange, className, children }: { value?: string; onChange: (v: string | undefined) => void; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  const t = useT();
  return (
    <div className={cx('relative group', className)}>
      <button type="button" className="absolute inset-0 w-full h-full" onClick={() => ref.current?.click()} aria-label={t('اختيار صورة', 'Choose image')} />
      {value ? <img src={value} alt="" className="w-full h-full object-cover pointer-events-none" /> : children}
      {value && (
        <button
          type="button"
          className="absolute top-1.5 end-1.5 rounded-full bg-black/60 text-white w-7 h-7 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onChange(undefined);
          }}
          aria-label={t('إزالة الصورة', 'Remove image')}
        >
          <X size={14} />
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await readImageFile(f));
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const safeFilename = (s: string) => (s || 'novel').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80);

export function useMediaQuery(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}
