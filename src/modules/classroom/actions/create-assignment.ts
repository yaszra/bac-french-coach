"use server";

import { randomUUID } from "node:crypto";
import { createAssignmentInput } from "../schemas/assignment";
import { checkScope, type ScopeItem } from "../domain/assignment-scope";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan } from "../../platform/authz/can";
import { appendEvent } from "../../platform/events/append";
import { logger } from "../../platform/observability/logger";
import { IN_APP_ONLY, deliveryStateOf, planChannel } from "../../family/domain/channels";

/**
 * Creating an assignment.
 *
 * The teacher is checked ONCE PER LEARNER, not once for the class: a roster is
 * a convenience, and authority is still per-student. A learner the caller may
 * not teach is dropped rather than failing the whole assignment, and the
 * result says how many were actually targeted, so the console can be honest
 * about it instead of claiming thirty when it wrote twenty-nine.
 */
export type CreateAssignmentResult =
  | { readonly ok: true; readonly assignmentId: string; readonly targeted: number; readonly requested: number }
  | { readonly ok: false; readonly error: "invalid" | "not_allowed" | "no_targets" };

export async function createAssignment(input: unknown): Promise<CreateAssignmentResult> {
  const actor = await requireCaller();
  const parsed = createAssignmentInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { classroomId, learnerUserIds, track, scope, settings, dueAt } = parsed.data;

  // The domain has the final word on whether these references make sense.
  const check = checkScope(scope as readonly ScopeItem[], learnerUserIds);
  if (!check.ok) return { ok: false, error: "invalid" };

  try {
    assertCan(actor, "teach:manageClassroom", { type: "classroom", id: classroomId });
  } catch {
    return { ok: false, error: "not_allowed" };
  }

  const allowed = learnerUserIds.filter((learnerUserId) => {
    try {
      assertCan(actor, "teach:assign", { type: "learner", id: learnerUserId });
      return true;
    } catch {
      return false;
    }
  });
  if (allowed.length === 0) return { ok: false, error: "no_targets" };

  const createdAt = new Date();
  const assignmentId = await withTenant(actor.organizationId, async (tx) => {
    const assignment = await tx.assignment.create({
      data: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        classroomId,
        track,
        scope: scope as object,
        // Locked, not suggested: the learner's client reads these and obeys.
        settings: settings as object,
        dueAt,
        targets: { create: allowed.map((learnerUserId) => ({ learnerUserId })) },
      },
      select: { id: true },
    });

    for (const learnerUserId of allowed) {
      await appendEvent(
        {
          organizationId: actor.organizationId,
          learnerUserId,
          type: "assignment.created",
          unitId: null,
          idempotencyKey: `assignment:${assignment.id}:${learnerUserId}`,
          payload: { assignmentId: assignment.id, track, scope, settings },
          occurredAt: createdAt,
          source: "teacher_console",
        },
        tx,
      );
      /* Delivery is decided here, by the planner, rather than left at the
         column default. A row that says "waiting to send" while nothing will
         ever send it is precisely the dishonest state this product refuses —
         and that is what every notification said until now. An in-app
         notification IS the record, so the planner resolves it to sent. */
      const plan = planChannel("in_app", IN_APP_ONLY, createdAt);
      await tx.notification.create({
        data: {
          organizationId: actor.organizationId,
          userId: learnerUserId,
          kind: "assignment_created",
          payload: { assignmentId: assignment.id, track },
          channel: plan.channel,
          deliveryState: deliveryStateOf(plan),
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: "classroom.assignment_created",
        resourceType: "assignment",
        resourceId: assignment.id,
        metadata: { targets: allowed.length, requested: learnerUserIds.length, track },
      },
    });

    return assignment.id;
  });

  logger.info({ assignmentId, targets: allowed.length }, "assignment created");
  return { ok: true, assignmentId, targeted: allowed.length, requested: learnerUserIds.length };
}

/** A fresh idempotency key for a console that may retry a submission. */
export async function newSubmissionKey(): Promise<string> {
  return randomUUID();
}
