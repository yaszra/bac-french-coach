/**
 * Shared memory-engine schemas.
 *
 * Zod sits at every boundary: nothing enters or leaves the engine unvalidated.
 * Error messages are i18n keys, never literal user-facing text.
 */

import { z } from "zod";

import {
  GRADES,
  LEARNER_TIERS,
  RETRIEVAL_TYPES,
  UNIT_KINDS,
  isUnitId,
} from "../domain/types";

export const unitKindSchema = z.enum(UNIT_KINDS);
export const gradeSchema = z.enum(GRADES);
export const retrievalTypeSchema = z.enum(RETRIEVAL_TYPES);
export const learnerTierSchema = z.enum(LEARNER_TIERS);

/** A unit id must parse under the documented grammar (`t:` / `b:` / `p:` / `c:`). */
export const unitIdSchema = z
  .string()
  .min(3)
  .max(120)
  .refine((value) => isUnitId(value), {
    message: "memory.schema.error.invalid_unit_id",
  });

/** An i18n key, never a literal sentence. */
export const i18nKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/, {
    message: "memory.schema.error.invalid_i18n_key",
  });

export const reasonParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const reasonSchema = z.object({
  key: i18nKeySchema,
  params: reasonParamsSchema,
});

/** A rate that carries its denominator; `rate` is null when nothing was observed. */
export const rateSchema = z.object({
  numerator: z.number().min(0),
  denominator: z.number().min(0),
  rate: z.number().min(0).max(1).nullable(),
});

export const probabilitySchema = z.number().min(0).max(1);
