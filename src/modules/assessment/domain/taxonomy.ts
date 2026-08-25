/**
 * The correction taxonomy a teacher uses while listening.
 *
 * Eleven categories, chosen so that a teacher can tap one in the half-second
 * between a slip and the next word, and so that each one means something
 * different to the memory graph. A correction is never free text alone: the
 * category is what feeds the graph, the note is for the human.
 *
 * Categories are split into two families, because they have different
 * consequences:
 *   · MEMORY errors say the learner does not yet hold this passage.
 *   · ARTICULATION errors say they hold it but are not yet saying it correctly.
 * Only memory errors lapse a unit. A learner with a tajwīd slip has not
 * forgotten the āyah, and treating it as forgetting would bury them in reviews.
 */
export type CorrectionFamily = "memory" | "articulation";

export type CorrectionCategory =
  // memory
  | "hesitation"        // stopped, needed a moment, then continued
  | "prompted"          // needed the first word before they could continue
  | "wrong_word"        // said a different word
  | "skipped_word"      // dropped a word
  | "skipped_ayah"      // dropped a whole āyah
  | "wrong_join"        // went to the wrong following āyah (the mutashābih trap)
  | "repeated"          // repeated a phrase while searching
  // articulation
  | "makhraj"           // articulation point
  | "sifah"             // letter quality
  | "madd_length"       // vowel-lengthening duration
  | "ghunnah_idgham";   // nasalisation and assimilation rules

export type CorrectionDefinition = {
  readonly category: CorrectionCategory;
  readonly family: CorrectionFamily;
  /** i18n key; the UI never contains the label text itself. */
  readonly labelKey: string;
  /** How strongly this correction says "not yet held" (0..1). */
  readonly memoryWeight: number;
  /** Which skill-graph relation this correction reinforces, if any. */
  readonly graphRelation?: "mutashabih_of" | "misconception_of" | "rule_ayah";
};

export const CORRECTIONS: readonly CorrectionDefinition[] = [
  { category: "hesitation", family: "memory", labelKey: "correction.hesitation", memoryWeight: 0.3 },
  { category: "prompted", family: "memory", labelKey: "correction.prompted", memoryWeight: 0.7 },
  { category: "wrong_word", family: "memory", labelKey: "correction.wrongWord", memoryWeight: 0.8 },
  { category: "skipped_word", family: "memory", labelKey: "correction.skippedWord", memoryWeight: 0.6 },
  { category: "skipped_ayah", family: "memory", labelKey: "correction.skippedAyah", memoryWeight: 1 },
  {
    category: "wrong_join",
    family: "memory",
    labelKey: "correction.wrongJoin",
    memoryWeight: 1,
    graphRelation: "mutashabih_of",
  },
  { category: "repeated", family: "memory", labelKey: "correction.repeated", memoryWeight: 0.4 },
  {
    category: "makhraj",
    family: "articulation",
    labelKey: "correction.makhraj",
    memoryWeight: 0,
    graphRelation: "misconception_of",
  },
  {
    category: "sifah",
    family: "articulation",
    labelKey: "correction.sifah",
    memoryWeight: 0,
    graphRelation: "misconception_of",
  },
  {
    category: "madd_length",
    family: "articulation",
    labelKey: "correction.maddLength",
    memoryWeight: 0,
    graphRelation: "rule_ayah",
  },
  {
    category: "ghunnah_idgham",
    family: "articulation",
    labelKey: "correction.ghunnahIdgham",
    memoryWeight: 0,
    graphRelation: "rule_ayah",
  },
];

const BY_CATEGORY = new Map(CORRECTIONS.map((c) => [c.category, c]));

export function correctionDefinition(category: CorrectionCategory): CorrectionDefinition {
  const definition = BY_CATEGORY.get(category);
  if (!definition) throw new Error(`unknown correction category: ${category}`);
  return definition;
}

export function isMemoryError(category: CorrectionCategory): boolean {
  return correctionDefinition(category).family === "memory";
}

/** A position on the page. References only — never the word itself. */
export type CorrectionMark = {
  readonly category: CorrectionCategory;
  readonly sura: number;
  readonly ayah: number;
  readonly wordIndex?: number;
  /** For a wrong join: where they went instead. Feeds the mutashābihāt index. */
  readonly wentTo?: { readonly sura: number; readonly ayah: number };
  readonly note?: string;
};
