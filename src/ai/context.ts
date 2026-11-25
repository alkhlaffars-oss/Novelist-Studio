// "Novel memory": assembles the parts of the project the writer allows the assistant to read,
// labelled so answers can cite chapters and scenes, within a character budget.
import { db } from '@/db/db';
import type { Project } from '@/db/types';
import { buildSceneIndex } from '@/lib/analysis';
import { CHARACTER_FIELDS, LOCATION_FIELDS, LORE_FIELDS, OBJECT_FIELDS, PLOT_STAGES, type FieldDef } from '@/lib/labels';

export interface ContextSources {
  overview: boolean;
  characters: boolean;
  world: boolean; // locations, objects, lore
  timeline: boolean;
  plot: boolean;
  notes: boolean;
  summaries: boolean; // chapter summaries + scene synopses
  manuscript: 'none' | 'before' | 'all'; // full text: up to the current scene, or the whole book
}

export const DEFAULT_SOURCES: ContextSources = { overview: true, characters: true, world: true, timeline: true, plot: true, notes: false, summaries: true, manuscript: 'before' };

const ar = (l: { ar: string; en: string }) => l.ar;

function fields(f: Record<string, string>, defs: FieldDef[], resolve: (k: string, v: string) => string) {
  return defs
    .filter((d) => f[d.key])
    .map((d) => {
      let v = f[d.key];
      if (d.type === 'select') v = d.options?.find((o) => o.value === v)?.label.ar ?? v;
      if (d.type === 'entity') v = resolve(d.key, v);
      return `  - ${ar(d.label)}: ${v.replace(/\n+/g, ' ')}`;
    })
    .join('\n');
}

