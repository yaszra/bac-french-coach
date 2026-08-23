/**
 * The mastery ladder: `ordered` → `randomized` → `in_person`.
 *
 * A learner meets a concept in the order it was taught, then out of order, then in
 * front of someone who can hear them. Each rung asks a harder question than the last,
 * and the last one is not a question a machine can ask.
 *
 * ## The in-person rung, and solo learners
 *
 * The top rung is a **human judgement**. When a teacher is present, only a teacher's
 * verdict closes it: a learner cannot self-certify past the ear that is meant to
 * check them.
 *
 * A learner with no teacher is not thereby locked out of their own progress. They may
 * self-confirm, and that advances the rung — but it is recorded as
 * `evidenceKind: "self_confirmed"`, and every value this module returns carries that
 * distinction forward:
 *
 * - `finalRungEvidenceKind` is `"teacher_observed"` or `"self_confirmed"`, never a
 *   boolean that flattens the two;
 * - `teacherVerified` and `selfConfirmed` are separate fields, and only one can be
 *   true;
 * - `verificationLabelKey` resolves to a different sentence in each case, so a report
 *   physically cannot render a self-confirmation as a teacher's verdict.
 *
 * The weaker evidence is real evidence. It is simply never *the same* evidence, and
 * a teacher who later hears the learner supersedes it.
 *
 * Pure module: no I/O, no clock (the caller supplies dates in the evidence), no
 * randomness.
 */

import { rate, type Rate } from "@/modules/memory/domain/numeric";
import { reason, type Reason } from "@/modules/memory/domain/types";

import type { ConceptId } from "./concepts";
import {
  observationsFor,
  sessionCount,
  type ConceptObservation,
  type EvidenceKind,
} from "./evidence";

export const LADDER_RUNGS = ["ordered", "randomized", "in_person"] as const;
export type LadderRung = (typeof LADDER_RUNGS)[number];

export function nextRung(rung: LadderRung): LadderRung | null {
  const index = LADDER_RUNGS.indexOf(rung);
  return LADDER_RUNGS[index + 1] ?? null;
}

/** Rungs strictly below `rung`, in order. */
export function rungsBelow(rung: LadderRung): readonly LadderRung[] {
  return LADDER_RUNGS.slice(0, LADDER_RUNGS.indexOf(rung));
}

export interface RungRequirement {
  readonly rung: LadderRung;
  readonly minCorrect: number;
  readonly minAccuracy: number;
  readonly minSessions: number;
  /** Evidence kinds this rung will accept at all. */
  readonly acceptedEvidence: readonly EvidenceKind[];
  /**
   * Whether the most recent accepted observation must itself be a success.
   *
   * True for the in-person rung: a human's latest word is the word. A learner heard
   * in March and told "not yet", then heard in April and told "yes", stands on the
   * April verdict — and the reverse is equally true, which is why an accuracy
   * threshold is the wrong instrument here and the ordering is the right one.
   */
  readonly latestMustBeCorrect: boolean;
}

export type LadderRequirements = Readonly<Record<LadderRung, RungRequirement>>;

/**
 * Defaults.
 *
 * The two machine rungs want a run of correct answers across more than one sitting —
 * six in the taught order, eight out of order over at least two days. The top rung
 * wants one thing only: someone heard it and said it was right. `acceptedEvidence`
 * for `in_person` lists the teacher alone; `self_confirmed` is admitted at runtime
 * only when `hasTeacher` is false, which is what keeps the two apart.
 */
export const DEFAULT_LADDER_REQUIREMENTS: LadderRequirements = {
  ordered: {
    rung: "ordered",
    minCorrect: 6,
    minAccuracy: 0.85,
    minSessions: 1,
    acceptedEvidence: ["machine_checked", "teacher_observed"],
    latestMustBeCorrect: false,
  },
  randomized: {
    rung: "randomized",
    minCorrect: 8,
    minAccuracy: 0.85,
    minSessions: 2,
    acceptedEvidence: ["machine_checked", "teacher_observed"],
    latestMustBeCorrect: false,
  },
  in_person: {
    rung: "in_person",
    minCorrect: 1,
    minAccuracy: 0,
    minSessions: 1,
    acceptedEvidence: ["teacher_observed"],
    latestMustBeCorrect: true,
  },
};

