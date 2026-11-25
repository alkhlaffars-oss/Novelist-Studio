import { useState } from 'react';
import { cx } from './ui';

export type BarDatum = { key: string; label: string; value: number; tip?: string };

/**
 * Single-series bar chart (SVG): rounded data-ends anchored to the baseline, recessive grid,
 * optional dashed goal line, and a per-bar hover tooltip with generous hit targets.
 */
export function BarChart({
  data,
  height = 160,
  goal,
  goalLabel,
  format = (n) => String(n),
  highlightLast = true,
  className,
}: {
  data: BarDatum[];
  height?: number;
  goal?: number;
  goalLabel?: string;
  format?: (n: number) => string;
  highlightLast?: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, goal ?? 0, ...data.map((d) => d.value)) * 1.08;
  const W = 1000;
  const H = height;
  const n = data.length;
  const slot = W / Math.max(1, n);
  const gap = Math.max(2, slot * 0.28);
  const bw = Math.max(2, slot - gap);
  const y = (v: number) => H - (v / max) * H;
  const r = Math.min(4, bw / 2);
  const labelEvery = Math.ceil(n / 8);

  return (
    <div className={cx('relative select-none', className)} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full block" style={{ height }} onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="rgb(var(--line))" strokeOpacity={0.5} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="rgb(var(--line))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const x = i * slot + gap / 2;
          const top = y(d.value);
          const h = H - top;
          const active = hover === i || (hover === null && highlightLast && i === n - 1);
          return (
            <g key={d.key}>
              {d.value > 0 && (
                <path
                  d={`M${x},${H} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${H} Z`}
                  fill="rgb(var(--accent))"
                  fillOpacity={active ? 1 : 0.55}
                  style={{ transition: 'fill-opacity .15s' }}
                />
              )}
              {d.value > 0 && h < 2 && <rect x={x} y={H - 2} width={bw} height={2} fill="rgb(var(--accent))" />}
              <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
            </g>
          );
        })}
        {goal !== undefined && goal > 0 && (
          <line x1={0} x2={W} y1={y(goal)} y2={y(goal)} stroke="rgb(var(--violet))" strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {goal !== undefined && goal > 0 && goalLabel && (
        <div className="absolute end-0 text-[10px] text-violet bg-surface/80 px-1 rounded" style={{ top: Math.max(0, y(goal) - 16) }}>
          {goalLabel}
        </div>
      )}
      <div className="flex mt-1.5 text-[10px] text-faint">
        {data.map((d, i) => (
          <div key={d.key} className="text-center truncate" style={{ width: `${100 / n}%` }}>
            {i % labelEvery === 0 || i === n - 1 ? d.label : ''}
          </div>
        ))}
      </div>
      {hover !== null && data[hover] && (
        <div
          className="absolute pointer-events-none -translate-x-1/2 -translate-y-full rounded-lg bg-raised border border-line shadow-soft px-2.5 py-1.5 text-xs whitespace-nowrap z-10"
          style={{ left: `${((hover + 0.5) / n) * 100}%`, top: Math.max(14, y(data[hover].value) * (height / H)) - 6 }}
        >
          <div className="text-muted">{data[hover].tip ?? data[hover].label}</div>
          <div className="text-ink font-semibold tabular-nums">{format(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for ranked categories (e.g. words per chapter); direct-labeled, no legend needed. */
export function HBarList({ rows, format, onClick }: { rows: { id: string; label: string; value: number; sub?: string }[]; format: (n: number) => string; onClick?: (id: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <button key={r.id} className="w-full text-start group" onClick={() => onClick?.(r.id)} disabled={!onClick}>
          <div className="flex justify-between gap-3 text-xs mb-1">
            <span className="text-ink truncate group-hover:text-accent">{r.label}</span>
            <span className="text-muted tabular-nums shrink-0">
              {format(r.value)}
              {r.sub && <span className="text-faint ms-1.5">{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-line/50 overflow-hidden">
            <div className="h-full rounded-full bg-accent/80" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}

/** GitHub-style activity heatmap for the last N weeks (sequential single hue). */
export function Heatmap({ totals, weeks = 18, format, lang }: { totals: Map<string, { added: number }>; weeks?: number; format: (n: number) => string; lang: 'ar' | 'en' }) {
  const days: { key: string; v: number }[] = [];
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - weeks * 7 + 1);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    days.push({ key, v: totals.get(key)?.added ?? 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.v));
  const level = (v: number) => (v === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const opacity = [0, 0.28, 0.5, 0.75, 1];
  const fmtDate = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-US', { dateStyle: 'medium' });
  const cols: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));
  return (
    <div className="flex gap-[3px] overflow-x-auto no-scrollbar" dir="ltr">
      {cols.map((c, i) => (
        <div key={i} className="flex flex-col gap-[3px]">
          {c.map((d) => (
            <div
              key={d.key}
              title={`${fmtDate.format(new Date(d.key + 'T00:00:00'))} — ${format(d.v)}`}
              className="w-3 h-3 rounded-[3px]"
              style={{ background: d.v ? `rgb(var(--accent) / ${opacity[level(d.v)]})` : 'rgb(var(--line) / .5)' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
