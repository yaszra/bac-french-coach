/**
 * Verify latency — how long a learner waits for an ear.
 *
 * Of everything a school could measure, this is the number that decides whether
 * the promise holds: a child who recites and waits three days for a teacher to
 * listen has not been taught, however good the software was. It is reported in
 * whole minutes, with the count it was computed from, and with the queue that
 * is still waiting stated separately — because a fast median over the requests
 * that were answered says nothing about the ones that were not.
 */

export const MINIMUM_LATENCY_SAMPLES = 5;

export type VerificationSample = {
  readonly requestedAt: Date;
  /** null while nobody has listened yet. */
  readonly decidedAt: Date | null;
};

export type LatencySummary =
  | {
      readonly kind: "measured";
      readonly medianMinutes: number;
      readonly p90Minutes: number;
      readonly answered: number;
      readonly denominator: number;
    }
  | { readonly kind: "not_yet_recorded"; readonly answered: number; readonly needed: number };

export type WaitingSummary = {
  readonly waiting: number;
  /** Whole hours the oldest unanswered request has been waiting. */
  readonly longestWaitHours: number | null;
};

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

export function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index] as number;
}

export function verifyLatency(
  samples: readonly VerificationSample[],
  minimum = MINIMUM_LATENCY_SAMPLES,
): LatencySummary {
  const answered = samples
    .filter((s): s is VerificationSample & { decidedAt: Date } => s.decidedAt !== null)
    .map((s) => minutesBetween(s.requestedAt, s.decidedAt))
    .sort((a, b) => a - b);

  if (answered.length < minimum) {
    return { kind: "not_yet_recorded", answered: answered.length, needed: minimum - answered.length };
  }
  return {
    kind: "measured",
    medianMinutes: percentile(answered, 0.5),
    p90Minutes: percentile(answered, 0.9),
    answered: answered.length,
    denominator: samples.length,
  };
}

export function stillWaiting(samples: readonly VerificationSample[], now: Date): WaitingSummary {
  const open = samples.filter((s) => s.decidedAt === null);
  if (open.length === 0) return { waiting: 0, longestWaitHours: null };
  const oldest = open.reduce((a, b) => (a.requestedAt <= b.requestedAt ? a : b));
  return {
    waiting: open.length,
    longestWaitHours: Math.floor(minutesBetween(oldest.requestedAt, now) / 60),
  };
}
