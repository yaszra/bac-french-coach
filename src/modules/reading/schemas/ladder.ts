/**
 * Schemas for the mastery ladder.
 *
 * `ladderStateSchema` deliberately keeps `finalRungEvidenceKind`, `teacherVerified`
 * and `selfConfirmed` as three separate fields rather than one boolean. A projection
 * that survives this schema still cannot present a solo learner's self-confirmation
 * as a teacher's verdict, because the shape it must satisfy never lost the difference.
 */

import { z } from "zod";

import { LADDER_RUNGS } from "../domain/masteryLadder";
import {
  conceptIdSchema,
  evidenceKindSchema,
  i18nKeySchema,
  rateSchema,
  reasonSchema,
} from "./common";

export const ladderRungSchema = z.enum(LADDER_RUNGS);

export const rungRequirementSchema = z.object({
  rung: ladderRungSchema,
  minCorrect: z.number().int().min(0),
  minAccuracy: z.number().min(0).max(1),
  minSessions: z.number().int().min(0),
  acceptedEvidence: z.array(evidenceKindSchema).min(1),
  latestMustBeCorrect: z.boolean(),
});

export const ladderRequirementsSchema = z.object({
  ordered: rungRequirementSchema,
  randomized: rungRequirementSchema,
  in_person: rungRequirementSchema,
});

export const ladderOptionsSchema = z.object({
  hasTeacher: z.boolean(),
  requirements: ladderRequirementsSchema.optional(),
});

export const ladderRungProgressSchema = z.object({
  rung: ladderRungSchema,
  met: z.boolean(),
  attempts: z.number().int().min(0),
  correct: z.number().int().min(0),
  sessions: z.number().int().min(0),
  accuracy: rateSchema,
  required: rungRequirementSchema,
  evidenceKind: evidenceKindSchema.nullable(),
  latestObservationCorrect: z.boolean().nullable(),
  unacceptedEvidence: z.record(z.string(), z.number().int().min(0)),
  reason: reasonSchema,
});

export const ladderStateSchema = z.object({
  conceptId: conceptIdSchema,
  rung: ladderRungSchema.nullable(),
  workingOn: ladderRungSchema,
  rungs: z.object({
    ordered: ladderRungProgressSchema,
    randomized: ladderRungProgressSchema,
    in_person: ladderRungProgressSchema,
  }),
  /** Never a boolean: a teacher's verdict and a self-confirmation stay distinct. */
  finalRungEvidenceKind: z.enum(["teacher_observed", "self_confirmed"]).nullable(),
  teacherVerified: z.boolean(),
  selfConfirmed: z.boolean(),
  verificationLabelKey: i18nKeySchema,
  complete: z.boolean(),
  reason: reasonSchema,
});

export const advanceDecisionSchema = z.object({
  rung: ladderRungSchema,
  allowed: z.boolean(),
  nextRung: ladderRungSchema.nullable(),
  evidenceKind: evidenceKindSchema.nullable(),
  progress: ladderRungProgressSchema,
  missing: z.array(reasonSchema),
  reason: reasonSchema,
});
