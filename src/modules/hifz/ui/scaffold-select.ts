/**
 * Choosing the support that is on screen.
 *
 * The memory engine's `scaffoldLevel` says what a learner's strength has earned.
 * This module layers the two things the engine does not know about:
 *
 *   · **Test mode.** In a test there is no scaffold and no hint, whatever the
 *     strength says. The support is `blank`, always, and hints are refused.
 *   · **The rung.** A rebuild puts every word in front of the learner by
 *     definition; a recall-first shows nothing until they commit. The exercise
 *     can only ever ask for LESS support than the strength earned, never more —
 *     otherwise a strong unit would be quietly made easier.
 *
 * The level travels to the server with the attempt, so the grader knows what was
 * on screen. That is the whole reason a client reports it: it is an observation
 * about the screen, not a claim about the learner.
 *
 * Pure: no clock of its own, no I/O.
 */

import {
  DEFAULT_SCAFFOLD_CONFIG,
  SCAFFOLD_LEVELS,
  scaffoldLevel,
  scaffoldRank,
  type ScaffoldConfig,
  type ScaffoldLevel,
} from "@/modules/memory/domain/scaffold";
import { DEFAULT_SCHEDULING_POLICY } from "@/modules/memory/domain/fsrs";
import type { MemoryState, SchedulingPolicy } from "@/modules/memory/domain/types";
import type { HifzExercise } from "../domain/exercises";

export type PracticeMode = "practice" | "test";

/**
 * The most support a rung may ever show, regardless of strength.
 *
 * `listen` is exposure: the page is open. `rebuild` and `gap_fill` put the words
 * on screen as tiles or around a gap, so the page itself carries no more than a
 * word count. Everything from `recall_first` upward is production: blank.
 */
export const EXERCISE_SCAFFOLD_CEILING: Readonly<Record<HifzExercise, ScaffoldLevel>> = {
  listen: "full_text",
  recall_first: "blank",
  rebuild: "word_count",
  gap_fill: "word_count",
  next_ayah_cue: "blank",
  connect_chain: "blank",
  oral_recitation: "blank",
};

export interface ScaffoldDecision {
  readonly level: ScaffoldLevel;
  /** Why this level and not the one the strength alone would have given. */
  readonly reasonKey:
    | "learner.scaffold.reason.test_mode"
    | "learner.scaffold.reason.exercise_floor"
    | "learner.scaffold.reason.strength";
  /** The level the learner's strength alone earned, before the rung clamped it. */
  readonly earned: ScaffoldLevel;
  readonly hintsAllowed: boolean;
}

export interface ScaffoldInput {
  readonly exercise: HifzExercise;
  readonly mode: PracticeMode;
  /** `undefined` when nothing is recorded — full support, by the engine's rule. */
  readonly state: MemoryState | undefined;
  readonly now: Date;
  readonly scheduling?: SchedulingPolicy;
  readonly config?: ScaffoldConfig;
}

/**
 * The support to show, and why.
 *
 * `min` in scaffold *rank* terms is the MORE supportive of two levels, so the
 * clamp below is "show no more than the rung allows".
 */
export function decideScaffold(input: ScaffoldInput): ScaffoldDecision {
  const scheduling = input.scheduling ?? DEFAULT_SCHEDULING_POLICY;
  const config = input.config ?? DEFAULT_SCAFFOLD_CONFIG;
  const earned =
    input.state === undefined
      ? "full_text"
      : scaffoldLevel(input.state, input.now, scheduling, config);

  if (input.mode === "test") {
    return {
      level: "blank",
      reasonKey: "learner.scaffold.reason.test_mode",
      earned,
      hintsAllowed: false,
    };
  }

  const ceiling = EXERCISE_SCAFFOLD_CEILING[input.exercise];
  const clamped = scaffoldRank(earned) >= scaffoldRank(ceiling) ? earned : ceiling;
  return {
    level: clamped,
    reasonKey:
      clamped === earned ? "learner.scaffold.reason.strength" : "learner.scaffold.reason.exercise_floor",
    earned,
    hintsAllowed: true,
  };
}

/* --------------------------------------------------------- what to render */

export type ScaffoldRender =
  | { readonly kind: "full_text" }
  /** Only the first letter of each word survives. The caller slices; nothing here authors Arabic. */
  | { readonly kind: "first_letters" }
  | { readonly kind: "word_count"; readonly words: number }
  | { readonly kind: "blank" };

/**
 * Turn a level into what the page should draw.
 *
 * SACRED-CONTENT: this returns a *shape*, never text. The caller slices the real
 * words from the content package; nothing here generates, completes or truncates
 * scripture on its own.
 */
export function renderPlanFor(level: ScaffoldLevel, wordCount: number): ScaffoldRender {
  switch (level) {
    case "full_text":
      return { kind: "full_text" };
    case "first_letters":
      return { kind: "first_letters" };
    case "word_count":
      return { kind: "word_count", words: Math.max(0, Math.trunc(wordCount)) };
    case "blank":
      return { kind: "blank" };
  }
}

/**
 * The first letter of a word, as a *slice* of the caller's own string.
 *
 * Arabic combining marks belong to the letter they sit on, so the slice takes the
 * base letter plus any marks that follow it. Nothing is substituted, normalised
 * or replaced: what comes back is a prefix of what went in, byte for byte.
 */
const COMBINING_MARK = /\p{Mn}/u;

export function firstLetterSlice(word: string): string {
  const characters = [...word];
  const head = characters[0];
  if (head === undefined) return "";
  let end = 1;
  while (end < characters.length) {
    const next = characters[end];
    if (next === undefined || !COMBINING_MARK.test(next)) break;
    end += 1;
  }
  return characters.slice(0, end).join("");
}

/** True when this rung shows the learner nothing until they have committed. */
export function hidesUntilCommitted(exercise: HifzExercise): boolean {
  return exercise === "recall_first" || exercise === "connect_chain";
}

/** Every level, most supportive first — for a settings list or a legend. */
export const SCAFFOLD_ORDER: readonly ScaffoldLevel[] = SCAFFOLD_LEVELS;
