import { EVENT_TYPES } from "../../platform/events/types";

/**
 * Things a family can do together tonight — and the reason they can never
 * become progress.
 *
 * The evidence rule is binding: a learner advances only on server-validated
 * evidence, and a home task is not evidence. Nobody watched, nobody listened,
 * and a parent tapping "we did it" is a note, not a verdict.
 *
 * That is enforced structurally rather than by convention. Home task activity
 * is recorded under the FAMILY event vocabulary, which is DISJOINT from the
 * learning event vocabulary (`EVENT_TYPES`). `appendEvent` validates its input
 * against that enum, so a family event cannot be written to the learning event
 * stream at all — and every memory projection folds only over that stream.
 * There is therefore no code path, present or future, by which completing a
 * home task moves memory state. A unit test proves the disjointness.
 */

export const FAMILY_EVENT_TYPES = [
  "family.home_task.assigned",
  "family.home_task.completed",
] as const;
export type FamilyEventType = (typeof FAMILY_EVENT_TYPES)[number];

/** True when a type belongs to the learning stream that feeds memory. */
export function isLearningEventType(type: string): boolean {
  return (EVENT_TYPES as readonly string[]).includes(type);
}

export class FamilyEventLeak extends Error {
  constructor(type: string) {
    super(
      `"${type}" is a learning event type; family activity must never be written as learning evidence`,
    );
    this.name = "FamilyEventLeak";
  }
}

/** Guards the family ledger writer. A leak is a defect, not a warning. */
export function assertFamilyEventType(type: string): asserts type is FamilyEventType {
  if (isLearningEventType(type)) throw new FamilyEventLeak(type);
  if (!(FAMILY_EVENT_TYPES as readonly string[]).includes(type)) {
    throw new Error(`"${type}" is not a family event type`);
  }
}

export type HomeTask = {
  readonly id: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly minutes: number;
  /** An adult has to be in the room for this one. */
  readonly needsAdult: boolean;
};

/**
 * The catalogue. Small on purpose: a family evening holds one thing, not a
 * menu of nine. Nothing here references scripture text — tasks name what to do,
 * and the muṣḥaf itself comes from the content package.
 */
export const HOME_TASKS: readonly HomeTask[] = [
  {
    id: "listen_together",
    labelKey: "family.task.listenTogether.label",
    descriptionKey: "family.task.listenTogether.description",
    minutes: 5,
    needsAdult: true,
  },
  {
    id: "recite_to_me",
    labelKey: "family.task.reciteToMe.label",
    descriptionKey: "family.task.reciteToMe.description",
    minutes: 10,
    needsAdult: true,
  },
  {
    id: "practise_the_join",
    labelKey: "family.task.practiseJoin.label",
    descriptionKey: "family.task.practiseJoin.description",
    minutes: 5,
    needsAdult: true,
  },
  {
    id: "quiet_review",
    labelKey: "family.task.quietReview.label",
    descriptionKey: "family.task.quietReview.description",
    minutes: 8,
    needsAdult: false,
  },
];

export function findHomeTask(id: string): HomeTask | undefined {
  return HOME_TASKS.find((task) => task.id === id);
}

export type FamilyLedgerEntry = {
  readonly type: FamilyEventType;
  readonly learnerUserId: string;
  readonly taskId: string;
  readonly byUserId: string;
  readonly occurredAt: Date;
  /** Stated in the row itself, so a reader of the data knows what it is not. */
  readonly isEvidence: false;
};

export function homeTaskCompletion(input: {
  learnerUserId: string;
  taskId: string;
  byUserId: string;
  occurredAt: Date;
}): FamilyLedgerEntry {
  const task = findHomeTask(input.taskId);
  if (!task) throw new Error(`unknown home task: ${input.taskId}`);
  const type: FamilyEventType = "family.home_task.completed";
  assertFamilyEventType(type);
  return {
    type,
    learnerUserId: input.learnerUserId,
    taskId: task.id,
    byUserId: input.byUserId,
    occurredAt: input.occurredAt,
    isEvidence: false,
  };
}

/**
 * One evening, one task. Chosen from what the report actually showed, and never
 * more than one — a list of four suggestions is a list nobody does.
 */
export function suggestHomeTask(input: {
  struggleReasonKeys: readonly string[];
  quietDay: boolean;
}): HomeTask {
  if (input.struggleReasonKeys.some((key) => key.endsWith("weakJoin"))) {
    return HOME_TASKS[2] as HomeTask;
  }
  if (input.quietDay) return HOME_TASKS[0] as HomeTask;
  return HOME_TASKS[1] as HomeTask;
}
