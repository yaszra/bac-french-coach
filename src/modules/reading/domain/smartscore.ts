/**
 * SmartScore — one honest number per reading concept.
 *
 * Three ingredients, kept separate so nothing hides behind an average:
 *
 * 1. **BKT posterior** — P(known) after the concept's mastery-bearing observations,
 *    computed by the shared engine in `@/modules/memory/domain/bkt`. This module
 *    does not reimplement Bayesian Knowledge Tracing; it feeds it.
 * 2. **Recency** — a gentle decay so a score earned in March does not read in
 *    September as though it were earned this morning. Floored, because silence is
 *    weaker evidence of forgetting than a miss is.
 * 3. **Evidence variety** — recognising a letter on screen, saying it aloud to a
 *    teacher, and doing both across several sittings are three different kinds of
 *    knowing. Variety raises `confidence`, never `score`: more kinds of evidence make
 *    the estimate *more certain*, not better.
 *
 * ## Honesty rule
 *
 * - `score` is `number | null`. `null` is the only encoding of "not yet recorded".
 *   A concept with nothing behind it never reports 0% — 0% is a claim, and no claim
 *   has been earned.
 * - `denominator` always travels with the score: how many attempts, across how many
 *   sittings, and how many of those attempts were the mastery-bearing kind.
 * - Evidence that is not mastery-bearing (a solo learner's self-confirmation, an
 *   advisory listener's opinion) is counted, reported in `evidenceMix`, and allowed
 *   to raise `confidence` — but it never moves the score. A learner practising alone
 *   is not thereby less advanced; the platform simply does not claim to know.
 *
 * Pure module: no I/O, no clock (the caller supplies `now`), no randomness.
 */

import {
  BKT_CONFIDENCE_OBSERVATIONS,
  DEFAULT_BKT_PARAMS,
  initialBktState,
  update as bktUpdate,
  type BktParams,
  type BktState,
} from "@/modules/memory/domain/bkt";
import { clamp01 } from "@/modules/memory/domain/numeric";
import { conceptUnitId, reason, type Reason } from "@/modules/memory/domain/types";

import type { ConceptId } from "./concepts";
import {
  EVIDENCE_KINDS,
  EVIDENCE_WEIGHTS,
  isMasteryBearing,
  observationsFor,
  sessionCount,
  type ConceptObservation,
  type EvidenceDenominator,
  type EvidenceKind,
} from "./evidence";

export const SMART_SCORE_STATES = ["not_yet_recorded", "emerging", "secure"] as const;
export type SmartScoreState = (typeof SMART_SCORE_STATES)[number];

export interface SmartScore {
  readonly conceptId: ConceptId;
  /**
   * 0..100, or `null` when no mastery-bearing evidence has been recorded. `null` is
   * never to be rendered as a number: the UI shows "not yet recorded".
   */
  readonly score: number | null;
  /** 0..1 — how much evidence stands behind the score. Not a measure of mastery. */
  readonly confidence: number;
  /** Everything that was observed: attempts and the sittings they fell in. */
  readonly denominator: EvidenceDenominator;
  /** The score's own denominator: attempts of a mastery-bearing kind. */
  readonly scoredAttempts: number;
  readonly state: SmartScoreState;
  /** Raw BKT posterior, or `null` when no mastery-bearing evidence exists. */
  readonly pKnown: number | null;
  readonly lastEvidenceAt: Date | null;
  /** Attempts by evidence kind — so a report can name what kind of knowing this is. */
  readonly evidenceMix: Readonly<Record<EvidenceKind, number>>;
  /** Distinct (activity kind × evidence kind) buckets seen. */
  readonly evidenceVariety: number;
  readonly reason: Reason;
}

export interface SmartScoreOptions {
  /** Evaluation time, for the recency term. Defaults to the last evidence. */
  readonly now?: Date;
  readonly params?: BktParams;
  /** Score at or above which a concept may read "secure". */
  readonly secureScore?: number;
  readonly secureConfidence?: number;
  readonly secureSessions?: number;
  /** Days over which an unrehearsed score halves its distance to the floor. */
  readonly recencyHalfLifeDays?: number;
  /** Recency never pushes a score below this share of its posterior. */
  readonly recencyFloor?: number;
}

