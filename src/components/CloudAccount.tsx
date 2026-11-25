import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, CloudOff, RefreshCw, LogOut, KeyRound, ShieldCheck, Loader2, BarChart3, Lock } from 'lucide-react';
import { useT } from '@/store/settings';
import { CloudError, changePassword, isAdmin, signIn, signOut, signUp, unlock, useCloud } from '@/cloud/account';
import { syncNow } from '@/cloud/sync';
import { Field, Modal, confirmDialog, toast, useFmt, cx } from './ui';

function useErrorText() {
  const t = useT();
  return (e: unknown) => {
    const code = e instanceof CloudError ? e.code : 'network';
    return {
      username: t('اسم المستخدم من 3 إلى 30 حرفاً إنجليزياً أو أرقام أو . _ - فقط', 'Username: 3–30 latin letters, digits, . _ -'),
      password: t('كلمة المرور غير صحيحة', 'Wrong password'),
      wrong: t('اسم المستخدم أو كلمة المرور غير صحيحة', 'Wrong username or password'),
      'unknown-user': t('لا يوجد حساب بهذا الاسم', 'No account with this username'),
      taken: t('اسم المستخدم محجوز، اختر اسماً آخر', 'Username is taken'),
      weak: t('كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'Password must be at least 8 characters'),
      network: t('تعذر الاتصال بالخادم', 'Could not reach the server') + (e instanceof Error && e.message !== 'network' ? ` (${e.message})` : ''),
      config: t('إعداد الخادم غير مكتمل: يجب إيقاف تأكيد البريد في Supabase', 'Server setup incomplete: turn off email confirmation in Supabase'),
    }[code];
  };
}

/** Account & sync section shown at the top of Settings. */
export function CloudAccount() {
  const t = useT();
  const f = useFmt();
  const errText = useErrorText();
  const { status, username, syncing, lastSync, error } = useCloud();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [p2, setP2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [admin, setAdmin] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    if (status === 'ready') isAdmin().then(setAdmin).catch(() => setAdmin(false));
  }, [status]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      setP('');
      setP2('');
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'unconfigured')
    return (
      <p className="text-sm text-muted">
        <CloudOff size={15} className="inline me-1.5" />
        {t('المزامنة غير مفعّلة في هذه النسخة بعد.', 'Sync is not enabled in this build yet.')}
      </p>
    );

  if (status === 'ready')
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-raised/50 p-4">
          <Cloud size={20} className="text-ok" />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-ink">
              {t('مسجّل باسم', 'Signed in as')} <b dir="ltr">{username}</b>
            </div>
            <div className={cx('text-xs mt-0.5', error ? 'text-danger' : 'text-muted')}>
              {syncing ? t('جارٍ المزامنة…', 'Syncing…') : error ? t('تعذرت آخر مزامنة — ستُعاد المحاولة تلقائياً', 'Last sync failed — will retry automatically') : lastSync ? `${t('آخر مزامنة', 'Last sync')}: ${f.rel(lastSync)}` : t('بانتظار أول مزامنة', 'Waiting for first sync')}
            </div>
          </div>
          <button className="btn-outline h-9" disabled={syncing} onClick={() => syncNow().then(() => !useCloud.getState().error && toast(t('تمت المزامنة', 'Synced')))}>
            {syncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} {t('مزامنة الآن', 'Sync now')}
          </button>
        </div>
        <p className="text-xs text-faint flex gap-1.5 leading-relaxed">
          <ShieldCheck size={14} className="shrink-0 mt-0.5 text-ok" />
          {t('رواياتك تُشفَّر على جهازك قبل رفعها بمفتاح لا يُفتح إلا بكلمة مرورك. لا أحد غيرك يستطيع قراءتها، ولا حتى مدير التطبيق. سجل التعديلات يبقى على كل جهاز ولا يُزامَن.', 'Your novels are encrypted on your device before upload with a key only your password unlocks. Nobody else — not even the app admin — can read them. Version history stays on each device.')}
        </p>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <Link to="/admin" className="btn-primary h-9">
              <BarChart3 size={15} /> {t('لوحة المدير', 'Admin dashboard')}
            </Link>
          )}
          <button className="btn-ghost h-9" onClick={() => setPwOpen(true)}>
            <KeyRound size={15} /> {t('تغيير كلمة المرور', 'Change password')}
          </button>
          <button
            className="btn-ghost h-9 text-danger"
            onClick={async () => {
              await syncNow();
              const removeLocal = await confirmDialog({
                title: t('تسجيل الخروج', 'Sign out'),
                message: t('هل تريد أيضاً حذف الروايات من هذا الجهاز؟ (تبقى محفوظة في حسابك وتعود عند تسجيل الدخول). اختر "تأكيد" للحذف من الجهاز، أو "إلغاء" للإبقاء عليها.', 'Also remove your novels from this device? They stay in your account. Confirm to remove, Cancel to keep them.'),
              });
              await signOut(removeLocal);
            }}
          >
            <LogOut size={15} /> {t('تسجيل الخروج', 'Sign out')}
          </button>
        </div>
        <PasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
      </div>
    );

  if (status === 'locked')
    return (
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => unlock(p)); }}>
        <p className="text-sm text-muted flex gap-2">
          <Lock size={16} className="text-accent shrink-0" /> {t(`أدخل كلمة مرور ${username ?? ''} لفك تشفير رواياتك على هذا الجهاز.`, `Enter the password for ${username ?? ''} to decrypt your novels on this device.`)}
        </p>
        <input type="password" className="input" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
        {msg && <p className="text-xs text-danger">{msg}</p>}
        <button className="btn-primary" disabled={busy || !p}>{busy && <Loader2 size={15} className="animate-spin" />} {t('فتح', 'Unlock')}</button>
      </form>
    );

  // signed-out
  return (
    <form
      className="space-y-3 max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === 'up' && p !== p2) return setMsg(t('كلمتا المرور غير متطابقتين', 'Passwords do not match'));
        void run(() => (mode === 'in' ? signIn(u, p) : signUp(u, p)).then(() => toast(mode === 'in' ? t('أهلاً بعودتك', 'Welcome back') : t('تم إنشاء حسابك', 'Account created'))));
      }}
    >
      <div className="inline-flex rounded-lg border border-line p-0.5">
        {(['in', 'up'] as const).map((m) => (
          <button type="button" key={m} onClick={() => { setMode(m); setMsg(''); }} className={cx('px-3 h-8 rounded-md text-sm', mode === m ? 'bg-raised text-ink' : 'text-muted')}>
            {m === 'in' ? t('تسجيل الدخول', 'Sign in') : t('حساب جديد', 'Create account')}
          </button>
        ))}
      </div>
      <Field label={t('اسم المستخدم (إنجليزي)', 'Username')}>
        <input className="input" dir="ltr" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={u} onChange={(e) => setU(e.target.value.toLowerCase())} />
      </Field>
      <Field label={t('كلمة المرور', 'Password')}>
        <input type="password" className="input" dir="ltr" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={p} onChange={(e) => setP(e.target.value)} />
      </Field>
      {mode === 'up' && (
        <Field label={t('تأكيد كلمة المرور', 'Confirm password')}>
          <input type="password" className="input" dir="ltr" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
        </Field>
      )}
      {msg && <p className="text-xs text-danger">{msg}</p>}
      <button className="btn-primary w-full" disabled={busy || !u || !p}>
        {busy && <Loader2 size={15} className="animate-spin" />} {mode === 'in' ? t('دخول', 'Sign in') : t('إنشاء الحساب', 'Create account')}
      </button>
      {mode === 'up' && (
        <p className="text-xs text-gold leading-relaxed">
          {t('مهم: كلمة المرور هي مفتاح تشفير رواياتك. لا يوجد "نسيت كلمة المرور" — إن نسيتها لا يمكن استرجاع النسخة السحابية (رواياتك على أجهزتك تبقى سليمة).', 'Important: your password is the encryption key. There is no password reset — if you forget it the cloud copy cannot be recovered (copies on your devices are unaffected).')}
        </p>
      )}
      <p className="text-xs text-faint">{t('رواياتك الموجودة على هذا الجهاز تُضاف إلى حسابك تلقائياً بعد الدخول.', 'Novels already on this device are added to your account after signing in.')}</p>
    </form>
  );
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const errText = useErrorText();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('تغيير كلمة المرور', 'Change password')}
      footer={
        <button
          className="btn-primary"
          disabled={busy || !a || !b}
          onClick={async () => {
            setBusy(true);
            setMsg('');
            try {
              await changePassword(a, b);
              toast(t('تم تغيير كلمة المرور', 'Password changed'));
              setA('');
              setB('');
              onClose();
            } catch (e) {
              setMsg(errText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('حفظ', 'Save')}
        </button>
      }
    >
      <div className="space-y-3">
        <Field label={t('كلمة المرور الحالية', 'Current password')}>
          <input type="password" className="input" value={a} onChange={(e) => setA(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label={t('كلمة المرور الجديدة', 'New password')}>
          <input type="password" className="input" value={b} onChange={(e) => setB(e.target.value)} autoComplete="new-password" />
        </Field>
        {msg && <p className="text-xs text-danger">{msg}</p>}
      </div>
    </Modal>
  );
}
