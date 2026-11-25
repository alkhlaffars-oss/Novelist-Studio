import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings2, Copy, Archive, ArchiveRestore, Trash2, Upload, Check } from 'lucide-react';
import { db } from '@/db/db';
import { createScene, deleteProject, duplicateProject, newId, recomputeProjectWords, updateProject } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { ProjectFields, type ProjectDraft } from '@/components/ProjectForm';
import { promptDialog, toast } from '@/components/ui';
import { parseManuscriptFile } from '@/lib/importers';
import { useT } from '@/store/settings';

export default function ProjectDetails() {
  const project = useProject();
  const t = useT();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProjectDraft>(project);
  const [saved, setSaved] = useState(true);
  const timer = useRef<number>();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saved) setDraft(project);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const change = (p: Partial<ProjectDraft>) => {
    const next = { ...draft, ...p };
    setDraft(next);
    setSaved(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      await updateProject(project.id, { ...next, title: next.title.trim() || project.title });
      setSaved(true);
    }, 500);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const importChapters = async (file: File) => {
    try {
      const m = await parseManuscriptFile(file, t('الفصل', 'Chapter'));
      const existing = await db.chapters.where('projectId').equals(project.id).toArray();
      let order = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 0;
      const now = Date.now();
      for (const c of m.chapters) {
        const id = newId();
        await db.chapters.add({ id, projectId: project.id, order: order++, title: c.title, summary: '', status: 'draft', createdAt: now, updatedAt: now });
        for (const html of c.scenes) await createScene(project.id, id, '', { content: html });
      }
      await recomputeProjectWords(project.id);
      toast(t(`أضيف ${m.chapters.length} فصل إلى الرواية`, `Added ${m.chapters.length} chapters`));
      navigate(`/p/${project.id}/structure`);
    } catch {
      toast(t('تعذر قراءة الملف', 'Could not read the file'), 'error');
    }
  };

  return (
    <div className="page max-w-4xl space-y-6">
      <PageHeader
        icon={<Settings2 size={22} />}
        title={t('بيانات المشروع', 'Project details')}
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            {saved ? <Check size={13} className="text-ok" /> : null}
            {saved ? t('تُحفظ التغييرات تلقائياً', 'Changes save automatically') : t('جارٍ الحفظ…', 'Saving…')}
          </span>
        }
      />
      <div className="card p-5">
        <ProjectFields value={draft} onChange={change} />
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="section-title">{t('استيراد فصول إلى هذه الرواية', 'Import chapters into this novel')}</h2>
        <p className="text-sm text-muted">{t('أضف فصولاً من ملف DOCX أو TXT أو Markdown إلى نهاية الرواية. تُكتشف الفصول من العناوين والمشاهد من الفواصل (***).', 'Append chapters from a DOCX, TXT or Markdown file. Chapters come from headings, scenes from *** separators.')}</p>
        <button className="btn-outline" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {t('اختيار ملف', 'Choose file')}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".docx,.txt,.md,.markdown"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importChapters(f);
            e.target.value = '';
          }}
        />
      </div>

      <div className="card p-5 space-y-3">
        <h2 className="section-title">{t('إدارة المشروع', 'Manage project')}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-outline"
            onClick={async () => {
              const id = await duplicateProject(project.id, t(' (نسخة)', ' (copy)'));
              toast(t('تم إنشاء نسخة', 'Duplicated'), 'ok', { label: t('فتح', 'Open'), run: () => navigate(`/p/${id}/details`) });
            }}
          >
            <Copy size={16} /> {t('نسخ الرواية', 'Duplicate novel')}
          </button>
          <button className="btn-outline" onClick={() => updateProject(project.id, { archived: !project.archived }).then(() => toast(project.archived ? t('أُلغيت الأرشفة', 'Unarchived') : t('أُرشفت الرواية', 'Archived')))}>
            {project.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
            {project.archived ? t('إلغاء الأرشفة', 'Unarchive') : t('أرشفة', 'Archive')}
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              const typed = await promptDialog({
                title: t('حذف الرواية نهائياً', 'Delete novel permanently'),
                message: t(`لا يمكن التراجع. اكتب "${project.title}" للتأكيد:`, `This cannot be undone. Type "${project.title}" to confirm:`),
              });
              if (typed === null) return;
              if (typed.trim() !== project.title.trim()) return toast(t('الاسم غير مطابق', 'Title did not match'), 'error');
              await deleteProject(project.id);
              navigate('/projects');
            }}
          >
            <Trash2 size={16} /> {t('حذف', 'Delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
