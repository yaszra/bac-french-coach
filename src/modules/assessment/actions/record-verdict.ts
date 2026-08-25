"use server";

// The boundary schema lives in schemas/: a "use server" module may only export
// async functions, so a Zod object cannot be exported from this file.
import { verdictInput } from "../schemas/verdict";
import { applyVerdict } from "../domain/verdict";
import { unitsInScope } from "../domain/scope";
import { appendEvent } from "../../platform/events/append";
import { foldEventIntoMemoryState } from "../../memory/repo/memory-projection";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan } from "../../platform/authz/can";
import { logger } from "../../platform/observability/logger";

/**
 * Recording a teacher's verdict — the ear-gate.
 *
 * This is the only path by which a unit becomes verified. It is also the only
 * place a person's judgement enters the memory graph, which is why the verdict
 * row is immutable at the database: correcting a verdict means recording a new
 * one, so the history of what a teacher actually said survives.
 */
export type RecordVerdictResult =
  | { readonly ok: true; readonly eventId: string; readonly drills: number; readonly graphSignals: number }
  | {
      readonly ok: false;
      readonly error: "invalid" | "not_allowed" | "already_decided" | "out_of_scope";
    };

export async function recordVerdict(input: unknown): Promise<RecordVerdictResult> {
  const actor = await requireCaller();
  const parsed = verdictInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    assertCan(actor, "teach:verifyRecitation", { type: "learner", id: parsed.data.learnerUserId });
  } catch {
    return { ok: false, error: "not_allowed" };
  }

  const decidedAt = new Date();

  const result = await withTenant(actor.organizationId, async (tx) => {
    const request = await tx.verificationRequest.findUnique({
      where: { id: parsed.data.verificationRequestId },
      select: { id: true, state: true, learnerUserId: true, unitScope: true },
    });
    if (!request || request.learnerUserId !== parsed.data.learnerUserId) return "invalid" as const;

    /* A verdict decides what was asked about — and the server is the only
     * thing that knows what that was.
     *
     * The unit ids used to arrive from the client and be folded straight into
     * memory state with `verifiedAt` set, without ever being compared to the
     * request being answered; its `unitScope` was not even selected. A
     * verifier could mark any unit verified for that learner, and the history
     * would then say a person had listened to a passage nobody recited.
     *
     * Validating a client's list would have closed it. Deriving the list
     * closes it and keeps it closed, because there is no longer a claim to
     * forget to check. */
    const scoped = unitsInScope(request.unitScope);
    if (scoped === null || scoped.size === 0) return "out_of_scope" as const;
    const unitIds = [...scoped];

    const consequences = applyVerdict({
      kind: parsed.data.verdict,
      unitIds,
      corrections: parsed.data.corrections as never,
      decidedByUserId: actor.userId,
      decidedAt,
    });
    // A verdict is a person's word, recorded once. A second one is a new
    // request, not an edit of this one.
    if (request.state !== "pending") return "already_decided" as const;

    await tx.verdict.create({
      data: {
        organizationId: actor.organizationId,
        verificationRequestId: request.id,
        verdict: parsed.data.verdict,
        corrections: parsed.data.corrections,
        note: parsed.data.note ?? null,
        decidedByUserId: actor.userId,
        decidedAt,
      },
    });
    await tx.verificationRequest.update({
      where: { id: request.id },
      data: {
        state: parsed.data.verdict === "not_attempted" ? "returned" : "verified",
        decidedAt,
        decidedBy: actor.userId,
      },
    });

    const event = await appendEvent(
      {
        organizationId: actor.organizationId,
        learnerUserId: parsed.data.learnerUserId,
        type: "verdict.given",
        unitId: null,
        idempotencyKey: `verdict:${request.id}`,
        payload: {
          verificationRequestId: request.id,
          verdict: parsed.data.verdict,
          unitIds,
          corrections: parsed.data.corrections,
          decidedByUserId: actor.userId,
        },
        occurredAt: decidedAt,
        source: "teacher_console",
      },
      tx,
    );

    // The verdict is the only thing that marks a unit verified, so the fold
    // runs here in the same transaction — a teacher who approves must see the
    // learner's page change as a result of having approved.
    await foldEventIntoMemoryState(
      {
        id: event.eventId,
        organizationId: actor.organizationId,
        learnerUserId: parsed.data.learnerUserId,
        type: "verdict.given",
        unitId: null,
        payload: {
          verdict: parsed.data.verdict,
          unitIds,
          corrections: parsed.data.corrections,
          decidedByUserId: actor.userId,
        },
        occurredAt: decidedAt,
        recordedAt: decidedAt,
      },
      tx as never,
    );

    // A wrong join observed by a teacher is the strongest mutashābih evidence
    // there is: it happened, to this learner, on this page.
    for (const signal of consequences.graphSignals) {
      if (signal.relation !== "mutashabih_of") continue;
      await tx.skillEdge
        .create({ data: { fromId: signal.from, toId: signal.to, relation: signal.relation, weight: 1 } })
        .catch(() => {
          /* the edge already exists; observing it again is not an error */
        });
    }

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "assessment.verdict_given",
        resourceType: "verification_request",
        resourceId: request.id,
        metadata: { verdict: parsed.data.verdict, units: unitIds.length },
      },
    });

    return { ...event, drills: consequences.drills.length, graphSignals: consequences.graphSignals.length };
  });

  if (result === "invalid") return { ok: false, error: "invalid" };
  if (result === "already_decided") return { ok: false, error: "already_decided" };
  if (result === "out_of_scope") return { ok: false, error: "out_of_scope" };

  logger.info(
    { learner: parsed.data.learnerUserId, verdict: parsed.data.verdict, drills: result.drills },
    "verdict recorded",
  );
  return {
    ok: true,
    eventId: result.eventId,
    drills: result.drills,
    graphSignals: result.graphSignals,
  };
}
