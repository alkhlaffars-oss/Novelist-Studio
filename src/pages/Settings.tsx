import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings as SettingsIcon, Globe, PenLine, Keyboard, Target, HardDrive, Sparkles, FileDown, Shield, Download, Upload, RotateCcw, Trash2, Check, Loader2, KeyRound } from 'lucide-react';
import { db, requestPersistentStorage } from '@/db/db';
import { FONT_STACKS, EXPORT_FONTS, useSettings, useT, type EditorFont, type AIProvider } from '@/store/settings';
import { Field, confirmDialog, downloadBlob, promptDialog, toast, useFmt, cx } from '@/components/ui';
import { Range } from '@/editor/Toolbar';
import { buildLibraryBackup, readJsonFile, restoreFromFile, runAutoBackupIfDue } from '@/lib/backup';
import { ANTHROPIC_MODELS, testConnection, AIError } from '@/ai/client';
import { forgetKey, getApiKey, hasVault, maskKey, saveEncryptedKey, setSessionKey, useKeyState } from '@/ai/keys';

const SECTIONS = ['general', 'editor', 'shortcuts', 'goals', 'backup', 'ai', 'export', 'privacy'] as const;

export default function Settings() {
  const t = useT();
  const loc = useLocation();
  useEffect(() => {
    const id = loc.hash.split('#')[2] ?? loc.hash.replace('#', '');
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [loc.hash]);
  const icons = { general: <Globe size={15} />, editor: <PenLine size={15} />, shortcuts: <Keyboard size={15} />, goals: <Target size={15} />, backup: <HardDrive size={15} />, ai: <Sparkles size={15} />, export: <FileDown size={15} />, privacy: <Shield size={15} /> };
  const names = {
    general: t('عام والمظهر', 'General & appearance'),
    editor: t('المحرر', 'Editor'),
    shortcuts: t('اختصارات لوحة المفاتيح', 'Keyboard shortcuts'),
    goals: t('أهداف الكتابة', 'Writing goals'),
    backup: t('الحفظ والنسخ الاحتياطي', 'Saving & backup'),
    ai: t('الذكاء الاصطناعي', 'AI'),
    export: t('التصدير', 'Export'),
    privacy: t('الخصوصية والبيانات', 'Privacy & data'),
  };
  return (
    <div className="page max-w-5xl">
      <div className="flex items-center gap-2.5 mb-8">
        <SettingsIcon size={22} className="text-accent" />
        <h1 className="h1">{t('الإعدادات', 'Settings')}</h1>
      </div>
      <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="hidden lg:block sticky top-6 self-start space-y-0.5">
          {SECTIONS.map((s) => (
            <a key={s} href={`#${s}`} onClick={(e) => { e.preventDefault(); document.getElementById(s)?.scrollIntoView({ behavior: 'smooth' }); }} className="flex items-center gap-2 rounded-lg px-3 h-9 text-sm text-muted hover:text-ink hover:bg-raised/60">
              {icons[s]} {names[s]}
            </a>
          ))}
        </nav>
        <div className="space-y-6 min-w-0">
          <General title={names.general} />
          <EditorSettings title={names.editor} />
          <Shortcuts title={names.shortcuts} />
          <Goals title={names.goals} />
          <Backup title={names.backup} />
          <AISettings title={names.ai} />
          <ExportDefaults title={names.export} />
          <Privacy title={names.privacy} />
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, children, desc }: { id: string; title: string; children: React.ReactNode; desc?: string }) {
  return (
    <section id={id} className="card p-5 scroll-mt-6">
      <h2 className="font-serif text-xl text-ink">{title}</h2>
      {desc && <p className="text-sm text-muted mt-1">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 flex-wrap">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={cx('px-3 h-8 rounded-md text-sm', value === o.v ? 'bg-raised text-ink' : 'text-muted hover:text-ink')}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <span>
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="block text-xs text-faint mt-0.5">{hint}</span>}
      </span>
      <input type="checkbox" className="mt-1 w-4 h-4 accent-[rgb(var(--accent))] shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function General({ title }: { title: string }) {
  const t = useT();
  const s = useSettings();
  return (
    <Section id="general" title={title}>
      <Field label={t('لغة الواجهة', 'Interface language')}>
        <Seg value={s.lang} onChange={(lang) => s.set({ lang })} options={[{ v: 'ar', l: 'العربية (RTL)' }, { v: 'en', l: 'English (LTR)' }]} />
      </Field>
      <Field label={t('المظهر', 'Theme')}>
        <Seg value={s.theme} onChange={(theme) => s.set({ theme })} options={[{ v: 'dark', l: t('ليلي', 'Dark') }, { v: 'light', l: t('نهاري', 'Light') }, { v: 'system', l: t('حسب النظام', 'System') }]} />
      </Field>
      <Field label={t('لون اللمسات', 'Accent')}>
        <Seg value={s.accent} onChange={(accent) => s.set({ accent })} options={[{ v: 'gold', l: t('ذهبي', 'Gold') }, { v: 'violet', l: t('بنفسجي', 'Violet') }]} />
      </Field>
      <Range label={t('حجم الواجهة', 'Interface size')} value={Math.round(s.uiScale * 100)} min={85} max={125} step={5} unit="%" onChange={(v) => s.set({ uiScale: v / 100 })} />
    </Section>
  );
}

function EditorSettings({ title }: { title: string }) {
  const t = useT();
  const s = useSettings();
  return (
    <Section id="editor" title={title}>
      <div>
        <span className="label">{t('خط الكتابة', 'Writing font')}</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(FONT_STACKS) as EditorFont[]).map((k) => (
            <button key={k} onClick={() => s.set({ editorFont: k })} className={cx('rounded-xl border p-3 text-center', s.editorFont === k ? 'border-current text-accent' : 'border-line text-ink')}>
              <div style={{ fontFamily: FONT_STACKS[k].css }} className="text-xl">
                كتب الحكاية
              </div>
              <div className="text-[11px] text-muted mt-1">{t.l(FONT_STACKS[k].label)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Range label={t('حجم الخط الافتراضي', 'Default font size')} value={s.editorFontSize} min={14} max={34} step={1} unit="px" onChange={(v) => s.set({ editorFontSize: v })} />
        <Range label={t('تباعد الأسطر', 'Line spacing')} value={s.lineHeight} min={1.3} max={2.6} step={0.1} onChange={(v) => s.set({ lineHeight: Math.round(v * 10) / 10 })} />
        <Range label={t('عرض مساحة الكتابة', 'Page width')} value={s.editorWidth} min={480} max={1200} step={20} unit="px" onChange={(v) => s.set({ editorWidth: v })} />
        <Range label={t('تأخير الحفظ التلقائي', 'Autosave delay')} value={s.autosaveDelay} min={200} max={3000} step={100} unit="ms" onChange={(v) => s.set({ autosaveDelay: v })} />
      </div>
      <div className="rounded-xl border border-line/60 p-4" style={{ fontFamily: FONT_STACKS[s.editorFont].css, fontSize: s.editorFontSize, lineHeight: s.lineHeight }} dir="rtl">
        كانت المدينة تستيقظ ببطء، والضباب يتسلل بين البيوت القديمة كأنه يبحث عن شيء أضاعه منذ زمن بعيد.
      </div>
      <Toggle label={t('مسافة بادئة للفقرات', 'Indent paragraphs')} checked={s.paragraphIndent} onChange={(v) => s.set({ paragraphIndent: v })} />
      <Toggle label={t('التدقيق الإملائي للمتصفح', 'Browser spellcheck')} checked={s.spellcheck} onChange={(v) => s.set({ spellcheck: v })} />
      <Toggle label={t('وضع الآلة الكاتبة', 'Typewriter scrolling')} hint={t('يبقي السطر الحالي في منتصف الشاشة', 'Keeps the current line centred')} checked={s.typewriter} onChange={(v) => s.set({ typewriter: v })} />
      <Toggle label={t('إظهار قائمة الفصول افتراضياً', 'Show chapter sidebar by default')} checked={s.showSidebar} onChange={(v) => s.set({ showSidebar: v })} />
      <Toggle label={t('إظهار لوحة المعلومات افتراضياً', 'Show info panel by default')} checked={s.showInspector} onChange={(v) => s.set({ showInspector: v })} />
    </Section>
  );
}

function Shortcuts({ title }: { title: string }) {
  const t = useT();
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
  const rows: [string, string][] = [
    [`${mod}+S`, t('حفظ فوري', 'Save now')],
    [`${mod}+Shift+S`, t('نقطة حفظ باسم مخصص', 'Named checkpoint')],
    [`${mod}+F`, t('بحث واستبدال في المشهد', 'Find & replace in scene')],
    [`${mod}+Shift+F`, t('البحث الشامل', 'Global search')],
    [`${mod}+.`, t('وضع التركيز', 'Focus mode')],
    [`${mod}+Alt+S`, t('إظهار/إخفاء الفصول', 'Toggle chapters sidebar')],
    [`${mod}+Alt+I`, t('إظهار/إخفاء لوحة المعلومات', 'Toggle info panel')],
    [`${mod}+Alt+N`, t('مشهد جديد', 'New scene')],
    [`${mod}+Alt+↓ / ↑`, t('المشهد التالي / السابق', 'Next / previous scene')],
    [`${mod}+Alt+= / -`, t('تكبير / تصغير الخط', 'Larger / smaller text')],
    [`${mod}+Enter`, t('فاصل مشهد', 'Scene break')],
    [`${mod}+Shift+D`, t('فقرة حوار', 'Dialogue paragraph')],
    [`${mod}+B / I / U`, t('عريض / مائل / تسطير', 'Bold / italic / underline')],
    [`${mod}+Z / ${mod}+Shift+Z`, t('تراجع / إعادة', 'Undo / redo')],
    ['Alt+1…9', t('التنقل بين أقسام الرواية', 'Jump between project sections')],
    ['Esc', t('الخروج من وضع التركيز', 'Exit focus mode')],
  ];
  return (
    <Section id="shortcuts" title={title}>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
        {rows.map(([k, l]) => (
          <div key={k} className="flex items-center justify-between gap-3 text-sm py-1 border-b border-line/40">
            <span className="text-muted">{l}</span>
            <kbd className="font-mono text-[11px] text-ink bg-raised rounded px-1.5 py-0.5 whitespace-nowrap" dir="ltr">
              {k}
            </kbd>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Goals({ title }: { title: string }) {
  const t = useT();
  const { goals, set } = useSettings();
  return (
    <Section id="goals" title={title}>
      <div className="grid sm:grid-cols-3 gap-3">
        {(['daily', 'weekly', 'monthly'] as const).map((k) => (
          <Field key={k} label={{ daily: t('يومياً', 'Daily'), weekly: t('أسبوعياً', 'Weekly'), monthly: t('شهرياً', 'Monthly') }[k]}>
            <input type="number" min={0} step={100} className="input" value={goals[k]} onChange={(e) => set({ goals: { ...goals, [k]: Math.max(0, Number(e.target.value) || 0) } })} />
          </Field>
        ))}
      </div>
    </Section>
  );
}

function Backup({ title }: { title: string }) {
  const t = useT();
  const f = useFmt();
  const { backup, set } = useSettings();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backups = useLiveQuery(() => db.backups.orderBy('createdAt').reverse().toArray(), []) ?? [];
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => undefined);
  }, []);
  const mb = (n: number) => `${f.n(n / 1024 / 1024)} MB`;
  const download = async () => {
    const data = await buildLibraryBackup();
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `novelist-backup-${new Date().toISOString().slice(0, 10)}.json`);
    set({ backup: { ...backup, lastDownloadAt: Date.now() } });
  };
  return (
    <Section id="backup" title={title} desc={t('كل شيء يُحفظ تلقائياً وفورياً في قاعدة بيانات IndexedDB على هذا الجهاز ويعمل دون إنترنت. احتفظ أيضاً بنسخ احتياطية خارج المتصفح.', 'Everything saves instantly to IndexedDB on this device and works offline. Keep backups outside the browser too.')}>
      <div className="rounded-xl bg-raised/50 p-4 text-sm space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">{t('التخزين الدائم (حماية من الحذف التلقائي)', 'Persistent storage (protected from eviction)')}</span>
          {persisted ? (
            <span className="text-ok flex items-center gap-1">
              <Check size={14} /> {t('مفعّل', 'Granted')}
            </span>
          ) : (
            <button className="btn-outline h-8 text-xs" onClick={async () => setPersisted(await requestPersistentStorage())}>
              {t('طلب التفعيل', 'Request')}
            </button>
          )}
        </div>
        {usage && (
          <div className="flex items-center justify-between text-muted">
            <span>{t('المساحة المستخدمة', 'Storage used')}</span>
            <span className="text-ink tabular-nums" dir="ltr">
              {mb(usage.usage)} / {mb(usage.quota)}
            </span>
          </div>
        )}
        {backup.lastDownloadAt && (
          <div className="flex items-center justify-between text-muted">
            <span>{t('آخر نسخة احتياطية منزّلة', 'Last downloaded backup')}</span>
            <span className="text-ink">{f.rel(backup.lastDownloadAt)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={download}>
          <Download size={16} /> {t('تنزيل نسخة احتياطية كاملة', 'Download full backup')}
        </button>
        <button className="btn-outline" onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {t('استعادة من ملف', 'Restore from file')}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          accept=".json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              const n = await restoreFromFile(await readJsonFile(file));
              toast(t(`استُعيدت ${n} رواية (أضيفت بجانب رواياتك الحالية)`, `Restored ${n} novel(s) alongside existing ones`));
            } catch {
              toast(t('الملف ليس نسخة احتياطية صالحة', 'Not a valid backup file'), 'error');
            }
          }}
        />
      </div>
      <p className="text-xs text-faint">{t('الاستعادة لا تحذف ولا تستبدل أي رواية موجودة؛ تُضاف الروايات المستعادة كنسخ مستقلة.', 'Restoring never deletes or overwrites existing novels; restored novels are added as separate copies.')}</p>
      <Toggle label={t('نسخ احتياطي تلقائي يومي داخل التطبيق', 'Automatic daily in-app backups')} checked={backup.auto} onChange={(v) => set({ backup: { ...backup, auto: v } })} />
      <Field label={t('عدد النسخ التلقائية المحفوظة', 'Automatic backups to keep')}>
        <input type="number" min={1} max={60} className="input w-32" value={backup.keep} onChange={(e) => set({ backup: { ...backup, keep: Math.max(1, Math.min(60, Number(e.target.value) || 10)) } })} />
      </Field>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="label !mb-0">{t('النسخ التلقائية', 'Automatic backups')}</span>
          <button className="btn-ghost h-8 text-xs" onClick={() => runAutoBackupIfDue(true).then(() => toast(t('أُنشئت نسخة', 'Backup created')))}>
            {t('إنشاء نسخة الآن', 'Back up now')}
          </button>
        </div>
        {backups.length === 0 && <p className="text-xs text-faint">—</p>}
        {backups.map((b) => (
          <div key={b.id} className="flex items-center gap-2 rounded-lg bg-raised/40 px-3 h-10 text-sm">
            <span className="flex-1 text-ink">{f.date(b.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="text-xs text-faint" dir="ltr">
              {mb(b.size)}
            </span>
            <button className="icon-btn w-8 h-8" title={t('تنزيل', 'Download')} onClick={() => downloadBlob(new Blob([b.data], { type: 'application/json' }), `novelist-auto-${new Date(b.createdAt).toISOString().slice(0, 10)}.json`)}>
              <Download size={14} />
            </button>
            <button
              className="icon-btn w-8 h-8"
              title={t('استعادة', 'Restore')}
              onClick={async () => {
                if (!(await confirmDialog({ title: t('استعادة هذه النسخة؟', 'Restore this backup?'), message: t('ستُضاف رواياتها كنسخ مستقلة بجانب رواياتك الحالية.', 'Its novels will be added as separate copies.') }))) return;
                const n = await restoreFromFile(JSON.parse(b.data));
                toast(t(`استُعيدت ${n} رواية`, `Restored ${n} novel(s)`));
              }}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        ))}
      </div>
      <p className="text-xs text-faint">{t('المزامنة بين الأجهزة تتطلب نظام حسابات وخادماً غير موجودين في هذا الإصدار؛ استخدم ملفات النسخ الاحتياطي للنقل بين الأجهزة.', 'Cross-device sync requires accounts and a server, which this version does not include; use backup files to move between devices.')}</p>
    </Section>
  );
}

function AISettings({ title }: { title: string }) {
  const t = useT();
  const { ai, set } = useSettings();
  useKeyState((s) => s.version);
  const [key, setKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [vault, setVault] = useState(false);
  const current = getApiKey(ai.provider);
  useEffect(() => {
    hasVault(ai.provider).then(setVault);
  }, [ai.provider, current]);
  const up = (p: Partial<typeof ai>) => set({ ai: { ...ai, ...p } });

  const saveKey = async () => {
    if (!key.trim()) return;
    if (ai.keyMode === 'encrypted') {
      const pass = await promptDialog({ title: t('عبارة مرور لتشفير المفتاح', 'Passphrase to encrypt the key'), message: t('ستحتاجها مرة في كل جلسة لفك التشفير. لا يمكن استعادتها إن نسيتها (ستعيد إدخال المفتاح فقط).', 'You will enter it once per session. If forgotten, just re-enter the key.') });
      if (!pass) return;
      await saveEncryptedKey(ai.provider, key.trim(), pass);
    } else setSessionKey(ai.provider, key.trim());
    setKey('');
    toast(t('حُفظ المفتاح', 'Key saved'));
  };

  return (
    <Section id="ai" title={title} desc={t('المساعد الأدبي يستدعي النموذج مباشرة من متصفحك بمفتاحك الخاص. لا يوجد خادم وسيط ولا ردود وهمية.', 'The assistant calls the model directly from your browser with your own key. No middle server, no canned answers.')}>
      <Field label={t('مزود الخدمة', 'Provider')}>
        <Seg<AIProvider>
          value={ai.provider}
          onChange={(provider) => up({ provider, model: provider === 'anthropic' ? 'claude-opus-5-5' : provider === 'openai' ? 'gpt-4.1' : ai.model })}
          options={[
            { v: 'anthropic', l: 'Anthropic Claude' },
            { v: 'openai', l: 'OpenAI' },
            { v: 'compatible', l: t('متوافق مع OpenAI', 'OpenAI-compatible') },
          ]}
        />
      </Field>
      {ai.provider === 'anthropic' ? (
        <Field label={t('النموذج', 'Model')}>
          <select className="input" value={ai.model} onChange={(e) => up({ model: e.target.value })}>
            {ANTHROPIC_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {t.l(m.note)}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t('اسم النموذج', 'Model name')}>
            <input className="input" dir="ltr" value={ai.model} onChange={(e) => up({ model: e.target.value })} />
          </Field>
          {ai.provider === 'compatible' && (
            <Field label={t('عنوان الخدمة (Base URL)', 'Base URL')}>
              <input className="input" dir="ltr" placeholder="https://openrouter.ai/api/v1 · http://localhost:11434/v1" value={ai.baseUrl} onChange={(e) => up({ baseUrl: e.target.value })} />
            </Field>
          )}
        </div>
      )}
      {ai.provider === 'anthropic' ? (
        <Field label={t('عمق التفكير (effort)', 'Effort')}>
          <Seg value={ai.effort} onChange={(effort) => up({ effort })} options={[{ v: 'low', l: t('سريع', 'Low') }, { v: 'medium', l: t('متوازن', 'Medium') }, { v: 'high', l: t('عميق', 'High') }]} />
        </Field>
      ) : (
        <Range label={t('درجة الإبداع (temperature)', 'Temperature')} value={ai.temperature} min={0} max={1.5} step={0.1} onChange={(v) => up({ temperature: Math.round(v * 10) / 10 })} />
      )}
      <Range label={t('الحد الأقصى لحجم الذاكرة الروائية المرسلة (حروف)', 'Max novel-memory size sent (characters)')} value={ai.maxContextChars} min={20000} max={1500000} step={20000} onChange={(v) => up({ maxContextChars: v })} />

      <div className="rounded-xl border border-line/60 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-ink">
          <KeyRound size={15} className="text-accent" /> {t('مفتاح API', 'API key')}
          {current && <span className="text-xs text-ok ms-auto" dir="ltr">{maskKey(current)}</span>}
          {!current && vault && <span className="text-xs text-gold ms-auto">{t('محفوظ مشفّراً (مقفل)', 'Stored encrypted (locked)')}</span>}
        </div>
        <Field label={t('طريقة حفظ المفتاح', 'Key storage')}>
          <Seg
            value={ai.keyMode}
            onChange={(keyMode) => up({ keyMode })}
            options={[
              { v: 'session', l: t('لهذه الجلسة فقط', 'This session only') },
              { v: 'encrypted', l: t('مشفّر بعبارة مرور', 'Encrypted with passphrase') },
            ]}
          />
        </Field>
        <div className="flex gap-2">
          <input type="password" autoComplete="off" dir="ltr" className="input flex-1" placeholder={ai.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'} value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="btn-primary" onClick={saveKey} disabled={!key.trim()}>
            {t('حفظ', 'Save')}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-outline h-9"
            disabled={testing || (!current && ai.provider !== 'compatible')}
            onClick={async () => {
              setTesting(true);
              try {
                await testConnection();
                toast(t('الاتصال يعمل ✓', 'Connection works ✓'));
              } catch (e) {
                toast(`${t('فشل الاتصال', 'Connection failed')}: ${e instanceof AIError ? e.code : ''} ${(e as Error).message.slice(0, 120)}`, 'error');
              } finally {
                setTesting(false);
              }
            }}
          >
            {testing && <Loader2 size={14} className="animate-spin" />} {t('اختبار الاتصال', 'Test connection')}
          </button>
          {(current || vault) && (
            <button className="btn-ghost h-9 text-danger" onClick={() => forgetKey(ai.provider).then(() => toast(t('حُذف المفتاح', 'Key removed')))}>
              <Trash2 size={14} /> {t('حذف المفتاح', 'Remove key')}
            </button>
          )}
        </div>
        <p className="text-[11px] text-faint leading-relaxed">
          {t(
            'لا يُحفظ المفتاح كنص مكشوف أبداً: إما في ذاكرة الجلسة فقط، أو مشفّراً (AES-GCM) بعبارة مرور لا تُخزَّن. تنبيه أمني: أي مفتاح يُستخدم من المتصفح يكون مرئياً لهذا المتصفح وإضافاته أثناء الاستخدام؛ للاستخدام المشترك يُنصح بخادم وسيط (البنية جاهزة لإضافته).',
            'The key is never stored in plain text: either in session memory only, or AES-GCM encrypted with a passphrase that is never stored. Security note: any key used from a browser is visible to that browser and its extensions while in use; for shared deployments use a server proxy (the architecture is ready for one).',
          )}
        </p>
      </div>
    </Section>
  );
}

function ExportDefaults({ title }: { title: string }) {
  const t = useT();
  const { exportDefaults: o, set } = useSettings();
  return (
    <Section id="export" title={title} desc={t('الإعدادات الافتراضية لملفات DOCX وPDF. يمكن تعديلها أيضاً من صفحة التصدير في كل رواية.', 'Defaults for DOCX and PDF; also adjustable from each novel’s Export page.')}>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label={t('حجم الصفحة', 'Page size')}>
          <select className="input" value={o.pageSize} onChange={(e) => set({ exportDefaults: { ...o, pageSize: e.target.value as typeof o.pageSize } })}>
            {['A5', '6x9', 'A4', 'Letter'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label={t('الخط', 'Font')}>
          <select className="input" value={o.font} onChange={(e) => set({ exportDefaults: { ...o, font: e.target.value } })}>
            {EXPORT_FONTS.map((f) => (
              <option key={f.name}>{f.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('حجم الخط (pt)', 'Font size (pt)')}>
          <input type="number" className="input" min={8} max={24} value={o.fontSize} onChange={(e) => set({ exportDefaults: { ...o, fontSize: Number(e.target.value) || 13 } })} />
        </Field>
      </div>
    </Section>
  );
}

function Privacy({ title }: { title: string }) {
  const t = useT();
  const { privacy, set } = useSettings();
  return (
    <Section id="privacy" title={title} desc={t('رواياتك لا تغادر جهازك أبداً، إلا إذا استخدمت المساعد الأدبي، وحينها يُرسل فقط ما تختاره إلى مزود الخدمة الذي حددته.', 'Your novels never leave your device unless you use the assistant — and then only the material you choose is sent to your chosen provider.')}>
      <Toggle label={t('تفعيل المساعد الأدبي (الذكاء الاصطناعي)', 'Enable the literary assistant (AI)')} checked={privacy.aiEnabled} onChange={(v) => set({ privacy: { ...privacy, aiEnabled: v } })} />
      <div className="pt-2 border-t border-line/60">
        <button
          className="btn-danger"
          onClick={async () => {
            const typed = await promptDialog({ title: t('حذف كل البيانات من هذا الجهاز', 'Delete all data on this device'), message: t('سيُحذف كل شيء: الروايات والسجل والنسخ الاحتياطية الداخلية. نزّل نسخة احتياطية أولاً. اكتب "حذف" للتأكيد:', 'Everything will be deleted: novels, history and in-app backups. Download a backup first. Type "DELETE" to confirm:') });
            if (typed?.trim() !== t('حذف', 'DELETE')) return;
            await db.delete();
            localStorage.clear();
            sessionStorage.clear();
            location.reload();
          }}
        >
          <Trash2 size={16} /> {t('حذف كل البيانات', 'Delete all data')}
        </button>
      </div>
    </Section>
  );
}


