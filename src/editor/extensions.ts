import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { findAll } from '@/lib/text';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    novelist: {
      toggleDialogue: () => ReturnType;
      setBlockDir: (dir: 'rtl' | 'ltr' | 'auto') => ReturnType;
      setSearch: (query: string, opts?: { wholeWord?: boolean }) => ReturnType;
      searchStep: (delta: 1 | -1) => ReturnType;
      replaceCurrent: (replacement: string) => ReturnType;
      replaceAll: (replacement: string) => ReturnType;
    };
  }
}

const BLOCKS = ['paragraph', 'heading', 'blockquote', 'listItem', 'bulletList', 'orderedList'];

/**
 * Per-block text direction. Defaults to `auto` so each paragraph follows its own script,
 * which makes mixed Arabic / English manuscripts behave naturally.
 */
export const BlockDirection = Extension.create({
  name: 'blockDirection',
  addGlobalAttributes() {
    return [
      {
        types: BLOCKS,
        attributes: {
          dir: {
            default: 'auto',
            parseHTML: (el) => el.getAttribute('dir') || 'auto',
            renderHTML: (attrs) => ({ dir: attrs.dir || 'auto' }),
          },
        },
      },
      {
        types: ['paragraph'],
        attributes: {
          class: {
            default: null,
            parseHTML: (el) => (el.classList.contains('dialogue') ? 'dialogue' : null),
            renderHTML: (attrs) => (attrs.class ? { class: attrs.class } : {}),
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      toggleDialogue:
        () =>
        ({ editor, commands }) => {
          const on = editor.getAttributes('paragraph').class === 'dialogue';
          return commands.updateAttributes('paragraph', { class: on ? null : 'dialogue' });
        },
      setBlockDir:
        (dir) =>
        ({ commands }) =>
          commands.updateAttributes('paragraph', { dir }) || commands.updateAttributes('heading', { dir }),
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-d': () => this.editor.commands.toggleDialogue(),
      // Scene break
      'Mod-Enter': () => this.editor.chain().focus().setHorizontalRule().run(),
    };
  },
});

// ───────────── Find & replace with Arabic normalization ─────────────

interface SearchState {
  query: string;
  wholeWord: boolean;
  results: { from: number; to: number }[];
  current: number;
  deco: DecorationSet;
}

export const searchKey = new PluginKey<SearchState>('novelist-search');

/** Collects text of each textblock with a char → doc position map. */
function collectMatches(doc: PMNode, query: string, wholeWord: boolean) {
  const results: { from: number; to: number }[] = [];
  if (!query) return results;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const map: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        const s = child.text ?? '';
        for (let i = 0; i < s.length; i++) map.push(pos + 1 + offset + i);
        text += s;
      } else {
        text += '￼';
        map.push(pos + 1 + offset);
      }
    });
    for (const m of findAll(text, query, { wholeWord })) results.push({ from: map[m.start], to: map[m.end - 1] + 1 });
    return false;
  });
  return results;
}

function buildDeco(doc: PMNode, results: SearchState['results'], current: number) {
  return DecorationSet.create(
    doc,
    results.map((r, i) => Decoration.inline(r.from, r.to, { class: i === current ? 'search-hit current' : 'search-hit' })),
  );
}

export const getSearchState = (state: EditorState) => searchKey.getState(state);

export const SearchReplace = Extension.create({
  name: 'searchReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ query: '', wholeWord: false, results: [], current: 0, deco: DecorationSet.empty }),
          apply(tr, prev, _old, newState) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
            if (!meta && !tr.docChanged) return prev;
            const query = meta?.query ?? prev.query;
            const wholeWord = meta?.wholeWord ?? prev.wholeWord;
            const results = collectMatches(newState.doc, query, wholeWord);
            let current = meta?.current ?? prev.current;
            if (current >= results.length) current = Math.max(0, results.length - 1);
            return { query, wholeWord, results, current, deco: buildDeco(newState.doc, results, current) };
          },
        },
        props: {
          decorations(state) {
            return searchKey.getState(state)?.deco;
          },
        },
      }),
    ];
  },
  addCommands() {
    const select = (tr: import('@tiptap/pm/state').Transaction, r?: { from: number; to: number }) => {
      if (r) tr.setSelection(TextSelection.create(tr.doc, r.from, r.to)).scrollIntoView();
    };
    return {
      setSearch:
        (query, opts) =>
        ({ tr, state, dispatch }) => {
          const results = collectMatches(state.doc, query, !!opts?.wholeWord);
          // start from the first match after the cursor
          const from = state.selection.from;
          let current = results.findIndex((r) => r.from >= from);
          if (current < 0) current = 0;
          tr.setMeta(searchKey, { query, wholeWord: !!opts?.wholeWord, current });
          if (dispatch && results[current]) select(tr, results[current]);
          return true;
        },
      searchStep:
        (delta) =>
        ({ tr, state, dispatch }) => {
          const s = searchKey.getState(state);
          if (!s || !s.results.length) return false;
          const current = (s.current + delta + s.results.length) % s.results.length;
          tr.setMeta(searchKey, { current });
          if (dispatch) select(tr, s.results[current]);
          return true;
        },
      replaceCurrent:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const s = searchKey.getState(state);
          const r = s?.results[s.current];
          if (!r) return false;
          if (dispatch) {
            if (replacement) tr.insertText(replacement, r.from, r.to);
            else tr.delete(r.from, r.to);
            tr.setMeta(searchKey, { current: s!.current });
          }
          return true;
        },
      replaceAll:
        (replacement) =>
        ({ tr, state, dispatch }) => {
          const s = searchKey.getState(state);
          if (!s?.results.length) return false;
          if (dispatch) {
            // Replace from the end so earlier positions stay valid.
            for (const r of [...s.results].reverse()) {
              if (replacement) tr.insertText(replacement, r.from, r.to);
              else tr.delete(r.from, r.to);
            }
            tr.setMeta(searchKey, { current: 0 });
          }
          return true;
        },
    };
  },
});

// ───────────── Focus: dim everything except the current paragraph ─────────────

export const focusKey = new PluginKey('novelist-focus');

export const ParagraphFocus = Extension.create({
  name: 'paragraphFocus',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: focusKey,
        props: {
          decorations(state) {
            const { $from } = state.selection;
            if ($from.depth < 1) return null;
            const start = $from.before(1);
            const node = state.doc.nodeAt(start);
            if (!node) return null;
            return DecorationSet.create(state.doc, [Decoration.node(start, start + node.nodeSize, { class: 'has-focus' })]);
          },
        },
      }),
    ];
  },
});
