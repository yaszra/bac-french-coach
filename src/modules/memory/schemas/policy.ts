/**
 * Schemas for the recommendation policy.
 *
 * Every recommendation that leaves the engine carries a machine-readable reason, and
 * the schema enforces it: no recommendation may reach a teacher's inbox without a
 * "why".
 */

import { z } from "zod";

import { RECOMMENDED_ACTIONS } from "../domain/policy";
import {
  learnerTierSchema,
  reasonSchema,
  retrievalTypeSchema,
  unitIdSchema,
  unitKindSchema,
} from "./common";
import { memoryStateSchema } from "./memory-state";

export const recommendedActionSchema = z.enum(RECOMMENDED_ACTIONS);

export const recommendationSchema = z.object({
  action: recommendedActionSchema,
  unitId: unitIdSchema,
  reason: reasonSchema,
  priority: z.number(),
  estimatedMinutes: z.number().min(0),
  retrievalType: retrievalTypeSchema,
});

export const tierPolicySchema = z.object({
  sessionBudgetMinutes: z.number().positive(),
  maxNewUnitsPerSession: z.number().int().min(0),
  newMaterialLoadRatio: z.number().min(0).max(1),
  repairWindowDays: z.number().min(0),
  weakJoinMargin: z.number().min(0).max(1),
  verificationGraceDays: z.number().min(0),
  maintenanceIntervalDays: z.number().min(0),
  actionMinutes: z.record(recommendedActionSchema, z.number().min(0)),
});

export const verificationRequestSchema = z.object({
  unitId: unitIdSchema,
  requestedAt: z.date(),
  dueAt: z.date().optional(),
});

export const recentLapseSchema = z.object({
  unitId: unitIdSchema,
  occurredAt: z.date(),
});

export const newUnitCandidateSchema = z.object({
  unitId: unitIdSchema,
  kind: unitKindSchema,
  order: z.number().int().min(0),
});

export const maintenanceCandidateSchema = z.object({
  unitId: unitIdSchema,
  kind: unitKindSchema,
  lastReadAt: z.date().nullable(),
});

export const policyInputSchema = z.object({
  now: z.date(),
  tier: learnerTierSchema,
  states: z.array(memoryStateSchema),
  verificationRequests: z.array(verificationRequestSchema).optional(),
  recentLapses: z.array(recentLapseSchema).optional(),
  newCandidates: z.array(newUnitCandidateSchema).optional(),
  maintenance: z.array(maintenanceCandidateSchema).optional(),
});

export const sessionLoadSchema = z.object({
  verificationCount: z.number().int().min(0),
  repairCount: z.number().int().min(0),
  dueReviewCount: z.number().int().min(0),
  weakJoinCount: z.number().int().min(0),
  dueLoadMinutes: z.number().min(0),
  budgetMinutes: z.number().min(0),
  newMaterialBudgetMinutes: z.number().min(0),
  newWithheld: z.boolean(),
  newWithheldReason: reasonSchema.nullable(),
  newUnitsProposed: z.number().int().min(0),
});

export const sessionPlanSchema = z.object({
  recommendations: z.array(recommendationSchema),
  selected: z.array(recommendationSchema),
  load: sessionLoadSchema,
});
