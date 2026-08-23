"use server";

/**
 * Teacher server actions.
 *
 * Everything a client sends here is untrusted, including data that came
 * from a component this codebase wrote: a server action is a public
 * endpoint, and the component is only the usual caller.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AttentionCategory } from "../../src/core/attention.js";
import type { CorrectionCategory, VerificationDecision, LearnerId } from "../../src/core/types.js";
import { recordVerification } from "../actions.js";
import { requireActor } from "../../src/server/actor.js";
import { getDatabase, getPool } from "../../src/server/db.js";
import { createAssignment } from "../../src/application/commands.js";
import { validatePolicy } from "../../src/core/assignment-policy.js";
import type { AssignmentDraft } from "../../src/ui/components/AssignmentWizard.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Follow an attention row's action.
 *
 * The route is rebuilt here from a category and an identifier rather than
 * taken from the caller. Redirecting to a client-supplied string would be
 * an open redirect, and the fact that our own component supplies a safe
 * one is not a control.
 */
export async function openAttentionRow(
  category: AttentionCategory,
  targetId: string,
): Promise<void> {
  if (!UUID.test(targetId)) redirect("/teach/today");

  switch (category) {
    case "awaiting_verification":
      redirect(`/teach/verify/${targetId}`);
    case "governance_request":
      redirect("/admin/governance");
    case "repeated_corrections":
    case "recall_decline":
    case "not_started":
    case "review_overload":
    case "inactivity":
    case "recently_improved":
      redirect(`/teach/learners/${targetId}`);
  }
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

  // The wizard validates the policy before enabling its Continue button.
  // That is a usability affordance, not a gate — a crafted call reaches
  // this line without ever rendering the wizard, so the gate is here.
  const issues = validatePolicy({
    requiredListens: draft.policy.requiredListens,
    requiredIndependentRecalls: draft.policy.requiredIndependentRecalls,
    requiredNonSerialRecalls: draft.policy.requiredNonSerialRecalls,
  });
  if (issues.length > 0)
    throw new Error(`Invalid evidence policy: ${issues.map((i) => i.message).join(" ")}`);

  const dueInDays = Math.min(365, Math.max(1, Math.round(draft.dueInDays)));
  const estimatedActiveMinutes = Math.min(
    120,
    Math.max(1, Math.round(draft.policy.estimatedActiveMinutes)),
  );

  const now = Date.now();
  const db = getDatabase();

  for (const learnerId of draft.learnerIds) {
    if (!UUID.test(learnerId)) continue;

    // The academy and classroom come from where this learner is actually
    // enrolled, not from whichever role the teacher happens to hold first.
    // A teacher of two classrooms would otherwise file assignments against
    // the wrong one, and the classroom is what decides who may verify it.
    const { rows } = await getPool().query(
      `SELECT e.academy_id, e.classroom_id
         FROM enrollment e
        WHERE e.learner_id = $1 AND e.organization_id = $2
        ORDER BY e.classroom_id
        LIMIT 1`,
      [learnerId, result.actor.organizationId],
    );
    const enrollment = rows[0];
    if (!enrollment) continue;

    await createAssignment(db, {
      actor: result.actor,
      now,
      learnerId: learnerId as LearnerId,
      academyId: enrollment["academy_id"] as string,
      classroomId: enrollment["classroom_id"] as string,
      targetKind: draft.targetKind,
      passageId: draft.passageId,
      policy: {
        requiredListens: draft.policy.requiredListens,
        requiredIndependentRecalls: draft.policy.requiredIndependentRecalls,
        requiredNonSerialRecalls: draft.policy.requiredNonSerialRecalls,
      },
      estimatedActiveMinutes,
      dueAt: now + dueInDays * 86_400_000,
    });
  }

  revalidatePath("/teach/today");
  redirect("/teach/today");
}
