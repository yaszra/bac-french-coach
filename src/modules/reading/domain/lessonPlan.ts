/**
 * Building one reading session.
 *
 * A session has three phases in a fixed shape — **intro → practice → review** — and a
 * budget in minutes that the tier decides. The plan is a list of concepts to work on,
 * each with the phase it belongs to, the activity that fits where the learner stands
 * on the ladder, and the reason it was chosen.
 *
 * ## What this planner will not do
 *
 * - **No hearts, no timers, no penalties.** The plan carries `guarantees`, whose
 *   fields are typed as literal `false`; a plan with a timer is not constructible.
 *   The `budgetMinutes` figure is an *estimate of how long this is*, so a parent can
 *   see what they are agreeing to. Nothing counts down, and nothing is lost by
 *   stopping early.
 * - **No padding.** When nothing is due, the plan comes back empty with a reason and
 *   its counts. "Nothing to do today" is a legitimate answer and the honest one; a
 *   session invented to keep a streak alive is neither.
 * - **No skipping the ladder.** A concept whose prerequisites are unmet is withheld
 *   with a reason rather than quietly introduced.
 *
 * The youngest learners (4–8) have a hard ten-minute ceiling. A caller may ask for
 * less; asking for more does not get more.
 *
 * Pure module: no I/O, no clock (the caller supplies `now`), no randomness.
 */

import { reason, type LearnerTier, type Reason } from "@/modules/memory/domain/types";

import { PRACTICE_GUARANTEES, type PracticeGuarantees } from "./activities";
import type { ConceptId } from "./concepts";
import type { ActivityKind, Presentation } from "./evidence";
import type { LadderState } from "./masteryLadder";
import type { SmartScore } from "./smartscore";

export const LESSON_PHASES = ["intro", "practice", "review"] as const;
export type LessonPhase = (typeof LESSON_PHASES)[number];

export interface ReadingTierPolicy {
  readonly sessionBudgetMinutes: number;
  /** How many never-before-seen concepts may be introduced in one sitting. */
  readonly maxNewConcepts: number;
  /** Estimated minutes per item, by phase. */
  readonly phaseMinutes: Readonly<Record<LessonPhase, number>>;
  /** Share of the budget reserved for review before anything new is added. */
  readonly reviewShare: number;
  /** Share of the budget an introduction may take. */
  readonly introShare: number;
  /** Days after which a secure concept with no explicit due date is offered again. */
  readonly reviewAfterDays: number;
}

/** The hard ceiling for learners aged 4–8, whatever the caller asks for. */
export const KIDS_CEILING_MINUTES = 10;

export const READING_TIER_POLICIES: Readonly<Record<LearnerTier, ReadingTierPolicy>> = {
  kids: {
    sessionBudgetMinutes: KIDS_CEILING_MINUTES,
    maxNewConcepts: 1,
    phaseMinutes: { intro: 3, practice: 1, review: 0.75 },
    reviewShare: 0.4,
    introShare: 0.35,
    reviewAfterDays: 10,
  },
  teen: {
    sessionBudgetMinutes: 20,
    maxNewConcepts: 3,
    phaseMinutes: { intro: 3, practice: 1.5, review: 1 },
    reviewShare: 0.4,
    introShare: 0.35,
    reviewAfterDays: 14,
  },
  adult: {
    sessionBudgetMinutes: 30,
    maxNewConcepts: 5,
    phaseMinutes: { intro: 3, practice: 2, review: 1 },
    reviewShare: 0.4,
    introShare: 0.35,
    reviewAfterDays: 21,
  },
};

export interface ConceptPlanState {
  readonly conceptId: ConceptId;
  readonly smartScore: SmartScore;
  readonly ladder: LadderState;
  /** Whether the lattice prerequisites are satisfied. The caller computes this. */
  readonly unlocked: boolean;
  /** Explicit due date, when the scheduler has one for this concept. */
  readonly dueAt?: Date;
}

export interface LessonPlanItem {
  readonly conceptId: ConceptId;
  readonly phase: LessonPhase;
  readonly activityKind: ActivityKind;
  readonly presentation: Presentation;
  readonly estimatedMinutes: number;
  readonly reason: Reason;
}

export interface WithheldConcept {
  readonly conceptId: ConceptId;
  readonly reason: Reason;
}

