"use server";

import { readingGateInput, READING_EVIDENCE_KIND } from "../../classroom/schemas/reading-gate";
import { conceptUnitId } from "../../memory/domain/types";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan } from "../../platform/authz/can";
import { recordVerdict } from "./record-verdict";

/**
 * The reading gate — a Qāʿidah rung confirmed in person.
 *
 * A learner does not pass a Qāʿidah rung by finishing exercises. A teacher sits
 * with them, hears them read, and says so. That confirmation goes down the SAME
 * path as every other human verdict — `recordVerdict`, the one ear-gate — so
 * there is no second way to verify a unit and no second thing to audit.
 *
 * What makes it distinguishable afterwards is `evidenceKind`, stamped on the
 * request it is a verdict about. Because the kind lives on the request rather
 * than being inferred from the verdict, a report reading verdicts back can
 * always tell an in-person confirmation from an app-mediated one, and can
 * never quietly present one as the other.
 */
export type ReadingGateResult =
  | { readonly ok: true; readonly unitId: string }
  | {
      readonly ok: false;
      readonly error: "invalid" | "not_allowed" | "already_confirmed" | "failed";
    };

export async function recordReadingGate(input: unknown): Promise<ReadingGateResult> {
  const actor = await requireCaller();
  const parsed = readingGateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { learnerUserId, lessonId, note } = parsed.data;

  try {
    assertCan(actor, "teach:verifyRecitation", { type: "learner", id: learnerUserId });
  } catch {
    return { ok: false, error: "not_allowed" };
  }

  const unitId = conceptUnitId(lessonId);

  /* The request is created here rather than by the learner: this rung is
     confirmed face to face, so there was never a moment for them to ask. It is
     still a request with a verdict, because that is the only shape the ear-gate
     accepts, and uniformity is what keeps the audit trail readable. */
  const requestId = await withTenant(actor.organizationId, async (tx) => {
    const existing = await tx.verificationRequest.findFirst({
      where: {
        learnerUserId,
        track: "reading",
        state: "verified",
        unitScope: { path: ["lessonId"], equals: lessonId },
      },
      select: { id: true },
    });
    if (existing) return null;

    const request = await tx.verificationRequest.create({
      data: {
        organizationId: actor.organizationId,
        learnerUserId,
        track: "reading",
        // References and provenance only — no Arabic, no recording.
        unitScope: { lessonId, unitId, evidenceKind: READING_EVIDENCE_KIND },
        state: "pending",
      },
      select: { id: true },
    });
    return request.id;
  });

  if (requestId === null) return { ok: false, error: "already_confirmed" };

  const recorded = await recordVerdict({
    verificationRequestId: requestId,
    learnerUserId,
    verdict: "passed",
    unitIds: [unitId],
    corrections: [],
    ...(note === undefined ? {} : { note }),
  });

  if (!recorded.ok) {
    return { ok: false, error: recorded.error === "not_allowed" ? "not_allowed" : "failed" };
  }
  return { ok: true, unitId };
}
