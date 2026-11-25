// Export pipeline: project data → neutral document model → DOCX / PDF (print) / Markdown / TXT.
import { db } from '@/db/db';
import type { Entity, Project } from '@/db/types';
import { getManuscript } from '@/db/repo';
import { CHARACTER_FIELDS, LOCATION_FIELDS, LORE_FIELDS, OBJECT_FIELDS, type FieldDef } from './labels';
import { escapeHtml, isRtlText } from './text';
import { EXPORT_FONTS, tr, type ExportSettings } from '@/store/settings';

// ───────────── Document model ─────────────

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
export type Block =
  | { type: 'p' | 'quote' | 'dialogue' | 'li' | 'oli'; runs: Run[]; align?: string }
  | { type: 'h'; level: 1 | 2 | 3; text: string; pageBreak?: boolean; toc?: boolean }
  | { type: 'break' }
  | { type: 'kv'; key: string; value: string };

export interface ExportDocument {
  title: string;
  author: string;
  cover?: string;
  rtl: boolean;
  blocks: Block[];
  tocEntries: string[];
}

export type ExportScope = 'novel' | 'chapters' | 'bible' | 'characters' | 'timeline';

function inlineRuns(node: Node, style: Omit<Run, 'text'> = {}, out: Run[] = []): Run[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (text) out.push({ text, ...style });
    return out;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return out;
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === 'BR') {
    out.push({ text: '\n', ...style });
    return out;
  }
  const next = { ...style };
  if (tag === 'STRONG' || tag === 'B') next.bold = true;
  if (tag === 'EM' || tag === 'I') next.italic = true;
  if (tag === 'U') next.underline = true;
  el.childNodes.forEach((c) => inlineRuns(c, next, out));
  return out;
}

/** Converts editor HTML into blocks. */
export function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out: Block[] = [];
  const walk = (el: Element) => {
    const tag = el.tagName;
    const align = (el as HTMLElement).style?.textAlign || undefined;
    if (tag === 'P') out.push({ type: el.classList.contains('dialogue') ? 'dialogue' : 'p', runs: inlineRuns(el), align });
    else if (/^H[1-6]$/.test(tag)) out.push({ type: 'h', level: 3, text: el.textContent ?? '' });
    else if (tag === 'HR') out.push({ type: 'break' });
    else if (tag === 'BLOCKQUOTE') el.querySelectorAll(':scope > p').forEach((p) => out.push({ type: 'quote', runs: inlineRuns(p) }));
    else if (tag === 'UL' || tag === 'OL') el.querySelectorAll(':scope > li').forEach((li) => out.push({ type: tag === 'OL' ? 'oli' : 'li', runs: inlineRuns(li) }));
    else Array.from(el.children).forEach(walk);
  };
  Array.from(doc.body.children).forEach(walk);
  return out.filter((b) => b.type !== 'p' || b.runs.some((r) => r.text.trim()));
}

const fieldLabel = (defs: FieldDef[], key: string) => {
  const d = defs.find((f) => f.key === key);
  return d ? tr(d.label.ar, d.label.en) : key;
};

function entityBlocks(entities: Entity[], defs: FieldDef[], sceneTitle: Map<string, string>): Block[] {
  const out: Block[] = [];
  for (const e of entities) {
    out.push({ type: 'h', level: 2, text: e.name });
    for (const d of defs) {
      let v = e.fields[d.key];
      if (!v) continue;
      if (d.type === 'entity') v = sceneTitle.get(v) ?? '';
      if (d.type === 'select') v = d.options?.find((o) => o.value === v)?.label ? tr(d.options.find((o) => o.value === v)!.label.ar, d.options.find((o) => o.value === v)!.label.en) : v;
      if (v) out.push({ type: 'kv', key: fieldLabel(defs, d.key), value: v });
    }
    if (e.tags.length) out.push({ type: 'kv', key: tr('وسوم', 'Tags'), value: e.tags.join('، ') });
  }
  return out;
}

