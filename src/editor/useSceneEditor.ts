import { useEffect, useRef, useState } from 'react';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import Highlight from '@tiptap/extension-highlight';
import { TextSelection } from '@tiptap/pm/state';
import { db } from '@/db/db';
import { getSceneHtml, newId, saveSceneContent } from '@/db/repo';
import { clearEmergency, writeEmergency } from '@/lib/emergency';
import { countChars, countWords, htmlToText } from '@/lib/text';
import { useSettings } from '@/store/settings';
import { useUI } from '@/store/ui';
import { BlockDirection, ParagraphFocus, SearchReplace } from './extensions';

export function editorText(editor: Editor) {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', ' ');
}

/**
 * Owns one scene's editing session:
 *  - loads text from IndexedDB, restores the cursor
 *  - autosaves (debounced) and mirrors unsaved text to an emergency buffer
 *  - flushes on scene switch, tab hide and page unload
 *  - reloads if the text was changed elsewhere (another tab, history restore) without losing local edits
 */
export function useSceneEditor(sceneId: string | undefined, placeholder: string) {
  const autosaveDelay = useSettings((s) => s.autosaveDelay);
  const setUI = useUI((s) => s.set);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });
  const [loaded, setLoaded] = useState<string | null>(null);
  const loadedRef = useRef<string | null>(null);
  loadedRef.current = loaded;

  const state = useRef({ sceneId: sceneId as string | undefined, dirty: false, lastSaved: '', timer: 0, countTimer: 0, cursorTimer: 0, chain: Promise.resolve() as Promise<unknown> });

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        Underline,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
        Placeholder.configure({ placeholder }),
        BlockDirection,
        SearchReplace,
        ParagraphFocus,
      ],
      editorProps: { attributes: { class: 'manuscript', spellcheck: 'true' } },
      editable: false,
      content: '',
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
    },
    [],
  );

  const recount = (ed: Editor) => {
    const text = editorText(ed);
    setCounts({ words: countWords(text), chars: countChars(text) });
  };

  /** Persists the current text (serialized through a promise chain so writes never overlap). */
  const flush = (ed: Editor | null = editor) => {
    const st = state.current;
    window.clearTimeout(st.timer);
    if (!ed || !st.sceneId || !st.dirty) return st.chain;
    const id = st.sceneId;
    const html = ed.getHTML();
    st.dirty = false;
    st.lastSaved = html;
    setUI({ saveState: 'saving' });
    st.chain = st.chain
      .then(() => saveSceneContent(id, html))
      .then(() => {
        clearEmergency(id);
        if (!state.current.dirty) setUI({ saveState: 'saved' });
      })
      .catch((e) => {
        console.error('Save failed', e);
        state.current.dirty = true; // retry on next change / flush
        setUI({ saveState: 'error' });
      });
    return st.chain;
  };

  // Load scene on change
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const prev = state.current.sceneId;
    // flush the scene we are leaving
    if (prev && prev !== sceneId && state.current.dirty) flush(editor);
    state.current.sceneId = sceneId;
    state.current.dirty = false;
    setLoaded(null);
    if (!sceneId) return;
    (async () => {
      await state.current.chain;
      const [html, scene] = await Promise.all([getSceneHtml(sceneId), db.scenes.get(sceneId)]);
      if (cancelled || !scene) return;
      state.current.lastSaved = html;
      editor.setEditable(true);
      editor.commands.setContent(html, false, { preserveWhitespace: false });
      // fresh undo history per scene
      const { state: es } = editor;
      editor.view.updateState(
        (es.constructor as typeof import('@tiptap/pm/state').EditorState).create({ doc: es.doc, plugins: es.plugins, selection: es.selection }),
      );
      const pos = Math.min(scene.cursor ?? editor.state.doc.content.size, editor.state.doc.content.size);
      try {
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.max(0, pos)))));
      } catch {
        /* ignore invalid position */
      }
      recount(editor);
      setLoaded(sceneId);
      setUI({ saveState: 'saved' });
      requestAnimationFrame(() => {
        if (cancelled) return;
        editor.commands.focus(undefined, { scrollIntoView: false });
        const coords = editor.view.coordsAtPos(editor.state.selection.from);
        const scroller = editor.view.dom.closest('[data-scroller]') as HTMLElement | null;
        if (scroller) scroller.scrollTop += coords.top - scroller.getBoundingClientRect().top - scroller.clientHeight * 0.4;
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, sceneId]);

  // Change tracking & autosave
  useEffect(() => {
    if (!editor) return;
    const onUpdate = ({ editor: ed, transaction }: { editor: Editor; transaction: import('@tiptap/pm/state').Transaction }) => {
      if (!transaction.docChanged || !state.current.sceneId || !ed.isEditable) return;
      const st = state.current;
      st.dirty = true;
      setUI({ saveState: 'saving' });
      window.clearTimeout(st.timer);
      st.timer = window.setTimeout(() => {
        writeEmergency(st.sceneId!, ed.getHTML());
        flush(ed);
      }, autosaveDelay);
      window.clearTimeout(st.countTimer);
      st.countTimer = window.setTimeout(() => recount(ed), 250);
    };
    const onSelection = ({ editor: ed }: { editor: Editor }) => {
      const st = state.current;
      window.clearTimeout(st.cursorTimer);
      const id = st.sceneId;
      st.cursorTimer = window.setTimeout(() => {
        if (id && id === state.current.sceneId) db.scenes.update(id, { cursor: ed.state.selection.from });
      }, 800);
    };
    editor.on('update', onUpdate);
    editor.on('selectionUpdate', onSelection);
    return () => {
      editor.off('update', onUpdate);
      editor.off('selectionUpdate', onSelection);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, autosaveDelay]);

  // Never lose text when the tab is hidden or closed.
  useEffect(() => {
    if (!editor) return;
    const emergency = () => {
      const st = state.current;
      if (st.dirty && st.sceneId) {
        writeEmergency(st.sceneId, editor.getHTML());
        flush(editor);
      }
    };
    const onVis = () => document.visibilityState === 'hidden' && emergency();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (state.current.dirty) {
        emergency();
        e.preventDefault();
      }
    };
    window.addEventListener('pagehide', emergency);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', emergency);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVis);
      emergency();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // External changes (history restore, other tabs, AI accept from another view)
  useEffect(() => {
    if (!editor || !sceneId) return;
    const sub = (async () => {
      const { liveQuery } = await import('dexie');
      return liveQuery(() => db.sceneTexts.get(sceneId)).subscribe((row) => {
        const st = state.current;
        if (!row || st.sceneId !== sceneId || loadedRef.current !== sceneId) return;
        if (row.html === st.lastSaved) return;
        if (st.dirty) {
          // Both changed: keep ours in the editor, preserve theirs in history.
          db.scenes.get(sceneId).then((scene) => {
            if (scene)
              db.snapshots.add({ id: newId(), projectId: scene.projectId, sceneId, content: row.html, wordCount: countWords(htmlToText(row.html)), label: 'External change (conflict)', kind: 'conflict', createdAt: Date.now() });
          });
          return;
        }
        st.lastSaved = row.html;
        const sel = editor.state.selection.from;
        editor.commands.setContent(row.html, false);
        try {
          editor.commands.setTextSelection(Math.min(sel, editor.state.doc.content.size));
        } catch {
          /* ignore */
        }
        recount(editor);
      });
    })();
    return () => {
      sub.then((s) => s.unsubscribe());
    };
  }, [editor, sceneId]);

  return { editor, counts, loaded: loaded === sceneId && !!sceneId, flush: () => flush(editor) };
}
