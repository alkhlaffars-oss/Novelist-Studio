import type { L } from '@/lib/labels';

/** Base instructions: grounded, honest about uncertainty, never rewrites the manuscript on its own. */
export function systemPrompt(lang: 'ar' | 'en') {
  return `You are a senior literary editor and story analyst working inside Novelist Studio, a novel-writing app. You help the writer with the novel described in the provided context.

Rules you always follow:
1. Ground every factual claim about the novel in the provided material only. When you state a fact from the text, cite where it comes from using the chapter/scene labels as they appear in the context, e.g. [الفصل 2 «...» · المشهد 1].
2. Clearly separate three kinds of statements: "مؤكد من النص" (confirmed by the text/bible), "استنتاج" (a reasonable inference — say what it rests on), and "اقتراح" (your creative suggestion). Never present a guess or suggestion as an established fact.
3. If the provided material does not contain the answer, say so plainly ("لا تتوفر معلومات كافية في المواد المتاحة") instead of inventing characters, events or details. Note when parts of the manuscript were omitted for length.
4. Never claim you changed the manuscript. You only suggest; the writer decides.
5. Respect the novel's language, voice and style. Answer in ${lang === 'ar' ? 'Arabic' : 'English'} unless the writer writes to you in another language. Use clear headings and short lists; avoid filler.`;
}

export interface AITask {
  id: string;
  group: 'analysis' | 'writing';
  label: L;
  prompt: string; // instruction sent with the request
  needsSelection?: boolean; // operates on selected text / current scene
  rewrite?: boolean; // output is replacement text (shown as a diff with accept/reject)
}

export const TASKS: AITask[] = [
  { id: 'plot', group: 'analysis', label: { ar: 'تحليل الحبكة', en: 'Plot analysis' }, prompt: 'Analyse the plot: structure, causal chain, stakes, turning points and how well each act works. Point to specific chapters/scenes. End with the 3 most valuable improvements.' },
  { id: 'characters', group: 'analysis', label: { ar: 'تحليل الشخصيات', en: 'Character analysis' }, prompt: 'Analyse the main characters: goals, motivations, contradictions, distinctiveness of voice, and whether their actions are consistent with their established traits. Cite scenes.' },
  { id: 'arcs', group: 'analysis', label: { ar: 'تطور الشخصيات', en: 'Character arcs' }, prompt: 'Trace each major character arc across the chapters: starting state, key changes (with scene references), and whether the change is earned. Flag flat or abrupt arcs.' },
  { id: 'consistency', group: 'analysis', label: { ar: 'اكتشاف التناقضات', en: 'Find contradictions' }, prompt: 'Find continuity errors and contradictions: physical details, ages, dates, places, who knows what and when (characters knowing information they could not know yet), objects appearing before being introduced, and broken world rules. For each: quote or cite both conflicting places, explain the conflict, and rate confidence (high/medium/low). Do not report things you cannot point to in the text.' },
  { id: 'holes', group: 'analysis', label: { ar: 'الثغرات السردية', en: 'Plot holes' }, prompt: 'Identify narrative gaps and plot holes: unexplained events, unmotivated decisions, setups without payoffs, questions the novel raises but never answers. Cite where each question is raised.' },
  { id: 'weak', group: 'analysis', label: { ar: 'المشاهد الضعيفة', en: 'Weak scenes' }, prompt: 'Identify the weakest scenes (no clear goal/conflict/change, redundancy, low tension). For each, cite the scene, explain why, and suggest a concrete fix.' },
  { id: 'pacing', group: 'analysis', label: { ar: 'الإيقاع السردي', en: 'Pacing' }, prompt: 'Analyse pacing chapter by chapter: where it drags, where it rushes, balance of action/dialogue/description/reflection. Use word counts and scene structure where helpful.' },
  { id: 'dialogue', group: 'analysis', label: { ar: 'تحليل الحوار', en: 'Dialogue analysis' }, prompt: 'Analyse the dialogue: naturalness, distinct character voices, subtext, exposition dumps, and register consistency. Quote short examples with locations.' },
  { id: 'world', group: 'analysis', label: { ar: 'اتساق العالم الروائي', en: 'World consistency' }, prompt: 'Evaluate the consistency of the fictional world: do events in the text respect the rules, history, technology/magic and cultures recorded in the bible? List violations with citations, and rules that are never used.' },
  { id: 'reader', group: 'analysis', label: { ar: 'ماذا يعرف القارئ حتى الآن؟', en: 'What does the reader know so far?' }, prompt: 'Based only on the manuscript up to the current scene, summarise what the reader knows so far: key facts, revealed secrets, open questions, and what the reader does NOT yet know (but the bible reveals). Cite scenes.' },
  { id: 'open-questions', group: 'analysis', label: { ar: 'أسئلة لم تُجب عنها', en: 'Unanswered questions' }, prompt: 'List every question, mystery or promise the novel has raised so far and whether it has been answered. For answered ones cite where; for unanswered ones cite where they were raised.' },

  { id: 'scene-ideas', group: 'writing', label: { ar: 'أفكار للمشهد', en: 'Scene ideas' }, needsSelection: true, prompt: 'Suggest 3–5 distinct directions for how this scene could develop or what the next scene could be. Each idea must fit the established characters and world; mark each clearly as a suggestion.' },
  { id: 'dialogue-ideas', group: 'writing', label: { ar: 'اقتراح حوار', en: 'Suggest dialogue' }, needsSelection: true, prompt: 'Suggest a short dialogue exchange that could fit at this point, in the voices of the characters involved. Offer two alternatives with different tones. Mark them as suggestions.' },
  { id: 'endings', group: 'writing', label: { ar: 'نهايات بديلة', en: 'Alternative endings' }, prompt: 'Propose 3 alternative endings consistent with the setups in the novel. For each: what happens, which threads it resolves, emotional effect, and risks.' },
  { id: 'improve', group: 'writing', label: { ar: 'تحسين الصياغة', en: 'Improve phrasing' }, needsSelection: true, rewrite: true, prompt: 'Rewrite the given passage to improve flow, rhythm and precision while preserving meaning, voice, point of view, tense and all story facts. Return ONLY the revised passage, with the same paragraph breaks, no commentary.' },
  { id: 'grammar', group: 'writing', label: { ar: 'تصحيح لغوي', en: 'Fix grammar & spelling' }, needsSelection: true, rewrite: true, prompt: 'Correct spelling, grammar, punctuation and (for Arabic) hamza/ta marbuta/alef maqsura errors in the given passage. Change nothing else — keep wording and style. Return ONLY the corrected passage.' },
  { id: 'repetition', group: 'writing', label: { ar: 'تقليل التكرار', en: 'Reduce repetition' }, needsSelection: true, rewrite: true, prompt: 'Reduce repeated words and phrases in the given passage using natural variation, keeping meaning, voice and facts unchanged. Return ONLY the revised passage.' },
  { id: 'description', group: 'writing', label: { ar: 'تحسين الوصف', en: 'Enrich description' }, needsSelection: true, rewrite: true, prompt: 'Enrich the descriptive writing of the given passage with concrete sensory detail consistent with the established setting, without adding new plot events or changing facts. Keep similar length (at most ~30% longer). Return ONLY the revised passage.' },
  { id: 'feedback', group: 'writing', label: { ar: 'ملاحظات على المقطع', en: 'Feedback on passage' }, needsSelection: true, prompt: 'Give an editor’s feedback on the given passage: what works, what does not, and specific line-level suggestions (quote the line, then the suggestion). Do not rewrite the whole passage.' },
];
