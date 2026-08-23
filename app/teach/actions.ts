"use server";

import { redirect } from "next/navigation";
import type { AttentionRow } from "../../src/core/attention.js";
import type { CorrectionCategory, VerificationDecision } from "../../src/core/types.js";
import { recordVerification } from "../actions.js";
import { revalidatePath } from "next/cache";
import { requireActor } from "../../src/server/actor.js";
import { getDatabase } from "../../src/server/db.js";
import { createAssignment } from "../../src/application/commands.js";
import type { LearnerId } from "../../src/core/types.js";
import type { AssignmentDraft } from "../../src/ui/components/AssignmentWizard.js";

/** Navigate to the one action a row offers. */
export async function openAttentionRow(row: AttentionRow): Promise<void> {
  redirect(row.action.route);
}

/**
 * File a verification decision.
 *
 * The request id is bound server-side from the route, and the actor comes
 * from the session, so neither can be substituted by a client.
 */
export async function decide(
  requestId: string,
  decision: VerificationDecision,
  corrections: readonly { category: CorrectionCategory; note?: string }[],
): Promise<void> {
  await recordVerification(requestId, decision, [...corrections]);
}

/**
 * Create assignments from the wizard.
 *
 * One assignment per learner, each with its own evidence policy version,
 * so a change for one learner never silently changes another's.
 */
export async function assignWork(draft: AssignmentDraft): Promise<void> {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const now = Date.now();
  const db = getDatabase();
  for (const learnerId of draft.learnerIds) {
    const academy = result.actor.roles.find((r) => r.academyId)?.academyId;
    const classroom = result.actor.roles.flatMap((r) => r.classroomIds ?? [])[0];
    if (!academy || !classroom) continue;
    await createAssignment(db, {
      actor: result.actor,
      now,
      learnerId: learnerId as LearnerId,
      academyId: academy,
      classroomId: classroom,
      targetKind: draft.targetKind,
      passageId: draft.passageId,
      policy: {
        requiredListens: draft.policy.requiredListens,
        requiredIndependentRecalls: draft.policy.requiredIndependentRecalls,
        requiredNonSerialRecalls: draft.policy.requiredNonSerialRecalls,
      },
      estimatedActiveMinutes: draft.policy.estimatedActiveMinutes,
      dueAt: now + draft.dueInDays * 86_400_000,
    });
  }
  revalidatePath("/teach/today");
  redirect("/teach/today");
}