export interface LadderOptions {
  /**
   * Whether a teacher is available to this learner. With a teacher, the top rung
   * takes a teacher's verdict and nothing else. Defaults to `false` (solo), which is
   * permissive about *advancing* and never permissive about *labelling*.
   */
  readonly hasTeacher: boolean;
  readonly requirements?: LadderRequirements;
}

const SOLO: LadderOptions = { hasTeacher: false };

/** Evidence kinds a rung accepts, given whether a teacher is in the room. */
export function acceptedEvidenceFor(
  requirement: RungRequirement,
  hasTeacher: boolean,
): readonly EvidenceKind[] {
  if (requirement.rung !== "in_person") return requirement.acceptedEvidence;
  return hasTeacher
    ? requirement.acceptedEvidence
    : [...requirement.acceptedEvidence, "self_confirmed"];
}

export interface LadderRungProgress {
  readonly rung: LadderRung;
  readonly met: boolean;
  readonly attempts: number;
  readonly correct: number;
  readonly sessions: number;
  /** Accuracy carrying its denominator; `rate` is null when nothing was attempted. */
  readonly accuracy: Rate;
  readonly required: RungRequirement;
  /** Strongest accepted evidence kind seen on this rung, or `null`. */
  readonly evidenceKind: EvidenceKind | null;
  /** Whether the most recent accepted observation was a success; `null` if none. */
  readonly latestObservationCorrect: boolean | null;
  /** Evidence recorded on this rung that the rung does not accept, by kind. */
  readonly unacceptedEvidence: Readonly<Record<string, number>>;
  readonly reason: Reason;
}

const EVIDENCE_STRENGTH: Readonly<Record<EvidenceKind, number>> = {
  teacher_observed: 3,
  machine_checked: 2,
  self_confirmed: 1,
  advisory_only: 0,
};

function strongest(kinds: readonly EvidenceKind[]): EvidenceKind | null {
  let best: EvidenceKind | null = null;
  for (const kind of kinds) {
    if (best === null || EVIDENCE_STRENGTH[kind] > EVIDENCE_STRENGTH[best]) best = kind;
  }
  return best;
}

function progressFor(
  rung: LadderRung,
  observations: readonly ConceptObservation[],
  options: LadderOptions,
): LadderRungProgress {
  const requirements = options.requirements ?? DEFAULT_LADDER_REQUIREMENTS;
  const requirement = requirements[rung];
  const accepted = new Set(acceptedEvidenceFor(requirement, options.hasTeacher));

  const onRung = observations.filter((observation) => observation.presentation === rung);
  const counted = onRung.filter((observation) => accepted.has(observation.evidenceKind));
  const correct = counted.filter((observation) => observation.correct);
  const sessions = sessionCount(correct);
  const accuracy = rate(correct.length, counted.length);

  const unaccepted: Record<string, number> = {};
  for (const observation of onRung) {
    if (accepted.has(observation.evidenceKind)) continue;
    unaccepted[observation.evidenceKind] = (unaccepted[observation.evidenceKind] ?? 0) + 1;
  }

  const latest = counted[counted.length - 1];
  const latestIsCorrect = latest?.correct === true;
  const met =
    correct.length >= requirement.minCorrect &&
    sessions >= requirement.minSessions &&
    (accuracy.rate ?? 0) >= requirement.minAccuracy &&
    (!requirement.latestMustBeCorrect || latestIsCorrect);

  return {
    rung,
    met,
    attempts: counted.length,
    correct: correct.length,
    sessions,
    accuracy,
    required: requirement,
    evidenceKind: strongest(correct.map((observation) => observation.evidenceKind)),
    latestObservationCorrect: latest === undefined ? null : latest.correct,
    unacceptedEvidence: unaccepted,
    reason: reason(
      met ? "reading.ladder.reason.rung_met" : "reading.ladder.reason.rung_not_yet_met",
      {
        rung,
        correct: correct.length,
        attempts: counted.length,
        sessions,
        requiredCorrect: requirement.minCorrect,
        requiredSessions: requirement.minSessions,
      },
    ),
  };
}

