import { z } from "zod";
import { CORRECTIONS } from "../domain/taxonomy";

/**
 * The verdict boundary.
 *
 * These schemas live here rather than beside the action because a `"use server"`
 * module may only export async functions — a Zod object exported from one is a
 * build error, and the whole console fails to render. Keeping the contract in
 * `schemas/` is also where it belongs: it is the shape of the boundary, not the
 * behaviour behind it.
 */
export const correctionMark = z.strictObject({
  category: z.enum(CORRECTIONS.map((c) => c.category) as [string, ...string[]]),
  sura: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1),
  wordIndex: z.number().int().nonnegative().optional(),
  wentTo: z.strictObject({ sura: z.number().int().min(1).max(114), ayah: z.number().int().min(1) }).optional(),
  note: z.string().max(500).optional(),
});

export const verdictInput = z.strictObject({
  verificationRequestId: z.string().min(1),
  learnerUserId: z.string().min(1),
  verdict: z.enum(["passed", "needs_work", "not_attempted"]),
  /* Which units a verdict decides is NOT a client input.
   *
   * It used to be: an array of arbitrary strings, folded straight into memory
   * state with `verifiedAt` set, never compared to the request being answered.
   * A verifier could mark any unit verified for that learner, and the history
   * would say a person had listened to a passage nobody recited. The server
   * now derives the units from the request's own scope, so there is no longer
   * a claim to validate — which is the only way this cannot be forgotten
   * again. */
  corrections: z.array(correctionMark).default([]),
  note: z.string().max(1000).optional(),
});

export type VerdictInputShape = z.infer<typeof verdictInput>;
