/**
 * The shape of a learner's path through the Qāʿidah.
 *
 * Twelve lessons, each a handful of concepts, each concept carrying a SmartScore and a
 * rung. This module turns that into the three things the overview screen needs: where
 * the learner is, what the single next action is, and — for every lesson — an honest
 * count that never rounds an absence up into a zero.
 *
 * The honesty rule shows up here as a type: `LessonProgress.recorded` is a count with
 * its denominator, and `state` has a `not_yet_recorded` member, so a lesson nobody has
 * touched cannot be rendered as "0% complete". It has no percentage. It has no
 * evidence.
 *
 * Pure module: no I/O, no clock, no randomness.
 */

import type { ConceptId } from "../domain/concepts";
import type { ConceptPlanState } from "../domain/lessonPlan";

export interface LessonSummary {
  readonly id: string;
  readonly order: number;
  readonly kind: string;
  readonly titleKey: string;
  readonly prerequisites: readonly string[];
  readonly conceptIds: readonly ConceptId[];
}

export const LESSON_STATES = ["not_yet_recorded", "in_progress", "secure"] as const;
export type LessonState = (typeof LESSON_STATES)[number];

export interface LessonProgress {
  readonly lesson: LessonSummary;
  readonly state: LessonState;
  /** Concepts with any evidence at all, over the concepts in the lesson. */
  readonly recorded: number;
  /** Concepts whose SmartScore reads "secure", over the same denominator. */
  readonly secure: number;
  readonly total: number;
  /** Concepts due for review right now. */
  readonly due: number;
  /** Every prerequisite lesson is secure, and every concept's lattice edge is met. */
  readonly unlocked: boolean;
  /** Locked because of these lessons. Empty when unlocked. */
  readonly blockedBy: readonly string[];
}

export interface ReadingPathShape {
  readonly lessons: readonly LessonProgress[];
  /** Concepts with evidence, over every concept the path teaches. */
  readonly recordedConcepts: number;
  readonly totalConcepts: number;
  readonly dueConcepts: number;
  /** The lesson to open next: the first unlocked one that is not yet secure. */
  readonly nextLesson: LessonProgress | null;
  /** The one obvious next action. `nothing_due` is a legitimate answer. */
  readonly next:
    | { readonly kind: "review"; readonly due: number }
    | { readonly kind: "lesson"; readonly lesson: LessonProgress }
    | { readonly kind: "nothing_due" };
}

function isDue(state: ConceptPlanState, now: Date): boolean {
  return state.dueAt !== undefined && state.dueAt.getTime() <= now.getTime();
}

/**
 * Fold the lessons and the concept states together.
 *
 * A lesson is `secure` only when every one of its concepts is: partial evidence is
 * partial, and it is reported as the count it is.
 */
export function shapeReadingPath(
  lessons: readonly LessonSummary[],
  states: readonly ConceptPlanState[],
  now: Date,
): ReadingPathShape {
  const byConcept = new Map(states.map((state) => [state.conceptId, state]));
  const ordered = [...lessons].sort((a, b) => a.order - b.order);

  const secureLessons = new Set<string>();
  const progress: LessonProgress[] = [];

  for (const lesson of ordered) {
    const conceptStates = lesson.conceptIds.flatMap((conceptId) => {
      const state = byConcept.get(conceptId);
      return state === undefined ? [] : [state];
    });

    const total = lesson.conceptIds.length;
    const recorded = conceptStates.filter(
      (state) => state.smartScore.denominator.attempts > 0,
    ).length;
    const secure = conceptStates.filter((state) => state.smartScore.state === "secure").length;
    const due = conceptStates.filter((state) => isDue(state, now)).length;

    const blockedBy = lesson.prerequisites.filter((id) => !secureLessons.has(id));
    const latticeReady = conceptStates.every((state) => state.unlocked);
    const unlocked = blockedBy.length === 0 && (conceptStates.length === 0 || latticeReady);

    const state: LessonState =
      recorded === 0 ? "not_yet_recorded" : secure === total && total > 0 ? "secure" : "in_progress";
    if (state === "secure") secureLessons.add(lesson.id);

    progress.push({ lesson, state, recorded, secure, total, due, unlocked, blockedBy });
  }

  const totalConcepts = progress.reduce((sum, entry) => sum + entry.total, 0);
  const recordedConcepts = progress.reduce((sum, entry) => sum + entry.recorded, 0);
  const dueConcepts = progress.reduce((sum, entry) => sum + entry.due, 0);
  const nextLesson = progress.find((entry) => entry.unlocked && entry.state !== "secure") ?? null;

  return {
    lessons: progress,
    recordedConcepts,
    totalConcepts,
    dueConcepts,
    nextLesson,
    next:
      dueConcepts > 0
        ? { kind: "review", due: dueConcepts }
        : nextLesson === null
          ? { kind: "nothing_due" }
          : { kind: "lesson", lesson: nextLesson },
  };
}
