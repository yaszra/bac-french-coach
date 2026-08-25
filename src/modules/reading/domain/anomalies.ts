/**
 * Patterns worth a teacher's attention.
 *
 * These are *detectors*, not verdicts. Each one answers a narrow, checkable question
 * about a pattern in recorded evidence, and each answer arrives with the counts that
 * produced it so a teacher can disagree with the machine on the spot.
 *
 * ## Never an accusation
 *
 * Reason keys describe the *observation*, never the learner: an anomaly says
 * "answers arrived faster than the prompt can be read", not "the child cheated". No
 * detector fires without a floor of data — a fast answer is a fluke, forty per cent
 * of forty answers is a pattern — and every anomaly carries its denominator, so a
 * pattern seen in six attempts is never dressed up as a finding about a term's work.
 *
 * An anomaly is a reason to *look*, and the only action it ever recommends is a human
 * looking. Nothing here changes a score, closes a rung, or costs the learner anything.
 *
 * Pure module: no I/O, no clock (the caller supplies `now`), no randomness.
 */

import { reason, type Reason } from "@/modules/memory/domain/types";

import type { ConceptId } from "./concepts";
import {
  bySession,
  denominatorOf,
  observationsFor,
  type ConceptObservation,
  type EvidenceDenominator,
} from "./evidence";
import type { LadderState } from "./masteryLadder";

export const ANOMALY_KINDS = [
  "possible_guessing",
  "regression",
  "systematic_confusion",
  "long_gap",
  "stalled_near_threshold",
] as const;

export type AnomalyKind = (typeof ANOMALY_KINDS)[number];

export type AnomalySeverity = "notice" | "attention";

export interface Anomaly {
  readonly kind: AnomalyKind;
  readonly conceptId: ConceptId;
  /** Neutral, machine-readable "why". An i18n key, never literal text. */
  readonly reason: Reason;
  /** What the finding is based on. Always present, never rounded away. */
  readonly denominator: EvidenceDenominator;
  /** The raw counts behind the reason, so a teacher can check the arithmetic. */
  readonly counts: Readonly<Record<string, number>>;
  /** The other concept involved, for a systematic confusion. */
  readonly relatedConceptId: ConceptId | null;
  readonly severity: AnomalySeverity;
}

export interface AnomalyThresholds {
  /** Below this, an answer arrived faster than the prompt can be read and decided. */
  readonly implausibleMs: number;
  readonly minTimedAttempts: number;
  readonly guessingShare: number;
  readonly attentionGuessingShare: number;
  readonly minSessionsForRegression: number;
  readonly minAttemptsPerSession: number;
  readonly regressionDrop: number;
  readonly minErrorsForSystematic: number;
  readonly systematicShare: number;
  readonly longGapDays: number;
  readonly minAttemptsForGap: number;
  readonly stalledSessions: number;
  readonly stalledNearShare: number;
}

/**
 * Defaults.
 *
 * `implausibleMs` is 350: reading a prompt, finding it among four choices and
 * pressing it does not happen in a third of a second, whatever the learner knows.
 * The share thresholds are deliberately blunt — a detector that fires at 15% would
 * fire on everyone.
 */
export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
  implausibleMs: 350,
  minTimedAttempts: 6,
  guessingShare: 0.4,
  attentionGuessingShare: 0.6,
  minSessionsForRegression: 3,
  minAttemptsPerSession: 4,
  regressionDrop: 0.25,
  minErrorsForSystematic: 3,
  systematicShare: 0.6,
  longGapDays: 21,
  minAttemptsForGap: 3,
  stalledSessions: 4,
  stalledNearShare: 0.8,
};

export interface AnomalyInput {
  readonly conceptId: ConceptId;
  /** Every observation the caller has; only this concept's are read. */
  readonly observations: readonly ConceptObservation[];
  readonly now: Date;
  /** Ladder state, when the caller has it — needed for `stalled_near_threshold`. */
  readonly ladder?: LadderState;
}

const MS_PER_DAY = 86_400_000;

function accuracyOf(observations: readonly ConceptObservation[]): number | null {
  if (observations.length === 0) return null;
  const correct = observations.filter((observation) => observation.correct).length;
  return correct / observations.length;
}

/* ---------------------------------------------------------------- detectors */

