import { useState } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline as UIcon,
  Quote,
  MessageSquareQuote,
  List,
  ListOrdered,
  Minus,
  Highlighter,
  Search,
  Type,
  AlignRight,
  AlignLeft,
  AlignCenter,
  AlignJustify,
  Pilcrow,
  ChevronDown,
} from 'lucide-react';
import { FONT_STACKS, useSettings, useT, type EditorFont } from '@/store/settings';
import { Menu, cx } from '@/components/ui';

function Btn({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx('icon-btn w-9 h-9', on && 'active')}
    >
      {children}
    </button>
  );
}

const Sep = () => <div className="w-px h-5 bg-line mx-1 shrink-0" />;

export function Toolbar({ editor, onFind }: { editor: Editor; onFind: () => void }) {
  const t = useT();
  const mod = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl+';
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      quote: e.isActive('blockquote'),
      dialogue: e.getAttributes('paragraph').class === 'dialogue',
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      mark: e.isActive('highlight'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      dir: (e.getAttributes('paragraph').dir || e.getAttributes('heading').dir || 'auto') as string,
      align: (['right', 'center', 'left', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? '',
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const block = s.h1 ? 'H1' : s.h2 ? 'H2' : s.h3 ? 'H3' : '¶';
  const c = () => editor.chain().focus();
  const AlignIcon = s.align === 'center' ? AlignCenter : s.align === 'justify' ? AlignJustify : s.align === 'left' ? AlignLeft : AlignRight;

  return (
    <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar px-1">
      <Btn title={`${t('تراجع', 'Undo')} (${mod}Z)`} disabled={!s.canUndo} onClick={() => c().undo().run()}>
        <Undo2 size={17} />
      </Btn>
      <Btn title={`${t('إعادة', 'Redo')} (${mod}Shift+Z)`} disabled={!s.canRedo} onClick={() => c().redo().run()}>
        <Redo2 size={17} />
      </Btn>
      <Sep />
      <Menu
        align="start"
        items={[
          { label: t('نص عادي', 'Paragraph'), icon: <Pilcrow size={15} />, onClick: () => c().setParagraph().run() },
          { label: t('عنوان رئيسي', 'Heading 1'), icon: <span className="text-xs font-bold">H1</span>, onClick: () => c().toggleHeading({ level: 1 }).run() },
          { label: t('عنوان فرعي', 'Heading 2'), icon: <span className="text-xs font-bold">H2</span>, onClick: () => c().toggleHeading({ level: 2 }).run() },
          { label: t('عنوان صغير', 'Heading 3'), icon: <span className="text-xs font-bold">H3</span>, onClick: () => c().toggleHeading({ level: 3 }).run() },
        ]}
        trigger={(tp) => (
          <button {...tp} onMouseDown={(e) => e.preventDefault()} className="btn-ghost h-9 px-2 gap-1 text-xs font-semibold" title={t('نمط الفقرة', 'Block style')}>
            {block} <ChevronDown size={12} />
          </button>
        )}
      />
      <Btn on={s.bold} title={`${t('عريض', 'Bold')} (${mod}B)`} onClick={() => c().toggleBold().run()}>
        <Bold size={17} />
      </Btn>
      <Btn on={s.italic} title={`${t('مائل', 'Italic')} (${mod}I)`} onClick={() => c().toggleItalic().run()}>
        <Italic size={17} />
      </Btn>
      <Btn on={s.underline} title={`${t('تسطير', 'Underline')} (${mod}U)`} onClick={() => c().toggleUnderline().run()}>
        <UIcon size={17} />
      </Btn>
      <Sep />
      <Btn on={s.quote} title={t('اقتباس', 'Quote')} onClick={() => c().toggleBlockquote().run()}>
        <Quote size={17} />
      </Btn>
      <Btn on={s.dialogue} title={`${t('حوار', 'Dialogue')} (${mod}Shift+D)`} onClick={() => c().toggleDialogue().run()}>
        <MessageSquareQuote size={17} />
      </Btn>
      <Btn on={s.bullet} title={t('قائمة نقطية', 'Bullet list')} onClick={() => c().toggleBulletList().run()}>
        <List size={17} />
      </Btn>
      <Btn on={s.ordered} title={t('قائمة مرقمة', 'Numbered list')} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered size={17} />
      </Btn>
      <Btn title={`${t('فاصل مشهد', 'Scene break')} (${mod}Enter)`} onClick={() => c().setHorizontalRule().run()}>
        <Minus size={17} />
      </Btn>
      <Menu
        align="start"
        items={[
          { label: t('علامة ذهبية', 'Gold marker'), icon: <span className="block w-3 h-3 rounded bg-gold/60" />, onClick: () => c().toggleHighlight({ color: 'gold' }).run() },
          { label: t('علامة بنفسجية', 'Violet marker'), icon: <span className="block w-3 h-3 rounded bg-violet/60" />, onClick: () => c().toggleHighlight({ color: 'violet' }).run() },
          { label: t('علامة حمراء (للمراجعة)', 'Red marker (revise)'), icon: <span className="block w-3 h-3 rounded bg-danger/60" />, onClick: () => c().toggleHighlight({ color: 'red' }).run() },
          { label: t('علامة خضراء', 'Green marker'), icon: <span className="block w-3 h-3 rounded bg-ok/60" />, onClick: () => c().toggleHighlight({ color: 'green' }).run() },
          'sep',
          { label: t('إزالة العلامة', 'Remove marker'), onClick: () => c().unsetHighlight().run() },
        ]}
        trigger={(tp) => (
          <button {...tp} onMouseDown={(e) => e.preventDefault()} className={cx('icon-btn w-9 h-9', s.mark && 'active')} title={t('علامات الكاتب', 'Markers')}>
            <Highlighter size={17} />
          </button>
        )}
      />
      <Sep />
      <Menu
        align="start"
        items={[
          { label: t('اتجاه تلقائي', 'Auto direction'), icon: <span className="text-[10px]">{s.dir === 'auto' ? '✓' : ''}</span>, onClick: () => c().setBlockDir('auto').run() },
          { label: t('من اليمين لليسار RTL', 'Right-to-left'), icon: <span className="text-[10px]">{s.dir === 'rtl' ? '✓' : ''}</span>, onClick: () => c().setBlockDir('rtl').run() },
          { label: t('من اليسار لليمين LTR', 'Left-to-right'), icon: <span className="text-[10px]">{s.dir === 'ltr' ? '✓' : ''}</span>, onClick: () => c().setBlockDir('ltr').run() },
          'sep',
          { label: t('محاذاة لليمين', 'Align right'), icon: <AlignRight size={15} />, onClick: () => c().setTextAlign('right').run() },
          { label: t('توسيط', 'Center'), icon: <AlignCenter size={15} />, onClick: () => c().setTextAlign('center').run() },
          { label: t('محاذاة لليسار', 'Align left'), icon: <AlignLeft size={15} />, onClick: () => c().setTextAlign('left').run() },
          { label: t('ضبط', 'Justify'), icon: <AlignJustify size={15} />, onClick: () => c().setTextAlign('justify').run() },
          { label: t('إلغاء المحاذاة', 'Default alignment'), onClick: () => c().unsetTextAlign().run() },
        ]}
        trigger={(tp) => (
          <button {...tp} onMouseDown={(e) => e.preventDefault()} className="btn-ghost h-9 px-2 gap-1 text-[11px]" title={t('الاتجاه والمحاذاة', 'Direction & alignment')}>
            <AlignIcon size={16} />
            <span className="font-semibold">{s.dir === 'auto' ? 'A' : s.dir.toUpperCase()}</span>
          </button>
        )}
      />
      <Btn title={`${t('بحث واستبدال', 'Find & replace')} (${mod}F)`} onClick={onFind}>
        <Search size={17} />
      </Btn>
      <TypographyMenu />
    </div>
  );
}

function TypographyMenu() {
  const t = useT();
  const st = useSettings();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onMouseDown={(e) => e.preventDefault()} className={cx('icon-btn w-9 h-9', open && 'active')} title={t('الخط والتنسيق', 'Typography')} onClick={() => setOpen((o) => !o)}>
        <Type size={17} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 top-28 end-3 w-72 card shadow-lift p-4 space-y-4 animate-fadeIn">
            <div>
              <span className="label">{t('نوع الخط', 'Font')}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(FONT_STACKS) as EditorFont[]).map((k) => (
                  <button key={k} onClick={() => st.set({ editorFont: k })} className={cx('rounded-lg border px-2 h-10 text-sm', st.editorFont === k ? 'border-current text-accent' : 'border-line text-muted')} style={{ fontFamily: FONT_STACKS[k].css }}>
                    {t.l(FONT_STACKS[k].label)}
                  </button>
                ))}
              </div>
            </div>
            <Range label={t('حجم الخط', 'Font size')} value={st.editorFontSize} min={14} max={34} step={1} unit="px" onChange={(v) => st.set({ editorFontSize: v })} />
            <Range label={t('تباعد الأسطر', 'Line spacing')} value={st.lineHeight} min={1.3} max={2.6} step={0.1} onChange={(v) => st.set({ lineHeight: Math.round(v * 10) / 10 })} />
            <Range label={t('عرض مساحة الكتابة', 'Page width')} value={st.editorWidth} min={480} max={1200} step={20} unit="px" onChange={(v) => st.set({ editorWidth: v })} />
            <label className="flex items-center justify-between text-sm text-ink">
              {t('مسافة بادئة للفقرات', 'Indent paragraphs')}
              <input type="checkbox" className="accent-[rgb(var(--accent))] w-4 h-4" checked={st.paragraphIndent} onChange={(e) => st.set({ paragraphIndent: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between text-sm text-ink">
              {t('وضع الآلة الكاتبة (المؤشر في المنتصف)', 'Typewriter scrolling')}
              <input type="checkbox" className="accent-[rgb(var(--accent))] w-4 h-4" checked={st.typewriter} onChange={(e) => st.set({ typewriter: e.target.checked })} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}

export function Range({ label, value, min, max, step, unit = '', onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between label">
        <span>{label}</span>
        <span className="tabular-nums text-ink">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" className="w-full accent-[rgb(var(--accent))]" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
