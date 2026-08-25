/**
 * Evidence payloads, validated at the trust boundary.
 *
 * Every object here is **strict**: an unknown key is a parse error, not something to
 * be quietly dropped. That is what makes the evidence rule mechanical rather than
 * aspirational — a client that tries to send `score`, `grade`, `correct` or
 * `mastered` alongside its observations is rejected at the door, and no later layer
 * has to remember to ignore it.
 *
 * Sacred-content note: no field here accepts free text. `cueAyah` is constrained to
 * an ASCII reference by regex, so scripture cannot ride in on an evidence payload
 * even by accident.
 */

import { z } from "zod";
import { SCAFFOLD_LEVELS, type ScaffoldLevel } from "@/modules/memory/domain/scaffold";
import { isUnitId } from "@/modules/memory/domain/types";
import type {
  AttemptEvidence,
  GapObservation,
  GradingContext,
  PlacementObservation,
} from "../domain/grading";

/* -------------------------------------------------------------- primitives */

/** Zod v4 rejects NaN and Infinity for `z.number()`, so counts are always real. */
const count = z.number().int().min(0);
const positiveCount = z.number().int().min(1);
const durationMs = z.number().min(0);
const positiveDurationMs = z.number().positive();

/** ASCII references only — never scripture, never free text. */
export const referenceString = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9:._>-]{0,63}$/, "must be an ASCII reference, not text");

export const unitIdSchema = z
  .string()
  .refine(isUnitId, "must be a well-formed unit id (e.g. b:2:255 or t:2:255>2:256)");

export const scaffoldLevelSchema = z.enum(SCAFFOLD_LEVELS);

/* -------------------------------------------------------------- observations */

export const placementObservationSchema = z.strictObject({
  index: count,
  correct: z.boolean(),
});

export const gapObservationSchema = z.strictObject({
  wordIndex: count,
  correct: z.boolean(),
  attempts: count,
});

/* ----------------------------------------------------------------- payloads */

export const listenEvidenceSchema = z.strictObject({
  exercise: z.literal("listen"),
  playedMs: durationMs,
  ayahDurationMs: positiveDurationMs,
  replays: count,
});

export const recallFirstEvidenceSchema = z.strictObject({
  exercise: z.literal("recall_first"),
  producedWordCount: count,
  expectedWordCount: positiveCount,
  revealedAfterMs: durationMs.nullable(),
  hintsUsed: count,
});

export const rebuildEvidenceSchema = z.strictObject({
  exercise: z.literal("rebuild"),
  placements: z.array(placementObservationSchema).min(1).readonly(),
  rescrambles: count,
  elapsedMs: durationMs,
});

export const gapFillEvidenceSchema = z.strictObject({
  exercise: z.literal("gap_fill"),
  gaps: z.array(gapObservationSchema).min(1).readonly(),
});

export const nextAyahCueEvidenceSchema = z.strictObject({
  exercise: z.literal("next_ayah_cue"),
  cueAyah: referenceString,
  producedFirstWords: z.boolean(),
  latencyMs: durationMs,
  hintsUsed: count,
});

export const connectChainEvidenceSchema = z.strictObject({
  exercise: z.literal("connect_chain"),
  ayahsRequested: positiveCount,
  ayahsProducedInOrder: count,
  breaks: z.array(count).readonly(),
});

export const oralRecitationEvidenceSchema = z.strictObject({
  exercise: z.literal("oral_recitation"),
  recordedMs: durationMs,
  expectedWordCount: positiveCount,
  /** Advisory only, and never read by the grader. See `reciteDiff.ts`. */
  advisoryMatchRate: z.number().min(0).max(1).nullable(),
});

export const attemptEvidenceSchema = z.discriminatedUnion("exercise", [
  listenEvidenceSchema,
  recallFirstEvidenceSchema,
  rebuildEvidenceSchema,
  gapFillEvidenceSchema,
  nextAyahCueEvidenceSchema,
  connectChainEvidenceSchema,
  oralRecitationEvidenceSchema,
]);

/**
 * One attempt, as it arrives from a client.
 *
 * There is deliberately no timestamp: the server stamps the time from its own clock.
 * A client cannot date its own evidence.
 */
export const attemptSubmissionSchema = z.strictObject({
  unitId: unitIdSchema,
  evidence: attemptEvidenceSchema,
  /** The support that was on screen, or `null` when the client cannot say. */
  scaffold: scaffoldLevelSchema.nullable(),
});

export type AttemptSubmission = z.infer<typeof attemptSubmissionSchema>;

/** Boundary adapter: `null` scaffold means "unknown", not "no support shown". */
export function gradingContextOf(scaffold: ScaffoldLevel | null): GradingContext {
  return scaffold === null ? {} : { scaffold };
}

/* ------------------------------------------------- schema ⇄ domain agreement */

type Assert<Expected, Actual extends Expected> = Actual;

/** Compile-time proof that the schemas and the domain types cannot drift apart. */
export type EvidenceMatchesDomain = Assert<
  AttemptEvidence,
  z.infer<typeof attemptEvidenceSchema>
>;
export type DomainMatchesEvidence = Assert<
  z.infer<typeof attemptEvidenceSchema>,
  AttemptEvidence
>;
export type PlacementMatchesDomain = Assert<
  PlacementObservation,
  z.infer<typeof placementObservationSchema>
>;
export type GapMatchesDomain = Assert<GapObservation, z.infer<typeof gapObservationSchema>>;
