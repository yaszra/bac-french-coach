/**
 * Practice-session rules: the blank-page invariant and the scaffold ladder.
 *
 * The page begins blank in every session, even one where it filled
 * completely yesterday. Exposure is not memory, and a page that stays
 * filled would flatter the learner into believing otherwise.
 */
import type { ScaffoldLevel } from "./types.js";
import { SCAFFOLD_LADDER, CUE_FREE_LEVELS } from "./types.js";
import type { RetrievalAttempt } from "./evidence.js";
import { isIndependentRecall } from "./evidence.js";

export const SESSION_VERSION = "athar-session/1.0.0";

/** Words revealed on the page, by position. Empty at session start, always. */
export interface PageRevealState {
  /** Layout-token IDs currently visible. Never contains text. */
  revealedTokenIds: readonly string[];
}

/**
 * Every session starts here. There is no code path that restores a
 * previously filled page — this is the invariant, expressed as the only
 * available constructor.
 */
export function blankPage(): PageRevealState {
  return { revealedTokenIds: [] };
}

/**
 * Reveal a token because it was retrieved correctly. Revealing is a
 * *display* effect; it writes no learning evidence on its own.
 */
export function revealToken(
  page: PageRevealState,
  tokenId: string,
): PageRevealState {
  if (page.revealedTokenIds.includes(tokenId)) return page;
  return { revealedTokenIds: [...page.revealedTokenIds, tokenId] };
}

export interface LadderState {
  level: ScaffoldLevel;
  consecutiveCleanAtLevel: number;
  consecutiveFailuresAtLevel: number;
  /**
   * Rises by one each time this level is retreated to. Advancing then
   * costs more evidence, which is what makes oscillation impossible
   * rather than merely unlikely.
   */
  advanceThresholdAtLevel: number;
}

export const ladderParams = {
  baseAdvanceThreshold: 2,
  retreatThreshold: 2,
  maxAdvanceThreshold: 5,
} as const;

export function initialLadder(
  level: ScaffoldLevel = "full_tiles",
): LadderState {
  return {
    level,
    consecutiveCleanAtLevel: 0,
    consecutiveFailuresAtLevel: 0,
    advanceThresholdAtLevel: ladderParams.baseAdvanceThreshold,
  };
}

function indexOfLevel(level: ScaffoldLevel): number {
  return SCAFFOLD_LADDER.indexOf(level);
}

export interface LadderTransition {
  state: LadderState;
  changed: "advanced" | "retreated" | "held";
  /** Announced to the learner in words — cue withdrawal is never silent. */
  reason: string;
}

/**
 * Fold one attempt into the ladder.
 *
 * Only clean, unassisted attempts advance the ladder. An assisted correct
 * attempt holds position: it shows the learner can do it *with help*,
 * which is not evidence for removing help.
 */
export function applyAttemptToLadder(
  state: LadderState,
  attempt: RetrievalAttempt,
): LadderTransition {
  const idx = indexOfLevel(state.level);
  const assisted = attempt.assistance.length > 0;

  if (!attempt.correct) {
    const failures = state.consecutiveFailuresAtLevel + 1;
    if (failures >= ladderParams.retreatThreshold && idx > 0) {
      const nextLevel = SCAFFOLD_LADDER[idx - 1];
      if (!nextLevel) throw new Error("ladder index out of range");
      return {
        state: {
          level: nextLevel,
          consecutiveCleanAtLevel: 0,
          consecutiveFailuresAtLevel: 0,
          advanceThresholdAtLevel: Math.min(
            ladderParams.maxAdvanceThreshold,
            state.advanceThresholdAtLevel + 1,
          ),
        },
        changed: "retreated",
        reason: "More support added after two misses in a row.",
      };
    }
    return {
      state: {
        ...state,
        consecutiveCleanAtLevel: 0,
        consecutiveFailuresAtLevel: failures,
      },
      changed: "held",
      reason: "Staying at this level for another try.",
    };
  }

  if (assisted) {
    return {
      state: { ...state, consecutiveFailuresAtLevel: 0 },
      changed: "held",
      reason: "Correct with help — support stays for now.",
    };
  }

  const clean = state.consecutiveCleanAtLevel + 1;
  if (clean >= state.advanceThresholdAtLevel && idx < SCAFFOLD_LADDER.length - 1) {
    const nextLevel = SCAFFOLD_LADDER[idx + 1];
    if (!nextLevel) throw new Error("ladder index out of range");
    return {
      state: {
        level: nextLevel,
        consecutiveCleanAtLevel: 0,
        consecutiveFailuresAtLevel: 0,
        advanceThresholdAtLevel: ladderParams.baseAdvanceThreshold,
      },
      changed: "advanced",
      reason: `Some support removed after ${clean} clean recalls.`,
    };
  }

  return {
    state: {
      ...state,
      consecutiveCleanAtLevel: clean,
      consecutiveFailuresAtLevel: 0,
    },
    changed: "held",
    reason: "Clean recall recorded; one more before support is reduced.",
  };
}

/** Whether the learner has reached the cue-free zone of the ladder. */
export function isCueFree(level: ScaffoldLevel): boolean {
  return CUE_FREE_LEVELS.has(level);
}

/**
 * Whether an attempt should be forwarded to the scheduler.
 * The scheduler must only ever see independent recall.
 */
export function feedsScheduler(attempt: RetrievalAttempt): boolean {
  return isIndependentRecall(attempt);
}
