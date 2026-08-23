/**
 * Qāʿidah reading foundation.
 *
 * Kept deliberately separate from ḥifẓ memory. A learner can be strong at
 * memorizing and weak at reading, and a single blended score would hide
 * exactly the diagnosis a teacher needs — that the memorization problem is
 * really a reading problem.
 *
 * Pure and deterministic, like the rest of `src/core`.
 */
import type { EpochMs } from "./types.js";
import { MS_PER_DAY } from "./types.js";

export const QAIDA_VERSION = "athar-qaida/1.0.0";

/** The lesson shape from docs §10, in order. */
export const QAIDA_STAGES = [
  "concept",
  "model_audio",
  "listen_and_identify",
  "guided_production",
  "mixed_discrimination",
  "delayed_practice",
  "pronunciation_gate",
] as const;

export type QaidaStage = (typeof QAIDA_STAGES)[number];

/**
 * Stages that require hearing a qualified human.
 *
 * These cannot proceed without approved audio, because the learner is
 * being asked to imitate a sound. A silent "listen and identify" is not a
 * degraded experience; it is a different, useless one.
 */
export const AUDIO_REQUIRED_STAGES: ReadonlySet<QaidaStage> = new Set([
  "model_audio",
  "listen_and_identify",
  "mixed_discrimination",
]);

/**
 * Stages a learner cannot clear alone.
 *
 * Pronunciation is verified in person by a qualified human. Software does
 * not certify a makhraj.
 */
export const HUMAN_GATED_STAGES: ReadonlySet<QaidaStage> = new Set([
  "pronunciation_gate",
]);

// ---------------------------------------------------------------------------
// Audio resolution
// ---------------------------------------------------------------------------

/**
 * Resolution order: teacher recording, then academy studio, then a
 * licensed approved library, then unavailable.
 *
 * There is deliberately no synthetic option. A learner imitating a
 * synthesised makhraj is being taught something wrong by a system that
 * sounds confident.
 */
export type AudioProvenance =
  | "teacher_recording"
  | "academy_studio"
  | "licensed_library";

export const AUDIO_PRIORITY: readonly AudioProvenance[] = [
  "teacher_recording",
  "academy_studio",
  "licensed_library",
];

export interface AudioCandidate {
  assetId: string;
  provenance: AudioProvenance;
  /** Approved by a qualified reviewer. Unapproved audio is not a candidate. */
  approved: boolean;
  /** Recorded by this learner's own teacher, where applicable. */
  recordedByTeacherId?: string;
}

export type AudioResolution =
  | { available: true; assetId: string; provenance: AudioProvenance }
  | { available: false; explanation: string };

/**
 * Choose the audio for a skill.
 *
 * Prefers the learner's own teacher over any other recording: a child
 * learning a sound is best served by the voice already correcting them.
 */
export function resolveAudio(
  candidates: readonly AudioCandidate[],
  opts: { teacherId?: string } = {},
): AudioResolution {
  const approved = candidates.filter((c) => c.approved);
  if (approved.length === 0)
    return {
      available: false,
      // Said plainly. Never substituted.
      explanation: "Recording not yet available.",
    };

  const ownTeacher = opts.teacherId
    ? approved.find(
        (c) =>
          c.provenance === "teacher_recording" &&
          c.recordedByTeacherId === opts.teacherId,
      )
    : undefined;
  if (ownTeacher)
    return {
      available: true,
      assetId: ownTeacher.assetId,
      provenance: ownTeacher.provenance,
    };

  for (const provenance of AUDIO_PRIORITY) {
    const match = approved.find((c) => c.provenance === provenance);
    if (match)
      return { available: true, assetId: match.assetId, provenance: match.provenance };
  }
  return { available: false, explanation: "Recording not yet available." };
}

// ---------------------------------------------------------------------------
// Skill state
// ---------------------------------------------------------------------------

export type QaidaSkillState =
  | "not_started"
  | "introduced"
  | "producing"
  | "discriminating"
  | "awaiting_pronunciation_check"
  | "confirmed"
  | "needs_repair";

export interface QaidaAttempt {
  stage: QaidaStage;
  correct: boolean;
  occurredAt: EpochMs;
  /** True when a human was guiding in the moment. */
  assisted: boolean;
}

export interface QaidaSkillProgress {
  state: QaidaSkillState;
  stage: QaidaStage;
  /** Unassisted correct attempts at the current stage. */
  cleanAtStage: number;
  lastPractisedAt: EpochMs | null;
  /** Set only by a qualified human, in person. */
  pronunciationConfirmedAt: EpochMs | null;
  pronunciationConfirmedBy: string | null;
}

export const initialQaidaProgress: QaidaSkillProgress = {
  state: "not_started",
  stage: "concept",
  cleanAtStage: 0,
  lastPractisedAt: null,
  pronunciationConfirmedAt: null,
  pronunciationConfirmedBy: null,
};

