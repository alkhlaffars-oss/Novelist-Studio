import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Plus, Trash2, Users, MapPin, Gem, Globe2, Network, ChevronRight, ChevronLeft, UserRound, ImagePlus, X, Search, Pencil } from 'lucide-react';
import { db } from '@/db/db';
import type { Entity, EntityType, Relationship } from '@/db/types';
import { addRelationship, createEntity, createLoreSection, deleteEntity, deleteLoreSection, updateEntity } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { ChipSelect, DebouncedInput, Empty, Field, ImagePicker, Modal, Tabs, confirmDialog, promptDialog, readImageFile, toast, useFmt, cx } from '@/components/ui';
import { useEntities, useManuscript, sceneLabel, type ManuscriptChapter } from '@/hooks/useManuscript';
import { CHARACTER_FIELDS, LOCATION_FIELDS, LORE_FIELDS, OBJECT_FIELDS, RELATION_KINDS, type FieldDef } from '@/lib/labels';
import { buildSceneIndex, entityNames, findMentions, sceneLabelOf, type IndexedScene, type Mention } from '@/lib/analysis';
import { useT } from '@/store/settings';
import { RelationshipMap } from '@/components/RelationshipMap';

type Tab = EntityType | 'map';

export default function Bible() {
  const project = useProject();
  const t = useT();
  const navigate = useNavigate();
  const { tab: rawTab, eid } = useParams();
  const tab = (['character', 'location', 'object', 'lore', 'map'].includes(rawTab ?? '') ? rawTab : 'character') as Tab;
  const all = useEntities(project.id);
  const count = (ty: EntityType) => all.filter((e) => e.type === ty).length;

  return (
    <div className="page max-w-7xl">
      <PageHeader icon={<BookOpen size={22} />} title={t('موسوعة الرواية', 'Novel bible')} subtitle={t('الشخصيات والأماكن والعناصر وقوانين العالم في مكان واحد.', 'Characters, places, objects and world rules in one place.')} />
      <Tabs<Tab>
        className="mb-6"
        value={tab}
        onChange={(k) => navigate(`/p/${project.id}/bible/${k}`)}
        tabs={[
          { key: 'character', label: t('الشخصيات', 'Characters'), icon: <Users size={15} />, count: count('character') },
          { key: 'location', label: t('الأماكن', 'Locations'), icon: <MapPin size={15} />, count: count('location') },
          { key: 'object', label: t('العناصر', 'Objects'), icon: <Gem size={15} />, count: count('object') },
          { key: 'lore', label: t('العالم', 'World'), icon: <Globe2 size={15} />, count: count('lore') },
          { key: 'map', label: t('خريطة العلاقات', 'Relationship map'), icon: <Network size={15} /> },
        ]}
      />
      {tab === 'map' ? <RelationshipMap projectId={project.id} /> : <Browser key={tab} type={tab} eid={eid} entities={all.filter((e) => e.type === tab)} />}
    </div>
  );
}

