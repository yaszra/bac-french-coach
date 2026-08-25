"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan, can } from "../../platform/authz/can";
import { normalizeLearnerCode } from "../domain/claim";
import { homeTaskCompletion } from "../domain/home-task";
import { CONSENT_PURPOSES } from "../domain/consent";
import { claimChild } from "../repo/family-repo";
import { recordFamilyEntry } from "../repo/ledger-repo";
import { assignHomeWork, guardianOwnsRequest } from "../repo/tutoring-repo";
import { createDataRequest, setConsent } from "../repo/privacy-repo";
import { recordVerdict } from "../../assessment/actions/record-verdict";
import { enqueue, JOBS } from "../../platform/jobs/queue";
import { logger } from "../../platform/observability/logger";

/**
 * Everything a guardian can actually do. Each one asks `can()` first, and each
 * one either happens or says why it did not — there is no optimistic success.
 */

export type ClaimActionResult =
  | { readonly ok: true; readonly state: "approved" | "claimed"; readonly messageKey: string; readonly childName: string }
  | { readonly ok: false; readonly errorKey: string };

export async function submitClaim(rawCode: string): Promise<ClaimActionResult> {
  const actor = await requireCaller();
  const decision = can(actor, "family:claimChild", { type: "organization", id: actor.organizationId });
  if (!decision.allowed) return { ok: false, errorKey: "family.link.error.notAllowed" };

  const normalized = normalizeLearnerCode(rawCode);
  if (!normalized.ok) return { ok: false, errorKey: normalized.reasonKey };

  const result = await claimChild(actor.organizationId, actor.userId, normalized.code);
  if (!result.ok) {
    return {
      ok: false,
      errorKey:
        result.reason === "unknown_code" ? "family.link.error.unknownCode" : "family.link.error.alreadyLinked",
    };
  }

  revalidatePath("/children");
  return {
    ok: true,
    state: result.outcome.state,
    messageKey: result.outcome.messageKey,
    childName: result.childName,
  };
}

const homeTaskInput = z.strictObject({
  learnerUserId: z.string().min(1),
  taskId: z.string().min(1),
});

export type SimpleResult = { readonly ok: true } | { readonly ok: false; readonly errorKey: string };

/**
 * Completing a home task. It records that a family did something together and
 * nothing else: no grade, no unit, no memory state. See `home-task.ts` for why
 * that is structural rather than a matter of care.
 */
export async function completeHomeTask(input: unknown): Promise<SimpleResult> {
  const actor = await requireCaller();
  const parsed = homeTaskInput.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: "family.error.invalid" };

  const decision = can(actor, "family:assignHomeTask", { type: "learner", id: parsed.data.learnerUserId });
  if (!decision.allowed) {
    return {
      ok: false,
      errorKey:
        decision.reason === "claim_not_yet_approved"
          ? "family.error.claimPending"
          : "family.error.notAllowed",
    };
  }

  await recordFamilyEntry(
    actor.organizationId,
    homeTaskCompletion({
      learnerUserId: parsed.data.learnerUserId,
      taskId: parsed.data.taskId,
      byUserId: actor.userId,
      occurredAt: new Date(),
    }),
  );
  revalidatePath("/tonight");
  return { ok: true };
}

const assignInput = z.strictObject({
  learnerUserId: z.string().min(1),
  track: z.enum(["hifz", "reading", "review"]),
  sura: z.number().int().min(1).max(114),
  ayahFrom: z.number().int().min(1),
  ayahTo: z.number().int().min(1),
});

/** Only a guardian the teacher marked as tutoring gets past `assertCan` here. */
export async function assignWork(input: unknown): Promise<SimpleResult> {
  const actor = await requireCaller();
  const parsed = assignInput.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: "family.error.invalid" };

  try {
    assertCan(actor, "teach:assign", { type: "learner", id: parsed.data.learnerUserId });
  } catch {
    return { ok: false, errorKey: "family.error.notTutoring" };
  }

  await assignHomeWork(actor.organizationId, {
    guardianUserId: actor.userId,
    learnerUserId: parsed.data.learnerUserId,
    track: parsed.data.track,
    scope: { sura: parsed.data.sura, ayahFrom: parsed.data.ayahFrom, ayahTo: parsed.data.ayahTo },
  });
  revalidatePath("/children");
  return { ok: true };
}

