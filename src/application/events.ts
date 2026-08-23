/**
 * Learning-event envelope and the transactional outbox.
 *
 * Three streams are kept separate: operational telemetry, product
 * telemetry, and learning evidence. Only the third is a source of truth
 * about a learner's memory, and it is written in the same transaction as
 * the state it justifies.
 *
 * `objectRefs` carries identifiers only. No Qur'anic text enters the event
 * stream, the logs, or the warehouse — asserted, not assumed.
 */
import { assertNoSacredText } from "../content/tripwire.js";
import { nextId } from "./ids.js";

export const EVENT_SCHEMA_VERSION = 1;

export type EventType =
  | "assignment_opened"
  | "passage_listen_completed"
  | "scaffold_changed"
  | "retrieval_submitted"
  | "assistance_used"
  | "independent_recall_succeeded"
  | "independent_recall_failed"
  | "recitation_requested"
  | "oral_verification_recorded"
  | "correction_added"
  | "correction_resolved"
  | "review_scheduled"
  | "review_completed"
  | "recommendation_served"
  | "recommendation_accepted"
  | "session_became_idle";

export type PrivacyClass =
  | "pseudonymous"
  | "learning_evidence"
  | "learning_evidence_sensitive";

export type RetentionClass = "90d" | "12m" | "24m" | "academy_policy_7y";

/** Catalog entry. An event with no named consumer is deleted, not kept. */
export interface CatalogEntry {
  purpose: string;
  privacy: PrivacyClass;
  retention: RetentionClass;
  consumers: readonly string[];
}

export const EVENT_CATALOG: Readonly<Record<EventType, CatalogEntry>> = {
  assignment_opened: {
    purpose: "Started-vs-assigned; orientation quality",
    privacy: "pseudonymous",
    retention: "24m",
    consumers: ["teacher_inbox", "scheduler"],
  },
  passage_listen_completed: {
    purpose: "Server-side listen count against policy",
    privacy: "pseudonymous",
    retention: "24m",
    consumers: ["policy_gate", "teacher_inbox"],
  },
  scaffold_changed: {
    purpose: "Cue-withdrawal analysis and frustration detection",
    privacy: "pseudonymous",
    retention: "24m",
    consumers: ["research", "product"],
  },
  retrieval_submitted: {
    purpose: "The atomic evidence record",
    privacy: "learning_evidence",
    retention: "academy_policy_7y",
    consumers: ["engine", "teacher_inbox", "reports"],
  },
  assistance_used: {
    purpose: "Marks the attempt assisted",
    privacy: "learning_evidence",
    retention: "academy_policy_7y",
    consumers: ["engine"],
  },
  independent_recall_succeeded: {
    purpose: "Threshold progress and stability",
    privacy: "learning_evidence",
    retention: "academy_policy_7y",
    consumers: ["engine", "scheduler"],
  },
  independent_recall_failed: {
    purpose: "Lapse and repair triggering",
    privacy: "learning_evidence",
    retention: "academy_policy_7y",
    consumers: ["engine", "scheduler"],
  },
  recitation_requested: {
    purpose: "Verification queue",
    privacy: "pseudonymous",
    retention: "24m",
    consumers: ["teacher_inbox"],
  },
  oral_verification_recorded: {
    purpose: "Human authority record",
    privacy: "learning_evidence",
    retention: "academy_policy_7y",
    consumers: ["engine", "audit", "reports"],
  },
  correction_added: {
    purpose: "Misconception ontology",
    privacy: "learning_evidence_sensitive",
    retention: "academy_policy_7y",
    consumers: ["teacher_inbox", "repair_engine"],
  },
  correction_resolved: {
    purpose: "Repair closure",
    privacy: "learning_evidence",
    retention: "academy_policy_7y",
    consumers: ["teacher_inbox", "engine"],
  },
  review_scheduled: {
    purpose: "Scheduling audit and backtesting",
    privacy: "pseudonymous",
    retention: "24m",
    consumers: ["scheduler", "research"],
  },
  review_completed: {
    purpose: "Delayed-recall outcome; the north-star input",
    privacy: "learning_evidence",
    retention: "academy_policy_7y",
    consumers: ["engine", "north_star"],
  },
  recommendation_served: {
    purpose: "Ranking quality",
    privacy: "pseudonymous",
    retention: "12m",
    consumers: ["product", "research"],
  },
  recommendation_accepted: {
    purpose: "Ranking quality",
    privacy: "pseudonymous",
    retention: "12m",
    consumers: ["product", "research"],
  },
  session_became_idle: {
    purpose: "Separates active learning time from wall-clock time",
    privacy: "pseudonymous",
    retention: "12m",
    consumers: ["honest_time_reporting"],
  },
};

