import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImageIcon } from 'lucide-react';
import type { Project, ProjectStatus } from '@/db/types';
import { createProject } from '@/db/repo';
import { GENRES, PROJECT_STATUS } from '@/lib/labels';
import { useT } from '@/store/settings';
import { Field, ImagePicker, Modal, toast } from './ui';

export type ProjectDraft = Pick<
  Project,
  'title' | 'author' | 'description' | 'genre' | 'subgenre' | 'premise' | 'world' | 'language' | 'cover' | 'status' | 'targetWords' | 'startDate' | 'targetDate'
>;

export function emptyDraft(lang: 'ar' | 'en'): ProjectDraft {
  return { title: '', author: '', description: '', genre: '', subgenre: '', premise: '', world: '', language: lang, cover: undefined, status: 'idea', targetWords: 80000, startDate: new Date().toISOString().slice(0, 10), targetDate: '' };
}

export function ProjectFields({ value, onChange }: { value: ProjectDraft; onChange: (patch: Partial<ProjectDraft>) => void }) {
  const t = useT();
  return (
    <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
      <ImagePicker value={value.cover} onChange={(cover) => onChange({ cover })} className="aspect-[2/3] w-28 sm:w-full rounded-lg overflow-hidden border border-line bg-raised">
        <div className="h-full flex flex-col items-center justify-center gap-2 text-faint text-xs p-3 text-center">
          <ImageIcon size={22} />
          {t('صورة الغلاف', 'Cover image')}
        </div>
      </ImagePicker>
      <div className="grid gap-3 sm:grid-cols-2 content-start">
        <Field label={t('اسم الرواية *', 'Title *')} className="sm:col-span-2">
          <input dir="auto" className="input text-base" autoFocus value={value.title} onChange={(e) => onChange({ title: e.target.value })} />
        </Field>
        <Field label={t('اسم الكاتب', 'Author')}>
          <input dir="auto" className="input" value={value.author} onChange={(e) => onChange({ author: e.target.value })} />
        </Field>
        <Field label={t('الحالة', 'Status')}>
          <select className="input" value={value.status} onChange={(e) => onChange({ status: e.target.value as ProjectStatus })}>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {t.l(v)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('التصنيف الأدبي', 'Genre')}>
          <input dir="auto" className="input" list="genres" value={value.genre} onChange={(e) => onChange({ genre: e.target.value })} />
          <datalist id="genres">
            {GENRES.map((g) => (
              <option key={g.en} value={t.l(g)} />
            ))}
          </datalist>
        </Field>
        <Field label={t('النوع الفرعي', 'Subgenre')}>
          <input dir="auto" className="input" value={value.subgenre} onChange={(e) => onChange({ subgenre: e.target.value })} />
        </Field>
      </div>
      <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
        <Field label={t('وصف الرواية', 'Description')} className="sm:col-span-2">
          <textarea dir="auto" rows={2} className="input" value={value.description} onChange={(e) => onChange({ description: e.target.value })} />
        </Field>
        <Field label={t('الفكرة الرئيسية', 'Premise')}>
          <textarea dir="auto" rows={3} className="input" value={value.premise} onChange={(e) => onChange({ premise: e.target.value })} />
        </Field>
        <Field label={t('العالم الذي تدور فيه الأحداث', 'Setting / world')}>
          <textarea dir="auto" rows={3} className="input" value={value.world} onChange={(e) => onChange({ world: e.target.value })} />
        </Field>
        <Field label={t('لغة الرواية', 'Manuscript language')}>
          <select className="input" value={value.language} onChange={(e) => onChange({ language: e.target.value })}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('الهدف النهائي لعدد الكلمات', 'Target word count')}>
          <input type="number" min={0} step={1000} className="input" value={value.targetWords} onChange={(e) => onChange({ targetWords: Math.max(0, Number(e.target.value) || 0) })} />
        </Field>
        <Field label={t('تاريخ البداية', 'Start date')}>
          <input type="date" className="input" value={value.startDate ?? ''} onChange={(e) => onChange({ startDate: e.target.value })} />
        </Field>
        <Field label={t('تاريخ الإنجاز المستهدف', 'Target finish date')}>
          <input type="date" className="input" value={value.targetDate ?? ''} onChange={(e) => onChange({ targetDate: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProjectDraft>(() => emptyDraft(t.lang));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!draft.title.trim()) return toast(t('اكتب اسم الرواية أولاً', 'Please enter a title'), 'error');
    setBusy(true);
    try {
      const p = await createProject(draft, t.lang);
      onClose();
      setDraft(emptyDraft(t.lang));
      navigate(`/p/${p.id}/write`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('رواية جديدة', 'New novel')}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t('إلغاء', 'Cancel')}
          </button>
          <button className="btn-primary" disabled={busy} onClick={submit}>
            {t('إنشاء وبدء الكتابة', 'Create & start writing')}
          </button>
        </>
      }
    >
      <ProjectFields value={draft} onChange={(p) => setDraft((d) => ({ ...d, ...p }))} />
    </Modal>
  );
}
