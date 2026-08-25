/**
 * Assembling what a reading screen needs.
 *
 * Three reads, and they all follow the same shape: fetch a learner's evidence once,
 * hand it to the pure engines, and carry their answers — reasons and denominators
 * included — out unchanged. Nothing here decides mastery, and nothing here writes.
 */

import { conceptById, type ConceptId } from "../domain/concepts";
import { resolveTalqin, type TalqinResolution } from "../domain/talqin";
import type { ConceptPlanState } from "../domain/lessonPlan";
import type { LearnerTier } from "@/modules/memory/domain/types";
import { conceptStatesFrom, readingSnapshot } from "../repo/reading-repo";
import { qaidahLesson, qaidahLessons, type QaidahLesson } from "../repo/lesson-content";
import { talqinAssetsFor, EMPTY_TALQIN_LIBRARY } from "../repo/talqin-repo";
import { shapeReadingPath, type ReadingPathShape } from "../ui/path-shape";
import { buildReadingSession, type ActivityPayload } from "../ui/session-plan";
import type { LessonPlan } from "../domain/lessonPlan";

/** Every concept the primer teaches, once, in teaching order. */
export function pathConceptIds(lessons: readonly QaidahLesson[] = qaidahLessons()): readonly ConceptId[] {
  const seen = new Set<ConceptId>();
  const ids: ConceptId[] = [];
  for (const lesson of lessons) {
    for (const conceptId of lesson.conceptIds) {
      if (seen.has(conceptId)) continue;
      seen.add(conceptId);
      ids.push(conceptId);
    }
  }
  return ids;
}

export interface ReadingPathView {
  readonly now: Date;
  readonly tier: LearnerTier;
  readonly hasTeacher: boolean;
  readonly path: ReadingPathShape;
  readonly states: readonly ConceptPlanState[];
  /** True when the lesson package itself is missing — a state, not an empty page. */
  readonly packageMissing: boolean;
}

export async function getReadingPath(
  organizationId: string,
  learnerUserId: string,
  tier: LearnerTier,
  now: Date = new Date(),
): Promise<ReadingPathView> {
  const lessons = qaidahLessons();
  const conceptIds = pathConceptIds(lessons);
  if (conceptIds.length === 0) {
    return {
      now,
      tier,
      hasTeacher: false,
      path: shapeReadingPath([], [], now),
      states: [],
      packageMissing: true,
    };
  }

  const snapshot = await readingSnapshot(organizationId, learnerUserId, conceptIds, now);
  const states = conceptStatesFrom(conceptIds, snapshot);

  return {
    now,
    tier,
    hasTeacher: snapshot.hasTeacher,
    path: shapeReadingPath(lessons, states, now),
    states,
    packageMissing: false,
  };
}

export interface ReadingSittingView {
  readonly now: Date;
  readonly tier: LearnerTier;
  readonly hasTeacher: boolean;
  readonly sessionId: string;
  readonly plan: LessonPlan;
  readonly items: readonly ActivityPayload[];
  readonly states: readonly ConceptPlanState[];
  /** One resolution per concept in the sitting, labelled or honestly absent. */
  readonly talqin: ReadonlyMap<ConceptId, TalqinResolution>;
  /** Where each resolved recording's bytes are served from. */
  readonly talqinSrc: ReadonlyMap<string, string>;
}

/**
 * A sitting on a set of concepts.
 *
 * `sessionId` is minted by the caller and travels inside every activity id, so the
 * observations of one sitting can be counted as one sitting later.
 */
export async function getReadingSitting(
  organizationId: string,
  learnerUserId: string,
  options: {
    readonly tier: LearnerTier;
    readonly conceptIds: readonly ConceptId[];
    readonly sessionId: string;
    readonly now?: Date;
    readonly budgetMinutes?: number;
  },
): Promise<ReadingSittingView> {
  const now = options.now ?? new Date();
  const snapshot = await readingSnapshot(organizationId, learnerUserId, options.conceptIds, now);
  const states = conceptStatesFrom(options.conceptIds, snapshot);

  const session = buildReadingSession({
    tier: options.tier,
    conceptStates: states,
    now,
    sessionId: options.sessionId,
    hasTeacher: snapshot.hasTeacher,
    ...(options.budgetMinutes === undefined ? {} : { budgetMinutes: options.budgetMinutes }),
  });

  const conceptsInSitting = [...new Set(session.items.map((item) => item.conceptId))];
  const library =
    conceptsInSitting.length === 0
      ? EMPTY_TALQIN_LIBRARY
      : await talqinAssetsFor(organizationId, conceptsInSitting);

  const talqin = new Map<ConceptId, TalqinResolution>(
    conceptsInSitting.map((conceptId) => [
      conceptId,
      resolveTalqin({ conceptId, learnerId: learnerUserId }, library.assets),
    ]),
  );

  return {
    now,
    tier: options.tier,
    hasTeacher: snapshot.hasTeacher,
    sessionId: options.sessionId,
    plan: session.plan,
    items: session.items,
    states,
    talqin,
    talqinSrc: library.srcById,
  };
}

/** The concepts of one lesson, or `null` when the package has no such lesson. */
export function lessonConcepts(lessonId: string): readonly ConceptId[] | null {
  const lesson = qaidahLesson(lessonId);
  return lesson === null ? null : lesson.conceptIds;
}

/** Concepts that have come round for review, weakest denominator first. */
export function dueConceptIds(view: ReadingPathView): readonly ConceptId[] {
  return view.states
    .filter((state) => state.dueAt !== undefined && state.dueAt.getTime() <= view.now.getTime())
    .sort((a, b) => (a.dueAt?.getTime() ?? 0) - (b.dueAt?.getTime() ?? 0))
    .map((state) => state.conceptId);
}

/** The talqīn for one concept on its own — the letters atlas asks for exactly this. */
export async function getTalqinFor(
  organizationId: string,
  learnerUserId: string,
  conceptIds: readonly ConceptId[],
): Promise<{
  readonly resolutions: ReadonlyMap<ConceptId, TalqinResolution>;
  readonly srcById: ReadonlyMap<string, string>;
}> {
  const known = conceptIds.filter((conceptId) => conceptById(conceptId) !== null);
  const library = known.length === 0 ? EMPTY_TALQIN_LIBRARY : await talqinAssetsFor(organizationId, known);
  return {
    resolutions: new Map(
      known.map((conceptId) => [
        conceptId,
        resolveTalqin({ conceptId, learnerId: learnerUserId }, library.assets),
      ]),
    ),
    srcById: library.srcById,
  };
}
