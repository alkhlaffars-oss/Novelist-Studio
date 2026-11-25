import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Users, UserPlus, Activity, BookOpen, Feather, ShieldCheck, RefreshCw } from 'lucide-react';
import { adminStats, isAdmin, useCloud, type AdminStats } from '@/cloud/account';
import { BarChart } from '@/components/Charts';
import { Empty, useFmt } from '@/components/ui';
import { useT } from '@/store/settings';
import { lastNDays } from '@/lib/stats';

/** Admin dashboard: aggregate numbers only — no user content is ever readable here. */
export default function Admin() {
  const t = useT();
  const f = useFmt();
  const status = useCloud((s) => s.status);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState('');

  const load = () =>
    adminStats()
      .then((s) => {
        setStats(s);
        setErr('');
      })
      .catch((e) => setErr(String(e.message ?? e)));

  useEffect(() => {
    if (status !== 'ready') return setAllowed(false);
    isAdmin().then((a) => {
      setAllowed(a);
      if (a) load();
    });
  }, [status]);

  if (allowed === null) return <div className="page" />;
  if (!allowed)
    return (
      <Empty
        title={t('هذه الصفحة للمدير فقط', 'Admins only')}
        action={
          <Link to="/settings#account" className="btn-primary">
            {t('الحساب', 'Account')}
          </Link>
        }
      />
    );

  const counts = new Map((stats?.signups_30d ?? []).map((s) => [s.day, s.count]));
  const days = lastNDays(30).map((d) => ({ key: d, label: String(new Date(d + 'T00:00:00').getDate()), tip: f.date(d + 'T00:00:00'), value: counts.get(d) ?? 0 }));
  const tiles = stats
    ? [
        { icon: <Users size={16} />, label: t('المستخدمون', 'Users'), value: stats.users },
        { icon: <UserPlus size={16} />, label: t('جدد هذا الأسبوع', 'New this week'), value: stats.new_7d },
        { icon: <Activity size={16} />, label: t('نشطون اليوم', 'Active today'), value: stats.active_1d },
        { icon: <Activity size={16} />, label: t('نشطون هذا الأسبوع', 'Active this week'), value: stats.active_7d },
        { icon: <Activity size={16} />, label: t('نشطون هذا الشهر', 'Active this month'), value: stats.active_30d },
        { icon: <BookOpen size={16} />, label: t('الروايات', 'Novels'), value: stats.novels },
        { icon: <Feather size={16} />, label: t('مجموع الكلمات', 'Total words'), value: stats.words },
      ]
    : [];

  return (
    <div className="page max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <BarChart3 size={22} className="text-accent" />
          <h1 className="h1">{t('لوحة المدير', 'Admin dashboard')}</h1>
        </div>
        <button className="btn-outline" onClick={load}>
          <RefreshCw size={15} /> {t('تحديث', 'Refresh')}
        </button>
      </div>
      <p className="text-sm text-muted flex gap-2">
        <ShieldCheck size={16} className="text-ok shrink-0 mt-0.5" />
        {t('أرقام إجمالية فقط. محتوى الروايات مشفّر بكلمات مرور أصحابها ولا يمكن عرضه هنا.', 'Aggregate numbers only. Novel content is encrypted with each owner’s password and cannot be shown here.')}
      </p>
      {err && <p className="text-sm text-danger">{err}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map((x) => (
          <div key={x.label} className="card p-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className="text-accent">{x.icon}</span>
              {x.label}
            </div>
            <div className="text-2xl font-semibold text-ink mt-2 tabular-nums">{f.n(x.value)}</div>
          </div>
        ))}
      </div>
      {stats && (
        <div className="card p-5">
          <div className="section-title mb-4">{t('التسجيلات الجديدة — آخر 30 يوماً', 'New sign-ups — last 30 days')}</div>
          <BarChart data={days} format={(n) => `${f.n(n)} ${t('مستخدم', 'users')}`} height={160} />
        </div>
      )}
    </div>
  );
}
