/**
 * Building the lines the muṣḥaf page draws.
 *
 * SACRED-CONTENT RULE: every Arabic string in the result is a slice of the
 * content package's own text — split on whitespace and nothing else. Nothing
 * here writes, completes, repairs, reorders or transliterates a word.
 *
 * HONESTY: the layout package records this muṣḥaf's line breaks as
 * `not_yet_recorded`, so lines are packed at a fixed width and `linesAreMeasured`
 * says so. A packed line is not a muṣḥaf line, and a screen that pretends
 * otherwise teaches a page shape the learner will not find in print.
 *
 * Pure: no I/O — the caller loads the āyāt from the content package and hands
 * them in.
 */

import type { InkDepth, MushafLine, MushafWord, InkWordState } from "@/modules/design/ui/mushaf/types";

/** Words per packed line, while the layout file has no measured breaks. */
export const PACKED_WORDS_PER_LINE = 7;

export interface AyahWords {
  readonly ayah: number;
  /** Words as the content package holds them. Never authored here. */
  readonly words: readonly string[];
  /** Ink depth for this āyah, decided on the server from memory state. */
  readonly depth: InkDepth;
}

export interface PageModelInput {
  readonly ayahs: readonly AyahWords[];
  /** Measured line breaks, when the layout package has them. */
  readonly measuredLines?: readonly (readonly number[])[] | undefined;
  readonly wordsPerLine?: number;
  /** `${ayah}:${index}` → state. The one moving mark, and the two server marks. */
  readonly wordStates?: ReadonlyMap<string, InkWordState> | undefined;
  /** `${ayah}:${index}` of words the scaffold reveals despite a depth of 0. */
  readonly revealed?: ReadonlySet<string> | undefined;
  /**
   * Reveal every word regardless of its depth.
   *
   * Ink depth and scaffold are different axes, and this is where they meet. A
   * learner LISTENING to a new āyah must see it — a page of blank spaces teaches
   * nothing — so the scaffold reveals what the depth has not yet earned. What was
   * earned is untouched: `revealed` changes what is shown, never `depth`.
   */
  readonly revealAll?: boolean | undefined;
}

export interface PageModel {
  readonly lines: readonly MushafLine[];
  /** False while the layout package has no measured breaks for this page. */
  readonly linesAreMeasured: boolean;
  readonly wordCount: number;
}

/**
 * Flatten the āyāt into words, then break them into lines.
 *
 * The end of each āyah is marked so the rosette follows the right word — that is
 * structural information from the corpus, not a decoration this module invents.
 */
export function buildPageModel(input: PageModelInput): PageModel {
  const perLine = Math.max(1, Math.trunc(input.wordsPerLine ?? PACKED_WORDS_PER_LINE));
  const words: MushafWord[] = [];

  for (const ayah of input.ayahs) {
    ayah.words.forEach((text, position) => {
      const index = position + 1;
      const key = `${ayah.ayah}:${index}`;
      const state = input.wordStates?.get(key);
      const revealed = input.revealAll === true || input.revealed?.has(key) === true;
      words.push({
        text,
        depth: ayah.depth,
        ayah: ayah.ayah,
        index,
        ...(state === undefined ? {} : { state }),
        ...(revealed ? { revealed: true } : {}),
        ...(index === ayah.words.length ? { endsAyah: true } : {}),
      });
    });
  }

  const lines: MushafLine[] = [];
  for (let at = 0; at < words.length; at += perLine) {
    const slice = words.slice(at, at + perLine);
    const first = slice[0];
    lines.push({
      words: slice,
      ...(first === undefined ? {} : { id: `l-${first.ayah}-${first.index}` }),
    });
  }

  return {
    lines,
    linesAreMeasured: input.measuredLines !== undefined,
    wordCount: words.length,
  };
}

/**
 * The lines for a scaffolded review.
 *
 * `blank` and `word_count` draw the words at depth 0 — the page keeps the words'
 * spaces, so the line does not reflow, and the learner sees the shape of what
 * they are being asked for without being shown it. `first_letters` is NOT done
 * here: slicing a word is the caller's business (see `firstLetterSlice`), and
 * doing it inside a page builder would put a text transformation on the muṣḥaf.
 */
export function hideForScaffold(ayahs: readonly AyahWords[]): readonly AyahWords[] {
  return ayahs.map((ayah) => ({ ...ayah, depth: 0 as InkDepth }));
}
