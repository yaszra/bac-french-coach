/**
 * Shared reading-module schemas.
 *
 * Zod sits at every boundary: the domain layer stays pure, and nothing crosses into
 * or out of it unvalidated. Error messages are i18n keys, never literal user text.
 */

import { z } from "zod";

import { CONCEPT_ID_RE, LABEL_KEY_RE } from "../domain/concepts";
import { ACTIVITY_KINDS, EVIDENCE_KINDS, PRESENTATIONS } from "../domain/evidence";

/** A concept id: lowercase ASCII, dot-separated. An Arabic literal would fail this. */
export const conceptIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(CONCEPT_ID_RE, { message: "reading.schema.error.invalid_concept_id" });

/** An i18n key, never a literal sentence. */
export const i18nKeySchema = z
  .string()
  .regex(LABEL_KEY_RE, { message: "reading.schema.error.invalid_i18n_key" });

export const reasonParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const reasonSchema = z.object({
  key: i18nKeySchema,
  params: reasonParamsSchema,
});

/** A rate that always carries its denominator; `rate` is null when nothing happened. */
export const rateSchema = z.object({
  numerator: z.number().min(0),
  denominator: z.number().min(0),
  rate: z.number().min(0).max(1).nullable(),
});

export const denominatorSchema = z.object({
  attempts: z.number().int().min(0),
  sessions: z.number().int().min(0),
});

export const probabilitySchema = z.number().min(0).max(1);

export const evidenceKindSchema = z.enum(EVIDENCE_KINDS);
export const activityKindSchema = z.enum(ACTIVITY_KINDS);
export const presentationSchema = z.enum(PRESENTATIONS);

/**
 * A single Arabic codepoint — a letter or a diacritic mark.
 *
 * Sacred-content rule: this schema admits exactly one codepoint, so a connected
 * Qurʾānic phrase cannot enter the reading module through any validated boundary.
 * Teaching an alphabet is not quoting scripture, and this is where that line is
 * mechanically enforced.
 */
export const arabicCodepointSchema = z
  .string()
  .refine((value) => [...value].length === 1, {
    message: "reading.schema.error.expected_single_codepoint",
  })
  .refine(
    (value) => {
      const point = value.codePointAt(0);
      if (point === undefined) return false;
      // Arabic (U+0600–U+06FF) and Arabic Supplement (U+0750–U+077F).
      return (point >= 0x0600 && point <= 0x06ff) || (point >= 0x0750 && point <= 0x077f);
    },
    { message: "reading.schema.error.codepoint_outside_arabic_block" },
  );

export const codepointsSchema = z.array(arabicCodepointSchema).max(8);

export const sessionIdSchema = z.string().min(1).max(120);
