import { rate, type Measured } from "./denominator";

/**
 * The daily report a learner, a parent and a teacher each see a view of.
 *
 * It is built only from events that actually happened. It never fills a gap
 * with an encouraging guess, and a day with nothing on it says so plainly —
 * a quiet day is information, not a failure to be hidden.
 */
export type ReportEvent = {
  readonly type: string;
  readonly unitId: string | null;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
};

export type StrugglePoint = {
  readonly unitId: string;
  readonly reasonKey: string;
  readonly observations: number;
  /** One thing an adult can do about it tonight. Exactly one. */
  readonly suggestedActionKey: string;
};

export type DailyReport = {
  readonly learnerUserId: string;
  readonly forDate: string;
  readonly state: "recorded" | "nothing_recorded";
  readonly minutesPractised: number;
  readonly unitsPractised: number;
  readonly reviewsDue: number;
  readonly reviewsDone: number;
  readonly unassistedRecall: Measured;
  readonly verificationsPassed: number;
  readonly verificationsRequested: number;
  readonly struggles: readonly StrugglePoint[];
  /** Progress in words, never a bare number: "held 34 words more than last week". */
  readonly trend: { readonly wordsHeld: number; readonly wordsHeldLastWeek: number | null };
};

const ASSISTED = new Set(["listen", "rebuild", "gap_fill"]);

export function buildDailyReport(input: {
  learnerUserId: string;
  forDate: string;
  events: readonly ReportEvent[];
  reviewsDue: number;
  wordsHeld: number;
  wordsHeldLastWeek: number | null;
}): DailyReport {
  const attempts = input.events.filter((e) => e.type === "attempt.recorded");
  const verdicts = input.events.filter((e) => e.type === "verdict.given");
  const requests = input.events.filter((e) => e.type === "verification.requested");

  if (input.events.length === 0) {
    return {
      learnerUserId: input.learnerUserId,
      forDate: input.forDate,
      state: "nothing_recorded",
      minutesPractised: 0,
      unitsPractised: 0,
      reviewsDue: input.reviewsDue,
      reviewsDone: 0,
      unassistedRecall: rate(0, 0),
      verificationsPassed: 0,
      verificationsRequested: 0,
      struggles: [],
      trend: { wordsHeld: input.wordsHeld, wordsHeldLastWeek: input.wordsHeldLastWeek },
    };
  }

  const durations = attempts.map((a) => Number(a.payload.durationMs ?? 0));
  const minutes = Math.round(durations.reduce((sum, ms) => sum + ms, 0) / 60_000);

  // Unassisted recall is the honest measure: only exercises where nothing was
  // shown to the learner count towards it.
  const unassisted = attempts.filter((a) => !ASSISTED.has(String(a.payload.retrievalType ?? "")));
  const unassistedGood = unassisted.filter((a) => ["good", "easy"].includes(String(a.payload.grade)));

  const failuresByUnit = new Map<string, number>();
  for (const a of attempts) {
    if (String(a.payload.grade) !== "again" || !a.unitId) continue;
    failuresByUnit.set(a.unitId, (failuresByUnit.get(a.unitId) ?? 0) + 1);
  }

  const struggles: StrugglePoint[] = [...failuresByUnit.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([unitId, observations]) => ({
      unitId,
      reasonKey: unitId.startsWith("t:") ? "struggle.weakJoin" : "struggle.repeatedLapse",
      observations,
      suggestedActionKey: unitId.startsWith("t:") ? "action.practiseJoin" : "action.listenTogether",
    }));

  return {
    learnerUserId: input.learnerUserId,
    forDate: input.forDate,
    state: "recorded",
    minutesPractised: minutes,
    unitsPractised: new Set(attempts.map((a) => a.unitId).filter(Boolean)).size,
    reviewsDue: input.reviewsDue,
    reviewsDone: attempts.length,
    unassistedRecall: rate(unassistedGood.length, unassisted.length),
    verificationsPassed: verdicts.filter((v) => String(v.payload.verdict) === "passed").length,
    verificationsRequested: requests.length,
    struggles,
    trend: { wordsHeld: input.wordsHeld, wordsHeldLastWeek: input.wordsHeldLastWeek },
  };
}
