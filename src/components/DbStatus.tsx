import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getDbHealth, onDbHealth } from '@/db/db';
import { useT } from '@/store/settings';

/** Explains a database that does not open (instead of leaving pages blank). */
export function DbStatus() {
  const t = useT();
  const [h, setH] = useState(getDbHealth());
  const [slow, setSlow] = useState(false);
  useEffect(() => onDbHealth(() => setH(getDbHealth())), []);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 4000);
    return () => window.clearTimeout(id);
  }, []);
  if (h.health === 'ready' || (h.health === 'opening' && !slow)) return null;
  return (
    <div className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-md card shadow-lift p-4 flex gap-3 animate-fadeIn">
      <AlertTriangle size={20} className="text-gold shrink-0 mt-0.5" />
      <div className="text-sm text-ink space-y-2">
        <p className="font-medium">{h.health === 'error' ? t('تعذر فتح قاعدة البيانات', 'The database could not be opened') : t('التطبيق ينتظر تحديث قاعدة البيانات', 'Waiting to update the database')}</p>
        <p className="text-muted leading-relaxed">
          {t(
            'يوجد تبويب آخر مفتوح فيه نسخة قديمة من التطبيق ويمنع التحديث. أغلق كل تبويبات التطبيق الأخرى (أو أغلق المتصفح وافتحه من جديد). رواياتك محفوظة ولم تتأثر.',
            'Another tab with an older version of the app is blocking the update. Close other tabs of the app (or restart the browser). Your novels are safe.',
          )}
        </p>
        {h.error && <p className="text-xs text-faint" dir="ltr">{h.error}</p>}
        <button className="btn-outline h-8 text-xs" onClick={() => location.reload()}>
          <RefreshCw size={13} /> {t('إعادة المحاولة', 'Retry')}
        </button>
      </div>
    </div>
  );
}
