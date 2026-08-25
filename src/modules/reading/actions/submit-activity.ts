"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";

import { appendEvent } from "../../platform/events/append";
import { foldEventIntoMemoryState } from "../../memory/repo/memory-projection";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan } from "../../platform/authz/can";
import { rateLimit } from "../../platform/ratelimit/limiter";
import { logger } from "../../platform/observability/logger";
import type { LearnerTier } from "@/modules/memory/domain/types";

import { conceptIdToUnitId } from "../domain/concepts";
import { evaluateActivity, type ActivityResponse } from "../domain/activities";
import { decodeActivityId } from "../ui/activity-id";
import { activityFor, CHOICE_COUNT } from "../ui/session-plan";
import { gradeFor, retrievalTypeFor } from "../ui/evidence-shape";

/**
 * Submitting one reading activity.
 *
 * This is `submitAttempt`'s sibling, and it enforces the same line in the same place:
 *
 *   trusted     — what happened. Which choice was touched, how long it took. For a
 *                 spoken answer, what the learner says about their own reading.
 *   NOT trusted — whether it was right. The schema below has no field for it. The
 *                 server rebuilds the activity from its id — distractors and answer
 *                 placement are a pure function of that id — and checks the choice
 *                 against a key the client never received.
 *   NOT trusted — who listened. A client cannot claim a teacher heard it. Evidence
 *                 from this action is `machine_checked` for a recognition and
 *                 `self_confirmed` for a spoken answer, always. A teacher's verdict
 *                 is a different event, given by a teacher, from a teacher's console.
 *   NOT trusted — when. The server stamps the time from its own clock.
 *
 * The result is an append-only `attempt.recorded` event, folded into memory state in
 * the same transaction — because a reading concept that stays due after the learner
 * has just answered it is a scheduler that has quietly stopped moving.
 */

