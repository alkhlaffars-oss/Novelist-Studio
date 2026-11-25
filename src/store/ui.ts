import { create } from 'zustand';

/** Transient (non-persisted) UI state. */
export const useUI = create<{
  focus: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  moreOpen: boolean;
  set: (p: Partial<{ focus: boolean; saveState: 'idle' | 'saving' | 'saved' | 'error'; moreOpen: boolean }>) => void;
}>((set) => ({ focus: false, saveState: 'idle', moreOpen: false, set: (p) => set(p) }));