export async function buildExportDocument(project: Project, scope: ExportScope, chapterIds: string[], opts: ExportSettings): Promise<ExportDocument> {
  const manuscript = await getManuscript(project.id);
  const texts = new Map((await db.sceneTexts.where('projectId').equals(project.id).toArray()).map((t) => [t.id, t.html]));
  const sceneTitle = new Map(manuscript.flatMap(({ chapter, scenes }) => scenes.map((s, i) => [s.id, `${chapter.title} · ${s.title || tr('مشهد', 'Scene') + ' ' + (i + 1)}`] as const)));
  const blocks: Block[] = [];
  const tocEntries: string[] = [];
  let title = project.title;

  if (scope === 'novel' || scope === 'chapters') {
    const chosen = scope === 'novel' ? manuscript : manuscript.filter((m) => chapterIds.includes(m.chapter.id));
    if (scope === 'chapters' && chosen.length === 1) title = `${project.title} — ${chosen[0].chapter.title}`;
    chosen.forEach(({ chapter, scenes }, ci) => {
      if (opts.chapterHeadings) {
        blocks.push({ type: 'h', level: 1, text: chapter.title, pageBreak: opts.chapterPageBreak && (ci > 0 || opts.coverPage || opts.toc), toc: true });
        tocEntries.push(chapter.title);
      } else if (ci > 0) blocks.push({ type: 'break' });
      scenes.forEach((s, si) => {
        if (si > 0) blocks.push({ type: 'break' });
        if (opts.sceneTitles && s.title) blocks.push({ type: 'h', level: 2, text: s.title });
        blocks.push(...htmlToBlocks(texts.get(s.id) ?? ''));
      });
    });
  } else if (scope === 'characters' || scope === 'bible') {
    const ents = await db.entities.where('projectId').equals(project.id).toArray();
    const by = (t: Entity['type']) => ents.filter((e) => e.type === t).sort((a, b) => a.name.localeCompare(b.name));
    title = `${project.title} — ${scope === 'characters' ? tr('الشخصيات', 'Characters') : tr('موسوعة الرواية', 'Novel bible')}`;
    const charDefs = CHARACTER_FIELDS.flatMap((g) => g.fields);
    const section = (name: string, list: Entity[], defs: FieldDef[]) => {
      if (!list.length) return;
      blocks.push({ type: 'h', level: 1, text: name, pageBreak: blocks.length > 0 || opts.coverPage, toc: true });
      tocEntries.push(name);
      blocks.push(...entityBlocks(list, defs, sceneTitle));
    };
    section(tr('الشخصيات', 'Characters'), by('character'), charDefs);
    if (scope === 'bible') {
      const rels = await db.relationships.where('projectId').equals(project.id).toArray();
      const name = new Map(ents.map((e) => [e.id, e.name]));
      if (rels.length) {
        blocks.push({ type: 'h', level: 2, text: tr('العلاقات', 'Relationships') });
        for (const r of rels) blocks.push({ type: 'kv', key: `${name.get(r.fromId)} ↔ ${name.get(r.toId)}`, value: r.label || r.kind });
      }
      section(tr('الأماكن', 'Locations'), by('location'), LOCATION_FIELDS);
      section(tr('العناصر', 'Objects'), by('object'), OBJECT_FIELDS);
      const sections = await db.loreSections.where('projectId').equals(project.id).sortBy('order');
      for (const s of sections) section(s.name, by('lore').filter((e) => e.sectionId === s.id), LORE_FIELDS);
    }
  } else if (scope === 'timeline') {
    title = `${project.title} — ${tr('الخط الزمني', 'Timeline')}`;
    const events = (await db.events.where('projectId').equals(project.id).toArray()).sort((a, b) => a.chronoOrder - b.chronoOrder);
    const ents = new Map((await db.entities.where('projectId').equals(project.id).toArray()).map((e) => [e.id, e.name]));
    blocks.push({ type: 'h', level: 1, text: tr('الخط الزمني', 'Timeline'), toc: false });
    events.forEach((e, i) => {
      blocks.push({ type: 'h', level: 2, text: `${i + 1}. ${e.title || '…'}` });
      if (e.dateLabel || e.timeLabel) blocks.push({ type: 'kv', key: tr('الزمن', 'When'), value: [e.dateLabel, e.timeLabel].filter(Boolean).join(' · ') });
      if (e.locationId) blocks.push({ type: 'kv', key: tr('المكان', 'Where'), value: ents.get(e.locationId) ?? '' });
      if (e.characterIds.length) blocks.push({ type: 'kv', key: tr('الشخصيات', 'Characters'), value: e.characterIds.map((c) => ents.get(c)).filter(Boolean).join('، ') });
      if (e.sceneId && sceneTitle.get(e.sceneId)) blocks.push({ type: 'kv', key: tr('المشهد', 'Scene'), value: sceneTitle.get(e.sceneId)! });
      if (e.description) blocks.push({ type: 'p', runs: [{ text: e.description }] });
    });
  }

  const sample = blocks.flatMap((b) => ('runs' in b ? b.runs.map((r) => r.text) : 'text' in b ? [b.text] : [])).join(' ').slice(0, 3000);
  return { title, author: project.author, cover: project.cover, rtl: sample ? isRtlText(sample) : project.language !== 'en', blocks, tocEntries };
}