const recognitionSubmission = z.object({
  kind: z.literal("recognition"),
  activityId: z.string().min(1).max(120),
  choiceId: z.string().min(1).max(160),
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

const productionSubmission = z.object({
  kind: z.literal("production"),
  activityId: z.string().min(1).max(120),
  /** What the learner says about their own reading. Never a verification. */
  verdict: z.enum(["clear", "needs_work", "not_observed"]),
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

/**
 * Not exported: a `"use server"` module may export only async functions, and this
 * schema is the server's own boundary rather than anything a client needs.
 */
const activitySubmissionSchema = z.discriminatedUnion("kind", [
  recognitionSubmission,
  productionSubmission,
]);

export type SubmitActivityResult =
  | {
      readonly ok: true;
      readonly outcome: "recorded";
      readonly correct: boolean;
      readonly evidenceKind: string;
      readonly countsTowardMastery: boolean;
      /** What to notice, on a miss. A message key and its params — never a rebuke. */
      readonly correction: {
        readonly messageKey: string;
        readonly params: Readonly<Record<string, string | number>>;
      } | null;
      readonly eventId: string;
      readonly deduplicated: boolean;
    }
  | { readonly ok: true; readonly outcome: "not_recorded"; readonly reasonKey: string }
  | {
      readonly ok: false;
      readonly error: "invalid" | "not_allowed" | "rate_limited";
      readonly detail?: string;
    };

export async function submitActivity(input: {
  readonly learnerUserId: string;
  readonly submission: unknown;
  /** Supplied by the client so a replayed submission is recognised, not re-counted. */
  readonly idempotencyKey?: string;
}): Promise<SubmitActivityResult> {
  const actor = await requireCaller();

  try {
    assertCan(actor, "learn:submitAttempt", { type: "learner", id: input.learnerUserId });
  } catch {
    return { ok: false, error: "not_allowed" };
  }

  const limited = await rateLimit("api:write", `${actor.organizationId}:${input.learnerUserId}`);
  if (!limited.allowed) return { ok: false, error: "rate_limited" };

  const parsed = activitySubmissionSchema.safeParse(input.submission);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path.join(".");
    return { ok: false, error: "invalid", ...(path ? { detail: path } : {}) };
  }

  // The id IS the activity. An id this server did not write cannot be rebuilt, and an
  // activity that cannot be rebuilt cannot be graded — so it is refused, not guessed.
  const parts = decodeActivityId(parsed.data.activityId);
  if (parts === null) return { ok: false, error: "invalid", detail: "activityId" };
  if (parts.form !== parsed.data.kind) return { ok: false, error: "invalid", detail: "kind" };

  // The tier decides how many choices an item had, so the rebuilt activity has to be
  // built at the same tier. It comes from the account, never from the request.
  const tier: LearnerTier = actor.tier ?? "adult";
  const occurredAt = new Date();
  const activity = activityFor(parsed.data.activityId, parts.conceptId, parts.form, parts.presentation, {
    choiceCount: CHOICE_COUNT[tier],
    // Only the learner is speaking here, so the activity is built as a
    // self-observed one. A teacher's ear enters through a verdict, not through this.
    observedBy: "self",
  });

  const response: ActivityResponse =
    parsed.data.kind === "recognition"
      ? {
          kind: "recognition",
          activityId: parsed.data.activityId,
          choiceId: parsed.data.choiceId,
          at: occurredAt,
          sessionId: parts.sessionId,
          ...(parsed.data.elapsedMs === undefined ? {} : { elapsedMs: parsed.data.elapsedMs }),
        }
      : {
          kind: "production",
          activityId: parsed.data.activityId,
          observer: "self",
          verdict: parsed.data.verdict,
          at: occurredAt,
          sessionId: parts.sessionId,
          ...(parsed.data.elapsedMs === undefined ? {} : { elapsedMs: parsed.data.elapsedMs }),
        };

  const evaluation = evaluateActivity(activity, response);

  // Nothing was observed — an unobserved production. That is a state, not a failure,
  // and it is reported with the engine's own reason rather than recorded as a miss.
  if (evaluation.observation === null || evaluation.correct === null) {
    return { ok: true, outcome: "not_recorded", reasonKey: evaluation.reason.key };
  }

  const observation = evaluation.observation;
  const unitId = conceptIdToUnitId(observation.conceptId);
  const payload = {
    unitId,
    unitKind: "reading_concept" as const,
    retrievalType: retrievalTypeFor(observation.activityKind, observation.evidenceKind),
    grade: gradeFor(observation.correct),
    ...(observation.elapsedMs === undefined ? {} : { durationMs: observation.elapsedMs }),
  };

  const appended = await withTenant(actor.organizationId, async (tx) => {
    const event = await appendEvent(
      {
        organizationId: actor.organizationId,
        learnerUserId: input.learnerUserId,
        type: "attempt.recorded",
        unitId,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        payload,
        occurredAt,
        source: "web",
      },
      tx,
    );

    if (!event.deduplicated) {
      // A denormalised row for the teacher's console, exactly as ḥifẓ writes one.
      await tx.attempt.create({
        data: {
          organizationId: actor.organizationId,
          learnerUserId: input.learnerUserId,
          unitId,
          retrievalType: payload.retrievalType,
          grade: payload.grade,
          occurredAt,
          ...(payload.durationMs === undefined ? {} : { durationMs: payload.durationMs }),
        },
      });

      // In the SAME transaction as the event. Without this the reading scheduler is
      // frozen: evidence accumulates and nothing ever comes round for review.
      await foldEventIntoMemoryState(
        {
          id: event.eventId,
          organizationId: actor.organizationId,
          learnerUserId: input.learnerUserId,
          type: "attempt.recorded",
          unitId,
          payload,
          occurredAt,
          recordedAt: occurredAt,
        },
        tx as never,
      );
    }
    return event;
  });

  logger.info(
    { conceptId: observation.conceptId, evidenceKind: observation.evidenceKind },
    "reading activity recorded",
  );

  return {
    ok: true,
    outcome: "recorded",
    correct: evaluation.correct,
    evidenceKind: evaluation.evidenceKind,
    countsTowardMastery: evaluation.countsTowardMastery,
    correction: evaluation.correction,
    eventId: appended.eventId,
    deduplicated: appended.deduplicated,
  };
}
