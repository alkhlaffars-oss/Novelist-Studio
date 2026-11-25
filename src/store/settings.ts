import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { L } from '@/lib/labels';

export type Lang = 'ar' | 'en';
export type Theme = 'dark' | 'light' | 'system';
export type EditorFont = 'amiri' | 'naskh' | 'plex' | 'notosans';
export type AIProvider = 'anthropic' | 'openai' | 'compatible';

export interface ExportSettings {
  pageSize: 'A4' | 'A5' | 'Letter' | '6x9';
  marginMm: number;
  font: string; // font family name written into the document
  fontSize: number;
  lineSpacing: number;
  pageNumbers: boolean;
  coverPage: boolean;
  toc: boolean;
  chapterHeadings: boolean;
  sceneTitles: boolean;
  chapterPageBreak: boolean;
}

export interface Settings {
  lang: Lang;
  theme: Theme;
  accent: 'gold' | 'violet';
  uiScale: number;
  editorFont: EditorFont;
  editorFontSize: number;
  lineHeight: number;
  editorWidth: number; // max width in px
  paragraphIndent: boolean;
  spellcheck: boolean;
  typewriter: boolean;
  autosaveDelay: number;
  showSidebar: boolean;
  showInspector: boolean;
  goals: { daily: number; weekly: number; monthly: number };
  backup: { auto: boolean; keep: number; remindDays: number; lastDownloadAt?: number };
  ai: { provider: AIProvider; model: string; baseUrl: string; keyMode: 'session' | 'encrypted'; maxContextChars: number; effort: 'low' | 'medium' | 'high'; temperature: number };
  exportDefaults: ExportSettings;
  privacy: { aiEnabled: boolean };
  set: (patch: Partial<Omit<Settings, 'set'>>) => void;
}

export const DEFAULT_EXPORT: ExportSettings = {
  pageSize: 'A5',
  marginMm: 20,
  font: 'Amiri',
  fontSize: 13,
  lineSpacing: 1.6,
  pageNumbers: true,
  coverPage: true,
  toc: true,
  chapterHeadings: true,
  sceneTitles: false,
  chapterPageBreak: true,
};

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      lang: 'ar',
      theme: 'dark',
      accent: 'gold',
      uiScale: 1,
      editorFont: 'amiri',
      editorFontSize: 21,
      lineHeight: 1.9,
      editorWidth: 760,
      paragraphIndent: false,
      spellcheck: true,
      typewriter: false,
      autosaveDelay: 500,
      showSidebar: true,
      showInspector: false,
      goals: { daily: 1000, weekly: 6000, monthly: 25000 },
      backup: { auto: true, keep: 10, remindDays: 7 },
      ai: { provider: 'anthropic', model: 'claude-opus-5-5', baseUrl: '', keyMode: 'session', maxContextChars: 400000, effort: 'medium', temperature: 0.7 },
      exportDefaults: DEFAULT_EXPORT,
      privacy: { aiEnabled: true },
      set: (patch) => set(patch),
    }),
    {
      name: 'ns-settings',
      version: 2,
      migrate: (state, version) => {
        const s = state as Settings;
        if (version < 2 && s.exportDefaults) s.exportDefaults = { ...DEFAULT_EXPORT, ...s.exportDefaults, font: 'Amiri' };
        if (s.ai && !s.ai.effort) s.ai = { ...s.ai, effort: 'medium' };
        return s;
      },
    },
  ),
);

export const FONT_STACKS: Record<EditorFont, { css: string; label: L; docx: string }> = {
  amiri: { css: "Amiri, 'Noto Naskh Arabic', serif", label: { ar: 'أميري', en: 'Amiri' }, docx: 'Amiri' },
  naskh: { css: "'Noto Naskh Arabic', Amiri, serif", label: { ar: 'نوتو نسخ', en: 'Noto Naskh Arabic' }, docx: 'Noto Naskh Arabic' },
  plex: { css: "'IBM Plex Sans Arabic', sans-serif", label: { ar: 'آي بي إم بلكس', en: 'IBM Plex Sans Arabic' }, docx: 'IBM Plex Sans Arabic' },
  notosans: { css: "'Noto Sans Arabic', sans-serif", label: { ar: 'نوتو سانس', en: 'Noto Sans Arabic' }, docx: 'Noto Sans Arabic' },
};

/** Translation helper: inline bilingual strings keep each screen self-contained. */
export function useT() {
  const lang = useSettings((s) => s.lang);
  const t = (ar: string, en: string) => (lang === 'ar' ? ar : en);
  const l = (label: L | undefined) => (label ? label[lang] : '');
  return Object.assign(t, { lang, l, dir: lang === 'ar' ? ('rtl' as const) : ('ltr' as const) });
}

export const getLang = () => useSettings.getState().lang;
export const tr = (ar: string, en: string) => (getLang() === 'ar' ? ar : en);

/** Fonts offered for exported documents. Web fonts are bundled for PDF; for DOCX the font must exist on the reader's computer. */
export const EXPORT_FONTS: { name: string; css: string; bundled: boolean }[] = [
  { name: 'Amiri', css: "Amiri, 'Noto Naskh Arabic', serif", bundled: true },
  { name: 'Noto Naskh Arabic', css: "'Noto Naskh Arabic', Amiri, serif", bundled: true },
  { name: 'IBM Plex Sans Arabic', css: "'IBM Plex Sans Arabic', sans-serif", bundled: true },
  { name: 'Noto Sans Arabic', css: "'Noto Sans Arabic', sans-serif", bundled: true },
  { name: 'Traditional Arabic', css: "'Traditional Arabic', Amiri, serif", bundled: false },
  { name: 'Sakkal Majalla', css: "'Sakkal Majalla', Amiri, serif", bundled: false },
  { name: 'Arial', css: 'Arial, sans-serif', bundled: false },
  { name: 'Times New Roman', css: "'Times New Roman', serif", bundled: false },
];