function detectGuessing(
  conceptId: ConceptId,
  observations: readonly ConceptObservation[],
  thresholds: AnomalyThresholds,
): Anomaly | null {
  const timed = observations.filter(
    (observation): observation is ConceptObservation & { elapsedMs: number } =>
      typeof observation.elapsedMs === "number" && Number.isFinite(observation.elapsedMs),
  );
  if (timed.length < thresholds.minTimedAttempts) return null;

  const fast = timed.filter((observation) => observation.elapsedMs < thresholds.implausibleMs);
  const share = fast.length / timed.length;
  if (share < thresholds.guessingShare) return null;

  return {
    kind: "possible_guessing",
    conceptId,
    reason: reason("reading.anomaly.reason.answers_faster_than_plausible", {
      conceptId,
      fasterThanMs: thresholds.implausibleMs,
      fast: fast.length,
      timed: timed.length,
    }),
    denominator: denominatorOf(observations),
    counts: {
      fastAnswers: fast.length,
      timedAnswers: timed.length,
      thresholdMs: thresholds.implausibleMs,
    },
    relatedConceptId: null,
    severity: share >= thresholds.attentionGuessingShare ? "attention" : "notice",
  };
}

function detectRegression(
  conceptId: ConceptId,
  observations: readonly ConceptObservation[],
  thresholds: AnomalyThresholds,
): Anomaly | null {
  const sessions = bySession(observations).filter(
    (session) => session.length >= thresholds.minAttemptsPerSession,
  );
  if (sessions.length < thresholds.minSessionsForRegression) return null;

  const latest = sessions[sessions.length - 1];
  const prior = sessions.slice(0, -1);
  if (latest === undefined || prior.length === 0) return null;

  const latestAccuracy = accuracyOf(latest);
  const priorAttempts = prior.reduce((total, session) => total + session.length, 0);
  const priorCorrect = prior.reduce(
    (total, session) => total + session.filter((observation) => observation.correct).length,
    0,
  );
  if (latestAccuracy === null || priorAttempts === 0) return null;
  const priorAccuracy = priorCorrect / priorAttempts;
  const drop = priorAccuracy - latestAccuracy;
  if (drop < thresholds.regressionDrop) return null;

  return {
    kind: "regression",
    conceptId,
    reason: reason("reading.anomaly.reason.accuracy_lower_than_earlier_sessions", {
      conceptId,
      latestCorrect: latest.filter((observation) => observation.correct).length,
      latestAttempts: latest.length,
      priorCorrect,
      priorAttempts,
    }),
    denominator: denominatorOf(observations),
    counts: {
      latestCorrect: latest.filter((observation) => observation.correct).length,
      latestAttempts: latest.length,
      priorCorrect,
      priorAttempts,
      sessionsCompared: sessions.length,
    },
    relatedConceptId: null,
    severity: drop >= thresholds.regressionDrop * 2 ? "attention" : "notice",
  };
}

function detectSystematicConfusion(
  conceptId: ConceptId,
  observations: readonly ConceptObservation[],
  thresholds: AnomalyThresholds,
): Anomaly | null {
  const errors = observations.filter(
    (observation) =>
      !observation.correct &&
      typeof observation.chosenConceptId === "string" &&
      observation.chosenConceptId !== conceptId,
  );
  if (errors.length < thresholds.minErrorsForSystematic) return null;

  const tally = new Map<ConceptId, number>();
  for (const error of errors) {
    const chosen = error.chosenConceptId;
    if (chosen === undefined) continue;
    tally.set(chosen, (tally.get(chosen) ?? 0) + 1);
  }
  // Deterministic: highest count, ties broken by concept id.
  const ranked = [...tally.entries()].sort((a, b) =>
    b[1] === a[1] ? (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) : b[1] - a[1],
  );
  const top = ranked[0];
  if (top === undefined) return null;
  const [towardConceptId, towardCount] = top;
  const share = towardCount / errors.length;
  // Errors spread across many different letters are ordinary error, not a pattern.
  if (share < thresholds.systematicShare || towardCount < thresholds.minErrorsForSystematic) {
    return null;
  }

  return {
    kind: "systematic_confusion",
    conceptId,
    reason: reason("reading.anomaly.reason.errors_concentrated_on_one_concept", {
      conceptId,
      towardConceptId,
      towardCount,
      errors: errors.length,
      distinctChoices: tally.size,
    }),
    denominator: denominatorOf(observations),
    counts: {
      errors: errors.length,
      towardCount,
      distinctChoices: tally.size,
    },
    relatedConceptId: towardConceptId,
    severity: share >= 0.8 ? "attention" : "notice",
  };
}

