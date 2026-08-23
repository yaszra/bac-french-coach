/**
 * Schemas for the skill graph.
 *
 * The studio authors this graph; these schemas are what stops a malformed curriculum
 * from reaching a learner. These schemas check shape; the structural rules that need
 * the whole graph (cycles, dangling edges) live in `validateGraph`.
 */

import { z } from "zod";

import { SKILL_RELATIONS } from "../domain/graph";
import { i18nKeySchema, reasonSchema, unitIdSchema, unitKindSchema } from "./common";

export const skillRelationSchema = z.enum(SKILL_RELATIONS);

export const skillSchema = z.object({
  id: unitIdSchema,
  kind: unitKindSchema,
  /** i18n key — a literal label would fail this. */
  labelKey: i18nKeySchema,
  difficultyHint: z.number().min(1).max(10),
});

export const skillEdgeSchema = z.object({
  from: unitIdSchema,
  to: unitIdSchema,
  relation: skillRelationSchema,
});

export const skillGraphSchema = z.object({
  skills: z.array(skillSchema),
  edges: z.array(skillEdgeSchema),
});

export const graphErrorSchema = z.object({
  code: z.enum([
    "duplicate_skill",
    "invalid_skill_id",
    "kind_mismatch",
    "invalid_label_key",
    "invalid_difficulty_hint",
    "unknown_skill",
    "self_edge",
    "duplicate_edge",
    "prerequisite_cycle",
  ]),
  reason: reasonSchema,
});

export const unlockPolicySchema = z.object({
  minStabilityDays: z.number().min(0),
  minConfidence: z.number().min(0).max(1),
  minReps: z.number().int().min(0),
});