export const qaidaParams = {
  /** Unassisted correct attempts needed to leave a stage. */
  cleanToAdvance: 3,
  /** Delayed practice must be this many days after the last session. */
  delayedPracticeMinDays: 1,
} as const;

export class QaidaGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QaidaGateError";
  }
}

function stateForStage(stage: QaidaStage): QaidaSkillState {
  switch (stage) {
    case "concept":
    case "model_audio":
      return "introduced";
    case "listen_and_identify":
    case "guided_production":
      return "producing";
    case "mixed_discrimination":
    case "delayed_practice":
      return "discriminating";
    case "pronunciation_gate":
      return "awaiting_pronunciation_check";
  }
}

export interface QaidaTransition {
  progress: QaidaSkillProgress;
  advanced: boolean;
  reason: string;
}

/**
 * Fold one attempt into a skill's progress.
 *
 * Assisted attempts never advance a stage: being guided through a sound is
 * how it is learned, not evidence that it has been.
 */
export function recordQaidaAttempt(
  progress: QaidaSkillProgress,
  attempt: QaidaAttempt,
  audio: AudioResolution,
): QaidaTransition {
  if (AUDIO_REQUIRED_STAGES.has(attempt.stage) && !audio.available)
    throw new QaidaGateError(
      `${attempt.stage} requires a qualified human recording. ${audio.explanation}`,
    );

  if (HUMAN_GATED_STAGES.has(attempt.stage))
    throw new QaidaGateError(
      "The pronunciation gate is cleared by a qualified human in person, not by a recorded attempt.",
    );

  // Delayed practice means delayed. Repeating it the same day would
  // measure short-term recall and call it retention.
  if (
    attempt.stage === "delayed_practice" &&
    progress.lastPractisedAt !== null &&
    (attempt.occurredAt - progress.lastPractisedAt) / MS_PER_DAY <
      qaidaParams.delayedPracticeMinDays
  )
    throw new QaidaGateError(
      "Delayed practice must happen at least a day after the last session.",
    );

  const base: QaidaSkillProgress = {
    ...progress,
    stage: attempt.stage,
    state: stateForStage(attempt.stage),
    lastPractisedAt: attempt.occurredAt,
  };

  if (!attempt.correct)
    return {
      progress: { ...base, cleanAtStage: 0, state: "needs_repair" },
      advanced: false,
      reason: "Attempt was incorrect; this step needs more practice.",
    };

  if (attempt.assisted)
    return {
      progress: { ...base, cleanAtStage: progress.cleanAtStage },
      advanced: false,
      reason: "Correct with guidance, which teaches but does not advance the step.",
    };

  const clean = progress.stage === attempt.stage ? progress.cleanAtStage + 1 : 1;
  if (clean < qaidaParams.cleanToAdvance)
    return {
      progress: { ...base, cleanAtStage: clean },
      advanced: false,
      reason: `${clean} of ${qaidaParams.cleanToAdvance} clean attempts at this step.`,
    };

  const index = QAIDA_STAGES.indexOf(attempt.stage);
  const next = QAIDA_STAGES[index + 1];
  if (!next)
    return {
      progress: { ...base, cleanAtStage: clean },
      advanced: false,
      reason: "Final step reached.",
    };

  return {
    progress: {
      ...base,
      stage: next,
      state: stateForStage(next),
      cleanAtStage: 0,
    },
    advanced: true,
    reason: `Moving on to ${next.replace(/_/g, " ")}.`,
  };
}

/**
 * Confirm pronunciation.
 *
 * The only way a skill reaches `confirmed`, and only a qualified human can
 * call it. There is no software path to this state.
 */
export function confirmPronunciation(
  progress: QaidaSkillProgress,
  input: { verifierUserId: string; now: EpochMs; verifierIsQualified: boolean },
): QaidaSkillProgress {
  if (!input.verifierIsQualified)
    throw new QaidaGateError(
      "Pronunciation is confirmed by a qualified human only.",
    );
  if (progress.stage !== "pronunciation_gate")
    throw new QaidaGateError(
      "This skill has not reached the pronunciation gate yet.",
    );
  return {
    ...progress,
    state: "confirmed",
    pronunciationConfirmedAt: input.now,
    pronunciationConfirmedBy: input.verifierUserId,
  };
}

/**
 * Reading readiness for a memorization target.
 *
 * Answers the diagnostic question: is this a memory problem or a reading
 * problem? Returns the unconfirmed prerequisites, so a teacher sees what
 * to teach rather than a score.
 */
export function unmetReadingPrerequisites(
  required: readonly string[],
  confirmed: ReadonlySet<string>,
): readonly string[] {
  return required.filter((skillId) => !confirmed.has(skillId));
}