// ───────────── Plain text & Markdown ─────────────

export function toText(d: ExportDocument): string {
  const lines: string[] = [d.title, d.author, ''];
  for (const b of d.blocks) {
    if (b.type === 'h') lines.push('', b.text, '');
    else if (b.type === 'break') lines.push('', '* * *', '');
    else if (b.type === 'kv') lines.push(`${b.key}: ${b.value}`);
    else lines.push((b.type === 'li' || b.type === 'oli' ? '• ' : b.type === 'dialogue' ? '— ' : '') + b.runs.map((r) => r.text).join(''));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function toMarkdown(d: ExportDocument): string {
  const md = (runs: Run[]) =>
    runs
      .map((r) => {
        let t = r.text.replace(/([*_`\\])/g, '\\$1');
        if (!t.trim()) return t;
        if (r.bold) t = `**${t}**`;
        if (r.italic) t = `*${t}*`;
        return t;
      })
      .join('');
  const lines: string[] = [`# ${d.title}`, ''];
  if (d.author) lines.push(`*${d.author}*`, '');
  for (const b of d.blocks) {
    if (b.type === 'h') lines.push(`${'#'.repeat(b.level + 1)} ${b.text}`, '');
    else if (b.type === 'break') lines.push('* * *', '');
    else if (b.type === 'kv') lines.push(`- **${b.key}:** ${b.value}`);
    else if (b.type === 'quote') lines.push(`> ${md(b.runs)}`, '');
    else if (b.type === 'li') lines.push(`- ${md(b.runs)}`);
    else if (b.type === 'oli') lines.push(`1. ${md(b.runs)}`);
    else if (b.type === 'dialogue') lines.push(`— ${md(b.runs)}`, '');
    else lines.push(md(b.runs), '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ───────────── DOCX ─────────────

const PAGE_MM: Record<ExportSettings['pageSize'], [number, number]> = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], '6x9': [152.4, 228.6] };
const mmToTwip = (mm: number) => Math.round((mm / 25.4) * 1440);

export async function toDocx(d: ExportDocument, o: ExportSettings): Promise<Blob> {
  const docx = await import('docx');
  const { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, TextRun, TableOfContents, ImageRun, PageBreak } = docx;
  const font = { ascii: o.font, hAnsi: o.font, cs: o.font, eastAsia: o.font };
  const size = o.fontSize * 2;
  const rtl = d.rtl;
  const line = Math.round(o.lineSpacing * 240);
  const run = (r: Run, extra: { size?: number; bold?: boolean; color?: string } = {}) =>
    new TextRun({
      text: r.text,
      font,
      size: extra.size ?? size,
      sizeComplexScript: extra.size ?? size,
      bold: r.bold || extra.bold,
      boldComplexScript: r.bold || extra.bold,
      italics: r.italic,
      italicsComplexScript: r.italic,
      underline: r.underline ? {} : undefined,
      rightToLeft: rtl,
      color: extra.color,
    });
  const para = (children: InstanceType<typeof TextRun>[], extra: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) =>
    new Paragraph({ children, bidirectional: rtl, spacing: { line, after: 120 }, alignment: AlignmentType.BOTH, ...(extra as object) });

  const body: InstanceType<typeof Paragraph>[] = [];
  for (const b of d.blocks) {
    if (b.type === 'h') {
      body.push(
        new Paragraph({
          children: [run({ text: b.text }, { size: b.level === 1 ? size + 12 : b.level === 2 ? size + 6 : size + 2, bold: true })],
          heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
          alignment: b.level === 1 ? AlignmentType.CENTER : rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
          bidirectional: rtl,
          pageBreakBefore: !!b.pageBreak,
          spacing: { before: b.level === 1 ? 1200 : 360, after: b.level === 1 ? 600 : 160 },
        }),
      );
    } else if (b.type === 'break') {
      body.push(new Paragraph({ children: [run({ text: '✦   ✦   ✦' }, { color: '9A7B45' })], alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 } }));
    } else if (b.type === 'kv') {
      body.push(para([run({ text: `${b.key}: `, bold: true }), run({ text: b.value })], { alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT }));
    } else if (b.type === 'quote') {
      body.push(para(b.runs.map((r) => run({ ...r, italic: true })), { indent: { start: 720 } } as object));
    } else if (b.type === 'li' || b.type === 'oli') {
      body.push(para(b.runs.map((r) => run(r)), { bullet: { level: 0 } } as object));
    } else if (b.type === 'dialogue') {
      body.push(para([run({ text: '— ' }), ...b.runs.map((r) => run(r))]));
    } else {
      const align = b.align === 'center' ? AlignmentType.CENTER : b.align === 'left' ? AlignmentType.LEFT : b.align === 'right' ? AlignmentType.RIGHT : AlignmentType.BOTH;
      body.push(para(b.runs.map((r) => run(r)), { alignment: align, indent: { firstLine: 360 } } as object));
    }
  }

  const front: (InstanceType<typeof Paragraph> | InstanceType<typeof TableOfContents>)[] = [];
  if (o.coverPage) {
    if (d.cover) {
      try {
        const data = Uint8Array.from(atob(d.cover.split(',')[1]), (c) => c.charCodeAt(0));
        const img = await new Promise<HTMLImageElement>((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = d.cover!;
        });
        const w = 300;
        front.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 600, after: 400 }, children: [new ImageRun({ type: 'jpg', data, transformation: { width: w, height: Math.round((img.height / img.width) * w) } })] }));
      } catch {
        /* cover optional */
      }
    }
    front.push(new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: rtl, spacing: { before: d.cover ? 200 : 3000, after: 400 }, children: [run({ text: d.title }, { size: size + 28, bold: true })] }));
    if (d.author) front.push(new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: rtl, children: [run({ text: d.author }, { size: size + 6 })] }));
    front.push(new Paragraph({ children: [new PageBreak()] }));
  }
  if (o.toc && d.tocEntries.length) {
    front.push(new Paragraph({ alignment: AlignmentType.CENTER, bidirectional: rtl, spacing: { after: 400 }, children: [run({ text: tr('المحتويات', 'Contents') }, { size: size + 10, bold: true })] }));
    front.push(new TableOfContents(tr('المحتويات', 'Contents'), { hyperlink: true, headingStyleRange: '1-1' }));
    // Fallback list in case the viewer does not refresh the TOC field.
    for (const e of d.tocEntries) front.push(new Paragraph({ bidirectional: rtl, alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [run({ text: e }, { color: '666666' })] }));
  }

  const [w, h] = PAGE_MM[o.pageSize];
  const document = new Document({
    creator: d.author || 'Novelist Studio',
    title: d.title,
    features: { updateFields: o.toc },
    styles: {
      default: { document: { run: { font, size, sizeComplexScript: size, rightToLeft: rtl }, paragraph: { bidirectional: rtl } as object } },
    },
    sections: [
      {
        properties: { page: { size: { width: mmToTwip(w), height: mmToTwip(h) }, margin: { top: mmToTwip(o.marginMm), bottom: mmToTwip(o.marginMm), left: mmToTwip(o.marginMm), right: mmToTwip(o.marginMm) } }, bidi: rtl } as object,
        footers: o.pageNumbers
          ? { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font, size: size - 4 })] })] }) }
          : undefined,
        children: [...front, ...body],
      },
    ],
  });
  return Packer.toBlob(document);
}

