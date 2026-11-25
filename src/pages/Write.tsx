import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { EditorContent } from '@tiptap/react';
import {
  Maximize2,
  Minimize2,
  Eye,
  EyeOff,
  Check,
  Loader2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Plus,
  ListTree,
  SlidersHorizontal,
  Scissors,
} from 'lucide-react';
import { db } from '@/db/db';
import { createCheckpoint, createScene, splitScene, touchProject, updateSceneMeta } from '@/db/repo';
import { useProject } from '@/components/ProjectLayout';
import { ManuscriptTree } from '@/components/ManuscriptTree';
import { Drawer, DebouncedInput, promptDialog, toast, useFmt, useMediaQuery, cx } from '@/components/ui';
import { useManuscript } from '@/hooks/useManuscript';
import { useSceneEditor } from '@/editor/useSceneEditor';
import { Toolbar } from '@/editor/Toolbar';
import { FindBar } from '@/editor/FindBar';
import { Inspector, type InspectorTab } from '@/editor/Inspector';
import { FONT_STACKS, useSettings, useT } from '@/store/settings';
import { useUI } from '@/store/ui';
import { estimatePages, todayKey } from '@/lib/text';

export default function Write() {
  const project = useProject();
  const t = useT();
  const f = useFmt();
  const navigate = useNavigate();
  const { sceneId: routeSceneId } = useParams();
  const [params, setParams] = useSearchParams();
  const ms = useManuscript(project.id);
  const settings = useSettings();
  const { focus, saveState, set: setUI } = useUI();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [mobileTree, setMobileTree] = useState(false);
  const [mobileInspector, setMobileInspector] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findInitial, setFindInitial] = useState<string>();
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('scene');
  const [fullscreen, setFullscreen] = useState(!!document.fullscreenElement);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Resolve the scene to open: route → last opened → first scene.
  const allScenes = useMemo(() => ms?.flatMap((c) => c.scenes) ?? [], [ms]);
  const sceneId = routeSceneId && allScenes.some((s) => s.id === routeSceneId) ? routeSceneId : undefined;
  useEffect(() => {
    if (!ms || sceneId) return;
    const fallback = allScenes.find((s) => s.id === project.lastSceneId) ?? allScenes[0];
    if (fallback) navigate(`/p/${project.id}/write/${fallback.id}${window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : ''}`, { replace: true });
  }, [ms, sceneId, allScenes, project.lastSceneId, project.id, navigate]);

  useEffect(() => {
    if (sceneId) touchProject(project.id, sceneId);
  }, [sceneId, project.id]);

  const { editor, counts, loaded, flush } = useSceneEditor(sceneId, t('ابدأ الكتابة هنا…', 'Begin writing here…'));
  const scene = allScenes.find((s) => s.id === sceneId);
  const chapter = ms?.find((c) => c.scenes.some((s) => s.id === sceneId));
  const sceneIndex = chapter ? chapter.scenes.findIndex((s) => s.id === sceneId) : -1;
  const flatIndex = allScenes.findIndex((s) => s.id === sceneId);
  const prev = flatIndex > 0 ? allScenes[flatIndex - 1] : undefined;
  const next = flatIndex >= 0 && flatIndex < allScenes.length - 1 ? allScenes[flatIndex + 1] : undefined;

  const todayStat = useLiveQuery(() => db.dailyStats.get(`${project.id}|${todayKey()}`), [project.id]);

  const open = useCallback(
    (id: string) => {
      setMobileTree(false);
      navigate(`/p/${project.id}/write/${id}`);
    },
    [navigate, project.id],
  );

  // Open find bar when arriving from global search (?q=)
  useEffect(() => {
    const q = params.get('q');
    if (q && loaded) {
      setFindInitial(q);
      setFindOpen(true);
      params.delete('q');
      setParams(params, { replace: true });
    }
  }, [params, setParams, loaded]);

  // Spellcheck + typewriter scrolling
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute('spellcheck', String(settings.spellcheck));
    editor.view.dom.setAttribute('lang', project.language === 'en' ? 'en' : 'ar');
  }, [editor, settings.spellcheck, project.language]);
  useEffect(() => {
    if (!editor || !settings.typewriter) return;
    const center = () => {
      const sc = scrollerRef.current;
      if (!sc || !editor.isFocused) return;
      const { top } = editor.view.coordsAtPos(editor.state.selection.from);
      const box = sc.getBoundingClientRect();
      const target = box.top + sc.clientHeight * 0.45;
      if (Math.abs(top - target) > 24) sc.scrollBy({ top: top - target, behavior: 'smooth' });
    };
    editor.on('selectionUpdate', center);
    return () => void editor.off('selectionUpdate', center);
  }, [editor, settings.typewriter]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  useEffect(() => () => setUI({ focus: false }), [setUI]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => toast(t('المتصفح لا يدعم ملء الشاشة هنا', 'Fullscreen is not available here'), 'info'));
  };

  const newScene = async () => {
    if (!chapter) return;
    const s = await createScene(project.id, chapter.chapter.id, '');
    open(s.id);
  };

  const splitAtCursor = async () => {
    if (!editor || !scene) return;
    const { $from } = editor.state.selection;
    if ($from.depth < 1) return;
    const idx = $from.index(0);
    const doc = editor.state.doc;
    if (idx === 0) return toast(t('ضع المؤشر في الفقرة التي يبدأ بها المشهد الجديد', 'Place the cursor in the paragraph that should start the new scene'), 'info');
    await flush();
    const { DOMSerializer } = await import('@tiptap/pm/model');
    const serializer = DOMSerializer.fromSchema(editor.schema);
    let offset = 0;
    for (let i = 0; i < idx; i++) offset += doc.child(i).nodeSize;
    const toHtml = (frag: import('@tiptap/pm/model').Fragment) => {
      const div = document.createElement('div');
      div.appendChild(serializer.serializeFragment(frag));
      return div.innerHTML;
    };
    const before = toHtml(doc.content.cut(0, offset));
    const after = toHtml(doc.content.cut(offset));
    const created = await splitScene(scene.id, before, after, '');
    editor.commands.setContent(before, false);
    if (created) open(created.id);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && !e.shiftKey && !e.altKey && k === 'f') {
        e.preventDefault();
        const sel = editor?.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, ' ');
        setFindInitial(sel && sel.length < 60 ? sel : undefined);
        setFindOpen(true);
      } else if (mod && k === 's') {
        e.preventDefault();
        if (e.shiftKey && scene) {
          promptDialog({ title: t('نقطة حفظ يدوية', 'Manual checkpoint') }).then(async (name) => {
            if (name === null) return;
            await flush();
            await createCheckpoint(scene.id, name || t('نقطة حفظ', 'Checkpoint'));
            toast(t('تم إنشاء نقطة الحفظ', 'Checkpoint created'));
          });
        } else flush().then(() => toast(t('تم الحفظ', 'Saved')));
      } else if (mod && e.key === '.') {
        e.preventDefault();
        setUI({ focus: !useUI.getState().focus });
      } else if (e.key === 'Escape' && useUI.getState().focus && !findOpen) {
        setUI({ focus: false });
      } else if (mod && e.altKey && k === 's') {
        e.preventDefault();
        settings.set({ showSidebar: !useSettings.getState().showSidebar });
      } else if (mod && e.altKey && k === 'i') {
        e.preventDefault();
        settings.set({ showInspector: !useSettings.getState().showInspector });
      } else if (mod && e.altKey && k === 'n') {
        e.preventDefault();
        newScene();
      } else if (mod && e.altKey && e.key === 'ArrowDown' && next) {
        e.preventDefault();
        open(next.id);
      } else if (mod && e.altKey && e.key === 'ArrowUp' && prev) {
        e.preventDefault();
        open(prev.id);
      } else if (mod && e.altKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        settings.set({ editorFontSize: Math.min(34, useSettings.getState().editorFontSize + 1) });
      } else if (mod && e.altKey && e.key === '-') {
        e.preventDefault();
        settings.set({ editorFontSize: Math.max(14, useSettings.getState().editorFontSize - 1) });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!ms || !editor) return <div className="h-full" />;

  const showSidebar = settings.showSidebar && !focus && isDesktop;
  const showInspector = settings.showInspector && !focus && isDesktop && scene && chapter;
  const Prev = t.dir === 'rtl' ? ChevronRight : ChevronLeft;
  const Next = t.dir === 'rtl' ? ChevronLeft : ChevronRight;

  const tree = <ManuscriptTree projectId={project.id} ms={ms} activeSceneId={sceneId} onOpenScene={open} />;
  const inspector =
    scene && chapter ? (
      <Inspector
        projectId={project.id}
        scene={scene}
        chapter={chapter}
        editor={editor}
        tab={inspectorTab}
        setTab={setInspectorTab}
        onFlush={flush}
        onClose={() => (isDesktop ? settings.set({ showInspector: false }) : setMobileInspector(false))}
      />
    ) : null;

  return (
    <div className="h-full flex" style={{ ['--editor-font' as string]: FONT_STACKS[settings.editorFont].css, ['--editor-size' as string]: `${settings.editorFontSize}px`, ['--editor-lh' as string]: settings.lineHeight }}>
      {showSidebar && <aside className="w-72 shrink-0 border-e border-line/60 bg-surface/50">{tree}</aside>}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className={cx('flex items-center gap-1 px-2 h-12 border-b border-line/60 shrink-0 bg-bg/80 backdrop-blur safe-top', focus && 'opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300')}>
          <button
            className="icon-btn"
            onClick={() => (isDesktop ? settings.set({ showSidebar: !settings.showSidebar }) : setMobileTree(true))}
            title={t('الفصول والمشاهد', 'Chapters & scenes') + ' (Ctrl+Alt+S)'}
          >
            <ListTree size={18} />
          </button>
          <div className="min-w-0 flex-1 px-1">
            <div className="text-[11px] text-faint truncate">{project.title}</div>
            <div className="text-sm text-ink truncate">
              {chapter?.chapter.title}
              {scene && <span className="text-muted"> · {scene.title || `${t('مشهد', 'Scene')} ${sceneIndex + 1}`}</span>}
            </div>
          </div>
          <SaveIndicator state={saveState} />
          <button className="icon-btn hidden sm:inline-flex" onClick={splitAtCursor} title={t('تقسيم المشهد عند المؤشر', 'Split scene at cursor')}>
            <Scissors size={17} />
          </button>
          <button className={cx('icon-btn', focus && 'active')} onClick={() => setUI({ focus: !focus })} title={t('وضع التركيز', 'Focus mode') + ' (Ctrl+.)'}>
            {focus ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <button className="icon-btn hidden sm:inline-flex" onClick={toggleFullscreen} title={t('ملء الشاشة', 'Fullscreen')}>
            {fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <button
            className={cx('icon-btn', settings.showInspector && isDesktop && 'active')}
            onClick={() => (isDesktop ? settings.set({ showInspector: !settings.showInspector }) : setMobileInspector(true))}
            title={t('لوحة المعلومات', 'Info panel') + ' (Ctrl+Alt+I)'}
          >
            <SlidersHorizontal size={18} />
          </button>
        </header>

        <div className={cx('border-b border-line/60 shrink-0 bg-bg', focus && 'opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity duration-300')}>
          <Toolbar editor={editor} onFind={() => setFindOpen(true)} />
        </div>
        {findOpen && <FindBar key={findInitial} editor={editor} initial={findInitial} onClose={() => { setFindOpen(false); editor.commands.focus(); }} />}

        {/* Writing surface */}
        <div ref={scrollerRef} data-scroller className="flex-1 overflow-y-auto overscroll-contain" onClick={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
          <div className="mx-auto px-5 sm:px-10 pt-8 sm:pt-14" style={{ maxWidth: settings.editorWidth + 80 }}>
            {scene && (
              <div className="mb-6">
                {sceneIndex === 0 && <div className="font-serif text-faint text-sm mb-1" dir="auto">{chapter?.chapter.title}</div>}
                <DebouncedInput
                  key={scene.id}
                  value={scene.title}
                  onCommit={(v) => updateSceneMeta(scene.id, { title: v })}
                  placeholder={`${t('مشهد', 'Scene')} ${sceneIndex + 1} — ${t('عنوان اختياري', 'optional title')}`}
                  className="!border-0 !bg-transparent !px-0 !h-auto font-serif !text-2xl sm:!text-3xl text-ink placeholder:text-faint/70"
                />
              </div>
            )}
            <div className={cx(!loaded && 'opacity-0')} style={{ transition: 'opacity .15s' }}>
              <EditorContent editor={editor} className={cx(settings.paragraphIndent && '[&_.manuscript]:indent', focus && '[&_.manuscript]:focus-paragraph')} />
            </div>
          </div>
          {/* Scene navigation */}
          <div className="mx-auto px-5 sm:px-10 -mt-[30vh] pb-16 flex items-center justify-between gap-3" style={{ maxWidth: settings.editorWidth + 80 }}>
            {prev ? (
              <button className="btn-ghost text-xs" onClick={() => open(prev.id)}>
                <Prev size={14} /> {t('المشهد السابق', 'Previous scene')}
              </button>
            ) : (
              <span />
            )}
            <button className="btn-ghost text-xs" onClick={newScene}>
              <Plus size={14} /> {t('مشهد جديد', 'New scene')}
            </button>
            {next ? (
              <button className="btn-ghost text-xs" onClick={() => open(next.id)}>
                {t('المشهد التالي', 'Next scene')} <Next size={14} />
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>

        {/* Status bar */}
        <footer className={cx('flex items-center gap-4 px-4 h-9 border-t border-line/60 text-[11px] text-muted shrink-0 overflow-x-auto no-scrollbar whitespace-nowrap', focus && 'opacity-0 hover:opacity-100 transition-opacity')}>
          <span>
            <b className="text-ink font-medium tabular-nums">{f.n(counts.words)}</b> {t('كلمة في المشهد', 'words in scene')}
          </span>
          <span>
            <b className="text-ink font-medium tabular-nums">{f.n((chapter?.words ?? 0) - (scene?.wordCount ?? 0) + counts.words)}</b> {t('في الفصل', 'in chapter')}
          </span>
          <span>
            <b className="text-ink font-medium tabular-nums">{f.n(project.wordCount)}</b> {t('في الرواية', 'in novel')}
          </span>
          <span>
            {f.n(counts.chars)} {t('حرف', 'chars')}
          </span>
          <span>
            ≈ {f.n(estimatePages(project.wordCount))} {t('صفحة', 'pages')}
          </span>
          <span className="ms-auto">
            {t('اليوم', 'Today')}: <b className="text-accent font-medium tabular-nums">+{f.n(todayStat?.added ?? 0)}</b>
          </span>
        </footer>
      </div>

      {showInspector && <aside className="w-80 shrink-0 border-s border-line/60 bg-surface/50">{inspector}</aside>}

      <Drawer open={mobileTree && !isDesktop} onClose={() => setMobileTree(false)} side="start">
        {tree}
      </Drawer>
      <Drawer open={mobileInspector && !isDesktop} onClose={() => setMobileInspector(false)} side="end">
        {inspector}
      </Drawer>
    </div>
  );
}

function SaveIndicator({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  const t = useT();
  if (state === 'idle') return null;
  return (
    <span className={cx('flex items-center gap-1.5 text-[11px] px-2 whitespace-nowrap', state === 'error' ? 'text-danger' : 'text-faint')} aria-live="polite">
      {state === 'saving' && <Loader2 size={12} className="animate-spin" />}
      {state === 'saved' && <Check size={12} className="text-ok" />}
      {state === 'error' && <AlertTriangle size={12} />}
      <span className="hidden sm:inline">{state === 'saving' ? t('جارٍ الحفظ…', 'Saving…') : state === 'saved' ? t('محفوظ', 'Saved') : t('تعذر الحفظ', 'Save failed')}</span>
    </span>
  );
}
