/**
 * The vocabulary of the muṣḥaf page.
 *
 * SACRED-CONTENT RULE: `text` is always supplied by the caller from the
 * content package (`content/quran/`). No component in this folder ever
 * generates, completes, reconstructs or transliterates a single Arabic word.
 */

/**
 * Ink depth is the single progress language: 0 = not yet earned (the word's
 * space is blank), 1 = faint/due, 5 = held crisply. It is applied as the
 * ALPHA of the one ink colour — never a hue, never a highlight.
 */
export type InkDepth = 0 | 1 | 2 | 3 | 4 | 5;

export const INK_DEPTHS: readonly InkDepth[] = [0, 1, 2, 3, 4, 5];

export function isInkDepth(value: number): value is InkDepth {
  return Number.isInteger(value) && value >= 0 && value <= 5;
}

/** Clamp any server-sent strength onto the ladder. Never invents progress. */
export function toInkDepth(value: number): InkDepth {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 5) return 5;
  return rounded as InkDepth;
}

/**
 * Word state on the page.
 * - `idle`    nothing is happening to this word
 * - `active`  the word-sync indicator — the ONE moving mark allowed on the
 *             page: a restrained ink underline, never a colour wash
 * - `correct` server-confirmed this pass (a faint ink ground, no hue)
 * - `lapsed`  server-marked as slipped (a dotted ink underline, no hue)
 */
export type InkWordState = "idle" | "active" | "correct" | "lapsed";

/** One word of the page. Purely descriptive: no component decides mastery. */
export type MushafWord = {
  /** Arabic text, byte-for-byte from the content package. Never authored here. */
  readonly text: string;
  readonly depth: InkDepth;
  /** 1-based āyah number within its sūrah. */
  readonly ayah: number;
  /** 1-based position of the word within its āyah. */
  readonly index: number;
  readonly state?: InkWordState;
  /** Scaffolded review: show a depth-0 word without changing what was earned. */
  readonly revealed?: boolean;
  /** True when the āyah ends after this word — the rosette follows it. */
  readonly endsAyah?: boolean;
};

/** One printed line of the page, in muṣḥaf order. */
export type MushafLine = {
  readonly words: readonly MushafWord[];
  /** Stable id from the layout file when there is one. */
  readonly id?: string;
};

/** The address of a word on the page: `${ayah}:${index}`. */
export function wordKey(word: Pick<MushafWord, "ayah" | "index">): string {
  return `${word.ayah}:${word.index}`;
}
