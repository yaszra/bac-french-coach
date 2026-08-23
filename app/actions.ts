"use server";

/**
 * Server actions.
 *
 * Thin wrappers over the command layer. Each resolves the actor from the
 * session cookie — never from an argument — so a client cannot act as
 * someone else by shaping a payload.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireActor } from "../src/server/actor.js";
import { getDatabase } from "../src/server/db.js";
import {
  recordListen,
  recordOralVerification,
  submitRetrieval,
  requestOralRecitation,
} from "../src/application/commands.js";
import type { AssignmentId, CorrectionCategory, VerificationDecision } from "../src/core/types.js";
import type { AssistanceKind } from "../src/core/evidence.js";
import type { ScaffoldLevel, StartContext } from "../src/core/types.js";

export async function startAssignment(assignmentId: string): Promise<void> {
  if (!assignmentId) redirect("/learn/today");
  redirect(`/learn/session/${assignmentId}`);
}

export async function listenCompleted(
  assignmentId: string,
  segmentId: string,
): Promise<void> {
  const result = await requireActor();
  if (!result.ok) redirect("/login");
  await recordListen(getDatabase(), {
    actor: result.actor,
    now: Date.now(),
    assignmentId: assignmentId as AssignmentId,
    segmentId,
  });
  revalidatePath(`/learn/session/${assignmentId}`);
}

export async function submitAttempt(input: {
  assignmentId: string;
  segmentId: string;
  scaffoldLevel: ScaffoldLevel;
  startContext: StartContext;
  correct: boolean;
  assistance: AssistanceKind[];
  hesitant: boolean;
  idempotencyKey: string;
}): Promise<void> {
  const result = await requireActor();
  if (!result.ok) redirect("/login");
  // Note what is NOT passed: no evidence class, no learning state. The
  // client reports what happened; the server decides what it means.
  await submitRetrieval(getDatabase(), {
    actor: result.actor,
    now: Date.now(),
    assignmentId: input.assignmentId as AssignmentId,
    segmentId: input.segmentId,
    scaffoldLevel: input.scaffoldLevel,
    startContext: input.startContext,
    correct: input.correct,
    assistance: input.assistance,
    hesitant: input.hesitant,
    idempotencyKey: input.idempotencyKey,
  });
  revalidatePath(`/learn/session/${input.assignmentId}`);
}

export async function askForVerification(assignmentId: string): Promise<void> {
  const result = await requireActor();
  if (!result.ok) redirect("/login");
  await requestOralRecitation(getDatabase(), {
    actor: result.actor,
    now: Date.now(),
    assignmentId: assignmentId as AssignmentId,
  });
  revalidatePath("/learn/today");
}

export async function recordVerification(
  requestId: string,
  decision: VerificationDecision,
  corrections: { category: CorrectionCategory; note?: string }[],
): Promise<void> {
  const result = await requireActor();
  if (!result.ok) redirect("/login");
  await recordOralVerification(getDatabase(), {
    actor: result.actor,
    now: Date.now(),
    requestId,
    decision,
    corrections,
  });
  revalidatePath("/teach/today");
  redirect("/teach/today");
}