const approveInput = z.strictObject({
  verificationRequestId: z.string().min(1),
  learnerUserId: z.string().min(1),
  verdict: z.enum(["passed", "needs_work", "not_attempted"]),
  // Which units are decided is the server's to know, from the request.
});

/**
 * A tutoring guardian approving a recitation.
 *
 * Two gates, in this order: it must be work they set, and then it goes through
 * `recordVerdict` — the same path a teacher's verdict takes, with the same
 * authorisation, the same immutable verdict row and the same audit entry. There
 * is no second, softer verdict path for parents.
 */
export async function approveRecitation(input: unknown): Promise<SimpleResult> {
  const actor = await requireCaller();
  const parsed = approveInput.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: "family.error.invalid" };

  const ownership = await guardianOwnsRequest(
    actor.organizationId,
    actor.userId,
    parsed.data.verificationRequestId,
  );
  if (!ownership.ok) {
    return {
      ok: false,
      errorKey:
        ownership.reason === "unknown_request"
          ? "family.error.invalid"
          : "family.error.notYourAssignment",
    };
  }

  const result = await recordVerdict({
    verificationRequestId: parsed.data.verificationRequestId,
    learnerUserId: parsed.data.learnerUserId,
    verdict: parsed.data.verdict,
    corrections: [],
  });
  if (!result.ok) {
    return {
      ok: false,
      errorKey: result.error === "not_allowed" ? "family.error.notTutoring" : "family.error.invalid",
    };
  }
  revalidatePath("/tonight");
  return { ok: true };
}

const consentInput = z.strictObject({
  learnerUserId: z.string().min(1),
  purpose: z.enum(CONSENT_PURPOSES),
  granted: z.boolean(),
});

export async function updateConsent(input: unknown): Promise<SimpleResult> {
  const actor = await requireCaller();
  const parsed = consentInput.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: "family.error.invalid" };

  try {
    assertCan(actor, "family:manageConsent", { type: "learner", id: parsed.data.learnerUserId });
  } catch {
    return { ok: false, errorKey: "family.error.notAllowed" };
  }

  await setConsent(actor.organizationId, {
    learnerUserId: parsed.data.learnerUserId,
    purpose: parsed.data.purpose,
    granted: parsed.data.granted,
    grantedByUserId: actor.userId,
  });
  revalidatePath("/settings");
  return { ok: true };
}

const dataRequestInput = z.strictObject({
  learnerUserId: z.string().min(1),
  kind: z.enum(["export", "erasure"]),
});

/**
 * Export and erasure are requests, not buttons that finish. The row is written
 * in state `received` and a job does the work; the screen shows whatever state
 * the row is actually in, including `failed`.
 */
export async function requestData(input: unknown): Promise<SimpleResult> {
  const actor = await requireCaller();
  const parsed = dataRequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, errorKey: "family.error.invalid" };

  try {
    assertCan(actor, "family:exportData", { type: "learner", id: parsed.data.learnerUserId });
  } catch {
    return { ok: false, errorKey: "family.error.notAllowed" };
  }

  const requestId = await createDataRequest(actor.organizationId, {
    subjectUserId: parsed.data.learnerUserId,
    kind: parsed.data.kind,
    requestedBy: actor.userId,
  });

  try {
    await enqueue(parsed.data.kind === "export" ? JOBS.dataExport : JOBS.dataErasure, {
      organizationId: actor.organizationId,
      requestId,
    });
  } catch (error) {
    // The request stands even if the queue is unreachable; it is visible as
    // "received" and the job will pick it up. Never a silent success.
    logger.error({ err: error, requestId }, "could not enqueue data request");
  }

  revalidatePath("/settings");
  return { ok: true };
}