export async function buildNovelContext(project: Project, src: ContextSources, opts: { currentSceneId?: string; budget: number }): Promise<{ text: string; truncated: boolean; chars: number }> {
  const index = await buildSceneIndex(project.id);
  const label = (sceneId?: string) => {
    const s = index.find((x) => x.scene.id === sceneId);
    return s ? `[الفصل ${s.chapterIndex + 1} «${s.chapter.title}» · المشهد ${s.sceneIndex + 1}${s.scene.title ? ` «${s.scene.title}»` : ''}]` : '';
  };
  const [entities, events, cards, threads, notes, rels, sections] = await Promise.all([
    db.entities.where('projectId').equals(project.id).toArray(),
    db.events.where('projectId').equals(project.id).toArray(),
    db.plotCards.where('projectId').equals(project.id).toArray(),
    db.plotThreads.where('projectId').equals(project.id).toArray(),
    db.notes.where('projectId').equals(project.id).toArray(),
    db.relationships.where('projectId').equals(project.id).toArray(),
    db.loreSections.where('projectId').equals(project.id).toArray(),
  ]);
  const name = new Map(entities.map((e) => [e.id, e.name]));
  const parts: string[] = [];
  const add = (title: string, body: string) => body.trim() && parts.push(`<${title}>\n${body.trim()}\n</${title}>`);

  if (src.overview)
    add(
      'novel_overview',
      [
        `العنوان: ${project.title}`,
        project.author && `الكاتب: ${project.author}`,
        project.genre && `التصنيف: ${project.genre} ${project.subgenre}`,
        project.description && `الوصف: ${project.description}`,
        project.premise && `الفكرة الرئيسية: ${project.premise}`,
        project.world && `العالم: ${project.world}`,
        `عدد الفصول: ${new Set(index.map((s) => s.chapter.id)).size} · عدد الكلمات: ${project.wordCount}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );

  if (src.characters) {
    const charDefs = CHARACTER_FIELDS.flatMap((g) => g.fields);
    add(
      'characters',
      entities
        .filter((e) => e.type === 'character')
        .map((e) => `• ${e.name}\n${fields(e.fields, charDefs, (_k, v) => label(v) || v)}`)
        .join('\n') +
        (rels.length ? `\nالعلاقات:\n${rels.map((r) => `  - ${name.get(r.fromId)} ↔ ${name.get(r.toId)}: ${r.label || r.kind}`).join('\n')}` : ''),
    );
  }
  if (src.world) {
    add('locations', entities.filter((e) => e.type === 'location').map((e) => `• ${e.name}\n${fields(e.fields, LOCATION_FIELDS, (_k, v) => label(v) || v)}`).join('\n'));
    add('objects', entities.filter((e) => e.type === 'object').map((e) => `• ${e.name}\n${fields(e.fields, OBJECT_FIELDS, (_k, v) => label(v) || v)}`).join('\n'));
    const secName = new Map(sections.map((s) => [s.id, s.name]));
    add('world_rules_and_lore', entities.filter((e) => e.type === 'lore').map((e) => `• [${secName.get(e.sectionId ?? '') ?? ''}] ${e.name}\n${fields(e.fields, LORE_FIELDS, (_k, v) => v)}`).join('\n'));
  }
  if (src.timeline && events.length)
    add(
      'timeline_in_world_order',
      events
        .sort((a, b) => a.chronoOrder - b.chronoOrder)
        .map((e, i) => `${i + 1}. ${e.title}${e.dateLabel ? ` (${e.dateLabel}${e.timeLabel ? ' ' + e.timeLabel : ''})` : ''}${e.locationId ? ` @ ${name.get(e.locationId)}` : ''}${e.characterIds.length ? ` — ${e.characterIds.map((c) => name.get(c)).join('، ')}` : ''}${e.sceneId ? ` ${label(e.sceneId)}` : ''}${e.description ? `: ${e.description}` : ''}`)
        .join('\n'),
    );
  if (src.plot && cards.length) {
    const th = new Map(threads.map((t) => [t.id, t.name]));
    add(
      'plot_plan',
      PLOT_STAGES.map((st) => {
        const list = cards.filter((c) => c.stage === st.key);
        return list.length ? `${st.label.ar}:\n${list.map((c) => `  - ${c.title}${c.threadId ? ` [${th.get(c.threadId)}]` : ''}${c.foreshadow ? (c.payoffId ? ' (تمهيد تحقق)' : ' (تمهيد لم يتحقق بعد)') : ''}${c.description ? ': ' + c.description : ''}`).join('\n')}` : '';
      })
        .filter(Boolean)
        .join('\n'),
    );
  }
  if (src.notes && notes.length) add('writer_notes', notes.map((n) => `• (${n.type}${n.resolved ? '، مُجاب' : ''}) ${n.title}${n.content ? ': ' + n.content.replace(/\n+/g, ' ') : ''}`).join('\n'));
  if (src.summaries)
    add(
      'chapter_and_scene_summaries',
      index
        .map((s) => (s.sceneIndex === 0 && s.chapter.summary ? `الفصل ${s.chapterIndex + 1} «${s.chapter.title}»: ${s.chapter.summary}\n` : '') + (s.scene.synopsis || s.scene.goal ? `  ${label(s.scene.id)} ${s.scene.synopsis}${s.scene.goal ? ` | الهدف: ${s.scene.goal}` : ''}${s.scene.conflict ? ` | الصراع: ${s.scene.conflict}` : ''}${s.scene.outcome ? ` | النتيجة: ${s.scene.outcome}` : ''}` : ''))
        .filter((x) => x.trim())
        .join('\n'),
    );

  let used = parts.join('\n\n').length;
  let truncated = false;
  if (src.manuscript !== 'none') {
    const cur = index.find((s) => s.scene.id === opts.currentSceneId);
    const scope = src.manuscript === 'before' && cur ? index.filter((s) => s.position <= cur.position) : index;
    const remaining = Math.max(0, opts.budget - used);
    // Prefer the most recent text when the book does not fit: walk backwards from the current scene.
    const chosen: string[] = [];
    let size = 0;
    for (let i = scope.length - 1; i >= 0; i--) {
      const s = scope[i];
      const block = `${label(s.scene.id)}\n${s.text}`;
      if (size + block.length > remaining) {
        truncated = true;
        break;
      }
      chosen.unshift(block);
      size += block.length;
    }
    if (chosen.length)
      parts.push(
        `<manuscript${src.manuscript === 'before' && cur ? ' scope="up_to_current_scene"' : ''}${truncated ? ' note="earlier chapters omitted for length; rely on summaries for them"' : ''}>\n${chosen.join('\n\n')}\n</manuscript>`,
      );
    used += size;
  }
  const text = parts.join('\n\n');
  return { text, truncated, chars: text.length };
}