export interface LessonPlan {
  readonly tier: LearnerTier;
  readonly budgetMinutes: number;
  readonly plannedMinutes: number;
  readonly items: readonly LessonPlanItem[];
  readonly empty: boolean;
  /** Present exactly when `empty` is true, and never a euphemism. */
  readonly emptyReason: Reason | null;
  readonly withheld: readonly WithheldConcept[];
  /** Denominators for what the planner looked at. */
  readonly considered: {
    readonly concepts: number;
    readonly unlocked: number;
    readonly introCandidates: number;
    readonly practiceCandidates: number;
    readonly reviewCandidates: number;
  };
  readonly guarantees: PracticeGuarantees;
}

export interface LessonPlanInput {
  readonly tier: LearnerTier;
  readonly conceptStates: readonly ConceptPlanState[];
  readonly now: Date;
  /** Ask for a shorter session. Asking for a longer one has no effect. */
  readonly budgetMinutes?: number;
  readonly policy?: ReadingTierPolicy;
}

const MS_PER_DAY = 86_400_000;

/** The activity a concept needs, given where it stands on the ladder. */
function activityFor(state: ConceptPlanState): ActivityKind {
  return state.ladder.workingOn === "in_person" ? "production" : "recognition";
}

function presentationFor(state: ConceptPlanState, phase: LessonPhase): Presentation {
  if (phase === "intro") return "ordered";
  if (state.ladder.workingOn === "in_person") return "in_person";
  return phase === "review" ? "randomized" : state.ladder.workingOn;
}

/** Nothing has ever been recorded for this concept. */
function isNew(state: ConceptPlanState): boolean {
  return state.smartScore.denominator.attempts === 0;
}

/**
 * Whether the concept has come round again. An explicit `dueAt` from the scheduler
 * wins; without one, a concept untouched for the tier's interval is offered again.
 */
function isDue(state: ConceptPlanState, now: Date, policy: ReadingTierPolicy): boolean {
  if (isNew(state)) return false;
  if (state.dueAt !== undefined) return state.dueAt.getTime() <= now.getTime();
  const last = state.smartScore.lastEvidenceAt;
  if (last === null) return false;
  return (now.getTime() - last.getTime()) / MS_PER_DAY >= policy.reviewAfterDays;
}

function compareIds(a: ConceptId, b: ConceptId): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Build a session.
 *
 * Selection order is review first (the budget is reserved for it before anything new
 * is added), then introductions up to the tier's cap, then practice fills whatever is
 * left. The *emitted* order is intro → practice → review, which is the shape of the
 * lesson the learner sits through.
 */
