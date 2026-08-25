/**
 * Schemas for the lesson plan.
 *
 * `guarantees` is validated as three literal `false`s. A plan that grew a heart
 * counter, a countdown or a streak penalty would fail this schema at the boundary,
 * which is the point: the promise is checked, not merely written down.
 */

import { z } from "zod";

import { LESSON_PHASES } from "../domain/lessonPlan";
import {
  activityKindSchema,
  conceptIdSchema,
  presentationSchema,
  reasonSchema,
} from "./common";
import { ladderStateSchema } from "./ladder";
import { smartScoreSchema } from "./activities";

export const learnerTierSchema = z.enum(["kids", "teen", "adult"]);
export const lessonPhaseSchema = z.enum(LESSON_PHASES);

export const conceptPlanStateSchema = z.object({
  conceptId: conceptIdSchema,
  smartScore: smartScoreSchema,
  ladder: ladderStateSchema,
  unlocked: z.boolean(),
  dueAt: z.date().optional(),
});

export const lessonPlanItemSchema = z.object({
  conceptId: conceptIdSchema,
  phase: lessonPhaseSchema,
  activityKind: activityKindSchema,
  presentation: presentationSchema,
  estimatedMinutes: z.number().min(0).max(60),
  reason: reasonSchema,
});

export const withheldConceptSchema = z.object({
  conceptId: conceptIdSchema,
  reason: reasonSchema,
});

/** No hearts, no timers, no streak penalties, no score deductions. Ever. */
export const practiceGuaranteesSchema = z.object({
  hearts: z.literal(false),
  timers: z.literal(false),
  streakPenalties: z.literal(false),
  scoreDeductions: z.literal(false),
});

export const lessonPlanSchema = z.object({
  tier: learnerTierSchema,
  budgetMinutes: z.number().min(0).max(120),
  plannedMinutes: z.number().min(0).max(120),
  items: z.array(lessonPlanItemSchema),
  empty: z.boolean(),
  emptyReason: reasonSchema.nullable(),
  withheld: z.array(withheldConceptSchema),
  considered: z.object({
    concepts: z.number().int().min(0),
    unlocked: z.number().int().min(0),
    introCandidates: z.number().int().min(0),
    practiceCandidates: z.number().int().min(0),
    reviewCandidates: z.number().int().min(0),
  }),
  guarantees: practiceGuaranteesSchema,
});

export const lessonPlanInputSchema = z.object({
  tier: learnerTierSchema,
  conceptStates: z.array(conceptPlanStateSchema),
  now: z.date(),
  budgetMinutes: z.number().min(0).max(120).optional(),
});
