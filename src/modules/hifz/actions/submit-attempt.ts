"use server";

import { randomUUID } from "node:crypto";
import { attemptSubmissionSchema, gradingContextOf } from "../schemas/evidence";
import { gradeAttempt, reviewEvidenceOf } from "../domain/grading";
import { appendEvent } from "../../platform/events/append";
import { foldEventIntoMemoryState } from "../../memory/repo/memory-projection";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan } from "../../platform/authz/can";
import { rateLimit } from "../../platform/ratelimit/limiter";
import { logger } from "../../platform/observability/logger";

/**
 * Submitting an attempt.
 *
 * This is where the evidence rule is actually enforced, so it is worth being
 * explicit about what the client is and is not trusted with:
 *
 *   trusted   — what happened: which words were placed, how long it took, how
 *               many hints were taken. Observations.
 *   NOT trusted — what it was worth. The submission schema is strict and has no
 *               grade, score or mastery field, so a client cannot even express
 *               a claim about its own performance. The server grades.
 *   NOT trusted — when it happened. The server stamps the time from its own
 *               clock; only the idempotency key comes from the client, so a
 *               queued offline attempt replays exactly once.
 *
 * The attempt becomes an append-only event. MemoryState follows from the
 * projection over that event — never from this function directly.
 */
export type SubmitAttemptResult =
  | { readonly ok: true; readonly outcome: "graded"; readonly eventId: string; readonly deduplicated: boolean }
  | { readonly ok: true; readonly outcome: "requires_human"; readonly reasonKey: string }
  | { readonly ok: false; readonly error: "invalid" | "not_allowed" | "rate_limited"; readonly detail?: string };

export async function submitAttempt(input: {
  readonly learnerUserId: string;
  readonly submission: unknown;
  /** Supplied by the client so an offline replay is recognised, not re-counted. */
  readonly idempotencyKey?: string;
  readonly source?: "web" | "pwa_offline" | "ios" | "android";
}): Promise<SubmitAttemptResult> {
  const actor = await requireCaller();

  // A learner submits their own attempts. Nobody submits on their behalf: a
  // teacher's judgement enters through a verdict, which is a different event.
  try {
    assertCan(actor, "learn:submitAttempt", { type: "learner", id: input.learnerUserId });
  } catch {
    return { ok: false, error: "not_allowed" };
  }

  const limited = await rateLimit("api:write", `${actor.organizationId}:${input.learnerUserId}`);
  if (!limited.allowed) return { ok: false, error: "rate_limited" };

  const parsed = attemptSubmissionSchema.safeParse(input.submission);
  if (!parsed.success) {
    // A submission carrying anything the schema does not know about — a "grade",
    // a "score" — fails here rather than being quietly stripped.
    const path = parsed.error.issues[0]?.path.join(".");
    return { ok: false, error: "invalid", ...(path ? { detail: path } : {}) };
  }

  const occurredAt = new Date();
  const result = gradeAttempt(parsed.data.evidence, gradingContextOf(parsed.data.scaffold));

  if (result.kind === "requires_human") {
    logger.info({ unitId: parsed.data.unitId }, "attempt needs a teacher's ear");
    return { ok: true, outcome: "requires_human", reasonKey: result.reason };
  }
  if (result.kind === "insufficient_evidence") {
    return { ok: false, error: "invalid", detail: result.missing.join(",") };
  }

  const review = reviewEvidenceOf(parsed.data.evidence.exercise, result, occurredAt);
  if (!review) return { ok: false, error: "invalid", detail: "ungradeable" };

  const appended = await withTenant(actor.organizationId, async (tx) => {
    const event = await appendEvent(
      {
        organizationId: actor.organizationId,
        learnerUserId: input.learnerUserId,
        type: "attempt.recorded",
        unitId: parsed.data.unitId,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        payload: {
          unitId: parsed.data.unitId,
          unitKind: unitKindOf(parsed.data.unitId),
          retrievalType: review.retrievalType,
          grade: review.grade,
        },
        occurredAt,
        source: input.source ?? "web",
      },
      tx,
    );

    // A denormalised row for the teacher's console. It is a convenience, not a
    // source of truth: the event above is.
    if (!event.deduplicated) {
      await tx.attempt.create({
        data: {
          organizationId: actor.organizationId,
          learnerUserId: input.learnerUserId,
          unitId: parsed.data.unitId,
          retrievalType: review.retrievalType,
          grade: review.grade,
          occurredAt,
        },
      });

      // Advance memory state in the SAME transaction as the event. A learner
      // who answers correctly must see the unit stop being due now, not after
      // a background sweep — and a rollback must undo both together, or the
      // projection would claim something the history does not contain.
      await foldEventIntoMemoryState(
        {
          id: event.eventId,
          organizationId: actor.organizationId,
          learnerUserId: input.learnerUserId,
          type: "attempt.recorded",
          unitId: parsed.data.unitId,
          payload: {
            unitId: parsed.data.unitId,
            unitKind: unitKindOf(parsed.data.unitId),
            retrievalType: review.retrievalType,
            grade: review.grade,
          },
          occurredAt,
          recordedAt: occurredAt,
        },
        tx as never,
      );
    }
    return event;
  });

  return { ok: true, outcome: "graded", eventId: appended.eventId, deduplicated: appended.deduplicated };
}

function unitKindOf(unitId: string): string {
  if (unitId.startsWith("t:")) return "ayah_transition";
  if (unitId.startsWith("p:")) return "page_position";
  if (unitId.startsWith("c:")) return "reading_concept";
  return "ayah_body";
}
