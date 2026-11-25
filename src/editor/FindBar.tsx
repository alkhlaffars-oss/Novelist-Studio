import { useEffect, useRef, useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { ChevronUp, ChevronDown, X, Replace } from 'lucide-react';
import { useT } from '@/store/settings';
import { getSearchState } from './extensions';
import { cx, useFmt } from '@/components/ui';

export function FindBar({ editor, initial, onClose }: { editor: Editor; initial?: string; onClose: () => void }) {
  const t = useT();
  const f = useFmt();
  const [q, setQ] = useState(initial ?? '');
  const [rep, setRep] = useState('');
  const [whole, setWhole] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const s = getSearchState(e.state);
      return { total: s?.results.length ?? 0, current: s?.current ?? 0 };
    },
  });

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  useEffect(() => {
    editor.commands.setSearch(q, { wholeWord: whole });
  }, [q, whole, editor]);
  useEffect(() => () => void editor.commands.setSearch(''), [editor]);

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line/60 bg-surface animate-fadeIn">
      <div className="relative flex-1 min-w-[160px] max-w-sm">
        <input
          ref={ref}
          dir="auto"
          className="input h-9 pe-20"
          placeholder={t('ابحث في المشهد…', 'Find in scene…')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              editor.commands.searchStep(e.shiftKey ? -1 : 1);
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <span className="absolute end-2.5 top-1/2 -translate-y-1/2 text-[11px] text-faint tabular-nums">{q ? `${info.total ? f.n(info.current + 1) : 0}/${f.n(info.total)}` : ''}</span>
      </div>
      <button className="icon-btn w-9 h-9" onClick={() => editor.commands.searchStep(-1)} title={t('السابق', 'Previous')}>
        <ChevronUp size={16} />
      </button>
      <button className="icon-btn w-9 h-9" onClick={() => editor.commands.searchStep(1)} title={t('التالي', 'Next')}>
        <ChevronDown size={16} />
      </button>
      <button className={cx('chip h-8', whole && 'on')} onClick={() => setWhole((w) => !w)}>
        {t('كلمة كاملة', 'Whole word')}
      </button>
      <button className={cx('icon-btn w-9 h-9', showReplace && 'active')} onClick={() => setShowReplace((s) => !s)} title={t('استبدال', 'Replace')}>
        <Replace size={16} />
      </button>
      <div className="flex-1 hidden sm:block" />
      <button className="icon-btn w-9 h-9" onClick={onClose} title={t('إغلاق', 'Close')}>
        <X size={16} />
      </button>
      {showReplace && (
        <div className="basis-full flex flex-wrap items-center gap-2">
          <input dir="auto" className="input h-9 flex-1 min-w-[160px] max-w-sm" placeholder={t('استبدال بـ…', 'Replace with…')} value={rep} onChange={(e) => setRep(e.target.value)} />
          <button className="btn-outline h-9" disabled={!info.total} onClick={() => editor.chain().focus().replaceCurrent(rep).run()}>
            {t('استبدال', 'Replace')}
          </button>
          <button className="btn-outline h-9" disabled={!info.total} onClick={() => editor.chain().focus().replaceAll(rep).run()}>
            {t('استبدال الكل', 'Replace all')}
          </button>
          <span className="text-[11px] text-faint">{t('البحث يتجاهل التشكيل واختلاف الهمزات.', 'Search ignores Arabic diacritics and hamza variants.')}</span>
        </div>
      )}
    </div>
  );
}
