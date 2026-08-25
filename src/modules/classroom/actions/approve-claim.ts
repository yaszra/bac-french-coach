"use server";

import { z } from "zod";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan } from "../../platform/authz/can";

/**
 * Approving a guardian's claim.
 *
 * A claim is a claim, not access: an adult saying "this is my child" gets them
 * nothing until the child's teacher confirms it. This is the only place that
 * confirmation happens, and it is audited, because it grants an adult sight of
 * a child's work.
 */
const approveInput = z.strictObject({
  relationshipId: z.string().min(1),
  canTutor: z.boolean(),
});

export type ApproveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: "invalid" | "not_allowed" | "not_found" | "already_decided" };

export async function approveGuardianClaim(input: unknown): Promise<ApproveResult> {
  const actor = await requireCaller();
  const parsed = approveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  return withTenant(actor.organizationId, async (tx) => {
    const link = await tx.relationship.findUnique({
      where: { id: parsed.data.relationshipId },
      select: { id: true, kind: true, objectUserId: true, state: true },
    });
    if (!link || link.kind !== "guardian_child") return { ok: false, error: "not_found" } as const;
    if (link.state !== "claimed") return { ok: false, error: "already_decided" } as const;

    try {
      assertCan(actor, "teach:viewStudent", { type: "learner", id: link.objectUserId });
    } catch {
      return { ok: false, error: "not_allowed" } as const;
    }

    const now = new Date();
    await tx.relationship.update({
      where: { id: link.id },
      data: {
        state: "approved",
        canTutor: parsed.data.canTutor,
        approvedAt: now,
        approvedBy: actor.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "family.claim_approved",
        resourceType: "relationship",
        resourceId: link.id,
        metadata: { canTutor: parsed.data.canTutor },
      },
    });
    return { ok: true } as const;
  });
}
