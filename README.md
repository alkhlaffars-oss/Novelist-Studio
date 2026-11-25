# Novelist Studio

استوديو احترافي لكتابة الروايات — عربي أولاً (RTL) مع واجهة إنجليزية كاملة، يعمل دون إنترنت ويحفظ كل شيء على جهازك.

A professional, local-first novel-writing studio. Arabic-first (RTL) with a full English (LTR) interface.

## التشغيل / Running

```bash
npm install
npm run dev        # development server
npm run build      # production build → dist/
npm run preview    # serve the production build (http://localhost:4173)
```

The build is a static site (no server needed). Deploy `dist/` to any static host (GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket…). It installs as a PWA and works offline after the first visit. Routes use hash URLs, so no rewrite rules are required.

## الميزات / Features

| Area | What it does |
|---|---|
| **Dashboard** | Last opened novel, last edited chapter, continue-writing cards per novel, daily goal ring, writing streak, week/month totals vs goals, 14-day chart. |
| **Projects** | Unlimited novels with title, author, description, genre/subgenre, premise, world, language, cover, status, word target, start/target dates. Duplicate, archive, delete (typed confirmation), export/import a full project (`.novelist.json`). |
| **Editor** (Tiptap/ProseMirror) | Three resizable areas (chapters sidebar · page · info panel), each can be hidden. Per-paragraph automatic RTL/LTR, headings, bold/italic/underline, quotes, dialogue style, lists, scene breaks, colour markers, alignment, Arabic-aware find & replace (ignores diacritics and hamza forms), word/char/page counts (scene, chapter, novel), focus mode, fullscreen, typewriter scrolling, font/size/width/line-height, undo/redo, split scene at cursor, keyboard shortcuts. |
| **Saving** | Autosave ~0.5 s after typing, with a Saving/Saved indicator. Unsaved text is mirrored synchronously to a small crash buffer and recovered on next launch if the tab dies mid-write. Flushes on scene switch, tab hide and close. Cursor position and last scene are restored. Edits from another tab or a history restore are merged without losing local text (conflicts are kept in history). |
| **Chapters & scenes** | Create, rename, delete, duplicate, split (at a scene), merge with next, status, summary; drag-and-drop reordering of chapters and scenes (including moving scenes between chapters). Each scene has title, synopsis, text, characters, POV, location, in-story time, goal, conflict, outcome and status. |
| **Novel bible** | Characters (full profile, aliases, relationships, arc, first/last/death scene, reference image), automatic appearance tracking from the text, locations (linked characters, events, gallery), objects, world sections (history, civilizations, nations, politics, cultures, religions, laws, technology, magic, creatures, glossary) plus custom sections, and an interactive draggable **relationship map**. |
| **Timeline** | Events with date/time labels, location, characters, chapter, scene and "happens after" links. Visual dual timeline: in-world chronology vs. reader order (crossing lines reveal flashbacks), zoom, character filter, drag ordering, sort-by-date, contradiction check. |
| **Plot board** | Kanban across 9 stages (premise → ending), timeline view with one lane per subplot, outline tree; subplots with colours and characters; cards linked to characters/chapters/scenes; foreshadowing cards with payoff tracking. |
| **Notes** | Quick ideas, dialogue, alternate endings, future scenes, quotes, open questions, research, unused ideas; tags, search, pinning; convert a note into a chapter, scene, character, timeline event or plot card. |
| **Continuity checker** | Heuristic checks (see *Limits*) with open/resolved/ignored states and links to the scenes involved, plus manual and assistant-added issues. |
| **Statistics & goals** | Daily/weekly/monthly words, goals, streaks, sessions, average speed, longest session, words per chapter, activity heatmap, projected finish date from your real pace, words/day needed for the target date. |
| **Version history** | Automatic version every 10 minutes of editing, named checkpoints, side-by-side or inline word diff, words added/removed, restore (the current text is always saved first), recovery of deleted scenes. |
| **Search** | Searches manuscript, chapters, scene details, characters, places, objects, world entries, events, notes and plot cards with chapter/scene labels and snippets; novel-wide replace with a history version per changed scene. |
| **Export / import** | DOCX (real RTL paragraphs, cover, TOC, page numbers, page size, margins, font, size, spacing), PDF (browser print engine), TXT, Markdown — for the whole novel, selected chapters, one chapter, the bible, the character list or the timeline. Import DOCX/TXT/Markdown as a new novel or as extra chapters. |
| **AI assistant** | Real provider calls only (Anthropic Claude via the official SDK, OpenAI, or any OpenAI-compatible endpoint such as OpenRouter or a local Ollama). Novel analysis (plot, characters, arcs, contradictions, plot holes, weak scenes, pacing, dialogue, world consistency, what the reader knows, unanswered questions) and writing help (ideas, dialogue, alternative endings, phrasing, grammar, repetition, description). You choose exactly what "novel memory" it may read. Rewrites appear as a diff with **Accept / Reject**; nothing changes the manuscript without your click, and a version is saved before applying. |
| **Backup** | Download/restore full-library backups, rolling automatic daily backups inside the app, persistent-storage request, storage usage. Restoring never overwrites existing novels. |

