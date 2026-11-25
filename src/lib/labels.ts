// Bilingual labels for enumerations and structured fields.
import type { ChapterStatus, NoteType, PlotStage, ProjectStatus, Relationship } from '@/db/types';

export type L = { ar: string; en: string };

export const PROJECT_STATUS: Record<ProjectStatus, L> = {
  idea: { ar: 'فكرة', en: 'Idea' },
  writing: { ar: 'قيد الكتابة', en: 'Writing' },
  paused: { ar: 'متوقفة', en: 'Paused' },
  complete: { ar: 'مكتملة', en: 'Complete' },
};

export const CHAPTER_STATUS: Record<ChapterStatus, L> = {
  idea: { ar: 'فكرة', en: 'Idea' },
  draft: { ar: 'مسودة', en: 'Draft' },
  revision: { ar: 'مراجعة', en: 'Revision' },
  complete: { ar: 'مكتمل', en: 'Complete' },
};

export const STATUS_COLOR: Record<ChapterStatus | ProjectStatus, string> = {
  idea: 'bg-faint/40',
  draft: 'bg-violet/70',
  writing: 'bg-violet/70',
  revision: 'bg-gold/80',
  paused: 'bg-muted/60',
  complete: 'bg-ok/80',
};

export const PLOT_STAGES: { key: PlotStage; label: L; hint: L }[] = [
  { key: 'premise', label: { ar: 'الفكرة الأساسية', en: 'Premise' }, hint: { ar: 'ما جوهر الحكاية؟', en: 'What is the story about?' } },
  { key: 'setup', label: { ar: 'البداية', en: 'Setup' }, hint: { ar: 'العالم الطبيعي للبطل', en: "The hero's ordinary world" } },
  { key: 'inciting', label: { ar: 'الحدث المحفز', en: 'Inciting incident' }, hint: { ar: 'ما يكسر التوازن', en: 'What breaks the balance' } },
  { key: 'rising', label: { ar: 'تصاعد الصراع', en: 'Rising action' }, hint: { ar: 'العقبات والتعقيدات', en: 'Obstacles and complications' } },
  { key: 'turning', label: { ar: 'نقطة التحول', en: 'Turning point' }, hint: { ar: 'قرار لا رجعة فيه', en: 'A point of no return' } },
  { key: 'midpoint', label: { ar: 'منتصف الرواية', en: 'Midpoint' }, hint: { ar: 'انقلاب في الفهم أو الهدف', en: 'A reversal of goal or understanding' } },
  { key: 'climax', label: { ar: 'الذروة', en: 'Climax' }, hint: { ar: 'المواجهة الكبرى', en: 'The final confrontation' } },
  { key: 'resolution', label: { ar: 'الانفراج', en: 'Resolution' }, hint: { ar: 'تبعات الذروة', en: 'Aftermath of the climax' } },
  { key: 'ending', label: { ar: 'النهاية', en: 'Ending' }, hint: { ar: 'الصورة الأخيرة', en: 'The final image' } },
];

export const NOTE_TYPES: Record<NoteType, L & { color: string }> = {
  idea: { ar: 'فكرة سريعة', en: 'Quick idea', color: 'text-gold' },
  dialogue: { ar: 'حوار محتمل', en: 'Possible dialogue', color: 'text-violet' },
  ending: { ar: 'نهاية بديلة', en: 'Alternate ending', color: 'text-rose-400' },
  future: { ar: 'مشهد مستقبلي', en: 'Future scene', color: 'text-sky-400' },
  quote: { ar: 'اقتباس', en: 'Quote', color: 'text-amber-300' },
  question: { ar: 'سؤال مفتوح', en: 'Open question', color: 'text-orange-400' },
  research: { ar: 'بحث ومراجع', en: 'Research', color: 'text-emerald-400' },
  unused: { ar: 'فكرة غير مستخدمة', en: 'Unused idea', color: 'text-muted' },
};

export const RELATION_KINDS: Record<Relationship['kind'], L & { color: string }> = {
  family: { ar: 'عائلة', en: 'Family', color: '#c9a96e' },
  love: { ar: 'حب', en: 'Love', color: '#d9778f' },
  friend: { ar: 'صداقة', en: 'Friendship', color: '#6fb39a' },
  ally: { ar: 'تحالف', en: 'Alliance', color: '#6f9fd9' },
  enemy: { ar: 'عداوة', en: 'Enmity', color: '#d96f6f' },
  work: { ar: 'عمل', en: 'Work', color: '#9d8ec7' },
  other: { ar: 'أخرى', en: 'Other', color: '#8a8a93' },
};

