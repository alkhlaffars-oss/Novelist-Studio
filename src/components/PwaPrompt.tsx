import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';
import { useT } from '@/store/settings';

export function PwaPrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="fixed z-[58] bottom-20 lg:bottom-6 start-4 end-4 sm:end-auto sm:max-w-sm card shadow-lift p-4 flex items-start gap-3 animate-fadeIn">
      <div className="flex-1 text-sm">
        {needRefresh ? (
          <p className="text-ink">{t('يتوفر إصدار جديد من التطبيق.', 'A new version is available.')}</p>
        ) : (
          <p className="text-ink">{t('التطبيق جاهز للعمل دون اتصال بالإنترنت.', 'The app is ready to work offline.')}</p>
        )}
        {needRefresh && (
          <button className="btn-primary h-8 mt-3" onClick={() => updateServiceWorker(true)}>
            <RefreshCw size={14} /> {t('تحديث الآن', 'Update now')}
          </button>
        )}
      </div>
      <button
        className="icon-btn w-8 h-8"
        onClick={() => {
          setNeedRefresh(false);
          setOfflineReady(false);
        }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