// ───────────── PDF via the browser's print engine ─────────────

/** @font-face rules from the app, with absolute URLs, so the print document can use bundled fonts. */
function collectFontFaces(): string {
  const out: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const r of Array.from(rules))
      if (r instanceof CSSFontFaceRule) out.push(r.cssText.replace(/url\(["']?([^"')]+)["']?\)/g, (_m, u) => `url("${new URL(u, sheet.href ?? location.href).href}")`));
  }
  return out.join('\n');
}

export function toPrintHtml(d: ExportDocument, o: ExportSettings): string {
  const fontCss = EXPORT_FONTS.find((f) => f.name === o.font)?.css ?? `'${o.font}', serif`;
  const [w, h] = PAGE_MM[o.pageSize];
  const runs = (rs: Run[]) =>
    rs
      .map((r) => {
        let t = escapeHtml(r.text).replace(/\n/g, '<br>');
        if (r.bold) t = `<strong>${t}</strong>`;
        if (r.italic) t = `<em>${t}</em>`;
        if (r.underline) t = `<u>${t}</u>`;
        return t;
      })
      .join('');
  let tocI = 0;
  const body = d.blocks
    .map((b) => {
      if (b.type === 'h') return `<h${b.level} ${b.toc ? `id="c${tocI++}"` : ''} class="${b.pageBreak ? 'pb' : ''}">${escapeHtml(b.text)}</h${b.level}>`;
      if (b.type === 'break') return '<div class="sb">✦ ✦ ✦</div>';
      if (b.type === 'kv') return `<p class="kv"><b>${escapeHtml(b.key)}:</b> ${escapeHtml(b.value)}</p>`;
      if (b.type === 'quote') return `<blockquote>${runs(b.runs)}</blockquote>`;
      if (b.type === 'li' || b.type === 'oli') return `<p class="li">• ${runs(b.runs)}</p>`;
      if (b.type === 'dialogue') return `<p>— ${runs(b.runs)}</p>`;
      return `<p${b.align ? ` style="text-align:${b.align}"` : ''}>${runs(b.runs)}</p>`;
    })
    .join('\n');
  const cover = o.coverPage
    ? `<section class="cover">${d.cover ? `<img src="${d.cover}" alt="">` : ''}<h1 class="title">${escapeHtml(d.title)}</h1>${d.author ? `<p class="author">${escapeHtml(d.author)}</p>` : ''}</section>`
    : '';
  const toc = o.toc && d.tocEntries.length ? `<section class="toc"><h2>${tr('المحتويات', 'Contents')}</h2><ol>${d.tocEntries.map((e, i) => `<li><a href="#c${i}">${escapeHtml(e)}</a></li>`).join('')}</ol></section>` : '';
  return `<!doctype html><html lang="${d.rtl ? 'ar' : 'en'}" dir="${d.rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escapeHtml(d.title)}</title>
<style>
${collectFontFaces()}
@page { size: ${w}mm ${h}mm; margin: ${o.marginMm}mm; ${o.pageNumbers ? '@bottom-center { content: counter(page); font-family: ' + fontCss + '; font-size: 9pt; color: #666; }' : ''} }
@page :first { @bottom-center { content: none; } }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ${fontCss}; font-size: ${o.fontSize}pt; line-height: ${o.lineSpacing}; color: #111; margin: 0; text-align: justify; hyphens: auto; }
p { margin: 0 0 .35em; text-indent: 1.4em; orphans: 2; widows: 2; }
p.kv, p.li { text-indent: 0; text-align: start; }
h1, h2, h3 { text-align: center; font-weight: 700; break-after: avoid; line-height: 1.4; }
h1 { font-size: 1.9em; margin: 2.2em 0 1.4em; }
h2 { font-size: 1.35em; margin: 1.6em 0 .8em; }
h3 { font-size: 1.1em; margin: 1.2em 0 .6em; }
.pb { break-before: page; }
.sb { text-align: center; color: #9a7b45; letter-spacing: .4em; margin: 1.2em 0; }
blockquote { margin: .8em 2em; font-style: italic; color: #333; }
.cover { height: ${h - o.marginMm * 2 - 2}mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; break-after: page; }
.cover img { max-width: 70%; max-height: 55%; object-fit: contain; margin-bottom: 2em; }
.cover .title { font-size: 2.6em; margin: 0 0 .4em; }
.cover .author { font-size: 1.3em; text-indent: 0; text-align: center; color: #444; }
.toc { break-after: page; } .toc ol { list-style: none; padding: 0; } .toc li { margin: .45em 0; } .toc a { color: inherit; text-decoration: none; }
</style></head><body>${cover}${toc}${body}</body></html>`;
}

/** Opens the system print dialog (choose "Save as PDF"). Waits for fonts so Arabic shaping is correct. */
export async function printHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;inset:auto;width:0;height:0;border:0;opacity:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 50));
  try {
    await doc.fonts?.ready;
    await Promise.all(Array.from(doc.images).map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r)))));
  } catch {
    /* ignore */
  }
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => iframe.remove(), 60_000);
}