export type FieldDef = { key: string; label: L; long?: boolean; type?: 'text' | 'number' | 'select' | 'entity'; options?: { value: string; label: L }[] };

export const CHARACTER_FIELDS: { group: L; fields: FieldDef[] }[] = [
  {
    group: { ar: 'الهوية', en: 'Identity' },
    fields: [
      { key: 'aliases', label: { ar: 'الأسماء المستعارة', en: 'Aliases' } },
      { key: 'role', label: { ar: 'الدور في الرواية', en: 'Role' }, type: 'select', options: [
        { value: 'protagonist', label: { ar: 'بطل', en: 'Protagonist' } },
        { value: 'antagonist', label: { ar: 'خصم', en: 'Antagonist' } },
        { value: 'supporting', label: { ar: 'ثانوية', en: 'Supporting' } },
        { value: 'minor', label: { ar: 'عابرة', en: 'Minor' } },
      ] },
      { key: 'age', label: { ar: 'العمر', en: 'Age' }, type: 'number' },
      { key: 'gender', label: { ar: 'الجنس', en: 'Gender' } },
      { key: 'fate', label: { ar: 'الحالة', en: 'Status' }, type: 'select', options: [
        { value: 'alive', label: { ar: 'على قيد الحياة', en: 'Alive' } },
        { value: 'dead', label: { ar: 'متوفاة', en: 'Dead' } },
        { value: 'missing', label: { ar: 'مفقودة', en: 'Missing' } },
        { value: 'unknown', label: { ar: 'غير معروف', en: 'Unknown' } },
      ] },
    ],
  },
  {
    group: { ar: 'المظهر', en: 'Appearance' },
    fields: [
      { key: 'appearance', label: { ar: 'المظهر الخارجي', en: 'Appearance' }, long: true },
      { key: 'eyes', label: { ar: 'لون العينين', en: 'Eye color' } },
      { key: 'hair', label: { ar: 'لون الشعر', en: 'Hair color' } },
    ],
  },
  {
    group: { ar: 'الداخل', en: 'Inner life' },
    fields: [
      { key: 'personality', label: { ar: 'الشخصية والطباع', en: 'Personality' }, long: true },
      { key: 'strengths', label: { ar: 'نقاط القوة', en: 'Strengths' }, long: true },
      { key: 'weaknesses', label: { ar: 'نقاط الضعف', en: 'Weaknesses' }, long: true },
      { key: 'fears', label: { ar: 'المخاوف', en: 'Fears' }, long: true },
      { key: 'goals', label: { ar: 'الأهداف', en: 'Goals' }, long: true },
      { key: 'motivation', label: { ar: 'الدوافع', en: 'Motivation' }, long: true },
      { key: 'backstory', label: { ar: 'الماضي والخلفية', en: 'Backstory' }, long: true },
      { key: 'secrets', label: { ar: 'الأسرار', en: 'Secrets' }, long: true },
    ],
  },
  {
    group: { ar: 'في الرواية', en: 'In the story' },
    fields: [
      { key: 'arc', label: { ar: 'تطور الشخصية', en: 'Character arc' }, long: true },
      { key: 'firstScene', label: { ar: 'أول ظهور (مشهد)', en: 'First appearance (scene)' }, type: 'entity' },
      { key: 'lastScene', label: { ar: 'آخر ظهور (مشهد)', en: 'Last appearance (scene)' }, type: 'entity' },
      { key: 'deathScene', label: { ar: 'مشهد الوفاة/الاختفاء', en: 'Death/exit scene' }, type: 'entity' },
      { key: 'notes', label: { ar: 'ملاحظات الكاتب', en: "Writer's notes" }, long: true },
    ],
  },
];

