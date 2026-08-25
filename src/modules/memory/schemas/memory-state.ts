/**
 * Schemas for memory state and the evidence that changes it.
 *
 * `MemoryState` crosses the boundary between the pure engine and the repo/actions
 * layer in both directions, so it is validated in both directions.
 */

import { z } from "zod";

import { MAX_DIFFICULTY, MAX_STABILITY, MIN_DIFFICULTY, MIN_STABILITY } from "../domain/fsrs";
import {
  gradeSchema,
  probabilitySchema,
  retrievalTypeSchema,
  unitIdSchema,
  unitKindSchema,
} from "./common";

export const memoryStateSchema = z.object({
  unitId: unitIdSchema,
  kind: unitKindSchema,
  stability: z.number().min(MIN_STABILITY).max(MAX_STABILITY),
  difficulty: z.number().min(MIN_DIFFICULTY).max(MAX_DIFFICULTY),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  lastReviewAt: z.date().nullable(),
  lastRetrievalType: retrievalTypeSchema.nullable(),
  confidence: probabilitySchema,
});

/** One server-validated observation. Clients never construct these. */
export const reviewEvidenceSchema = z.object({
  grade: gradeSchema,
  retrievalType: retrievalTypeSchema,
  at: z.date(),
});

export const reviewOutcomeSchema = z.object({
  unitId: unitIdSchema,
  previous: memoryStateSchema,
  next: memoryStateSchema,
  grade: gradeSchema,
  retrievalType: retrievalTypeSchema,
  reviewedAt: z.date(),
  elapsedDays: z.number().min(0),
  retrievabilityBefore: probabilitySchema,
  intervalDays: z.number().min(0),
  dueAt: z.date(),
  lapsed: z.boolean(),
});

/** BKT state for one reading concept. */
export const bktStateSchema = z.object({
  conceptId: unitIdSchema,
  pKnown: z.number().gt(0).lt(1),
  observations: z.number().int().min(0),
  correctObservations: z.number().int().min(0),
  lastSeenAt: z.date().nullable(),
  lastRetrievalType: retrievalTypeSchema.nullable(),
});
