/**
 * One sitting, laid out.
 *
 * `buildLessonPlan` decides *what* a sitting should contain — which concepts, in which
 * phase, inside the tier's minutes. This module turns each of those decisions into the
 * activity the learner will actually see, and into the payload the client receives.
 *
 * ## What the client is given, and what it is not
 *
 * It is given the prompt and the choices. It is **not** given the answer: the payload
 * type has no field for one, and `toPayload` cannot emit one, because
 * `answerChoiceId` never leaves this module. When the learner picks a choice, the
 * server rebuilds the identical activity from the activity id and checks it there.
 *
 * Pure module: no I/O, no clock, no randomness — activity ids come in, and the same
 * ids always produce the same choices in the same order.
 */

import type { ConceptId } from "../domain/concepts";
import type { Presentation } from "../domain/evidence";
import {
  buildProductionActivity,
  buildRecognitionActivity,
  type ReadingActivity,
} from "../domain/activities";
import {
  buildLessonPlan,
  type LessonPhase,
  type LessonPlan,
  type LessonPlanInput,
  type LessonPlanItem,
} from "../domain/lessonPlan";
import type { LearnerTier } from "@/modules/memory/domain/types";
import { encodeActivityId } from "./activity-id";

/** How many choices a recognition item offers, by tier. Children get three. */
export const CHOICE_COUNT: Readonly<Record<LearnerTier, number>> = {
  kids: 3,
  teen: 4,
  adult: 4,
};

export interface ChoicePayload {
  readonly choiceId: string;
  readonly conceptId: ConceptId;
}

export interface ActivityPayload {
  readonly activityId: string;
  readonly conceptId: ConceptId;
  readonly kind: "recognition" | "production";
  readonly phase: LessonPhase;
  readonly presentation: Presentation;
  /** Bare codepoints — a letter, or a letter with one mark. Never a word. */
  readonly promptCodepoints: readonly string[];
  readonly choices: readonly ChoicePayload[];
  /** Who is expected to listen to a spoken answer. */
  readonly observedBy: "teacher" | "self";
  /** The planner's own "why this, now" — carried through unchanged. */
  readonly reasonKey: string;
  readonly reasonParams: Readonly<Record<string, string | number>>;
}

export interface SessionBuildInput extends LessonPlanInput {
  /** The sitting's id, minted once per sitting by the caller. */
  readonly sessionId: string;
  readonly hasTeacher: boolean;
}

export interface ReadingSession {
  readonly plan: LessonPlan;
  readonly items: readonly ActivityPayload[];
}

/**
 * Build the activity for one planned item.
 *
 * Exported because the submit path calls it too: an id arrives, the same activity is
 * rebuilt from it, and the answer is checked against a key the client never held.
 */
export function activityFor(
  activityId: string,
  conceptId: ConceptId,
  kind: "recognition" | "production",
  presentation: Presentation,
  options: { readonly choiceCount: number; readonly observedBy: "teacher" | "self" },
): ReadingActivity {
  return kind === "recognition"
    ? buildRecognitionActivity({
        activityId,
        conceptId,
        choiceCount: options.choiceCount,
        presentation,
      })
    : buildProductionActivity({
        activityId,
        conceptId,
        presentation,
        observedBy: options.observedBy,
      });
}

function toPayload(
  item: LessonPlanItem,
  activity: ReadingActivity,
  observedBy: "teacher" | "self",
): ActivityPayload {
  return {
    activityId: activity.activityId,
    conceptId: activity.conceptId,
    kind: activity.kind,
    phase: item.phase,
    presentation: activity.presentation,
    promptCodepoints: activity.promptCodepoints,
    choices:
      activity.kind === "recognition"
        ? activity.choices.map((choice) => ({
            choiceId: choice.choiceId,
            conceptId: choice.conceptId,
          }))
        : [],
    observedBy,
    reasonKey: item.reason.key,
    reasonParams: item.reason.params,
  };
}

/**
 * Plan a sitting and lay it out.
 *
 * An item whose activity id cannot be written down is dropped rather than shipped
 * unparseable — an activity the server could not later rebuild is an activity it
 * could not grade, and a learner must never be asked for evidence that will be
 * thrown away.
 */
export function buildReadingSession(input: SessionBuildInput): ReadingSession {
  const plan = buildLessonPlan(input);
  const choiceCount = CHOICE_COUNT[input.tier];
  const observedBy: "teacher" | "self" = input.hasTeacher ? "teacher" : "self";

  const items = plan.items.flatMap((item, index): readonly ActivityPayload[] => {
    const activityId = encodeActivityId({
      form: item.activityKind,
      conceptId: item.conceptId,
      presentation: item.presentation,
      sessionId: input.sessionId,
      index,
    });
    if (activityId === null) return [];

    const activity = activityFor(
      activityId,
      item.conceptId,
      item.activityKind,
      item.presentation,
      { choiceCount, observedBy },
    );
    return [toPayload(item, activity, observedBy)];
  });

  return { plan, items };
}