export const SMART_SCORE_DEFAULTS = {
  secureScore: 85,
  secureConfidence: 0.6,
  secureSessions: 2,
  recencyHalfLifeDays: 45,
  recencyFloor: 0.6,
} as const;

const MS_PER_DAY = 86_400_000;

const EMPTY_MIX: Readonly<Record<EvidenceKind, number>> = Object.freeze({
  machine_checked: 0,
  teacher_observed: 0,
  self_confirmed: 0,
  advisory_only: 0,
});

function evidenceMixOf(
  observations: readonly ConceptObservation[],
): Readonly<Record<EvidenceKind, number>> {
  const mix: Record<EvidenceKind, number> = { ...EMPTY_MIX };
  for (const observation of observations) {
    mix[observation.evidenceKind] += 1;
  }
  return mix;
}

/**
 * Distinct (activity kind × evidence kind) buckets. A learner who has only ever
 * clicked the right picture has one; one who has clicked *and* recited to a teacher
 * has two, and the platform is correspondingly more certain about them.
 */
export function evidenceVariety(observations: readonly ConceptObservation[]): number {
  return new Set(
    observations.map((observation) => `${observation.activityKind}|${observation.evidenceKind}`),
  ).size;
}

/** 0.6 at one bucket, 0.8 at two, 1.0 at three or more. */
export function evidenceVarietyFactor(observations: readonly ConceptObservation[]): number {
  const variety = evidenceVariety(observations);
  if (variety <= 0) return 0;
  return 0.6 + 0.4 * Math.min(1, (variety - 1) / 2);
}

/** 0.7 at one sitting, 0.85 at two, 1.0 at three or more. */
export function sessionSpreadFactor(sessions: number): number {
  if (sessions <= 0) return 0;
  return 0.7 + 0.3 * Math.min(1, (sessions - 1) / 2);
}

/** Recency multiplier in `[floor, 1]`. Never below the floor: silence is not a miss. */
export function recencyFactor(
  daysSinceLastEvidence: number,
  halfLifeDays: number = SMART_SCORE_DEFAULTS.recencyHalfLifeDays,
  floor: number = SMART_SCORE_DEFAULTS.recencyFloor,
): number {
  if (!Number.isFinite(daysSinceLastEvidence) || daysSinceLastEvidence <= 0) return 1;
  if (halfLifeDays <= 0) return floor;
  const decayed = Math.pow(0.5, daysSinceLastEvidence / halfLifeDays);
  return clamp01(floor + (1 - floor) * decayed);
}

/**
 * Run BKT over the mastery-bearing observations for one concept. Returns `null` when
 * there are none — a prior with no evidence behind it is not a measurement.
 */
export function bktStateFor(
  conceptId: ConceptId,
  observations: readonly ConceptObservation[],
  params: BktParams = DEFAULT_BKT_PARAMS,
): BktState | null {
  const ordered = observationsFor(conceptId, observations).filter((observation) =>
    isMasteryBearing(observation.evidenceKind),
  );
  if (ordered.length === 0) return null;
  let state = initialBktState(conceptUnitId(conceptId), params);
  for (const observation of ordered) {
    state = bktUpdate(state, observation.correct, params, observation.at, null);
  }
  return state;
}

/**
 * The SmartScore for one concept, given every observation the caller has for it.
 *
 * Observations for other concepts are ignored, so the caller may pass a whole
 * session's evidence.
 */
