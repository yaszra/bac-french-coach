/**
 * Measured word timings and timing-derived observations.
 *
 * Timings enter the system from the content package, where they were produced
 * against a real reciter's audio. The schema validates their shape; `validateTimings`
 * in `../domain/wordSync.ts` validates their *meaning* (monotone, non-overlapping,
 * inside the clip). Both run before a highlight is ever drawn, and neither will
 * invent a timing that was not measured.
 */

import { z } from "zod";
import type { FluencyObservation } from "../domain/fluency";
import type { WordTiming } from "../domain/wordSync";

const count = z.number().int().min(0);
const durationMs = z.number().min(0);

export const wordTimingSchema = z.strictObject({
  wordIndex: count,
  startMs: durationMs,
  endMs: durationMs,
});

/** An empty array is valid and means "not aligned yet" — a legitimate state. */
export const wordTimingsSchema = z.array(wordTimingSchema).readonly();

export const fluencyObservationSchema = z.strictObject({
  wordIndex: count,
  latencyMs: durationMs,
});

export const fluencyObservationsSchema = z.array(fluencyObservationSchema).readonly();

/** A playback position, in milliseconds from the start of the clip. */
export const playbackPositionSchema = z.number().min(0);

type Assert<Expected, Actual extends Expected> = Actual;

export type WordTimingMatchesDomain = Assert<WordTiming, z.infer<typeof wordTimingSchema>>;
export type DomainMatchesWordTiming = Assert<z.infer<typeof wordTimingSchema>, WordTiming>;
export type FluencyObservationMatchesDomain = Assert<
  FluencyObservation,
  z.infer<typeof fluencyObservationSchema>
>;