export const LOCATION_FIELDS: FieldDef[] = [
  { key: 'description', label: { ar: 'الوصف', en: 'Description' }, long: true },
  { key: 'geography', label: { ar: 'الموقع الجغرافي', en: 'Geography' }, long: true },
  { key: 'history', label: { ar: 'التاريخ', en: 'History' }, long: true },
  { key: 'importance', label: { ar: 'الأهمية في القصة', en: 'Story significance' }, long: true },
  { key: 'firstScene', label: { ar: 'أول ظهور (مشهد)', en: 'First appearance (scene)' }, type: 'entity' },
  { key: 'notes', label: { ar: 'ملاحظات', en: 'Notes' }, long: true },
];

export const OBJECT_FIELDS: FieldDef[] = [
  { key: 'category', label: { ar: 'النوع', en: 'Kind' }, type: 'select', options: [
    { value: 'weapon', label: { ar: 'سلاح', en: 'Weapon' } },
    { value: 'book', label: { ar: 'كتاب', en: 'Book' } },
    { value: 'artifact', label: { ar: 'قطعة أثرية', en: 'Artifact' } },
    { value: 'letter', label: { ar: 'رسالة', en: 'Letter' } },
    { value: 'tool', label: { ar: 'أداة', en: 'Tool' } },
    { value: 'symbol', label: { ar: 'رمز ذو قيمة', en: 'Symbolic item' } },
    { value: 'other', label: { ar: 'أخرى', en: 'Other' } },
  ] },
  { key: 'description', label: { ar: 'الوصف', en: 'Description' }, long: true },
  { key: 'owner', label: { ar: 'المالك الحالي', en: 'Current owner' } },
  { key: 'origin', label: { ar: 'الأصل والتاريخ', en: 'Origin & history' }, long: true },
  { key: 'significance', label: { ar: 'الأهمية والرمزية', en: 'Significance' }, long: true },
  { key: 'firstScene', label: { ar: 'أول ظهور (مشهد)', en: 'First appearance (scene)' }, type: 'entity' },
  { key: 'notes', label: { ar: 'ملاحظات', en: 'Notes' }, long: true },
];

export const LORE_FIELDS: FieldDef[] = [
  { key: 'summary', label: { ar: 'الخلاصة', en: 'Summary' }, long: true },
  { key: 'details', label: { ar: 'التفاصيل', en: 'Details' }, long: true },
  { key: 'rules', label: { ar: 'القواعد والقيود', en: 'Rules & limits' }, long: true },
  { key: 'notes', label: { ar: 'ملاحظات', en: 'Notes' }, long: true },
];

export const DEFAULT_LORE_SECTIONS: { key: string; label: L }[] = [
  { key: 'history', label: { ar: 'التاريخ', en: 'History' } },
  { key: 'civilizations', label: { ar: 'الحضارات', en: 'Civilizations' } },
  { key: 'nations', label: { ar: 'الدول والممالك', en: 'Nations & kingdoms' } },
  { key: 'politics', label: { ar: 'الأنظمة السياسية', en: 'Political systems' } },
  { key: 'cultures', label: { ar: 'الثقافات', en: 'Cultures' } },
  { key: 'religions', label: { ar: 'الأديان والمعتقدات', en: 'Religions & beliefs' } },
  { key: 'laws', label: { ar: 'القوانين', en: 'Laws' } },
  { key: 'technology', label: { ar: 'التكنولوجيا', en: 'Technology' } },
  { key: 'magic', label: { ar: 'السحر والقوى الخارقة', en: 'Magic & powers' } },
  { key: 'creatures', label: { ar: 'الكائنات', en: 'Creatures' } },
  { key: 'glossary', label: { ar: 'المصطلحات', en: 'Glossary' } },
];

export const GENRES: L[] = [
  { ar: 'فانتازيا', en: 'Fantasy' },
  { ar: 'خيال علمي', en: 'Science fiction' },
  { ar: 'رواية تاريخية', en: 'Historical' },
  { ar: 'رواية اجتماعية', en: 'Literary / social' },
  { ar: 'غموض وجريمة', en: 'Mystery & crime' },
  { ar: 'إثارة وتشويق', en: 'Thriller' },
  { ar: 'رعب', en: 'Horror' },
  { ar: 'رومانسية', en: 'Romance' },
  { ar: 'مغامرة', en: 'Adventure' },
  { ar: 'أدب الناشئة', en: 'Young adult' },
  { ar: 'أخرى', en: 'Other' },
];
