/**
 * Word boundaries in the muṣḥaf text.
 *
 * SACRED-CONTENT RULE: this module NEVER changes a byte. It only decides where
 * one word ends and the next begins, and every string it returns is a contiguous
 * substring of the text it was given — spaces included.
 *
 * Why it exists: the KFGQPC ʿUthmānī corpus writes an open tanwīn followed by its
 * alif with a space between them, e.g. `…دࣰ ا`. Splitting naïvely on whitespace
 * therefore produces a stray bare alif as if it were a word of its own, which
 *
 *   · inflates every word count the evidence carries,
 *   · gives the rebuild tray a tile nobody can place meaningfully, and
 *   · draws a lone alif on the page where the print shows none.
 *
 * The fix is to rejoin that fragment to the word it belongs to, keeping the space
 * exactly where the corpus put it. Nothing is added, removed or substituted; the
 * concatenation of the result is byte-for-byte the original text.
 */

/** Tanwīn marks that may be followed by a detached alif in this edition. */
const TANWIN = /[ًࣰٌࣱٍࣲ]$/u;

/** A fragment that cannot stand as a word: a bare alif, with or without a madda. */
const DETACHED_ALIF = /^[اآٰ]$/u;

/**
 * Split an āyah into words.
 *
 * Whitespace runs are the boundaries, except where the token that follows one
 * cannot stand alone — then the run and the token are kept with the word before,
 * so the returned word is the original substring including its internal space.
 */
export function segmentWords(text: string): readonly string[] {
  const parts = text.split(/(\s+)/u);
  const words: string[] = [];
  let pendingSpace = "";

  for (const part of parts) {
    if (part === "") continue;
    if (/^\s+$/u.test(part)) {
      pendingSpace = part;
      continue;
    }
    const previous = words[words.length - 1];
    if (previous !== undefined && DETACHED_ALIF.test(part) && TANWIN.test(previous)) {
      // Byte-for-byte: previous + the very space the corpus wrote + the alif.
      words[words.length - 1] = `${previous}${pendingSpace}${part}`;
    } else {
      words.push(part);
    }
    pendingSpace = "";
  }

  return words;
}

/** How many words an āyah has, once boundaries are settled. */
export function wordCount(text: string): number {
  return segmentWords(text).length;
}
