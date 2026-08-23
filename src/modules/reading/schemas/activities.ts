/**
 * Schemas for practice activities and the evidence they produce.
 *
 * The response schemas are the ones that matter most: they are what a client sends,
 * and a client's opinion of its own correctness is never among the fields. A
 * recognition response carries the choice that was made, not whether it was right; a
 * production response carries who observed and what they said. The server decides the
 * rest (evidence rule).
 */

import { z } from "zod";

import { PRODUCTION_OBSERVERS, PRODUCTION_VERDICTS } from "../domain/activities";
import {
  activityKindSchema,
  codepointsSchema,
  conceptIdSchema,
  denominatorSchema,
  evidenceKindSchema,
  i18nKeySchema,
  presentationSchema,
  reasonSchema,
  sessionIdSchema,
} from "./common";

export const recognitionChoiceSchema = z.object({
  choiceId: z.string().min(1).max(160),
  conceptId: conceptIdSchema,
});

export const recognitionActivitySchema = z.object({
  kind: z.literal("recognition"),
  activityId: z.string().min(1).max(120),
  conceptId: conceptIdSchema,
  presentation: presentationSchema,
  promptCodepoints: codepointsSchema,
  choices: z.array(recognitionChoiceSchema).min(2).max(8),
  answerChoiceId: z.string().min(1).max(160),
});

export const productionActivitySchema = z.object({
  kind: z.literal("production"),
  activityId: z.string().min(1).max(120),
  conceptId: conceptIdSchema,
  presentation: presentationSchema,
  promptCodepoints: codepointsSchema,
  observedBy: z.enum(["teacher", "self"]),
});

export const readingActivitySchema = z.discriminatedUnion("kind", [
  recognitionActivitySchema,
  productionActivitySchema,
]);

/** What a learner's client may send about a recognition item. Note what is absent. */
export const recognitionResponseSchema = z.object({
  kind: z.literal("recognition"),
  activityId: z.string().min(1).max(120),
  choiceId: z.string().min(1).max(160),
  at: z.date(),
  sessionId: sessionIdSchema,
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

export const productionObserverSchema = z.enum(PRODUCTION_OBSERVERS);
export const productionVerdictSchema = z.enum(PRODUCTION_VERDICTS);

export const productionResponseSchema = z.object({
  kind: z.literal("production"),
  activityId: z.string().min(1).max(120),
  observer: productionObserverSchema,
  verdict: productionVerdictSchema,
  at: z.date(),
  sessionId: sessionIdSchema,
  observerId: z.string().min(1).max(120).optional(),
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
});

export const activityResponseSchema = z.discriminatedUnion("kind", [
  recognitionResponseSchema,
  productionResponseSchema,
]);

/** One recorded observation. Built on the server; never accepted from a client. */
export const conceptObservationSchema = z.object({
  conceptId: conceptIdSchema,
  correct: z.boolean(),
  at: z.date(),
  activityKind: activityKindSchema,
  evidenceKind: evidenceKindSchema,
  presentation: presentationSchema,
  sessionId: sessionIdSchema,
  elapsedMs: z.number().int().min(0).max(3_600_000).optional(),
  chosenConceptId: conceptIdSchema.optional(),
});

export const conceptBearingSchema = z.object({
  conceptId: conceptIdSchema,
  polarity: z.enum(["supports", "contradicts", "neutral"]),
  weight: z.number().min(0).max(1),
});

export const correctionSchema = z.object({
  messageKey: i18nKeySchema,
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const activityEvaluationSchema = z.object({
  activityId: z.string().min(1).max(120),
  kind: activityKindSchema,
  conceptId: conceptIdSchema,
  correct: z.boolean().nullable(),
  evidenceKind: evidenceKindSchema,
  countsTowardMastery: z.boolean(),
  bearsOn: z.array(conceptBearingSchema),
  correction: correctionSchema.nullable(),
  /** There is no punishment: the only permitted value is `null`. */
  penalty: z.null(),
  observation: conceptObservationSchema.nullable(),
  reason: reasonSchema,
});

export const smartScoreSchema = z.object({
  conceptId: conceptIdSchema,
  /** `null` is "not yet recorded". It is never to be rendered as a number. */
  score: z.number().min(0).max(100).nullable(),
  confidence: z.number().min(0).max(1),
  denominator: denominatorSchema,
  scoredAttempts: z.number().int().min(0),
  state: z.enum(["not_yet_recorded", "emerging", "secure"]),
  pKnown: z.number().gt(0).lt(1).nullable(),
  lastEvidenceAt: z.date().nullable(),
  evidenceMix: z.record(evidenceKindSchema, z.number().int().min(0)),
  evidenceVariety: z.number().int().min(0),
  reason: reasonSchema,
});

export const anomalySchema = z.object({
  kind: z.enum([
    "possible_guessing",
    "regression",
    "systematic_confusion",
    "long_gap",
    "stalled_near_threshold",
  ]),
  conceptId: conceptIdSchema,
  reason: reasonSchema,
  denominator: denominatorSchema,
  counts: z.record(z.string(), z.number()),
  relatedConceptId: conceptIdSchema.nullable(),
  severity: z.enum(["notice", "attention"]),
});