export const VERIFICATION_LABEL_KEYS = {
  teacher: "reading.ladder.verification.teacher_verified",
  self: "reading.ladder.verification.self_confirmed",
  none: "reading.ladder.verification.not_yet_verified",
} as const;

export interface LadderState {
  readonly conceptId: ConceptId;
  /** Highest rung actually earned, or `null` when none has been. */
  readonly rung: LadderRung | null;
  /** The rung the learner is working on now. */
  readonly workingOn: LadderRung;
  readonly rungs: Readonly<Record<LadderRung, LadderRungProgress>>;
  /**
   * How the top rung was closed. Kept as a labelled kind rather than a boolean so
   * that no report can flatten a self-confirmation into a teacher's verdict.
   */
  readonly finalRungEvidenceKind: "teacher_observed" | "self_confirmed" | null;
  /** True only when a human teacher heard the learner and said it was right. */
  readonly teacherVerified: boolean;
  /** True when the learner attested to their own reading and no teacher has yet. */
  readonly selfConfirmed: boolean;
  /** i18n key that names exactly which of the three cases this is. */
  readonly verificationLabelKey: string;
  readonly complete: boolean;
  readonly reason: Reason;
}

/**
 * Where a learner stands on the ladder for one concept.
 *
 * `evidence` may contain observations for any concept; only this concept's are read.
 */
export function ladderState(
  conceptId: ConceptId,
  evidence: readonly ConceptObservation[],
  options: LadderOptions = SOLO,
): LadderState {
  const observations = observationsFor(conceptId, evidence);
  const ordered = progressFor("ordered", observations, options);
  const randomized = progressFor("randomized", observations, options);
  const inPerson = progressFor("in_person", observations, options);
  const rungs = { ordered, randomized, in_person: inPerson } as const;

  // A rung only counts once every rung below it does.
  const orderedMet = ordered.met;
  const randomizedMet = orderedMet && randomized.met;
  const inPersonMet = randomizedMet && inPerson.met;

  const highest: LadderRung | null = inPersonMet
    ? "in_person"
    : randomizedMet
      ? "randomized"
      : orderedMet
        ? "ordered"
        : null;
  const workingOn: LadderRung = inPersonMet
    ? "in_person"
    : randomizedMet
      ? "in_person"
      : orderedMet
        ? "randomized"
        : "ordered";

  const closingKind = inPersonMet ? inPerson.evidenceKind : null;
  const finalRungEvidenceKind =
    closingKind === "teacher_observed" || closingKind === "self_confirmed" ? closingKind : null;
  const teacherVerified = finalRungEvidenceKind === "teacher_observed";
  const selfConfirmed = finalRungEvidenceKind === "self_confirmed";

  return {
    conceptId,
    rung: highest,
    workingOn,
    rungs,
    finalRungEvidenceKind,
    teacherVerified,
    selfConfirmed,
    verificationLabelKey: teacherVerified
      ? VERIFICATION_LABEL_KEYS.teacher
      : selfConfirmed
        ? VERIFICATION_LABEL_KEYS.self
        : VERIFICATION_LABEL_KEYS.none,
    complete: inPersonMet,
    reason: reason(
      highest === null
        ? "reading.ladder.reason.not_yet_started"
        : teacherVerified
          ? "reading.ladder.reason.complete_teacher_verified"
          : selfConfirmed
            ? "reading.ladder.reason.complete_self_confirmed"
            : "reading.ladder.reason.in_progress",
      { conceptId, rung: highest ?? "none", workingOn },
    ),
  };
}

export interface AdvanceDecision {
  readonly rung: LadderRung;
  readonly allowed: boolean;
  readonly nextRung: LadderRung | null;
  /** The evidence kind that closed the rung, when one did. */
  readonly evidenceKind: EvidenceKind | null;
  readonly progress: LadderRungProgress;
  /** Everything still standing in the way. Empty when `allowed` is true. */
  readonly missing: readonly Reason[];
  readonly reason: Reason;
}

