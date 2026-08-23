/**
 * The rebuild exercise's tray.
 *
 * The tray is re-scrambled after every placement. That is not decoration: a tray
 * whose order stays put lets a learner solve the āyah by remembering *positions*
 * in a row of tiles rather than the words themselves, and the resulting evidence
 * would be about the tray, not the memory.
 *
 * The shuffle is seeded, so a session replays identically in a test and a bug
 * report can be reproduced. Nothing here contains Arabic: tiles are referenced by
 * their index into the caller's own word list.
 *
 * Pure: no clock, no I/O, no ambient randomness.
 */

/** Word positions, 0-based, into the caller's word array. Never text. */
export type WordIndex = number;

export interface RebuildState {
  /** Correct order, as indices. `[0, 1, 2, …]` for an unshuffled passage. */
  readonly solution: readonly WordIndex[];
  /** What the learner has placed so far, in the order they placed it. */
  readonly placed: readonly WordIndex[];
  /** What is still in the tray, in its current (scrambled) order. */
  readonly tray: readonly WordIndex[];
  /** One observation per placement, in order. Observations only — no grade. */
  readonly placements: readonly { readonly index: number; readonly correct: boolean }[];
  readonly rescrambles: number;
  readonly seed: number;
}

/**
 * A small deterministic PRNG (mulberry32). Seeded by the caller so a session is
 * reproducible; never `Math.random`, which would make the evidence unrepeatable.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a supplied PRNG. Returns a new array; the input is untouched. */
export function shuffle<T>(items: readonly T[], random: () => number): readonly T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * A shuffle that will not hand back the original order.
 *
 * A tray that comes back identical looks broken and, worse, silently removes the
 * re-scramble the exercise depends on. With fewer than two tiles there is nothing
 * to scramble and the input is returned as it is — honestly, not by pretending.
 */
export function scramble<T>(items: readonly T[], random: () => number, attempts = 8): readonly T[] {
  if (items.length < 2) return [...items];
  let candidate = shuffle(items, random);
  for (let attempt = 0; attempt < attempts && sameOrder(items, candidate); attempt += 1) {
    candidate = shuffle(items, random);
  }
  if (sameOrder(items, candidate)) {
    // Deterministic last resort: swap the first two tiles.
    const out = [...candidate];
    const first = out[0];
    const second = out[1];
    if (first !== undefined && second !== undefined) {
      out[0] = second;
      out[1] = first;
    }
    return out;
  }
  return candidate;
}

function sameOrder<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, at) => item === right[at]);
}

export function startRebuild(wordCount: number, seed: number): RebuildState {
  const solution = Array.from({ length: Math.max(0, Math.trunc(wordCount)) }, (_, i) => i);
  return {
    solution,
    placed: [],
    tray: scramble(solution, mulberry32(seed)),
    placements: [],
    rescrambles: 0,
    seed,
  };
}

/**
 * Place a tile.
 *
 * A wrong tile is *recorded* and returned to the tray — the learner keeps going,
 * and the mistake survives in `placements` where the server can see it. The
 * client marks nothing as passed or failed; `correct` here means "this tile was
 * the next one in the passage", which is an observation about the tray.
 */
export function place(state: RebuildState, word: WordIndex): RebuildState {
  if (!state.tray.includes(word)) return state;
  const expected = state.solution[state.placed.length];
  const correct = expected === word;
  const placements = [...state.placements, { index: state.placed.length, correct }];
  const random = mulberry32(state.seed + placements.length);

  if (!correct) {
    return {
      ...state,
      placements,
      // The tray is re-scrambled even on a miss: position is never a clue.
      tray: scramble(state.tray, random),
      rescrambles: state.rescrambles + 1,
    };
  }

  const tray = state.tray.filter((item) => item !== word);
  return {
    ...state,
    placed: [...state.placed, word],
    tray: scramble(tray, random),
    placements,
    rescrambles: state.rescrambles + 1,
  };
}

export function isComplete(state: RebuildState): boolean {
  return state.placed.length === state.solution.length && state.solution.length > 0;
}

/** The evidence payload for `submitAttempt`. Observations only, by construction. */
export function rebuildEvidence(
  state: RebuildState,
  elapsedMs: number,
): {
  readonly exercise: "rebuild";
  readonly placements: readonly { readonly index: number; readonly correct: boolean }[];
  readonly rescrambles: number;
  readonly elapsedMs: number;
} {
  return {
    exercise: "rebuild",
    placements: state.placements,
    rescrambles: state.rescrambles,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

/* ------------------------------------------------------------------- gaps */

/**
 * Which words to blank for a gap fill.
 *
 * The gaps land on the *seams* the learner is weak at where the caller knows
 * them, and are spread evenly otherwise. A gap is never the first word of the
 * passage: with nothing before it there is nothing to retrieve from.
 */
export function chooseGaps(
  wordCount: number,
  count: number,
  seed: number,
  preferred: readonly number[] = [],
): readonly number[] {
  const total = Math.max(0, Math.trunc(wordCount));
  if (total < 2) return [];
  const wanted = Math.min(Math.max(1, Math.trunc(count)), total - 1);
  const chosen = new Set<number>();

  for (const index of preferred) {
    if (chosen.size >= wanted) break;
    if (Number.isInteger(index) && index >= 1 && index < total) chosen.add(index);
  }

  const random = mulberry32(seed);
  const rest = shuffle(
    Array.from({ length: total - 1 }, (_, i) => i + 1).filter((i) => !chosen.has(i)),
    random,
  );
  for (const index of rest) {
    if (chosen.size >= wanted) break;
    chosen.add(index);
  }
  return [...chosen].sort((a, b) => a - b);
}