## البنية التقنية / Architecture

- **React 18 + TypeScript + Vite**, Tailwind CSS with CSS-variable design tokens (dark default, light, gold/violet accent).
- **Tiptap 2 (ProseMirror)** editor with custom extensions (`src/editor/extensions.ts`): per-block direction, dialogue style, Arabic-normalized search/replace, paragraph focus.
- **IndexedDB via Dexie** (`src/db`). Scene text lives in its own table (`sceneTexts`) so chapter/scene trees stay light for very long novels. LocalStorage is used only for small UI settings and the single-scene crash buffer.
- **Repository layer** (`src/db/repo.ts`): every write goes through one module, which is where a sync backend can hook in later without rebuilding the app.
- **PWA** via `vite-plugin-pwa` (precached app shell and fonts).
- Exports: `docx` for Word, the browser print engine for PDF, `mammoth` + `marked` for imports, `diff` for version comparison, `@dnd-kit` for drag and drop.
- Fonts are bundled (IBM Plex Sans Arabic, Noto Sans Arabic, Amiri, Noto Naskh Arabic), so the app looks right offline.

```
src/
  ai/          provider client, key vault, novel-memory context, task prompts, AI UI
  components/  app shell, navigation, manuscript tree (DnD), charts, relationship map, UI kit
  db/          Dexie schema, types, repository (all writes)
  editor/      Tiptap extensions, scene editor hook (autosave), toolbar, find bar, info panel
  hooks/       live queries (manuscript structure, entities)
  lib/         text/Arabic utilities, analysis, continuity checks, stats, diff, import, export, backup
  pages/       one file per screen
  store/       settings (persisted) and transient UI state
```

## الحدود الصريحة / Honest limits

- **PDF** is produced through the browser's print dialog ("Save as PDF"). It is the only approach that guarantees correct Arabic shaping and bidi; the PDF has real selectable text. Page numbers rely on CSS page margin boxes (current Chrome/Edge). The TOC in the PDF lists chapters with links, without page numbers.
- **DOCX** names the chosen font; if it is not installed on the reader's computer, Word substitutes one. Word may ask to update the table of contents field on open; a plain chapter list is included as a fallback.
- **Continuity checks are heuristics.** They detect: characters linked to or mentioned after their death/exit scene, items mentioned before their recorded first appearance, eye/hair colour and age differing from the bible (Arabic and English colour vocabulary, including pronoun references in the next sentence), timeline order violations, event/scene location mismatches, a character in two places at the same labelled time, open questions and unpaid setups. They will miss things, and some findings will be intentional (memories, time jumps). Knowledge errors ("she knew before she could have") and broken world rules need a human, or the AI assistant.
- **AI keys in the browser.** Keys are kept in session memory only, or AES-GCM encrypted with a passphrase that is never stored. Any key used from a browser is still visible to that browser and its extensions while in use. For a shared or public deployment, add a small server proxy that holds the key and point the client at it (`src/ai/client.ts` is the single integration point).
- **No accounts or cloud sync** in this version; move between devices with backup files. The repository layer is the place to add a sync backend.

## اختصارات / Shortcuts

`Ctrl/⌘+S` save · `Ctrl+Shift+S` named checkpoint · `Ctrl+F` find & replace · `Ctrl+Shift+F` global search · `Ctrl+.` focus mode · `Ctrl+Alt+S` / `Ctrl+Alt+I` toggle panels · `Ctrl+Alt+N` new scene · `Ctrl+Alt+↑/↓` previous/next scene · `Ctrl+Enter` scene break · `Ctrl+Shift+D` dialogue · `Alt+1…9` project sections.

## الحسابات والمزامنة / Accounts & sync (optional)

Username + password accounts with end-to-end encrypted sync between devices, on [Supabase](https://supabase.com) (free tier).

1. Create a Supabase project. In **SQL Editor**, run `supabase/setup.sql`.
2. **Authentication → Sign In / Providers → Email**: turn **Confirm email** off (usernames are mapped to internal addresses; no email is sent).
3. Provide `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API) as build environment variables (e.g. in Cloudflare Pages → Settings → Variables), or in `src/cloud/config.ts`. The anon key is public by design; access is enforced by Row Level Security.
4. Create your account in the app, then make yourself admin (see the last line of `setup.sql`). Admins see aggregate numbers only at `#/admin`.

Every record is encrypted in the browser (AES-GCM) with a random data key; the server stores that key only wrapped with a key derived from the user's password (PBKDF2, 310k iterations). Neither the server nor its owner can read novels. Consequence: there is no password reset — a forgotten password makes the cloud copy unrecoverable (local copies are unaffected). Version history stays on each device.