export function smartScore(
  conceptId: ConceptId,
  observations: readonly ConceptObservation[],
  options: SmartScoreOptions = {},
): SmartScore {
  const ordered = observationsFor(conceptId, observations);
  const sessions = sessionCount(ordered);
  const denominator: EvidenceDenominator = { attempts: ordered.length, sessions };
  const mix = evidenceMixOf(ordered);
  const variety = evidenceVariety(ordered);
  const lastEvidenceAt = ordered[ordered.length - 1]?.at ?? null;

  if (ordered.length === 0) {
    return {
      conceptId,
      score: null,
      confidence: 0,
      denominator: { attempts: 0, sessions: 0 },
      scoredAttempts: 0,
      state: "not_yet_recorded",
      pKnown: null,
      lastEvidenceAt: null,
      evidenceMix: EMPTY_MIX,
      evidenceVariety: 0,
      reason: reason("reading.smartscore.reason.not_yet_recorded", { conceptId }),
    };
  }

  const params = options.params ?? DEFAULT_BKT_PARAMS;
  const scored = ordered.filter((observation) => isMasteryBearing(observation.evidenceKind));
  const weightedAttempts = ordered.reduce(
    (total, observation) => total + EVIDENCE_WEIGHTS[observation.evidenceKind],
    0,
  );
  const confidence = clamp01(
    (1 - Math.exp(-weightedAttempts / BKT_CONFIDENCE_OBSERVATIONS)) *
      evidenceVarietyFactor(ordered) *
      sessionSpreadFactor(sessions),
  );

  if (scored.length === 0) {
    // Something happened, and it is recorded — but nothing that this platform lets
    // stand as a mastery measurement. Saying "0%" here would be a lie; saying
    // "emerging" would quietly promote a self-attestation into progress.
    return {
      conceptId,
      score: null,
      confidence,
      denominator,
      scoredAttempts: 0,
      state: "not_yet_recorded",
      pKnown: null,
      lastEvidenceAt,
      evidenceMix: mix,
      evidenceVariety: variety,
      reason: reason("reading.smartscore.reason.no_mastery_bearing_evidence", {
        conceptId,
        attempts: ordered.length,
        sessions,
      }),
    };
  }

  const state = bktStateFor(conceptId, ordered, params);
  const pKnown = state?.pKnown ?? null;
  if (state === null || pKnown === null) {
    return {
      conceptId,
      score: null,
      confidence,
      denominator,
      scoredAttempts: 0,
      state: "not_yet_recorded",
      pKnown: null,
      lastEvidenceAt,
      evidenceMix: mix,
      evidenceVariety: variety,
      reason: reason("reading.smartscore.reason.no_mastery_bearing_evidence", {
        conceptId,
        attempts: ordered.length,
        sessions,
      }),
    };
  }

  const now = options.now ?? lastEvidenceAt;
  const daysSince =
    now === null || lastEvidenceAt === null
      ? 0
      : Math.max(0, (now.getTime() - lastEvidenceAt.getTime()) / MS_PER_DAY);
  const recency = recencyFactor(
    daysSince,
    options.recencyHalfLifeDays ?? SMART_SCORE_DEFAULTS.recencyHalfLifeDays,
    options.recencyFloor ?? SMART_SCORE_DEFAULTS.recencyFloor,
  );

  // Floored at 1: with real evidence on the record, a score of 0 would read as
  // "nothing here", which is a different and already-taken meaning.
  const score = Math.max(1, Math.round(100 * pKnown * recency));

  const secureScore = options.secureScore ?? SMART_SCORE_DEFAULTS.secureScore;
  const secureConfidence = options.secureConfidence ?? SMART_SCORE_DEFAULTS.secureConfidence;
  const secureSessions = options.secureSessions ?? SMART_SCORE_DEFAULTS.secureSessions;
  const isSecure =
    score >= secureScore && confidence >= secureConfidence && sessions >= secureSessions;

  return {
    conceptId,
    score,
    confidence,
    denominator,
    scoredAttempts: scored.length,
    state: isSecure ? "secure" : "emerging",
    pKnown,
    lastEvidenceAt,
    evidenceMix: mix,
    evidenceVariety: variety,
    reason: reason(
      isSecure ? "reading.smartscore.reason.secure" : "reading.smartscore.reason.emerging",
      {
        conceptId,
        score,
        attempts: ordered.length,
        scoredAttempts: scored.length,
        sessions,
      },
    ),
  };
}

/** SmartScores for several concepts, in the order given. */
export function smartScores(
  conceptIds: readonly ConceptId[],
  observations: readonly ConceptObservation[],
  options: SmartScoreOptions = {},
): readonly SmartScore[] {
  return conceptIds.map((conceptId) => smartScore(conceptId, observations, options));
}

/** The evidence kinds, re-exported so a report can iterate the mix in a fixed order. */
export const SMART_SCORE_EVIDENCE_ORDER: readonly EvidenceKind[] = EVIDENCE_KINDS;