function detectLongGap(
  conceptId: ConceptId,
  observations: readonly ConceptObservation[],
  now: Date,
  thresholds: AnomalyThresholds,
): Anomaly | null {
  if (observations.length < thresholds.minAttemptsForGap) return null;
  const last = observations[observations.length - 1];
  if (last === undefined) return null;
  const days = (now.getTime() - last.at.getTime()) / MS_PER_DAY;
  if (!Number.isFinite(days) || days < thresholds.longGapDays) return null;

  return {
    kind: "long_gap",
    conceptId,
    reason: reason("reading.anomaly.reason.no_evidence_recorded_recently", {
      conceptId,
      days: Math.floor(days),
      thresholdDays: thresholds.longGapDays,
    }),
    denominator: denominatorOf(observations),
    counts: { days: Math.floor(days), thresholdDays: thresholds.longGapDays },
    relatedConceptId: null,
    severity: days >= thresholds.longGapDays * 2 ? "attention" : "notice",
  };
}

function detectStalled(
  conceptId: ConceptId,
  ladder: LadderState | undefined,
  thresholds: AnomalyThresholds,
): Anomaly | null {
  if (ladder === undefined || ladder.complete) return null;
  const progress = ladder.rungs[ladder.workingOn];
  if (progress.met) return null;
  const required = Math.max(1, progress.required.minCorrect);
  const share = progress.correct / required;
  if (share < thresholds.stalledNearShare) return null;
  if (progress.sessions < thresholds.stalledSessions) return null;

  return {
    kind: "stalled_near_threshold",
    conceptId,
    reason: reason("reading.anomaly.reason.near_rung_threshold_for_several_sessions", {
      conceptId,
      rung: ladder.workingOn,
      correct: progress.correct,
      requiredCorrect: required,
      sessions: progress.sessions,
    }),
    denominator: { attempts: progress.attempts, sessions: progress.sessions },
    counts: {
      correct: progress.correct,
      requiredCorrect: required,
      sessions: progress.sessions,
      attempts: progress.attempts,
    },
    relatedConceptId: null,
    severity: "notice",
  };
}

/* ------------------------------------------------------------------ detection */

const KIND_ORDER: Readonly<Record<AnomalyKind, number>> = {
  systematic_confusion: 0,
  regression: 1,
  possible_guessing: 2,
  stalled_near_threshold: 3,
  long_gap: 4,
};

/**
 * Every pattern worth a look for one concept, most actionable first.
 *
 * Deterministic: the same evidence always produces the same list in the same order.
 * Returns an empty list — the ordinary case — when nothing crosses a floor.
 */
export function detectAnomalies(
  input: AnomalyInput,
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
): readonly Anomaly[] {
  const observations = observationsFor(input.conceptId, input.observations);
  if (observations.length === 0) return [];

  const found: Anomaly[] = [];
  const guessing = detectGuessing(input.conceptId, observations, thresholds);
  if (guessing !== null) found.push(guessing);
  const regression = detectRegression(input.conceptId, observations, thresholds);
  if (regression !== null) found.push(regression);
  const confusion = detectSystematicConfusion(input.conceptId, observations, thresholds);
  if (confusion !== null) found.push(confusion);
  const gap = detectLongGap(input.conceptId, observations, input.now, thresholds);
  if (gap !== null) found.push(gap);
  const stalled = detectStalled(input.conceptId, input.ladder, thresholds);
  if (stalled !== null) found.push(stalled);

  return found.sort((a, b) => {
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0;
  });
}

/** Anomalies across several concepts, grouped and ordered deterministically. */
export function detectAnomaliesAcross(
  conceptIds: readonly ConceptId[],
  observations: readonly ConceptObservation[],
  now: Date,
  ladders: ReadonlyMap<ConceptId, LadderState> = new Map(),
  thresholds: AnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
): readonly Anomaly[] {
  const all: Anomaly[] = [];
  for (const conceptId of [...conceptIds].sort()) {
    const ladder = ladders.get(conceptId);
    all.push(
      ...detectAnomalies(
        {
          conceptId,
          observations,
          now,
          ...(ladder === undefined ? {} : { ladder }),
        },
        thresholds,
      ),
    );
  }
  return all.sort((a, b) => {
    if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    return a.conceptId < b.conceptId ? -1 : a.conceptId > b.conceptId ? 1 : 0;
  });
}
