/**
 * Schemas for the concept lattice.
 *
 * The lattice is authored content: it crosses the boundary from the studio editor
 * into the engine, so it is validated on the way in. `readingLatticeSchema` checks
 * *shape*; `validateLattice` in the domain checks *meaning* (acyclicity, reachability,
 * the makhraj partition). Both matter, and neither substitutes for the other.
 */

import { z } from "zod";

import { CONCEPT_KINDS, MAKHRAJ_IDS, MAKHRAJ_REGIONS, SKELETONS } from "../domain/concepts";
import {
  arabicCodepointSchema,
  codepointsSchema,
  conceptIdSchema,
  i18nKeySchema,
} from "./common";

export const conceptKindSchema = z.enum(CONCEPT_KINDS);
export const makhrajGroupSchema = z.enum(MAKHRAJ_IDS);
export const makhrajRegionSchema = z.enum(MAKHRAJ_REGIONS);
export const skeletonSchema = z.enum(SKELETONS);

export const letterFormSchema = z.enum(["isolated", "initial", "medial", "final"]);

export const letterDotsSchema = z.object({
  count: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  position: z.enum(["above", "below", "none"]),
});

export const arabicLetterSchema = z.object({
  id: conceptIdSchema,
  name: z.string().regex(/^[a-z]+$/, { message: "reading.schema.error.invalid_letter_name" }),
  codepoint: arabicCodepointSchema,
  unicode: z.string().regex(/^U\+[0-9A-F]{4}$/, {
    message: "reading.schema.error.invalid_unicode_reference",
  }),
  makhraj: makhrajGroupSchema,
  skeleton: skeletonSchema,
  dots: letterDotsSchema,
  connectsForward: z.boolean(),
  connectsBackward: z.boolean(),
  inAlphabet: z.boolean(),
  order: z.number().int().min(0).max(28),
});

export const readingConceptSchema = z.object({
  id: conceptIdSchema,
  kind: conceptKindSchema,
  labelKey: i18nKeySchema,
  letterCodepoints: codepointsSchema.optional(),
  makhraj: makhrajGroupSchema.optional(),
  prerequisites: z.array(conceptIdSchema).max(64),
});

export const prerequisiteEdgeSchema = z.object({
  from: conceptIdSchema,
  to: conceptIdSchema,
});

export const readingLatticeSchema = z.object({
  concepts: z.array(readingConceptSchema).min(1),
  edges: z.array(prerequisiteEdgeSchema),
});

export const latticeErrorSchema = z.object({
  code: z.enum([
    "duplicate_concept",
    "invalid_concept_id",
    "invalid_label_key",
    "unknown_prerequisite",
    "self_prerequisite",
    "prerequisite_cycle",
    "unreachable_concept",
    "unknown_makhraj",
    "duplicate_codepoint",
    "letter_without_makhraj",
    "letter_in_multiple_makhraj_groups",
    "alphabet_size",
  ]),
  reason: z.object({
    key: i18nKeySchema,
    params: z.record(z.string(), z.union([z.string(), z.number()])),
  }),
});
