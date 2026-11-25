import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Editor } from '@tiptap/react';
import { Sparkles, Square, Check, X, Copy, GitCompare, StickyNote } from 'lucide-react';
import { db } from '@/db/db';
import type { Scene } from '@/db/types';
import { createCheckpoint, createNote } from '@/db/repo';
import { useSettings, useT } from '@/store/settings';
import { toast, cx } from '@/components/ui';
import { wordDiff } from '@/lib/diff';
import { escapeHtml } from '@/lib/text';
import { TASKS, systemPrompt, type AITask } from './tasks';
import { buildNovelContext, DEFAULT_SOURCES } from './context';
import { AIErrorBox, AIMarkdown, KeyGate, useAIRequest } from './ui';

/**
 * Writing help on the current selection (or the whole scene). Rewrites never touch the text
 * until the writer reviews the comparison and presses "Accept".
 */
export function AISelectionPanel({ projectId, scene, editor, onFlush }: { projectId: string; scene: Scene; editor: Editor; onFlush: () => Promise<unknown> }) {
  const t = useT();
  const maxContextChars = useSettings((s) => s.ai.maxContextChars);
  const req = useAIRequest();
  const [task, setTask] = useState<AITask | null>(null);
  const [target, setTarget] = useState<{ from: number; to: number; text: string; whole: boolean } | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [ask, setAsk] = useState('');

  const runTask = async (tk: AITask, custom?: string) => {
    const { from, to } = editor.state.selection;
    const whole = from === to;
    const doc = editor.state.doc;
    const text = whole ? doc.textBetween(0, doc.content.size, '\n\n') : doc.textBetween(from, to, '\n\n');
    if (!text.trim()) return toast(t('لا يوجد نص للعمل عليه', 'There is no text to work on'), 'info');
    if (tk.rewrite && whole && text.length > 12000) return toast(t('حدد مقطعاً أقصر لإعادة الصياغة', 'Select a shorter passage to rewrite'), 'info');
    setTask(tk);
    setTarget({ from: whole ? 0 : from, to: whole ? doc.content.size : to, text, whole });
    await onFlush();
    const project = await db.projects.get(projectId);
    if (!project) return;
    const ctx = await buildNovelContext(project, { ...DEFAULT_SOURCES, manuscript: 'before' }, { currentSceneId: scene.id, budget: Math.min(maxContextChars, 200000) });
    const passageLabel = whole ? t('نص المشهد الحالي', 'Current scene text') : t('المقطع المحدد', 'Selected passage');
    await req.run({
      system: systemPrompt(t.lang),
      context: `<novel_context>\n${ctx.text}\n</novel_context>`,
      messages: [{ role: 'user', content: `${custom ?? tk.prompt}\n\n<${whole ? 'current_scene' : 'selected_passage'} label="${passageLabel}">\n${text}\n</${whole ? 'current_scene' : 'selected_passage'}>` }],
    });
  };

  const accept = async () => {
    if (!target || !req.text.trim()) return;
    const doc = editor.state.doc;
    const current = target.whole ? doc.textBetween(0, doc.content.size, '\n\n') : doc.textBetween(target.from, Math.min(target.to, doc.content.size), '\n\n');
    if (current !== target.text) return toast(t('تغيّر النص منذ الطلب — حدد المقطع وأعد المحاولة', 'The text changed since the request — reselect and retry'), 'error');
    await onFlush();
    await createCheckpoint(scene.id, t(`قبل اقتراح الذكاء: ${task ? t.l(task.label) : ''}`, `Before AI: ${task ? t.l(task.label) : ''}`), 'pre-ai');
    const html = req.text
      .trim()
      .split(/\n{2,}|\n/)
      .filter((p) => p.trim())
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join('');
    if (target.whole) editor.chain().focus().setContent(html, true).run();
    else editor.chain().focus().insertContentAt({ from: target.from, to: target.to }, html).run();
    toast(t('طُبّق الاقتراح — النسخة السابقة في السجل ويمكنك التراجع', 'Applied — previous version kept in history; undo is available'));
    req.reset();
    setTask(null);
  };

  const diff = useMemo(() => (task?.rewrite && target && req.text && !req.running ? wordDiff(target.text, req.text) : null), [task, target, req.text, req.running]);
  const writing = TASKS.filter((x) => x.group === 'writing');

  return (
    <KeyGate>
      <div className="space-y-4">
        <p className="text-xs text-muted leading-relaxed">
          {t('حدد مقطعاً في النص أو اترك المؤشر بلا تحديد للعمل على المشهد كله. لن يتغير نصك إلا إذا ضغطت "قبول".', 'Select a passage, or leave no selection to work on the whole scene. Your text never changes unless you press "Accept".')}
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {writing.map((tk) => (
            <button key={tk.id} disabled={req.running} onClick={() => runTask(tk)} className={cx('rounded-lg border px-2.5 py-2 text-xs text-start', task?.id === tk.id ? 'border-current text-accent' : 'border-line text-muted hover:text-ink')}>
              {t.l(tk.label)}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ask.trim()) return;
            runTask({ id: 'ask', group: 'writing', label: { ar: 'سؤال', en: 'Question' }, prompt: ask }, ask);
          }}
        >
          <input dir="auto" className="input h-9 flex-1" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder={t('اسأل عن هذا المشهد…', 'Ask about this scene…')} />
          <button className="btn-primary h-9 px-3" disabled={req.running || !ask.trim()}>
            <Sparkles size={14} />
          </button>
        </form>

        {req.error && <AIErrorBox error={req.error} />}
        {(req.running || req.text) && (
          <div className="rounded-xl border border-line bg-raised/40 p-3 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-accent" /> {task ? t.l(task.label) : ''} {target?.whole ? t('· المشهد كاملاً', '· whole scene') : t('· المقطع المحدد', '· selection')}
              </span>
              {req.running ? (
                <button className="btn-ghost h-7 px-2 text-xs" onClick={req.stop}>
                  <Square size={12} /> {t('إيقاف', 'Stop')}
                </button>
              ) : (
                task?.rewrite && (
                  <button className={cx('icon-btn w-7 h-7', showDiff && 'active')} onClick={() => setShowDiff((s) => !s)} title={t('مقارنة', 'Compare')}>
                    <GitCompare size={14} />
                  </button>
                )
              )}
            </div>
            {diff && showDiff ? (
              <div className="font-serif text-[15px] leading-loose whitespace-pre-wrap text-ink" dir="auto">
                {diff.parts.map((p, i) => (
                  <span key={i} className={p.added ? 'diff-add' : p.removed ? 'diff-del' : undefined}>
                    {p.value}
                  </span>
                ))}
              </div>
            ) : task?.rewrite ? (
              <div className="font-serif text-[15px] leading-loose whitespace-pre-wrap text-ink" dir="auto">
                {req.text}
              </div>
            ) : (
              <AIMarkdown text={req.text || '…'} />
            )}
            {!req.running && req.text && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {task?.rewrite && (
                  <button className="btn-primary h-8 text-xs" onClick={accept}>
                    <Check size={14} /> {t('قبول', 'Accept')}
                  </button>
                )}
                <button
                  className="btn-ghost h-8 text-xs"
                  onClick={() => {
                    req.reset();
                    setTask(null);
                  }}
                >
                  <X size={14} /> {t('رفض', 'Reject')}
                </button>
                <button className="btn-ghost h-8 text-xs" onClick={() => navigator.clipboard?.writeText(req.text).then(() => toast(t('نُسخ', 'Copied')))}>
                  <Copy size={14} />
                </button>
                <button
                  className="btn-ghost h-8 text-xs"
                  onClick={async () => {
                    await createNote(projectId, { type: task?.id === 'dialogue-ideas' ? 'dialogue' : 'idea', title: `${t('المساعد', 'Assistant')}: ${task ? t.l(task.label) : ''}`, content: req.text, tags: ['AI'] });
                    toast(t('حُفظ في الملاحظات', 'Saved to notes'));
                  }}
                >
                  <StickyNote size={14} /> {t('حفظ كملاحظة', 'Save as note')}
                </button>
              </div>
            )}
          </div>
        )}
        <Link to={`/p/${projectId}/assistant`} className="text-xs text-accent block">
          {t('تحليل الرواية كاملة في صفحة المساعد ←', 'Full-novel analysis in the Assistant page →')}
        </Link>
      </div>
    </KeyGate>
  );
}
