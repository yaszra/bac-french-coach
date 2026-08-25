/**
 * The onboarding checklist — real state, never a decorative progress bar.
 *
 * Five steps get a teacher from "signed up" to "a class doing work". Each one
 * is derived from a FACT the database can answer, so the list cannot drift
 * away from reality and cannot be ticked by pressing a button. If a step is
 * unfinished, it is unfinished because the thing itself has not happened.
 *
 * Two things are deliberately absent: a percentage (four of five is more
 * honest than 80%), and any notion of dismissing a step. The checklist
 * disappears on its own when the work is done.
 *
 * Pure: the caller reads the facts, this module decides what they mean.
 */

export const ONBOARDING_STEPS = [
  "account_created",
  "teacher_approved",
  "classroom_created",
  "code_shared",
  "first_assignment",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

/** The facts each step is derived from. Counts and booleans — no opinions. */
export type OnboardingFacts = {
  readonly hasAccount: boolean;
  /** A teacher role granted at a scope: someone let them in. */
  readonly hasTeacherGrant: boolean;
  readonly classroomCount: number;
  /** Learners enrolled across their classrooms — proof the code was shared. */
  readonly enrolledLearners: number;
  readonly assignmentCount: number;
};

export type OnboardingStepState = "done" | "current" | "waiting" | "blocked";

export type OnboardingStep = {
  readonly id: OnboardingStepId;
  readonly state: OnboardingStepState;
  /** The count behind the step, so "1 class" is visible, not just a tick. */
  readonly count: number | null;
};

export type OnboardingProgress = {
  readonly steps: readonly OnboardingStep[];
  readonly done: number;
  /** The denominator. Rendered as "3 of 5", never as a percentage. */
  readonly total: number;
  /** True once every step is done — the checklist then has nothing to say. */
  readonly complete: boolean;
  /** The one step to act on now, or null when there is nothing left. */
  readonly nextStep: OnboardingStepId | null;
};

function doneness(facts: OnboardingFacts): Readonly<Record<OnboardingStepId, boolean>> {
  return {
    account_created: facts.hasAccount,
    teacher_approved: facts.hasTeacherGrant,
    classroom_created: facts.classroomCount > 0,
    code_shared: facts.enrolledLearners > 0,
    first_assignment: facts.assignmentCount > 0,
  };
}

function countFor(step: OnboardingStepId, facts: OnboardingFacts): number | null {
  switch (step) {
    case "classroom_created":
      return facts.classroomCount;
    case "code_shared":
      return facts.enrolledLearners;
    case "first_assignment":
      return facts.assignmentCount;
    default:
      return null;
  }
}

/**
 * `teacher_approved` is the one step a teacher cannot do for themselves: an
 * admin has to grant it. It reads `waiting`, not `current`, so nobody sits
 * looking for a button that does not exist.
 */
const NOT_THEIRS_TO_DO: ReadonlySet<OnboardingStepId> = new Set<OnboardingStepId>([
  "teacher_approved",
]);

export function onboardingProgress(facts: OnboardingFacts): OnboardingProgress {
  const done = doneness(facts);
  const firstUnfinished = ONBOARDING_STEPS.find((step) => !done[step]) ?? null;

  const steps = ONBOARDING_STEPS.map((id): OnboardingStep => {
    const count = countFor(id, facts);
    if (done[id]) return { id, state: "done", count };
    if (id !== firstUnfinished) return { id, state: "blocked", count };
    return { id, state: NOT_THEIRS_TO_DO.has(id) ? "waiting" : "current", count };
  });

  const doneCount = steps.filter((step) => step.state === "done").length;
  return {
    steps,
    done: doneCount,
    total: ONBOARDING_STEPS.length,
    complete: firstUnfinished === null,
    nextStep: firstUnfinished,
  };
}
