import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Upload, MoreVertical, Copy, Archive, ArchiveRestore, Trash2, Download, PenLine, Settings2, Search, FileText } from 'lucide-react';
import { db } from '@/db/db';
import type { Project } from '@/db/types';
import { deleteProject, duplicateProject, exportProjectBundle, updateProject } from '@/db/repo';
import { useT } from '@/store/settings';
import { NewProjectDialog } from '@/components/ProjectForm';
import { Cover } from './Dashboard';
import { Empty, Menu, Modal, ProgressBar, downloadBlob, promptDialog, safeFilename, toast, useFmt, cx } from '@/components/ui';
import { PROJECT_STATUS, STATUS_COLOR } from '@/lib/labels';
import { readJsonFile, restoreFromFile } from '@/lib/backup';
import { createProjectFromManuscript, parseManuscriptFile, type ParsedManuscript } from '@/lib/importers';

export default function Projects() {
  const t = useT();
  const f = useFmt();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [preview, setPreview] = useState<ParsedManuscript | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), []);

  useEffect(() => {
    if (params.get('import')) {
      setParams({});
      setTimeout(() => fileRef.current?.click(), 100);
    }
  }, [params, setParams]);

  const list = useMemo(
    () => (projects ?? []).filter((p) => (filter === 'archived' ? p.archived : !p.archived)).filter((p) => !q || (p.title + p.author + p.genre).toLowerCase().includes(q.toLowerCase())),
    [projects, filter, q],
  );

  const onFile = async (file: File) => {
    try {
      if (file.name.endsWith('.json')) {
        const n = await restoreFromFile(await readJsonFile(file));
        toast(t(`تمت استعادة ${n} رواية`, `Restored ${n} novel(s)`));
      } else {
        setPreview(await parseManuscriptFile(file, t('الفصل', 'Chapter')));
      }
    } catch (e) {
      console.error(e);
      toast(t('تعذر قراءة الملف. الصيغ المدعومة: DOCX وTXT وMarkdown وملفات النسخ الاحتياطي JSON.', 'Could not read the file. Supported: DOCX, TXT, Markdown and JSON backups.'), 'error');
    }
  };

  const actions = (p: Project) => [
    { label: t('فتح المحرر', 'Open editor'), icon: <PenLine size={15} />, onClick: () => navigate(`/p/${p.id}/write`) },
    { label: t('تعديل بيانات المشروع', 'Edit details'), icon: <Settings2 size={15} />, onClick: () => navigate(`/p/${p.id}/details`) },
    {
      label: t('نسخ الرواية', 'Duplicate'),
      icon: <Copy size={15} />,
      onClick: async () => {
        await duplicateProject(p.id, t(' (نسخة)', ' (copy)'));
        toast(t('تم إنشاء نسخة من الرواية', 'Novel duplicated'));
      },
    },
    {
      label: t('تصدير المشروع كاملاً', 'Export full project'),
      icon: <Download size={15} />,
      onClick: async () => {
        const b = await exportProjectBundle(p.id);
        downloadBlob(new Blob([JSON.stringify(b)], { type: 'application/json' }), `${safeFilename(p.title)}.novelist.json`);
      },
    },
    p.archived
      ? { label: t('إلغاء الأرشفة', 'Unarchive'), icon: <ArchiveRestore size={15} />, onClick: () => updateProject(p.id, { archived: false }) }
      : { label: t('أرشفة', 'Archive'), icon: <Archive size={15} />, onClick: () => updateProject(p.id, { archived: true }).then(() => toast(t('تمت الأرشفة', 'Archived'))) },
    'sep' as const,
    {
      label: t('حذف نهائي…', 'Delete…'),
      icon: <Trash2 size={15} />,
      danger: true,
      onClick: async () => {
        const typed = await promptDialog({
          title: t('حذف الرواية نهائياً', 'Delete novel permanently'),
          message: t(
            `سيتم حذف "${p.title}" بكل فصولها وموسوعتها وسجل نسخها من هذا الجهاز. لا يمكن التراجع.\nننصح بتصدير المشروع أولاً.\nاكتب اسم الرواية للتأكيد:`,
            `"${p.title}" will be deleted with all chapters, bible and history from this device. This cannot be undone.\nConsider exporting first.\nType the title to confirm:`,
          ),
        });
        if (typed === null) return;
        if (typed.trim() !== p.title.trim()) return toast(t('الاسم غير مطابق — لم يتم الحذف', 'Title did not match — nothing deleted'), 'error');
        await deleteProject(p.id);
        toast(t('تم حذف الرواية', 'Novel deleted'));
      },
    },
  ];

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="h1">{t('رواياتي', 'My novels')}</h1>
          <p className="text-sm text-muted mt-1.5">{t('كل رواية مساحة عمل مستقلة بفصولها وموسوعتها وخطها الزمني.', 'Each novel is an independent workspace.')}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> {t('استيراد', 'Import')}
          </button>
          <button className="btn-primary" onClick={() => setNewOpen(true)}>
            <Plus size={16} /> {t('رواية جديدة', 'New novel')}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".docx,.txt,.md,.markdown,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex rounded-lg border border-line p-0.5">
          {(['active', 'archived'] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)} className={cx('px-3 h-8 rounded-md text-sm', filter === k ? 'bg-raised text-ink' : 'text-muted')}>
              {k === 'active' ? t('النشطة', 'Active') : t('المؤرشفة', 'Archived')}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-faint" />
          <input className="input ps-9 h-9" placeholder={t('ابحث في رواياتك…', 'Search novels…')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {projects && list.length === 0 ? (
        <Empty
          title={filter === 'archived' ? t('لا توجد روايات مؤرشفة', 'No archived novels') : t('لا توجد روايات بعد', 'No novels yet')}
          text={filter === 'active' ? t('أنشئ رواية جديدة أو استورد مخطوطة DOCX أو TXT أو Markdown.', 'Create a new novel or import a DOCX, TXT or Markdown manuscript.') : undefined}
        />
      ) : (
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((p) => (
            <div key={p.id} className="group relative">
              <Link to={`/p/${p.id}/write`} className="block">
                <Cover project={p} className="w-full transition-transform group-hover:-translate-y-0.5" />
              </Link>
              <div className="flex items-start gap-1 mt-2.5">
                <div className="min-w-0 flex-1">
                  <Link to={`/p/${p.id}/write`} className="font-serif text-base text-ink leading-snug line-clamp-2 hover:text-accent">
                    {p.title}
                  </Link>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted mt-1">
                    <span className={cx('w-1.5 h-1.5 rounded-full', STATUS_COLOR[p.status])} />
                    {t.l(PROJECT_STATUS[p.status])} · {f.n(p.wordCount)} {t('كلمة', 'words')}
                  </div>
                  <ProgressBar value={p.targetWords ? p.wordCount / p.targetWords : 0} className="mt-2" />
                </div>
                <Menu items={actions(p)} trigger={(tp) => <button {...tp} className="icon-btn w-8 h-8 -me-1" aria-label="menu"><MoreVertical size={16} /></button>} />
              </div>
            </div>
          ))}
        </div>
      )}

      <NewProjectDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <ImportPreview preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function ImportPreview({ preview, onClose }: { preview: ParsedManuscript | null; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setTitle(preview?.title ?? ''), [preview]);
  if (!preview) return null;
  const sceneCount = preview.chapters.reduce((a, c) => a + c.scenes.length, 0);
  return (
    <Modal
      open
      onClose={onClose}
      title={t('معاينة الاستيراد', 'Import preview')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const id = await createProjectFromManuscript({ ...preview, title: title || preview.title }, t.lang);
                onClose();
                toast(t('تم استيراد المخطوطة', 'Manuscript imported'));
                navigate(`/p/${id}/structure`);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('إنشاء الرواية', 'Create novel')}
          </button>
        </>
      }
    >
      <label className="label">{t('اسم الرواية', 'Title')}</label>
      <input dir="auto" className="input mb-4" value={title} onChange={(e) => setTitle(e.target.value)} />
      <p className="text-sm text-muted mb-3">
        {t(`تم التعرف على ${preview.chapters.length} فصل و${sceneCount} مشهد.`, `Detected ${preview.chapters.length} chapters and ${sceneCount} scenes.`)}{' '}
        {t('تُكتشف الفصول من العناوين أو أسطر مثل "الفصل الأول"، والمشاهد من الفواصل مثل ***.', 'Chapters are detected from headings or lines like "Chapter 1"; scenes from separators like ***.')}
      </p>
      <ol className="space-y-1.5 max-h-72 overflow-y-auto">
        {preview.chapters.map((c, i) => (
          <li key={i} className="flex items-center gap-2 text-sm rounded-lg bg-raised/50 px-3 py-2">
            <FileText size={14} className="text-faint shrink-0" />
            <span className="text-ink truncate flex-1" dir="auto">
              {c.title}
            </span>
            <span className="text-xs text-muted">
              {c.scenes.length} {t('مشهد', 'scenes')}
            </span>
          </li>
        ))}
      </ol>
    </Modal>
  );
}