export function buildLessonPlan(input: LessonPlanInput): LessonPlan {
  const policy = input.policy ?? READING_TIER_POLICIES[input.tier];
  const requested = input.budgetMinutes ?? policy.sessionBudgetMinutes;
  const tierCeiling =
    input.tier === "kids"
      ? Math.min(KIDS_CEILING_MINUTES, policy.sessionBudgetMinutes)
      : policy.sessionBudgetMinutes;
  const budgetMinutes = Math.max(0, Math.min(requested, tierCeiling));

  const withheld: WithheldConcept[] = [];
  const unlocked: ConceptPlanState[] = [];
  for (const state of input.conceptStates) {
    if (state.unlocked) {
      unlocked.push(state);
      continue;
    }
    withheld.push({
      conceptId: state.conceptId,
      reason: reason("reading.lesson.withheld.prerequisites_not_met", {
        conceptId: state.conceptId,
      }),
    });
  }

  // Three buckets, in this precedence: a concept that has come round again is
  // reviewed; one with unfinished ladder work is practised; one never seen is
  // introduced. A concept that is neither due nor unfinished is left alone — that is
  // what makes an empty plan possible, and honest.
  const introCandidates = unlocked
    .filter((state) => isNew(state))
    .sort((a, b) => compareIds(a.conceptId, b.conceptId));

  const practiceCandidates = unlocked
    .filter(
      (state) =>
        !isNew(state) && !isDue(state, input.now, policy) && !state.ladder.complete,
    )
    .sort((a, b) => {
      const aScore = a.smartScore.score ?? 0;
      const bScore = b.smartScore.score ?? 0;
      if (aScore !== bScore) return aScore - bScore;
      return compareIds(a.conceptId, b.conceptId);
    });

  const reviewCandidates = unlocked
    .filter((state) => isDue(state, input.now, policy))
    .sort((a, b) => {
      const aDue = a.dueAt?.getTime() ?? a.smartScore.lastEvidenceAt?.getTime() ?? 0;
      const bDue = b.dueAt?.getTime() ?? b.smartScore.lastEvidenceAt?.getTime() ?? 0;
      if (aDue !== bDue) return aDue - bDue;
      return compareIds(a.conceptId, b.conceptId);
    });

  const chosen: LessonPlanItem[] = [];
  let spent = 0;

  const take = (
    state: ConceptPlanState,
    phase: LessonPhase,
    cap: number,
    reasonKey: string,
  ): boolean => {
    const cost = policy.phaseMinutes[phase];
    if (spent + cost > cap + 1e-9 || spent + cost > budgetMinutes + 1e-9) return false;
    spent += cost;
    chosen.push({
      conceptId: state.conceptId,
      phase,
      activityKind: activityFor(state),
      presentation: presentationFor(state, phase),
      estimatedMinutes: cost,
      reason: reason(reasonKey, {
        conceptId: state.conceptId,
        rung: state.ladder.workingOn,
        score: state.smartScore.score ?? -1,
        attempts: state.smartScore.denominator.attempts,
      }),
    });
    return true;
  };

  // 1. Review, inside its reserved share — due work comes before anything new.
  const reviewCap = budgetMinutes * policy.reviewShare;
  for (const state of reviewCandidates) {
    if (!take(state, "review", reviewCap, "reading.lesson.reason.due_for_review")) break;
  }

  // 2. Introductions, capped by count and by share.
  const introCap = spent + budgetMinutes * policy.introShare;
  let introduced = 0;
  for (const state of introCandidates) {
    if (introduced >= policy.maxNewConcepts) {
      withheld.push({
        conceptId: state.conceptId,
        reason: reason("reading.lesson.withheld.new_concept_cap", {
          conceptId: state.conceptId,
          maxNewConcepts: policy.maxNewConcepts,
        }),
      });
      continue;
    }
    if (!take(state, "intro", introCap, "reading.lesson.reason.new_concept")) {
      withheld.push({
        conceptId: state.conceptId,
        reason: reason("reading.lesson.withheld.session_budget", {
          conceptId: state.conceptId,
          budgetMinutes,
        }),
      });
      continue;
    }
    introduced += 1;
  }

  // 3. Practice fills whatever is left.
  for (const state of practiceCandidates) {
    if (!take(state, "practice", budgetMinutes, "reading.lesson.reason.still_emerging")) {
      withheld.push({
        conceptId: state.conceptId,
        reason: reason("reading.lesson.withheld.session_budget", {
          conceptId: state.conceptId,
          budgetMinutes,
        }),
      });
    }
  }

  const phaseOrder: Readonly<Record<LessonPhase, number>> = { intro: 0, practice: 1, review: 2 };
  const items = [...chosen].sort((a, b) => {
    if (phaseOrder[a.phase] !== phaseOrder[b.phase]) return phaseOrder[a.phase] - phaseOrder[b.phase];
    return compareIds(a.conceptId, b.conceptId);
  });

  const considered = {
    concepts: input.conceptStates.length,
    unlocked: unlocked.length,
    introCandidates: introCandidates.length,
    practiceCandidates: practiceCandidates.length,
    reviewCandidates: reviewCandidates.length,
  } as const;

  const emptyReason =
    items.length > 0
      ? null
      : budgetMinutes <= 0
        ? reason("reading.lesson.empty.no_time_budgeted", { tier: input.tier, budgetMinutes })
        : input.conceptStates.length === 0
          ? reason("reading.lesson.empty.no_concepts_assigned", { tier: input.tier })
          : unlocked.length === 0
            ? reason("reading.lesson.empty.all_prerequisites_pending", {
                tier: input.tier,
                concepts: input.conceptStates.length,
              })
            : reason("reading.lesson.empty.nothing_due", {
                tier: input.tier,
                unlocked: unlocked.length,
                introCandidates: introCandidates.length,
                practiceCandidates: practiceCandidates.length,
                reviewCandidates: reviewCandidates.length,
              });

  return {
    tier: input.tier,
    budgetMinutes,
    plannedMinutes: Math.round(spent * 100) / 100,
    items,
    empty: items.length === 0,
    emptyReason,
    withheld,
    considered,
    guarantees: PRACTICE_GUARANTEES,
  };
}
