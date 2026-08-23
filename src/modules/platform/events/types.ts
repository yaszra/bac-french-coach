import { z } from "zod";

/**
 * The event vocabulary. Every learning interaction becomes one of these, once.
 * MemoryState, meters, reports and the teacher's inbox are all derived from
 * this stream — there is no final-state-only table anywhere in the learning
 * domain, so any projection can be dropped and rebuilt.
 */
export const EVENT_TYPES = [
  "attempt.recorded",
  "verification.requested",
  "verdict.given",
  "review.scheduled",
  "assignment.created",
  "assignment.completed",
  "lesson.started",
  "lesson.completed",
  "placement.completed",
  "recommendation.acted",
  "recommendation.ignored",
  "consent.changed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Payloads carry REFERENCES — sūrah/āyah numbers, unit ids, word positions.
 *  Arabic text never travels through an event (sacred-content rule). */
export const attemptRecorded = z.object({
  unitId: z.string(),
  unitKind: z.enum(["ayah_transition", "ayah_body", "page_position", "reading_concept"]),
  retrievalType: z.string(),
  grade: z.enum(["again", "hard", "good", "easy"]),
  durationMs: z.number().int().nonnegative().optional(),
  assignmentId: z.string().optional(),
  /** Advisory ASR comparison. Recorded for the learner's own review; the
   *  scheduler never reads it, and it can never produce a grade. */
  advisory: z
    .object({
      engine: z.string(),
      wordDiff: z.array(
        z.object({ index: z.number().int().nonnegative(), status: z.enum(["match", "differs", "missing"]) }),
      ),
    })
    .optional(),
});

export const verdictGiven = z.object({
  verificationRequestId: z.string(),
  verdict: z.enum(["passed", "needs_work", "not_attempted"]),
  unitIds: z.array(z.string()),
  corrections: z.array(
    z.object({
      category: z.string(),
      sura: z.number().int().positive(),
      ayah: z.number().int().positive(),
      wordIndex: z.number().int().nonnegative().optional(),
    }),
  ),
  decidedByUserId: z.string(),
});

export const reviewScheduled = z.object({
  unitId: z.string(),
  dueAt: z.string(),
  intervalDays: z.number().nonnegative(),
  scheduler: z.string(),
  shadow: z.boolean().default(false),
});

export const PAYLOAD_SCHEMAS = {
  "attempt.recorded": attemptRecorded,
  "verdict.given": verdictGiven,
  "review.scheduled": reviewScheduled,
} as const;

export const learningEventInput = z.object({
  organizationId: z.string().min(1),
  learnerUserId: z.string().min(1),
  type: z.enum(EVENT_TYPES),
  unitId: z.string().nullable().optional(),
  /** Supplied by the client so a queued offline attempt replays exactly once. */
  idempotencyKey: z.string().min(8).max(200),
  payload: z.unknown(),
  occurredAt: z.coerce.date(),
  source: z.enum(["web", "pwa_offline", "ios", "android", "teacher_console", "system"]).default("web"),
});
export type LearningEventInput = z.infer<typeof learningEventInput>;

/** Validate a payload against its type's schema, when one is defined. */
export function parsePayload(type: EventType, payload: unknown): unknown {
  const schema = (PAYLOAD_SCHEMAS as Record<string, z.ZodType | undefined>)[type];
  return schema ? schema.parse(payload) : payload;
}
