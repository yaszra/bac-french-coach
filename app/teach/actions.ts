"use server";

import { redirect } from "next/navigation";
import type { AttentionRow } from "../../src/core/attention.js";
import type { CorrectionCategory, VerificationDecision } from "../../src/core/types.js";
import { recordVerification } from "../actions.js";

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
