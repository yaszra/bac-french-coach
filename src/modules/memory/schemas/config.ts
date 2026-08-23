/**
 * Schemas for every tunable in the memory engine.
 *
 * These configs are the levers a teacher, a tier default or an experiment can move.
 * Validating them at the boundary is what stops a bad parameter from silently
 * reshaping a learner's schedule.
 */

import { z } from "zod";

import { MAX_STABILITY, MIN_STABILITY } from "../domain/fsrs";
import { probabilitySchema, retrievalTypeSchema } from "./common";

/** FSRS-4.5 weight vector: exactly 17 parameters. */
export const fsrsWeightsSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export const schedulingPolicySchema = z.object({
  weights: fsrsWeightsSchema,
  targetRetention: z.number().gt(0.5).lt(1),
  decay: z.number().lt(0),
  factor: z.number().gt(0),
  minimumIntervalDays: z.number().min(0),
  maximumIntervalDays: z.number().min(1).max(MAX_STABILITY),
  postLapseStabilityRatioCap: z.number().gt(0).lte(1),
  evidenceWeights: z.record(retrievalTypeSchema, probabilitySchema),
  retrievalStabilityFactors: z.record(retrievalTypeSchema, z.number().min(0).max(5)),
  confidenceHalfLifeFactor: z.number().positive(),
});

export const bktParamsSchema = z.object({
  pInit: z.number().gt(0).lt(1),
  pTransit: z.number().gt(0).lt(1),
  pSlip: z.number().gt(0).lt(1),
  pGuess: z.number().gt(0).lt(1),
});

/** Reject the degenerate model (Baker et al.): slip + guess must stay below 1. */
export const validBktParamsSchema = bktParamsSchema.refine(
  (params) => params.pSlip + params.pGuess < 1,
  { message: "memory.schema.error.degenerate_bkt_model" },
);

export const chunkingConfigSchema = z.object({
  minAttemptsPerSize: z.number().int().min(1),
  minTotalAttempts: z.number().int().min(1),
  targetSuccessRate: probabilitySchema,
  stretchSuccessRate: probabilitySchema,
  recencyHalfLifeDays: z.number().positive(),
  minChunkSize: z.number().int().min(1),
  maxChunkSize: z.number().int().min(1),
  maxSecondsPerUnit: z.number().positive(),
  confidenceScale: z.number().positive(),
  extrapolationPenalty: probabilitySchema,
});

export const chunkAttemptSchema = z.object({
  chunkSize: z.number().int().min(1),
  success: z.boolean(),
  secondsToComplete: z.number().min(0),
  at: z.date(),
});

export const scaffoldConfigSchema = z.object({
  stabilityHalfPointDays: z.number().positive(),
  stabilityWeight: z.number().min(0),
  retrievabilityWeight: z.number().min(0),
  confidenceFloor: probabilitySchema,
  thresholds: z.tuple([probabilitySchema, probabilitySchema, probabilitySchema]),
});

export const scaffoldLevelSchema = z.enum(["full_text", "first_letters", "word_count", "blank"]);

export const mutashabihatConfigSchema = z.object({
  n: z.number().int().min(1).max(16),
  topK: z.number().int().min(0).max(50),
  minSharedNGrams: z.number().int().min(1),
  minScore: probabilitySchema,
  metric: z.enum(["dice", "jaccard", "overlap"]),
  sequentialNeighbourRadius: z.number().int().min(0),
  maxPostingsPerNGram: z.number().int().min(2),
});

/** Stability is always inside the engine's clamp range. */
export const stabilitySchema = z.number().min(MIN_STABILITY).max(MAX_STABILITY);