/**
 * May the learner leave `rung`?
 *
 * A rung is earned only when every rung below it is earned too, so
 * `canAdvance("in_person", …)` is false for a learner who has never practised out of
 * order, however many teacher verdicts they collect.
 *
 * With `hasTeacher: true`, a `self_confirmed` observation on the in-person rung is
 * counted, reported under `progress.unacceptedEvidence`, and does not advance
 * anything. With `hasTeacher: false` it advances, and `evidenceKind` says so.
 */
export function canAdvance(
  rung: LadderRung,
  evidence: readonly ConceptObservation[],
  options: LadderOptions,
): AdvanceDecision {
  const conceptId = evidence[0]?.conceptId ?? "";
  const observations =
    conceptId === "" ? [...evidence] : observationsFor(conceptId, evidence);
  const progress = progressFor(rung, observations, options);
  const missing: Reason[] = [];

  for (const lower of rungsBelow(rung)) {
    const lowerProgress = progressFor(lower, observations, options);
    if (!lowerProgress.met) {
      missing.push(
        reason("reading.ladder.missing.previous_rung", {
          rung,
          previousRung: lower,
          correct: lowerProgress.correct,
          requiredCorrect: lowerProgress.required.minCorrect,
        }),
      );
    }
  }

  if (progress.correct < progress.required.minCorrect) {
    missing.push(
      reason("reading.ladder.missing.correct_answers", {
        rung,
        correct: progress.correct,
        requiredCorrect: progress.required.minCorrect,
        attempts: progress.attempts,
      }),
    );
  }
  if (progress.sessions < progress.required.minSessions) {
    missing.push(
      reason("reading.ladder.missing.sessions", {
        rung,
        sessions: progress.sessions,
        requiredSessions: progress.required.minSessions,
      }),
    );
  }
  if ((progress.accuracy.rate ?? 0) < progress.required.minAccuracy) {
    missing.push(
      reason("reading.ladder.missing.accuracy", {
        rung,
        correct: progress.accuracy.numerator,
        attempts: progress.accuracy.denominator,
        requiredAccuracy: progress.required.minAccuracy,
      }),
    );
  }
  if (progress.required.latestMustBeCorrect && progress.latestObservationCorrect === false) {
    missing.push(
      reason("reading.ladder.missing.latest_observation_was_not_yet", {
        rung,
        correct: progress.correct,
        attempts: progress.attempts,
      }),
    );
  }
  if (
    rung === "in_person" &&
    options.hasTeacher &&
    (progress.unacceptedEvidence["self_confirmed"] ?? 0) > 0 &&
    progress.evidenceKind !== "teacher_observed"
  ) {
    missing.push(
      reason("reading.ladder.missing.teacher_verdict_required", {
        rung,
        selfConfirmations: progress.unacceptedEvidence["self_confirmed"] ?? 0,
      }),
    );
  }

  const allowed = missing.length === 0;
  return {
    rung,
    allowed,
    nextRung: allowed ? nextRung(rung) : null,
    evidenceKind: allowed ? progress.evidenceKind : null,
    progress,
    missing,
    reason: reason(
      allowed
        ? progress.evidenceKind === "self_confirmed"
          ? "reading.ladder.reason.advanced_on_self_confirmation"
          : "reading.ladder.reason.advanced"
        : "reading.ladder.reason.not_yet_eligible",
      {
        rung,
        hasTeacher: options.hasTeacher ? 1 : 0,
        evidenceKind: progress.evidenceKind ?? "none",
        blockers: missing.length,
      },
    ),
  };
}

export interface RungExplanation {
  readonly rung: LadderRung;
  readonly titleKey: string;
  readonly bodyKey: string;
  /** What kind of evidence closes this rung. */
  readonly evidenceKey: string;
  readonly nextRung: LadderRung | null;
}

/** Message keys the UI uses to say what a rung is and what will close it. */
export function explainRung(rung: LadderRung): RungExplanation {
  return {
    rung,
    titleKey: `reading.ladder.rung.${rung}.title`,
    bodyKey: `reading.ladder.rung.${rung}.body`,
    evidenceKey: `reading.ladder.rung.${rung}.evidence`,
    nextRung: nextRung(rung),
  };
}