function Browser({ type, eid, entities }: { type: EntityType; eid?: string; entities: Entity[] }) {
  const project = useProject();
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const sections = useLiveQuery(() => db.loreSections.where('projectId').equals(project.id).sortBy('order'), [project.id]) ?? [];
  const [section, setSection] = useState<string>('');
  const selected = entities.find((e) => e.id === eid);
  useEffect(() => {
    if (type === 'lore' && !section && sections[0]) setSection(selected?.sectionId ?? sections[0].id);
  }, [type, section, sections, selected]);
  useEffect(() => {
    if (selected?.sectionId && selected.sectionId !== section) setSection(selected.sectionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const visible = entities.filter((e) => (type !== 'lore' || e.sectionId === section) && (!q || (e.name + ' ' + (e.fields.aliases ?? '') + ' ' + e.tags.join(' ')).toLowerCase().includes(q.toLowerCase())));
  const base = `/p/${project.id}/bible/${type}`;
  const add = async () => {
    const name = await promptDialog({ title: newLabel(type, t) });
    if (!name?.trim()) return;
    const e = await createEntity(project.id, type, name.trim(), type === 'lore' ? { sectionId: section } : type === 'character' ? { fields: { fate: 'alive' } } : {});
    navigate(`${base}/${e.id}`);
  };
  const Back = t.dir === 'rtl' ? ChevronRight : ChevronLeft;
  const currentSection = sections.find((s) => s.id === section);

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className={cx('space-y-3', selected && 'hidden lg:block')}>
        {type === 'lore' && (
          <div className="card p-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="section-title">{t('الأقسام', 'Sections')}</span>
              <button
                className="icon-btn w-8 h-8"
                title={t('قسم مخصص جديد', 'New custom section')}
                onClick={async () => {
                  const name = await promptDialog({ title: t('اسم القسم', 'Section name') });
                  if (name?.trim()) setSection((await createLoreSection(project.id, name.trim())).id);
                }}
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="flex lg:flex-col gap-1 overflow-x-auto no-scrollbar">
              {sections.map((s) => (
                <button key={s.id} onClick={() => setSection(s.id)} className={cx('text-start rounded-lg px-3 h-9 text-sm whitespace-nowrap flex items-center justify-between gap-2', section === s.id ? 'bg-raised text-accent' : 'text-muted hover:text-ink hover:bg-raised/60')}>
                  <span className="truncate">{s.name}</span>
                  <span className="text-[10px] text-faint">{entities.filter((e) => e.sectionId === s.id).length || ''}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-faint" />
            <input className="input ps-8 h-9" placeholder={t('بحث…', 'Search…')} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-primary h-9" onClick={add} disabled={type === 'lore' && !section}>
            <Plus size={15} /> {t('إضافة', 'Add')}
          </button>
        </div>
        {type === 'lore' && currentSection && (
          <div className="flex items-center justify-between text-xs text-muted px-1">
            <span>{currentSection.name}</span>
            <div className="flex gap-1">
              <button
                className="icon-btn w-7 h-7"
                title={t('إعادة تسمية القسم', 'Rename section')}
                onClick={async () => {
                  const v = await promptDialog({ title: t('اسم القسم', 'Section name'), initial: currentSection.name });
                  if (v?.trim()) await db.loreSections.update(currentSection.id, { name: v.trim() });
                }}
              >
                <Pencil size={13} />
              </button>
              <button
                className="icon-btn w-7 h-7 hover:text-danger"
                title={t('حذف القسم', 'Delete section')}
                onClick={async () => {
                  if (await confirmDialog({ title: t('حذف القسم وكل مداخله؟', 'Delete section and its entries?'), danger: true })) {
                    await deleteLoreSection(currentSection.id);
                    setSection('');
                  }
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        )}
        <div className={cx(type === 'character' ? 'grid grid-cols-1 gap-1.5' : 'space-y-1')}>
          {visible.map((e) => (
            <Link key={e.id} to={`${base}/${e.id}`} className={cx('flex items-center gap-3 rounded-xl px-2.5 py-2 border', e.id === eid ? 'border-line bg-raised' : 'border-transparent hover:bg-raised/60')}>
              <Avatar e={e} size={type === 'character' ? 40 : 32} />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-ink truncate">{e.name}</div>
                <div className="text-[11px] text-muted truncate">{entitySubtitle(e, t)}</div>
              </div>
            </Link>
          ))}
          {visible.length === 0 && <p className="text-sm text-faint px-2 py-4">{t('لا توجد مداخل بعد.', 'No entries yet.')}</p>}
        </div>
      </aside>
      <section className={cx(!selected && 'hidden lg:block')}>
        {selected ? (
          <>
            <Link to={base} className="lg:hidden inline-flex items-center gap-1 text-sm text-muted mb-4">
              <Back size={16} /> {t('القائمة', 'List')}
            </Link>
            <EntityEditor key={selected.id} entity={selected} />
          </>
        ) : (
          <Empty icon={<BookOpen size={40} strokeWidth={1.2} />} title={t('اختر مدخلاً أو أضف واحداً جديداً', 'Select or add an entry')} text={hintFor(type, t)} />
        )}
      </section>
    </div>
  );
}

function newLabel(type: EntityType, t: ReturnType<typeof useT>) {
  return { character: t('اسم الشخصية', 'Character name'), location: t('اسم المكان', 'Location name'), object: t('اسم العنصر', 'Object name'), lore: t('عنوان المدخل', 'Entry title') }[type];
}
function hintFor(type: EntityType, t: ReturnType<typeof useT>) {
  return {
    character: t('لكل شخصية ملف كامل: المظهر والدوافع والأسرار والعلاقات وتطورها، مع تتبع ظهورها في النص.', 'Each character gets a full profile with appearances tracked in the text.'),
    location: t('سجّل الأماكن وتاريخها وأهميتها والشخصيات والأحداث المرتبطة بها.', 'Record places, their history and the people and events tied to them.'),
    object: t('الأسلحة والكتب والرسائل والقطع الأثرية وكل ما له قيمة في الحكاية.', 'Weapons, books, letters, artifacts and anything of value to the story.'),
    lore: t('التاريخ والحضارات والقوانين والسحر والمصطلحات — وأقسام مخصصة تنشئها بنفسك.', 'History, cultures, laws, magic, glossary — plus your own custom sections.'),
  }[type];
}
function entitySubtitle(e: Entity, t: ReturnType<typeof useT>) {
  if (e.type === 'character') {
    const role = CHARACTER_FIELDS[0].fields.find((f) => f.key === 'role')?.options?.find((o) => o.value === e.fields.role);
    return [role && t.l(role.label), e.fields.age && `${e.fields.age} ${t('سنة', 'y')}`, e.fields.fate === 'dead' && t('متوفاة', 'dead')].filter(Boolean).join(' · ');
  }
  return (e.fields.description || e.fields.summary || '').slice(0, 60);
}

export function Avatar({ e, size = 36 }: { e: Entity; size?: number }) {
  return e.image ? (
    <img src={e.image} alt="" className="rounded-lg object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-lg bg-raised border border-line/60 flex items-center justify-center shrink-0 font-serif text-gold" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {e.name.trim().slice(0, 1) || '?'}
    </div>
  );
}

function fieldsFor(type: EntityType): { group?: { ar: string; en: string }; fields: FieldDef[] }[] {
  if (type === 'character') return CHARACTER_FIELDS;
  if (type === 'location') return [{ fields: LOCATION_FIELDS }];
  if (type === 'object') return [{ fields: OBJECT_FIELDS }];
  return [{ fields: LORE_FIELDS }];
}

function EntityEditor({ entity }: { entity: Entity }) {
  const project = useProject();
  const t = useT();
  const navigate = useNavigate();
  const ms = useManuscript(project.id);
  const characters = useEntities(project.id, 'character');
  const setField = (k: string, v: string) => updateEntity(entity.id, { fields: { ...entity.fields, [k]: v } });

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="card p-5 flex flex-col sm:flex-row gap-5">
        <ImagePicker value={entity.image} onChange={(image) => updateEntity(entity.id, { image })} className="w-28 h-36 rounded-xl overflow-hidden border border-line bg-raised shrink-0">
          <div className="h-full flex flex-col items-center justify-center gap-1.5 text-faint text-[11px] text-center p-2">
            <UserRound size={24} strokeWidth={1.4} />
            {t('صورة مرجعية', 'Reference image')}
          </div>
        </ImagePicker>
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-start gap-2">
            <DebouncedInput value={entity.name} onCommit={(v) => v.trim() && updateEntity(entity.id, { name: v.trim() })} className="font-serif !text-2xl !h-12 flex-1" />
            <button
              className="icon-btn hover:text-danger"
              title={t('حذف', 'Delete')}
              onClick={async () => {
                if (await confirmDialog({ title: t(`حذف "${entity.name}"؟`, `Delete "${entity.name}"?`), message: t('ستُزال أيضاً روابطها من المشاهد والأحداث والحبكة.', 'Its links in scenes, events and plot will be removed too.'), danger: true, confirmText: t('حذف', 'Delete') })) {
                  await deleteEntity(entity.id);
                  navigate(`/p/${project.id}/bible/${entity.type}`);
                }
              }}
            >
              <Trash2 size={17} />
            </button>
          </div>
          {entity.type === 'character' && (
            <Field label={t('الاسم الكامل / الأسماء المستعارة (افصل بفاصلة)', 'Aliases (comma separated)')}>
              <DebouncedInput value={entity.fields.aliases ?? ''} onCommit={(v) => setField('aliases', v)} />
            </Field>
          )}
          <Field label={t('وسوم', 'Tags')}>
            <DebouncedInput
              value={entity.tags.join('، ')}
              onCommit={(v) => updateEntity(entity.id, { tags: v.split(/[،,]/).map((x) => x.trim()).filter(Boolean) })}
              placeholder={t('مثال: عائلة الراوي، الفصل الأول', 'e.g. family, act one')}
            />
          </Field>
        </div>
      </div>

      {fieldsFor(entity.type).map((g, gi) => (
        <div key={gi} className="card p-5">
          {g.group && <h3 className="section-title mb-4">{t.l(g.group)}</h3>}
          <div className="grid gap-4 sm:grid-cols-2">
            {g.fields
              .filter((f) => f.key !== 'aliases')
              .map((f) => (
                <Field key={f.key} label={t.l(f.label)} className={f.long ? 'sm:col-span-2' : ''}>
                  <FieldInput def={f} value={entity.fields[f.key] ?? ''} onChange={(v) => setField(f.key, v)} ms={ms} characters={characters} />
                </Field>
              ))}
          </div>
        </div>
      ))}

      {(entity.type === 'location' || entity.type === 'object') && (
        <div className="card p-5 space-y-4">
          <h3 className="section-title">{t('الشخصيات المرتبطة', 'Linked characters')}</h3>
          <ChipSelect options={characters} value={entity.links ?? []} onChange={(links) => updateEntity(entity.id, { links })} empty={t('لا توجد شخصيات بعد.', 'No characters yet.')} />
          <Gallery entity={entity} />
        </div>
      )}

      {entity.type === 'character' && <Relationships entity={entity} characters={characters} />}
      {entity.type !== 'lore' && <Appearances entity={entity} ms={ms} />}
    </div>
  );
}

function FieldInput({ def, value, onChange, ms, characters }: { def: FieldDef; value: string; onChange: (v: string) => void; ms?: ManuscriptChapter[]; characters: Entity[] }) {
  const t = useT();
  if (def.type === 'select')
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {def.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {t.l(o.label)}
          </option>
        ))}
      </select>
    );
  if (def.type === 'entity')
    return (
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {ms?.map((c) => (
          <optgroup key={c.chapter.id} label={c.chapter.title}>
            {c.scenes.map((s, i) => (
              <option key={s.id} value={s.id}>
                {s.title || `${t('مشهد', 'Scene')} ${i + 1}`}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  if (def.key === 'owner')
    return (
      <>
        <DebouncedInput value={value} onCommit={onChange} list="owners" />
        <datalist id="owners">
          {characters.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </>
    );
  if (def.long) return <DebouncedInput multiline rows={3} value={value} onCommit={onChange} />;
  return <DebouncedInput value={value} onCommit={onChange} type={def.type === 'number' ? 'number' : 'text'} />;
}

function Gallery({ entity }: { entity: Entity }) {
  const t = useT();
  const gallery = entity.gallery ?? [];
  return (
    <div>
      <h3 className="section-title mb-3">{t('صور مرجعية', 'Reference images')}</h3>
      <div className="flex flex-wrap gap-2">
        {gallery.map((g, i) => (
          <div key={i} className="relative group">
            <img src={g} alt="" className="w-24 h-24 rounded-lg object-cover border border-line" />
            <button className="absolute top-1 end-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100" onClick={() => updateEntity(entity.id, { gallery: gallery.filter((_, j) => j !== i) })}>
              <X size={12} />
            </button>
          </div>
        ))}
        <label className="w-24 h-24 rounded-lg border border-dashed border-line flex flex-col items-center justify-center gap-1 text-faint text-[11px] cursor-pointer hover:text-ink">
          <ImagePlus size={18} />
          {t('إضافة', 'Add')}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              const imgs = await Promise.all(files.map((f) => readImageFile(f, 1200)));
              await updateEntity(entity.id, { gallery: [...gallery, ...imgs] });
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </div>
  );
}

function Relationships({ entity, characters }: { entity: Entity; characters: Entity[] }) {
  const t = useT();
  const rels = useLiveQuery(async () => [...(await db.relationships.where('fromId').equals(entity.id).toArray()), ...(await db.relationships.where('toId').equals(entity.id).toArray())], [entity.id]) ?? [];
  const [open, setOpen] = useState(false);
  const byId = new Map(characters.map((c) => [c.id, c]));
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">{t('العلاقات', 'Relationships')}</h3>
        <button className="btn-outline h-8 text-xs" onClick={() => setOpen(true)} disabled={characters.length < 2}>
          <Plus size={14} /> {t('علاقة', 'Relationship')}
        </button>
      </div>
      {rels.length === 0 && <p className="text-sm text-faint">{t('لا توجد علاقات مسجلة.', 'No relationships recorded.')}</p>}
      <div className="space-y-2">
        {rels.map((r) => {
          const other = byId.get(r.fromId === entity.id ? r.toId : r.fromId);
          if (!other) return null;
          return (
            <div key={r.id} className="flex items-center gap-3 rounded-lg bg-raised/50 px-3 py-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: RELATION_KINDS[r.kind].color }} />
              <Avatar e={other} size={28} />
              <div className="flex-1 min-w-0">
                <Link to={`/p/${entity.projectId}/bible/character/${other.id}`} className="text-sm text-ink hover:text-accent">
                  {other.name}
                </Link>
                <div className="text-[11px] text-muted">
                  {t.l(RELATION_KINDS[r.kind])}
                  {r.label && ` · ${r.label}`}
                </div>
              </div>
              <button className="icon-btn w-8 h-8 hover:text-danger" onClick={() => db.relationships.delete(r.id)}>
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <RelationshipDialog open={open} onClose={() => setOpen(false)} projectId={entity.projectId} fromId={entity.id} characters={characters} />
    </div>
  );
}

export function RelationshipDialog({ open, onClose, projectId, fromId, characters }: { open: boolean; onClose: () => void; projectId: string; fromId?: string; characters: Entity[] }) {
  const t = useT();
  const [from, setFrom] = useState(fromId ?? '');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<Relationship['kind']>('friend');
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (open) {
      setFrom(fromId ?? characters[0]?.id ?? '');
      setTo('');
      setLabel('');
    }
  }, [open, fromId, characters]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('علاقة جديدة', 'New relationship')}
      footer={
        <button
          className="btn-primary"
          disabled={!from || !to || from === to}
          onClick={async () => {
            await addRelationship({ projectId, fromId: from, toId: to, kind, label: label.trim() });
            toast(t('أضيفت العلاقة', 'Relationship added'));
            onClose();
          }}
        >
          {t('إضافة', 'Add')}
        </button>
      }
    >
      <div className="space-y-3">
        <Field label={t('من', 'From')}>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)} disabled={!!fromId}>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('إلى', 'To')}>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">—</option>
            {characters
              .filter((c) => c.id !== from)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('نوع العلاقة', 'Kind')}>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(RELATION_KINDS).map(([k, v]) => (
              <button key={k} type="button" onClick={() => setKind(k as Relationship['kind'])} className={cx('chip', kind === k && 'on')}>
                <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
                {t.l(v)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('وصف العلاقة (اختياري)', 'Description (optional)')}>
          <input dir="auto" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t('مثال: أخته الكبرى', 'e.g. older sister')} />
        </Field>
      </div>
    </Modal>
  );
}

/** Appearances: scenes that link the entity plus scenes whose text mentions it. */
function Appearances({ entity, ms }: { entity: Entity; ms?: ManuscriptChapter[] }) {
  const t = useT();
  const f = useFmt();
  const [index, setIndex] = useState<IndexedScene[] | null>(null);
  const names = useMemo(() => entityNames(entity), [entity]);
  useEffect(() => {
    let alive = true;
    buildSceneIndex(entity.projectId).then((i) => alive && setIndex(i));
    return () => {
      alive = false;
    };
  }, [entity.projectId, ms]);
  const events = useLiveQuery(() => db.events.where('projectId').equals(entity.projectId).filter((e) => e.characterIds.includes(entity.id) || e.locationId === entity.id).toArray(), [entity.id]) ?? [];
  if (!index) return null;
  const mentions = findMentions(index, names);
  const linked = index.filter((s) => s.scene.characterIds.includes(entity.id) || s.scene.locationId === entity.id || s.scene.povId === entity.id);
  const all = new Map<string, { s: IndexedScene; m?: Mention; linked: boolean }>();
  for (const s of linked) all.set(s.scene.id, { s, linked: true });
  for (const m of mentions) {
    const s = index.find((x) => x.scene.id === m.sceneId)!;
    all.set(m.sceneId, { s, m, linked: all.has(m.sceneId) });
  }
  const list = [...all.values()].sort((a, b) => a.s.position - b.s.position);
  const sceneWord = t('مشهد', 'Scene');
  return (
    <div className="card p-5">
      <h3 className="section-title mb-1">{t('الظهور في الرواية', 'Appearances')}</h3>
      <p className="text-[11px] text-faint mb-4">
        {t('يُكتشف تلقائياً من ربط المشاهد ومن ذكر الاسم في النص', 'Detected from scene links and name mentions in the text')}: {names.join('، ')}
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-faint">{t('لم يظهر في النص بعد.', 'Not in the text yet.')}</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg bg-raised/50 p-3">
              <div className="text-[11px] text-faint">{t('أول ظهور', 'First appearance')}</div>
              <div className="text-sm text-ink mt-0.5">{sceneLabelOf(list[0].s, sceneWord)}</div>
            </div>
            <div className="rounded-lg bg-raised/50 p-3">
              <div className="text-[11px] text-faint">{t('آخر ظهور', 'Last appearance')}</div>
              <div className="text-sm text-ink mt-0.5">{sceneLabelOf(list[list.length - 1].s, sceneWord)}</div>
            </div>
          </div>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {list.map(({ s, m, linked: isLinked }) => (
              <Link key={s.scene.id} to={`/p/${entity.projectId}/write/${s.scene.id}${m ? `?q=${encodeURIComponent(names.find((n) => m.excerpt.includes(n)) ?? names[0])}` : ''}`} className="block rounded-lg px-3 py-2 hover:bg-raised">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-ink">{sceneLabel(ms, s.scene.id, sceneWord)}</span>
                  {isLinked && <span className="chip h-5 text-[10px]">{t('مرتبط', 'linked')}</span>}
                  {m && <span className="text-faint">× {f.n(m.count)}</span>}
                </div>
                {m && (
                  <div className="text-xs text-muted mt-0.5 line-clamp-1 font-serif" dir="auto">
                    {m.excerpt}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
      {events.length > 0 && (
        <div className="mt-5">
          <h4 className="section-title mb-2">{t('أحداث الخط الزمني', 'Timeline events')}</h4>
          <div className="flex flex-wrap gap-1.5">
            {events.map((e) => (
              <Link key={e.id} to={`/p/${entity.projectId}/timeline?event=${e.id}`} className="chip hover:text-ink">
                {e.title || '—'} {e.dateLabel && <span className="text-faint">· {e.dateLabel}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
