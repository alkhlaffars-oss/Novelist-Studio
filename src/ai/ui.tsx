import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { marked } from 'marked';
import { KeyRound, Lock, AlertTriangle } from 'lucide-react';
import { useSettings, useT } from '@/store/settings';
import { AIError, complete, type CompletionRequest } from './client';
import { getApiKey, hasVault, unlockVault, useKeyState } from './keys';

/** Renders model markdown safely: raw HTML from the model is escaped before parsing. */
export function AIMarkdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text.replace(/&/g, '&amp;').replace(/</g, '&lt;'), { async: false, gfm: true, breaks: true }) as string, [text]);
  return <div className="prose-ai text-sm text-ink leading-relaxed" dir="auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function useAIRequest() {
  const [state, setState] = useState<{ running: boolean; text: string; error: AIError | null }>({ running: false, text: '', error: null });
  const ctrl = useRef<AbortController | null>(null);
  const run = async (req: Omit<CompletionRequest, 'signal' | 'onText'>) => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setState({ running: true, text: '', error: null });
    try {
      const full = await complete({ ...req, signal: c.signal, onText: (_d, f) => setState((s) => ({ ...s, text: f })) });
      setState({ running: false, text: full, error: null });
      return full;
    } catch (e) {
      const err = e instanceof AIError ? e : new AIError('network', String(e));
      setState((s) => ({ ...s, running: false, error: err.code === 'aborted' ? null : err }));
      return null;
    }
  };
  useEffect(() => () => ctrl.current?.abort(), []);
  return { ...state, run, stop: () => ctrl.current?.abort(), reset: () => setState({ running: false, text: '', error: null }) };
}

export function AIErrorBox({ error }: { error: AIError }) {
  const t = useT();
  const msg: Record<AIError['code'], string> = {
    'no-key': t('لم يُضف مفتاح API بعد.', 'No API key has been added.'),
    auth: t('المفتاح غير صالح أو لا يملك صلاحية لهذا النموذج.', 'The key is invalid or lacks access to this model.'),
    rate: t('تم تجاوز حد الطلبات، حاول بعد قليل.', 'Rate limited — try again shortly.'),
    network: t('تعذر الاتصال بالخدمة. تحقق من الإنترنت.', 'Could not reach the service. Check your connection.'),
    refusal: t('رفض النموذج هذا الطلب.', 'The model declined this request.'),
    'bad-request': t('الطلب غير مقبول من الخدمة.', 'The service rejected the request.'),
    server: t('خطأ مؤقت في الخدمة.', 'Temporary service error.'),
    aborted: '',
  };
  return (
    <div className="rounded-lg bg-danger/10 border border-danger/30 p-3 text-sm text-danger flex gap-2">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <div>
        {msg[error.code]}
        {error.message && error.code !== 'no-key' && <div className="text-xs opacity-80 mt-1 break-words" dir="ltr">{error.message.slice(0, 240)}</div>}
        {(error.code === 'no-key' || error.code === 'auth') && (
          <Link to="/settings#ai" className="underline block mt-1">
            {t('إعدادات الذكاء الاصطناعي', 'AI settings')}
          </Link>
        )}
      </div>
    </div>
  );
}

/** Shows setup/unlock UI until a usable key is available. */
export function KeyGate({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { ai, privacy } = useSettings();
  useKeyState((s) => s.version);
  const [vault, setVault] = useState<boolean | null>(null);
  const [pass, setPass] = useState('');
  const [bad, setBad] = useState(false);
  const key = getApiKey(ai.provider);
  useEffect(() => {
    hasVault(ai.provider).then(setVault);
  }, [ai.provider, key]);

  if (!privacy.aiEnabled)
    return (
      <div className="card p-5 text-sm text-muted">
        {t('المساعد معطّل من إعدادات الخصوصية.', 'The assistant is disabled in privacy settings.')}{' '}
        <Link to="/settings#privacy" className="text-accent">
          {t('الإعدادات', 'Settings')}
        </Link>
      </div>
    );
  if (key || ai.provider === 'compatible') return <>{children}</>;
  if (vault)
    return (
      <form
        className="card p-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBad(!(await unlockVault(ai.provider, pass)));
        }}
      >
        <div className="flex items-center gap-2 text-ink font-medium">
          <Lock size={16} className="text-accent" /> {t('افتح خزنة المفتاح', 'Unlock your key vault')}
        </div>
        <p className="text-xs text-muted">{t('مفتاحك محفوظ مشفّراً على هذا الجهاز. أدخل عبارة المرور لاستخدامه في هذه الجلسة.', 'Your key is stored encrypted on this device. Enter your passphrase to use it this session.')}</p>
        <input type="password" className="input" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={t('عبارة المرور', 'Passphrase')} autoFocus />
        {bad && <p className="text-xs text-danger">{t('عبارة المرور غير صحيحة', 'Wrong passphrase')}</p>}
        <button className="btn-primary">{t('فتح', 'Unlock')}</button>
      </form>
    );
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2 text-ink font-medium">
        <KeyRound size={16} className="text-accent" /> {t('أضف مفتاح API لتفعيل المساعد', 'Add an API key to enable the assistant')}
      </div>
      <p className="text-sm text-muted leading-relaxed">
        {t(
          'المساعد الأدبي يعمل بنموذج حقيقي عبر مفتاحك الخاص (Anthropic Claude أو OpenAI أو خدمة متوافقة). لا توجد ردود وهمية: بدون مفتاح لن يعمل المساعد.',
          'The assistant uses a real model through your own key (Anthropic Claude, OpenAI or a compatible service). There are no canned answers: without a key it does not run.',
        )}
      </p>
      <Link to="/settings#ai" className="btn-primary">
        {t('فتح إعدادات الذكاء الاصطناعي', 'Open AI settings')}
      </Link>
    </div>
  );
}
