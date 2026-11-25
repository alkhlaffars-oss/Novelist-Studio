import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, RotateCcw, Network } from 'lucide-react';
import { db } from '@/db/db';
import type { Relationship } from '@/db/types';
import { updateEntity } from '@/db/repo';
import { useEntities } from '@/hooks/useManuscript';
import { RELATION_KINDS } from '@/lib/labels';
import { useT } from '@/store/settings';
import { RelationshipDialog } from '@/pages/Bible';
import { Empty, cx } from './ui';

const W = 1000;
const H = 680;
const R = 30;

/** Interactive character relationship graph. Drag nodes to arrange; positions are saved. */
export function RelationshipMap({ projectId }: { projectId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const characters = useEntities(projectId, 'character');
  const rels = useLiveQuery(() => db.relationships.where('projectId').equals(projectId).toArray(), [projectId]) ?? [];
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const [hidden, setHidden] = useState<Set<Relationship['kind']>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    const unplaced = characters.filter((c) => c.mapX === undefined || c.mapY === undefined);
    characters.forEach((c) => {
      if (c.mapX !== undefined && c.mapY !== undefined) m.set(c.id, { x: c.mapX, y: c.mapY });
    });
    unplaced.forEach((c, i) => {
      const a = (i / Math.max(1, unplaced.length)) * Math.PI * 2 - Math.PI / 2;
      const r = unplaced.length === 1 ? 0 : Math.min(W, H) * 0.36;
      m.set(c.id, { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r });
    });
    if (drag) m.set(drag.id, { x: drag.x, y: drag.y });
    return m;
  }, [characters, drag]);

  const toSvg = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: Math.max(R, Math.min(W - R, p.x)), y: Math.max(R, Math.min(H - R - 16, p.y)) };
  };

  if (characters.length === 0)
    return <Empty icon={<Network size={40} strokeWidth={1.2} />} title={t('لا توجد شخصيات بعد', 'No characters yet')} text={t('أضف شخصيات ثم اربطها بعلاقات لتظهر الخريطة.', 'Add characters and relationships to see the map.')} />;

  const visibleRels = rels.filter((r) => !hidden.has(r.kind) && pos.has(r.fromId) && pos.has(r.toId));
  const connected = new Set(focusId ? visibleRels.filter((r) => r.fromId === focusId || r.toId === focusId).flatMap((r) => [r.fromId, r.toId]) : []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(RELATION_KINDS).map(([k, v]) => {
          const off = hidden.has(k as Relationship['kind']);
          return (
            <button
              key={k}
              className={cx('chip', !off && 'on')}
              onClick={() =>
                setHidden((s) => {
                  const n = new Set(s);
                  if (n.has(k as Relationship['kind'])) n.delete(k as Relationship['kind']);
                  else n.add(k as Relationship['kind']);
                  return n;
                })
              }
            >
              <span className="w-2.5 h-0.5 rounded" style={{ background: v.color }} />
              {t.l(v)}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          className="btn-ghost h-9 text-xs"
          onClick={async () => {
            for (const c of characters) await updateEntity(c.id, { mapX: undefined, mapY: undefined });
          }}
        >
          <RotateCcw size={14} /> {t('ترتيب دائري', 'Reset layout')}
        </button>
        <button className="btn-primary h-9" onClick={() => setAdding(true)} disabled={characters.length < 2}>
          <Plus size={15} /> {t('علاقة', 'Relationship')}
        </button>
      </div>
      <div className="card overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full min-w-[640px] touch-none select-none"
          style={{ aspectRatio: `${W}/${H}` }}
          onPointerMove={(e) => drag && setDrag({ ...drag, ...toSvg(e), moved: true })}
          onPointerUp={async () => {
            if (!drag) return;
            const d = drag;
            setDrag(null);
            if (d.moved) await updateEntity(d.id, { mapX: Math.round(d.x), mapY: Math.round(d.y) });
            else navigate(`/p/${projectId}/bible/character/${d.id}`);
          }}
          onPointerLeave={() => setDrag(null)}
          onClick={(e) => e.target === e.currentTarget && setFocusId(null)}
        >
          <defs>
            {characters.map((c) =>
              c.image ? (
                <clipPath key={c.id} id={`clip-${c.id}`}>
                  <circle cx={pos.get(c.id)!.x} cy={pos.get(c.id)!.y} r={R - 2} />
                </clipPath>
              ) : null,
            )}
          </defs>
          {visibleRels.map((r) => {
            const a = pos.get(r.fromId)!;
            const b = pos.get(r.toId)!;
            const dim = focusId && !(r.fromId === focusId || r.toId === focusId);
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const label = r.label || t.l(RELATION_KINDS[r.kind]);
            return (
              <g key={r.id} opacity={dim ? 0.15 : 1}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={RELATION_KINDS[r.kind].color} strokeWidth={2} strokeOpacity={0.75} />
                <g transform={`translate(${mx},${my})`}>
                  <rect x={-(label.length * 3.6 + 8)} y={-10} width={label.length * 7.2 + 16} height={20} rx={10} fill="rgb(var(--surface))" stroke={RELATION_KINDS[r.kind].color} strokeOpacity={0.5} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={11} fill="rgb(var(--muted))">
                    {label}
                  </text>
                </g>
              </g>
            );
          })}
          {characters.map((c) => {
            const p = pos.get(c.id)!;
            const dim = focusId && focusId !== c.id && !connected.has(c.id);
            return (
              <g
                key={c.id}
                opacity={dim ? 0.25 : 1}
                className="cursor-grab"
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  setDrag({ id: c.id, ...p, moved: false });
                }}
                onMouseEnter={() => setFocusId(c.id)}
                onMouseLeave={() => setFocusId(null)}
              >
                <circle cx={p.x} cy={p.y} r={R} fill="rgb(var(--raised))" stroke={c.fields.fate === 'dead' ? 'rgb(var(--faint))' : 'rgb(var(--gold))'} strokeWidth={2} strokeDasharray={c.fields.fate === 'dead' ? '4 3' : undefined} />
                {c.image ? (
                  <image href={c.image} x={p.x - R} y={p.y - R} width={R * 2} height={R * 2} clipPath={`url(#clip-${c.id})`} preserveAspectRatio="xMidYMid slice" />
                ) : (
                  <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={20} fill="rgb(var(--gold))" fontFamily="Amiri, serif">
                    {c.name.trim().slice(0, 1)}
                  </text>
                )}
                <text x={p.x} y={p.y + R + 15} textAnchor="middle" fontSize={13} fill="rgb(var(--ink))">
                  {c.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-faint">{t('اسحب الشخصيات لترتيبها، وانقر على شخصية لفتح ملفها. الخط المتقطع يعني شخصية متوفاة.', 'Drag characters to arrange them; click one to open it. A dashed ring marks a dead character.')}</p>
      <RelationshipDialog open={adding} onClose={() => setAdding(false)} projectId={projectId} characters={characters} />
    </div>
  );
}