export interface LearningEventEnvelope {
  eventId: string;
  eventType: EventType;
  schemaVersion: number;
  occurredAt: number;
  receivedAt: number;
  actorUserId?: string;
  learnerId?: string;
  organizationId: string;
  academyId?: string;
  classroomId?: string;
  assignmentId?: string;
  sessionId?: string;
  /** Identifiers only — never copied sacred text. */
  objectRefs: Readonly<Record<string, string | number | boolean>>;
  activeDurationMs?: number;
  deviceContext?: { formFactor: "phone" | "tablet" | "desktop"; connection: "slow" | "normal" };
  purpose: string;
  privacy: PrivacyClass;
  retention: RetentionClass;
  idempotencyKey: string;
}

export interface NewEvent {
  eventType: EventType;
  occurredAt: number;
  organizationId: string;
  idempotencyKey: string;
  actorUserId?: string;
  learnerId?: string;
  academyId?: string;
  classroomId?: string;
  assignmentId?: string;
  sessionId?: string;
  objectRefs?: Readonly<Record<string, string | number | boolean>>;
  activeDurationMs?: number;
}

export function buildEvent(input: NewEvent, receivedAt: number): LearningEventEnvelope {
  const entry = EVENT_CATALOG[input.eventType];
  const refs = input.objectRefs ?? {};

  // Boundary guard: sacred text must never reach the event stream.
  for (const [key, value] of Object.entries(refs))
    if (typeof value === "string")
      assertNoSacredText(value, `learning event ${input.eventType}.${key}`);

  const envelope: LearningEventEnvelope = {
    eventId: nextId(),
    eventType: input.eventType,
    schemaVersion: EVENT_SCHEMA_VERSION,
    occurredAt: input.occurredAt,
    receivedAt,
    organizationId: input.organizationId,
    objectRefs: refs,
    purpose: entry.purpose,
    privacy: entry.privacy,
    retention: entry.retention,
    idempotencyKey: input.idempotencyKey,
  };
  if (input.actorUserId !== undefined) envelope.actorUserId = input.actorUserId;
  if (input.learnerId !== undefined) envelope.learnerId = input.learnerId;
  if (input.academyId !== undefined) envelope.academyId = input.academyId;
  if (input.classroomId !== undefined) envelope.classroomId = input.classroomId;
  if (input.assignmentId !== undefined) envelope.assignmentId = input.assignmentId;
  if (input.sessionId !== undefined) envelope.sessionId = input.sessionId;
  if (input.activeDurationMs !== undefined)
    envelope.activeDurationMs = input.activeDurationMs;
  return envelope;
}

/**
 * Transactional outbox.
 *
 * Events commit with the state they justify. Delivery is separate and may
 * fail repeatedly: a failing notification, analytics sink, or AI service
 * can never roll back learning evidence.
 */
export class Outbox {
  private pending: LearningEventEnvelope[] = [];
  private delivered: LearningEventEnvelope[] = [];
  private deadLettered: { event: LearningEventEnvelope; error: string }[] = [];
  private seenIdempotencyKeys = new Set<string>();

  append(event: LearningEventEnvelope): void {
    // At-least-once delivery with idempotent consumers; a replayed client
    // submission cannot double-count evidence.
    const key = `${event.eventType}:${event.idempotencyKey}`;
    if (this.seenIdempotencyKeys.has(key)) return;
    this.seenIdempotencyKeys.add(key);
    this.pending.push(event);
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get deliveredEvents(): readonly LearningEventEnvelope[] {
    return this.delivered;
  }

  get deadLetters(): readonly { event: LearningEventEnvelope; error: string }[] {
    return this.deadLettered;
  }

  /**
   * Deliver pending events. A handler that throws leaves its event in the
   * outbox for retry; after `maxAttempts` the event is dead-lettered with
   * operator visibility. Neither path touches persisted learning state.
   */
  dispatch(
    handler: (event: LearningEventEnvelope) => void,
    maxAttempts = 3,
  ): { delivered: number; retained: number } {
    const retained: LearningEventEnvelope[] = [];
    let delivered = 0;
    for (const event of this.pending) {
      let lastError: unknown;
      let ok = false;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          handler(event);
          ok = true;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (ok) {
        this.delivered.push(event);
        delivered += 1;
      } else {
        this.deadLettered.push({
          event,
          error: lastError instanceof Error ? lastError.message : String(lastError),
        });
        retained.push(event);
      }
    }
    this.pending = [];
    return { delivered, retained: retained.length };
  }

  /** Replay a dead-lettered event after the downstream fault is fixed. */
  replayDeadLetters(): void {
    for (const { event } of this.deadLettered) this.pending.push(event);
    this.deadLettered = [];
  }
}
