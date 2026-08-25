/**
 * The grader's output, validated on the way out.
 *
 * The actions layer parses `GradeResult` before it is persisted or projected, so a
 * malformed grade can never be written into an append-only event log. Note that the
 * schema admits three kinds and only one of them is a grade — `requires_human` and
 * `insufficient_evidence` are first-class results, not error cases.
 */

import { z } from "zod";
import { GRADES } from "@/modules/memory/domain/types";
import type { GradeResult } from "../domain/grading";

export const gradeSchema = z.enum(GRADES);

export const gradedResultSchema = z.strictObject({
  kind: z.literal("graded"),
  grade: gradeSchema,
  evidenceStrength: z.number().min(0).max(1),
  /** i18n keys, never literal text. */
  rationale: z.array(z.string().min(1)).readonly(),
});

export const requiresHumanResultSchema = z.strictObject({
  kind: z.literal("requires_human"),
  reason: z.string().min(1),
});

export const insufficientEvidenceResultSchema = z.strictObject({
  kind: z.literal("insufficient_evidence"),
  missing: z.array(z.string().min(1)).readonly(),
});

export const gradeResultSchema = z.discriminatedUnion("kind", [
  gradedResultSchema,
  requiresHumanResultSchema,
  insufficientEvidenceResultSchema,
]);

type Assert<Expected, Actual extends Expected> = Actual;

export type GradeResultMatchesDomain = Assert<
  GradeResult,
  z.infer<typeof gradeResultSchema>
>;
export type DomainMatchesGradeResult = Assert<
  z.infer<typeof gradeResultSchema>,
  GradeResult
>;
