import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, FileType2, FileCode2, Printer, Loader2, Database, Info } from 'lucide-react';
import { exportProjectBundle } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { Field, downloadBlob, safeFilename, toast, cx } from '@/components/ui';
import { useManuscript } from '@/hooks/useManuscript';
import { buildExportDocument, printHtml, toDocx, toMarkdown, toPrintHtml, toText, type ExportDocument, type ExportScope } from '@/lib/exporters';
import { EXPORT_FONTS, useSettings, useT, type ExportSettings } from '@/store/settings';

type Format = 'docx' | 'pdf' | 'txt' | 'md';

export default function Export() {
  const project = useProject();
  const t = useT();
  const ms = useManuscript(project.id);
  const { exportDefaults, set } = useSettings();
  const o = exportDefaults;
  const setO = (p: Partial<ExportSettings>) => set({ exportDefaults: { ...o, ...p } });
  const [scope, setScope] = useState<ExportScope>('novel');
  const [selected, setSelected] = useState<string[]>([]);
  const [format, setFormat] = useState<Format>('docx');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ExportDocument | null>(null);

  useEffect(() => {
    if (ms && !selected.length && ms[0]) setSelected([ms[0].chapter.id]);
  }, [ms, selected.length]);

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(async () => {
      const d = await buildExportDocument(project, scope, selected, o);
      if (alive) setPreview({ ...d, blocks: d.blocks.slice(0, 80) });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [project, scope, selected, o]);
  const previewHtml = useMemo(() => (preview ? toPrintHtml(preview, o) : ''), [preview, o]);

  const run = async () => {
    if (scope === 'chapters' && !selected.length) return toast(t('اختر فصلاً واحداً على الأقل', 'Select at least one chapter'), 'error');
    setBusy(true);
    try {
      const d = await buildExportDocument(project, scope, selected, o);
      const name = safeFilename(d.title);
      if (format === 'docx') downloadBlob(await toDocx(d, o), `${name}.docx`);
      else if (format === 'txt') downloadBlob(new Blob([toText(d)], { type: 'text/plain;charset=utf-8' }), `${name}.txt`);
      else if (format === 'md') downloadBlob(new Blob([toMarkdown(d)], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
      else await printHtml(toPrintHtml(d, o));
      if (format !== 'pdf') toast(t('تم تجهيز الملف', 'File ready'));
    } catch (e) {
      console.error(e);
      toast(t('تعذر التصدير', 'Export failed'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const formats: { key: Format; label: string; icon: React.ReactNode; hint: string }[] = [
    { key: 'docx', label: 'DOCX', icon: <FileType2 size={18} />, hint: t('Word / Google Docs / LibreOffice', 'Word / Google Docs / LibreOffice') },
    { key: 'pdf', label: 'PDF', icon: <Printer size={18} />, hint: t('عبر نافذة الطباعة ← حفظ كـ PDF', 'Via print dialog → Save as PDF') },
    { key: 'txt', label: 'TXT', icon: <FileText size={18} />, hint: t('نص خام', 'Plain text') },
    { key: 'md', label: 'Markdown', icon: <FileCode2 size={18} />, hint: t('للمحررات والمواقع', 'For editors & the web') },
  ];
  const scopes: { key: ExportScope; label: string }[] = [
    { key: 'novel', label: t('الرواية كاملة', 'Whole novel') },
    { key: 'chapters', label: t('فصول محددة / فصل واحد', 'Selected chapters / one chapter') },
    { key: 'bible', label: t('موسوعة الرواية', 'Novel bible') },
    { key: 'characters', label: t('قائمة الشخصيات', 'Character list') },
    { key: 'timeline', label: t('الخط الزمني', 'Timeline') },
  ];
  const fontInfo = EXPORT_FONTS.find((f) => f.name === o.font);

  return (
    <div className="page max-w-7xl">
      <PageHeader icon={<Download size={22} />} title={t('التصدير', 'Export')} subtitle={t('صدّر روايتك بتنسيق جاهز للطباعة أو المشاركة، مع دعم كامل للعربية واتجاه RTL.', 'Export print-ready files with full Arabic and RTL support.')} />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <section className="card p-4">
            <h2 className="section-title mb-3">{t('ماذا تريد أن تصدّر؟', 'What to export')}</h2>
            <div className="space-y-1">
              {scopes.map((s) => (
                <label key={s.key} className={cx('flex items-center gap-3 rounded-lg px-3 h-10 cursor-pointer text-sm', scope === s.key ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/50')}>
                  <input type="radio" name="scope" className="accent-[rgb(var(--accent))]" checked={scope === s.key} onChange={() => setScope(s.key)} />
                  {s.label}
                </label>
              ))}
            </div>
            {scope === 'chapters' && ms && (
              <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-line/60 p-2 space-y-0.5">
                <div className="flex gap-2 px-1 pb-1">
                  <button className="text-xs text-accent" onClick={() => setSelected(ms.map((c) => c.chapter.id))}>
                    {t('تحديد الكل', 'All')}
                  </button>
                  <button className="text-xs text-muted" onClick={() => setSelected([])}>
                    {t('إلغاء', 'None')}
                  </button>
                </div>
                {ms.map((c) => (
                  <label key={c.chapter.id} className="flex items-center gap-2 px-1 h-8 text-sm text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-[rgb(var(--accent))]"
                      checked={selected.includes(c.chapter.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.chapter.id] : s.filter((x) => x !== c.chapter.id)))}
                    />
                    <span className="truncate">{c.chapter.title}</span>
                  </label>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="section-title mb-3">{t('الصيغة', 'Format')}</h2>
            <div className="grid grid-cols-2 gap-2">
              {formats.map((f) => (
                <button key={f.key} onClick={() => setFormat(f.key)} className={cx('rounded-xl border p-3 text-start', format === f.key ? 'border-current text-accent bg-raised/50' : 'border-line text-muted hover:text-ink')}>
                  <div className="flex items-center gap-2 font-medium">
                    {f.icon} {f.label}
                  </div>
                  <div className="text-[11px] text-faint mt-1">{f.hint}</div>
                </button>
              ))}
            </div>
          </section>

          {(format === 'docx' || format === 'pdf') && (
            <section className="card p-4 space-y-3">
              <h2 className="section-title">{t('إعدادات التنسيق والطباعة', 'Layout & print settings')}</h2>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('حجم الصفحة', 'Page size')}>
                  <select className="input" value={o.pageSize} onChange={(e) => setO({ pageSize: e.target.value as ExportSettings['pageSize'] })}>
                    <option value="A5">A5 ({t('رواية', 'novel')})</option>
                    <option value="6x9">6×9 in</option>
                    <option value="A4">A4</option>
                    <option value="Letter">Letter</option>
                  </select>
                </Field>
                <Field label={t('الهوامش (مم)', 'Margins (mm)')}>
                  <input type="number" min={5} max={50} className="input" value={o.marginMm} onChange={(e) => setO({ marginMm: Math.max(5, Math.min(50, Number(e.target.value) || 20)) })} />
                </Field>
                <Field label={t('نوع الخط', 'Font')} className="col-span-2">
                  <select className="input" value={o.font} onChange={(e) => setO({ font: e.target.value })}>
                    {EXPORT_FONTS.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('حجم الخط (pt)', 'Font size (pt)')}>
                  <input type="number" min={8} max={24} className="input" value={o.fontSize} onChange={(e) => setO({ fontSize: Math.max(8, Math.min(24, Number(e.target.value) || 13)) })} />
                </Field>
                <Field label={t('تباعد الأسطر', 'Line spacing')}>
                  <input type="number" min={1} max={3} step={0.1} className="input" value={o.lineSpacing} onChange={(e) => setO({ lineSpacing: Math.max(1, Math.min(3, Number(e.target.value) || 1.5)) })} />
                </Field>
              </div>
              {format === 'docx' && fontInfo?.bundled && (
                <p className="text-[11px] text-faint flex gap-1.5">
                  <Info size={13} className="shrink-0 mt-0.5" />
                  {t(`ملف DOCX يحدد خط "${o.font}"؛ إذا لم يكن مثبتاً على جهاز القارئ سيستبدله Word بخط آخر. للمشاركة الواسعة اختر Traditional Arabic أو Arial.`, `DOCX references "${o.font}"; if it is not installed on the reader's computer Word substitutes another font. For wide sharing pick Traditional Arabic or Arial.`)}
                </p>
              )}
              {[
                ['coverPage', t('صفحة غلاف', 'Cover page')],
                ['toc', t('صفحة الفهرس', 'Table of contents')],
                ['chapterHeadings', t('عناوين الفصول', 'Chapter headings')],
                ['chapterPageBreak', t('كل فصل في صفحة جديدة', 'Start chapters on a new page')],
                ['sceneTitles', t('عناوين المشاهد', 'Scene titles')],
                ['pageNumbers', t('ترقيم الصفحات', 'Page numbers')],
              ].map(([k, label]) => (
                <label key={k} className="flex items-center justify-between text-sm text-ink">
                  {label}
                  <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--accent))]" checked={o[k as keyof ExportSettings] as boolean} onChange={(e) => setO({ [k]: e.target.checked } as Partial<ExportSettings>)} />
                </label>
              ))}
            </section>
          )}

          <button className="btn-primary w-full h-12 text-base" onClick={run} disabled={busy}>
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            {format === 'pdf' ? t('فتح نافذة الطباعة / PDF', 'Open print / PDF dialog') : t('تنزيل الملف', 'Download file')}
          </button>
          {format === 'pdf' && (
            <p className="text-[11px] text-faint leading-relaxed">
              {t(
                'يُنشأ ملف PDF بمحرك الطباعة في المتصفح لأنه الوحيد الذي يضمن تشكيل الحروف العربية واتجاه النص بدقة. اختر "حفظ كـ PDF" كوجهة. ترقيم الصفحات يظهر في متصفحات Chrome وEdge الحديثة.',
                'PDF is produced by the browser print engine because it is the only way to guarantee correct Arabic shaping and direction. Choose "Save as PDF" as the destination. Page numbers appear in current Chrome and Edge.',
              )}
            </p>
          )}
          <section className="card p-4">
            <h2 className="section-title mb-2">{t('نسخة كاملة من المشروع', 'Full project copy')}</h2>
            <p className="text-xs text-muted mb-3">{t('ملف JSON يحتوي على كل شيء (النصوص، الموسوعة، الخط الزمني، الحبكة، الملاحظات، السجل) ويمكن استيراده لاحقاً على أي جهاز.', 'A JSON file with everything (text, bible, timeline, plot, notes, history) that can be imported on any device.')}</p>
            <button
              className="btn-outline w-full"
              onClick={async () => {
                const b = await exportProjectBundle(project.id);
                downloadBlob(new Blob([JSON.stringify(b)], { type: 'application/json' }), `${safeFilename(project.title)}.novelist.json`);
              }}
            >
              <Database size={16} /> {t('تصدير المشروع (JSON)', 'Export project (JSON)')}
            </button>
          </section>
        </div>

        <section className="card p-3 hidden lg:flex flex-col min-h-[70vh]">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="section-title">{t('معاينة', 'Preview')}</span>
            <span className="text-[11px] text-faint">{t('أول جزء من المستند', 'First part of the document')}</span>
          </div>
          <iframe title="preview" srcDoc={previewHtml} className="flex-1 w-full rounded-lg bg-white" />
        </section>
      </div>
    </div>
  );
}
