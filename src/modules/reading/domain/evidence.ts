/**
 * Reading evidence — the shared vocabulary.
 *
 * Everything downstream of a practice activity (SmartScore, the mastery ladder, the
 * anomaly detectors, the lesson plan) reads the same record shape, so there is one
 * place where the *strength* of a piece of evidence is defined.
 *
 * ## Evidence rule
 *
 * A learner advances only on server-validated evidence, and not all evidence is
 * equal:
 *
 * - `machine_checked`   — a recognition answer checked against the authored key.
 *                         Objective, but it only proves recognition.
 * - `teacher_observed`  — a human who can hear the learner said it was right. The
 *                         strongest evidence this platform accepts, and the only
 *                         kind that closes the ladder when a teacher is present.
 * - `self_confirmed`    — a solo learner attested to their own production. Real,
 *                         recorded, and permanently distinguishable from a teacher's
 *                         verdict. It is never rendered as verification.
 * - `advisory_only`     — an on-device listening aid's opinion. Advisory in the
 *                         literal sense: it never writes mastery, never closes a
 *                         rung, and never raises a score.
 *
 * `MASTERY_BEARING_EVIDENCE` is the single list the rest of the module consults, so
 * "does this count?" can never drift between two files.
 *
 * Pure module: no I/O, no clock, no randomness.
 */

import type { ConceptId } from "./concepts";

export const EVIDENCE_KINDS = [
  "machine_checked",
  "teacher_observed",
  "self_confirmed",
  "advisory_only",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Evidence kinds that may move a mastery estimate. Deliberately short. */
export const MASTERY_BEARING_EVIDENCE: readonly EvidenceKind[] = [
  "machine_checked",
  "teacher_observed",
];

export function isMasteryBearing(kind: EvidenceKind): boolean {
  return MASTERY_BEARING_EVIDENCE.includes(kind);
}

/**
 * How much belief one observation of each kind licenses (0..1). Feeds SmartScore's
 * `confidence`, never its `score`: a weakly-evidenced state is *less certain*, not
 * *less good*.
 */
export const EVIDENCE_WEIGHTS: Readonly<Record<EvidenceKind, number>> = {
  machine_checked: 0.6,
  teacher_observed: 1,
  self_confirmed: 0.3,
  advisory_only: 0.1,
};

export const ACTIVITY_KINDS = ["recognition", "production"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * How a concept was presented. `ordered` is the taught sequence, `randomized` is the
 * shuffled set; the mastery ladder distinguishes them because getting a letter right
 * in its lesson order proves much less than getting it right out of the blue.
 */
export const PRESENTATIONS = ["ordered", "randomized", "in_person"] as const;
export type Presentation = (typeof PRESENTATIONS)[number];

/**
 * One recorded observation about one concept.
 *
 * Constructed on the server from a validated activity response; a client never hands
 * this shape in directly. `correct` is the observation's polarity, not a judgement of
 * the learner.
 */
export interface ConceptObservation {
  readonly conceptId: ConceptId;
  readonly correct: boolean;
  readonly at: Date;
  readonly activityKind: ActivityKind;
  readonly evidenceKind: EvidenceKind;
  readonly presentation: Presentation;
  /** Groups observations into sittings, so denominators can report sessions. */
  readonly sessionId: string;
  /** Wall time to answer, when the activity measured it. Never used to punish. */
  readonly elapsedMs?: number;
  /** For a wrong recognition answer, the concept actually chosen. */
  readonly chosenConceptId?: ConceptId;
}

/** A count that always travels with what it counts (honesty rule). */
export interface EvidenceDenominator {
  readonly attempts: number;
  readonly sessions: number;
}

export const EMPTY_DENOMINATOR: EvidenceDenominator = { attempts: 0, sessions: 0 };

/** Distinct session ids among `observations`. */
export function sessionCount(observations: readonly ConceptObservation[]): number {
  return new Set(observations.map((observation) => observation.sessionId)).size;
}

export function denominatorOf(
  observations: readonly ConceptObservation[],
): EvidenceDenominator {
  return { attempts: observations.length, sessions: sessionCount(observations) };
}

/** Observations for one concept, oldest first. Ties broken by session id then index. */
export function observationsFor(
  conceptId: ConceptId,
  observations: readonly ConceptObservation[],
): readonly ConceptObservation[] {
  return observations
    .map((observation, index) => ({ observation, index }))
    .filter((entry) => entry.observation.conceptId === conceptId)
    .sort((a, b) => {
      const byTime = a.observation.at.getTime() - b.observation.at.getTime();
      if (byTime !== 0) return byTime;
      return a.index - b.index;
    })
    .map((entry) => entry.observation);
}

/** Observations grouped by session, in first-seen order. */
export function bySession(
  observations: readonly ConceptObservation[],
): readonly (readonly ConceptObservation[])[] {
  const groups = new Map<string, ConceptObservation[]>();
  const ordered = [...observations].sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const observation of ordered) {
    const existing = groups.get(observation.sessionId);
    if (existing === undefined) groups.set(observation.sessionId, [observation]);
    else existing.push(observation);
  }
  return [...groups.values()];
}
