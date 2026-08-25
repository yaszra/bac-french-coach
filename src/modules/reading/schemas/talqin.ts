/**
 * Schemas for talqīn (model pronunciation) requests, assets and resolutions.
 *
 * `talqinAssetSchema` is a discriminated union on `provenance`, mirroring the domain
 * type: there is no member of this union without a label, and the synthesized member
 * additionally requires the human who reviewed it and when. Audio that nobody signed
 * cannot pass validation, so it cannot reach a learner through any validated path.
 */

import { z } from "zod";

import { TALQIN_PROVENANCES, TALQIN_SOURCES } from "../domain/talqin";
import { conceptIdSchema, i18nKeySchema, reasonSchema } from "./common";

export const talqinSourceSchema = z.enum(TALQIN_SOURCES);
export const talqinProvenanceSchema = z.enum(TALQIN_PROVENANCES);

const talqinAssetBase = {
  assetId: z.string().min(1).max(120),
  conceptId: conceptIdSchema,
  source: talqinSourceSchema,
  recordedAt: z.date(),
  durationMs: z.number().int().min(1).max(600_000),
  locale: z.string().min(2).max(35).optional(),
  teacherId: z.string().min(1).max(120).optional(),
};

export const humanTalqinAssetSchema = z.object({
  ...talqinAssetBase,
  provenance: z.literal("human"),
  recordedByPersonId: z.string().min(1).max(120),
});

export const studioSynthTalqinAssetSchema = z.object({
  ...talqinAssetBase,
  provenance: z.literal("studio_synth_reviewed"),
  /** A machine voice with no named reviewer is not representable. */
  reviewedByPersonId: z.string().min(1).max(120),
  reviewedAt: z.date(),
});

export const libraryTalqinAssetSchema = z.object({
  ...talqinAssetBase,
  provenance: z.literal("library"),
  libraryId: z.string().min(1).max(120),
  /** Library audio comes from a real reciter, and says which. */
  reciterId: z.string().min(1).max(120),
});

export const talqinAssetSchema = z.discriminatedUnion("provenance", [
  humanTalqinAssetSchema,
  studioSynthTalqinAssetSchema,
  libraryTalqinAssetSchema,
]);

export const talqinRequestSchema = z.object({
  conceptId: conceptIdSchema,
  learnerId: z.string().min(1).max(120).optional(),
  teacherId: z.string().min(1).max(120).optional(),
  locale: z.string().min(2).max(35).optional(),
  allowedProvenance: z.array(talqinProvenanceSchema).min(1).optional(),
});

export const resolvedTalqinSchema = z.object({
  kind: z.literal("resolved"),
  asset: talqinAssetSchema,
  source: talqinSourceSchema,
  provenance: talqinProvenanceSchema,
  isMachineVoice: z.boolean(),
  provenanceLabelKey: i18nKeySchema,
  precedence: z.array(talqinSourceSchema),
  searched: z.array(talqinSourceSchema),
  reason: reasonSchema,
});

export const notYetRecordedTalqinSchema = z.object({
  kind: z.literal("not_yet_recorded"),
  conceptId: conceptIdSchema,
  searched: z.array(talqinSourceSchema),
  reason: reasonSchema,
});

export const talqinResolutionSchema = z.discriminatedUnion("kind", [
  resolvedTalqinSchema,
  notYetRecordedTalqinSchema,
]);
