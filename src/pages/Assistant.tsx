import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Sparkles, Send, Square, Trash2, Copy, StickyNote, ShieldPlus, Database, Info } from 'lucide-react';
import { db } from '@/db/db';
import { createNote, newId } from '@/db/repo';
import { useProject, PageHeader } from '@/components/ProjectLayout';
import { confirmDialog, toast, useFmt, cx } from '@/components/ui';
import { useSettings, useT } from '@/store/settings';
import { buildNovelContext, DEFAULT_SOURCES, type ContextSources } from '@/ai/context';
import { TASKS, systemPrompt } from '@/ai/tasks';
import { AIErrorBox, AIMarkdown, KeyGate, useAIRequest } from '@/ai/ui';
import { ANTHROPIC_MODELS, providerLabel, type ChatTurn } from '@/ai/client';

interface StoredTurn extends ChatTurn {
  id: string;
  at: number;
  task?: string;
}

export default function Assistant() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const ai = useSettings((s) => s.ai);
  const [params, setParams] = useSearchParams();
  const req = useAIRequest();
  const [sources, setSources] = useState<ContextSources>(DEFAULT_SOURCES);
  const [input, setInput] = useState('');
  const [ctxInfo, setCtxInfo] = useState<{ chars: number; truncated: boolean } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const kvKey = `assistant:${project.id}`;
  const thread = (useLiveQuery(() => db.kv.get(kvKey), [kvKey])?.value as StoredTurn[] | undefined) ?? [];

  useEffect(() => {
    let alive = true;
    buildNovelContext(project, sources, { currentSceneId: project.lastSceneId, budget: ai.maxContextChars }).then((c) => alive && setCtxInfo({ chars: c.chars, truncated: c.truncated }));
    return () => {
      alive = false;
    };
  }, [project, sources, ai.maxContextChars]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [thread.length, req.text]);

  const send = async (content: string, taskId?: string) => {
    if (!content.trim() || req.running) return;
    const userTurn: StoredTurn = { id: newId(), role: 'user', content, at: Date.now(), task: taskId };
    const history = [...thread, userTurn];
    await db.kv.put({ key: kvKey, value: history });
    setInput('');
    const ctx = await buildNovelContext(project, sources, { currentSceneId: project.lastSceneId, budget: ai.maxContextChars });
    const reply = await req.run({
      system: systemPrompt(t.lang),
      context: `<novel_context>\n${ctx.text || '(no material selected)'}\n</novel_context>`,
      messages: history.slice(-12).map(({ role, content: c }) => ({ role, content: c })),
    });
    if (reply) {
      await db.kv.put({ key: kvKey, value: [...history, { id: newId(), role: 'assistant', content: reply, at: Date.now(), task: taskId }] });
      req.reset();
    }
  };

  useEffect(() => {
    const task = TASKS.find((x) => x.id === params.get('task'));
    if (task) {
      setParams({}, { replace: true });
      setInput(task.prompt);
    }
  }, [params, setParams]);

  const src = (k: keyof ContextSources, label: string) => (
    <label className="flex items-center gap-2 text-sm text-ink h-8">
      <input type="checkbox" className="w-4 h-4 accent-[rgb(var(--accent))]" checked={!!sources[k]} onChange={(e) => setSources({ ...sources, [k]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <div className="page max-w-7xl">
      <PageHeader
        icon={<Sparkles size={22} />}
        title={t('المساعد الأدبي', 'Literary assistant')}
        subtitle={`${providerLabel(ai.provider)} · ${ANTHROPIC_MODELS.find((m) => m.id === ai.model)?.label ?? ai.model}`}
        actions={
          thread.length > 0 && (
            <button
              className="btn-ghost"
              onClick={async () => {
                if (await confirmDialog({ title: t('مسح المحادثة؟', 'Clear conversation?'), danger: true })) await db.kv.delete(kvKey);
              }}
            >
              <Trash2 size={15} /> {t('مسح المحادثة', 'Clear')}
            </button>
          )
        }
      />
      <KeyGate>
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="space-y-4">
            <div className="card p-4">
              <h2 className="section-title mb-2 flex items-center gap-1.5">
                <Database size={13} /> {t('الذاكرة الروائية — ما يُسمح له بقراءته', 'Novel memory — what it may read')}
              </h2>
              {src('overview', t('بيانات الرواية والفكرة', 'Overview & premise'))}
              {src('characters', t('الشخصيات وعلاقاتها', 'Characters & relationships'))}
              {src('world', t('الأماكن والعناصر والعالم', 'Places, objects & world'))}
              {src('timeline', t('الخط الزمني', 'Timeline'))}
              {src('plot', t('لوحة الحبكة', 'Plot board'))}
              {src('summaries', t('ملخصات الفصول والمشاهد', 'Chapter & scene summaries'))}
              {src('notes', t('الملاحظات', 'Notes'))}
              <label className="block mt-2">
                <span className="label">{t('نص المخطوطة', 'Manuscript text')}</span>
                <select className="input h-9" value={sources.manuscript} onChange={(e) => setSources({ ...sources, manuscript: e.target.value as ContextSources['manuscript'] })}>
                  <option value="none">{t('لا شيء', 'None')}</option>
                  <option value="before">{t('حتى آخر مشهد فتحته', 'Up to the last opened scene')}</option>
                  <option value="all">{t('الرواية كاملة', 'Whole novel')}</option>
                </select>
              </label>
              {ctxInfo && (
                <p className={cx('text-[11px] mt-2', ctxInfo.truncated ? 'text-gold' : 'text-faint')}>
                  ≈ {f.n(ctxInfo.chars)} {t('حرف سيُرسل', 'characters will be sent')}
                  {ctxInfo.truncated && ` — ${t('اقتُطعت فصول مبكرة لتجاوز الحد', 'early chapters trimmed to fit the limit')}`}
                </p>
              )}
            </div>
            <div className="card p-4">
              <h2 className="section-title mb-2">{t('تحليل الرواية', 'Analyse the novel')}</h2>
              <div className="flex flex-wrap gap-1.5">
                {TASKS.filter((x) => x.group === 'analysis' || x.id === 'endings').map((tk) => (
                  <button key={tk.id} disabled={req.running} className="chip hover:text-ink" onClick={() => send(`${t.l(tk.label)}:\n${tk.prompt}`, tk.id)}>
                    {t.l(tk.label)}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-faint flex gap-1.5 leading-relaxed">
              <Info size={13} className="shrink-0 mt-0.5" />
              {t('يُطلب من المساعد التمييز بين ما هو مؤكد من النص وما هو استنتاج أو اقتراح، والإشارة إلى الفصول والمشاهد. يُرسل المحتوى المحدد فقط إلى مزود الخدمة الذي اخترته.', 'The assistant is instructed to separate confirmed facts from inferences and suggestions, and to cite chapters/scenes. Only the selected material is sent to your chosen provider.')}
            </p>
          </aside>

          <section className="card flex flex-col min-h-[65vh] max-h-[calc(100dvh-180px)]">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {thread.length === 0 && !req.running && (
                <div className="text-center py-10 px-4">
                  <Sparkles size={32} className="mx-auto text-accent mb-3" strokeWidth={1.4} />
                  <p className="font-serif text-xl text-ink">{t('اسأل عن روايتك', 'Ask about your novel')}</p>
                  <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                    {[
                      t('هل سبق أن ظهرت شخصية …؟', 'Has … appeared before?'),
                      t('هل يتعارض هذا الحدث مع فصل سابق؟', 'Does this event contradict an earlier chapter?'),
                      t('هل يتوافق تصرف البطل في المشهد الأخير مع شخصيته؟', "Is the hero's latest action in character?"),
                      t('هل نسيت الإجابة عن أحد أسئلة الرواية؟', 'Did I forget to answer any question the novel raised?'),
                    ].map((s) => (
                      <button key={s} className="chip hover:text-ink" onClick={() => setInput(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {thread.map((m) => (
                <Turn key={m.id} m={m} />
              ))}
              {req.running && (
                <div className="rounded-xl bg-raised/40 p-4">
                  <AIMarkdown text={req.text || '…'} />
                </div>
              )}
              {req.error && <AIErrorBox error={req.error} />}
              <div ref={endRef} />
            </div>
            <form
              className="border-t border-line/60 p-3 flex gap-2 items-end"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                dir="auto"
                rows={Math.min(6, Math.max(1, input.split('\n').length))}
                className="input flex-1 resize-none"
                placeholder={t('اكتب سؤالك… (Enter للإرسال، Shift+Enter لسطر جديد)', 'Ask anything… (Enter to send, Shift+Enter for newline)')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              {req.running ? (
                <button type="button" className="btn-outline h-10" onClick={req.stop}>
                  <Square size={15} />
                </button>
              ) : (
                <button className="btn-primary h-10" disabled={!input.trim()}>
                  <Send size={15} className={t.dir === 'rtl' ? '-scale-x-100' : ''} />
                </button>
              )}
            </form>
          </section>
        </div>
      </KeyGate>
    </div>
  );
}

function Turn({ m }: { m: StoredTurn }) {
  const t = useT();
  const project = useProject();
  if (m.role === 'user')
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-accent/15 px-4 py-2.5 text-sm text-ink whitespace-pre-line" dir="auto">
          {m.content.length > 400 ? m.content.split('\n')[0] : m.content}
        </div>
      </div>
    );
  return (
    <div className="rounded-xl bg-raised/40 p-4 group">
      <AIMarkdown text={m.content} />
      <div className="flex gap-1 mt-3 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
        <button className="btn-ghost h-7 px-2 text-xs" onClick={() => navigator.clipboard?.writeText(m.content).then(() => toast(t('نُسخ', 'Copied')))}>
          <Copy size={13} /> {t('نسخ', 'Copy')}
        </button>
        <button
          className="btn-ghost h-7 px-2 text-xs"
          onClick={async () => {
            await createNote(project.id, { type: m.task === 'endings' ? 'ending' : 'research', title: `${t('المساعد', 'Assistant')}: ${TASKS.find((x) => x.id === m.task) ? t.l(TASKS.find((x) => x.id === m.task)!.label) : t('إجابة', 'Answer')}`, content: m.content, tags: ['AI'] });
            toast(t('حُفظ في الملاحظات', 'Saved to notes'));
          }}
        >
          <StickyNote size={13} /> {t('حفظ كملاحظة', 'Save as note')}
        </button>
        <button
          className="btn-ghost h-7 px-2 text-xs"
          onClick={async () => {
            const now = Date.now();
            await db.issues.add({ id: newId(), projectId: project.id, kind: 'ai', fingerprint: newId(), title: t('ملاحظة من المساعد الأدبي', 'Finding from the assistant'), detail: m.content.slice(0, 4000), sceneIds: [], chapterIds: [], entityIds: [], status: 'open', severity: 'medium', source: 'ai', createdAt: now, updatedAt: now });
            toast(t('أضيفت إلى قائمة التدقيق', 'Added to continuity list'));
          }}
        >
          <ShieldPlus size={13} /> {t('إلى التدقيق', 'To continuity')}
        </button>
      </div>
    </div>
  );
}
