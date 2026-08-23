/**
 * The evidence gate.
 *
 * `gradeAttempt` is the only place a ḥifẓ `Grade` is ever born, and it is born from
 * *observations* alone: what the learner produced, in what order, how long it took,
 * how much help was on screen. There is no `score`, `grade`, `correct` or `mastered`
 * field anywhere in `AttemptEvidence` — a client cannot assert its own result even
 * by accident, because there is no shape for it to travel in (the zod schemas in
 * `../schemas/evidence.ts` are strict, so an extra `score` key is rejected outright).
 *
 * Three answers are possible, and two of them are not grades:
 *
 * - `graded`               — the observations support a grade.
 * - `requires_human`       — only a person's ear can settle this. `oral_recitation`
 *                            *always* lands here; this is the ear-gate.
 * - `insufficient_evidence` — the observations are missing or unusable. This is an
 *                            honest answer, and it is never quietly turned into
 *                            "again" or into a default pass.
 *
 * Standing rules, enforced below:
 * - A `listen` never yields better than `hard`, and never counts as recall.
 * - Hints and reveals downgrade, one step per hint.
 * - Latency past a threshold downgrades a cue.
 * - More than one rescramble per placement downgrades a rebuild.
 * - Text on screen caps the grade: reading is not recalling.
 *
 * Pure: no clock, no I/O, no randomness, no memory writes. The caller stamps the
 * time from the server and hands the result to the scheduler.
 */

import { roundTo, clamp01 } from "@/modules/memory/domain/numeric";
import { GRADES } from "@/modules/memory/domain/types";
import type { Grade, ReviewEvidence } from "@/modules/memory/domain/types";
import type { ScaffoldLevel } from "@/modules/memory/domain/scaffold";
import { evidenceStrength, retrievalTypeOf, type HifzExercise } from "./exercises";

/* ------------------------------------------------------------------ evidence */

/** One placement in a rebuild: which slot, and whether the word landed in it. */
export interface PlacementObservation {
  readonly index: number;
  readonly correct: boolean;
}

/** One gap in a gap-fill: which word was hidden, whether it came back, in how many tries. */
export interface GapObservation {
  readonly wordIndex: number;
  readonly correct: boolean;
  readonly attempts: number;
}

/**
 * Everything the client is allowed to say about an attempt: observations, never
 * conclusions. Discriminated by `exercise`, so each rung's evidence is exactly the
 * evidence that rung can produce.
 *
 * Sacred-content note: no member carries scripture. `cueAyah` is an ASCII
 * *reference* (e.g. a unit id), and is rejected if it is anything else.
 */
export type AttemptEvidence =
  | {
      readonly exercise: "listen";
      readonly playedMs: number;
      readonly ayahDurationMs: number;
      readonly replays: number;
    }
  | {
      readonly exercise: "recall_first";
      readonly producedWordCount: number;
      readonly expectedWordCount: number;
      /** Milliseconds before the learner asked to see the answer; `null` if never. */
      readonly revealedAfterMs: number | null;
      readonly hintsUsed: number;
    }
  | {
      readonly exercise: "rebuild";
      readonly placements: readonly PlacementObservation[];
      readonly rescrambles: number;
      readonly elapsedMs: number;
    }
  | {
      readonly exercise: "gap_fill";
      readonly gaps: readonly GapObservation[];
    }
  | {
      readonly exercise: "next_ayah_cue";
      /** ASCII reference to the cue āyah (a unit id or `surah:ayah`). Never text. */
      readonly cueAyah: string;
      readonly producedFirstWords: boolean;
      readonly latencyMs: number;
      readonly hintsUsed: number;
    }
  | {
      readonly exercise: "connect_chain";
      readonly ayahsRequested: number;
      readonly ayahsProducedInOrder: number;
      /** Positions in the chain where the learner stopped or restarted. */
      readonly breaks: readonly number[];
    }
  | {
      readonly exercise: "oral_recitation";
      readonly recordedMs: number;
      readonly expectedWordCount: number;
      /**
       * Advisory match rate from on-device ASR, or `null`. Recorded for the human
       * reviewer's convenience and **never read by this module**: an advisory
       * mirror does not grade (see `reciteDiff.ts`).
       */
      readonly advisoryMatchRate: number | null;
    };

/** The exercise an evidence payload belongs to. */
export function exerciseOf(evidence: AttemptEvidence): HifzExercise {
  return evidence.exercise;
}

/* ------------------------------------------------------------------- results */

export type GradeResult =
  | {
      readonly kind: "graded";
      readonly grade: Grade;
      /** How much this attempt proves, in [0, 1]: the rung, less every penalty. */
      readonly evidenceStrength: number;
      /** Stable i18n keys, in the order they were applied. Never literal text. */
      readonly rationale: readonly string[];
    }
  | { readonly kind: "requires_human"; readonly reason: string }
  | {
      readonly kind: "insufficient_evidence";
      /** Field names whose observation is missing or unusable. */
      readonly missing: readonly string[];
    };

/* ---------------------------------------------------------------- thresholds */

export interface GradingThresholds {
  readonly listen: {
    /** Share of the āyah that must actually play to count as a full exposure. */
    readonly fullCoverage: number;
    /** Below this share, the exposure did not happen. */
    readonly minimumCoverage: number;
    /** Replays at or above this count are worth telling the teacher about. */
    readonly replayConcern: number;
  };
  readonly recallFirst: {
    readonly complete: number;
    readonly good: number;
    readonly hard: number;
    /** A reveal this fast is giving up, not recalling. */
    readonly gaveUpMs: number;
  };
  readonly rebuild: {
    readonly good: number;
    readonly hard: number;
    /** Rescrambles per placement above which the ordering was searched for, not known. */
    readonly rescramblesPerPlacement: number;
    /** Milliseconds per placement above which the rebuild was laboured. */
    readonly msPerPlacement: number;
  };
  readonly gapFill: {
    readonly good: number;
    readonly hard: number;
    /** Mean attempts per gap above which the words were guessed at. */
    readonly attemptsPerGap: number;
  };
  readonly cue: {
    readonly easyMs: number;
    readonly goodMs: number;
    /** Past this, the join did not fire; the learner reconstructed it. */
    readonly hardMs: number;
  };
  readonly chain: {
    readonly good: number;
    readonly hard: number;
  };
}

/**
 * Defaults, and why:
 *
 * - **listen** 0.9 / 0.5: a played share of 0.9 allows for a fade-out; below half,
 *   nothing was heard. Three replays is the point a teacher would want to know.
 * - **recall_first** 0.99 / 0.8 / 0.5: the first words are short, so "all of them"
 *   is the only clean pass; four fifths is good; half is a stumble. A reveal inside
 *   1.5 s is a tap, not a recall attempt.
 * - **rebuild** 0.9 / 0.7 with 1 rescramble per placement: rescrambling more than
 *   once per word is search behaviour. 6 s per placement is a slow, laboured drag.
 * - **gap_fill** 0.9 / 0.7 with 2 attempts per gap: a second try is normal, a third
 *   is guessing.
 * - **cue** 2 s / 5 s / 10 s: a fired join starts inside two seconds; five seconds
 *   is a working join; past ten the āyah was rebuilt from context, not cued.
 * - **chain** 0.8 / 0.5 of the requested āyāt produced in order.
 */
export const DEFAULT_GRADING_THRESHOLDS: GradingThresholds = {
  listen: { fullCoverage: 0.9, minimumCoverage: 0.5, replayConcern: 3 },
  recallFirst: { complete: 0.99, good: 0.8, hard: 0.5, gaveUpMs: 1_500 },
  rebuild: { good: 0.9, hard: 0.7, rescramblesPerPlacement: 1, msPerPlacement: 6_000 },
  gapFill: { good: 0.9, hard: 0.7, attemptsPerGap: 2 },
  cue: { easyMs: 2_000, goodMs: 5_000, hardMs: 10_000 },
  chain: { good: 0.8, hard: 0.5 },
};

/**
 * The best grade each rung can ever produce.
 *
 * `listen` is capped at `hard` by the standing rule — exposure is not retrieval.
 * `rebuild` is capped at `good`: every word is on screen, so a perfect ordering
 * proves the sequence, not effortless production.
 */
export const MAX_GRADE_BY_EXERCISE: Readonly<Record<HifzExercise, Grade>> = {
  listen: "hard",
  recall_first: "easy",
  rebuild: "good",
  gap_fill: "easy",
  next_ayah_cue: "easy",
  connect_chain: "easy",
  oral_recitation: "easy",
};

/** Support on screen caps the grade: reading is not recalling. */
export const MAX_GRADE_BY_SCAFFOLD: Readonly<Record<ScaffoldLevel, Grade>> = {
  full_text: "hard",
  first_letters: "good",
  word_count: "easy",
  blank: "easy",
};

/** Multiplier on evidence strength for the support that was on screen. */
const SCAFFOLD_STRENGTH_FACTOR: Readonly<Record<ScaffoldLevel, number>> = {
  full_text: 0.4,
  first_letters: 0.7,
  word_count: 0.9,
  blank: 1,
};

/** Each hint costs a fifth of the attempt's evidential value, never below a fifth. */
const HINT_STRENGTH_PENALTY = 0.2;
const MIN_HINT_FACTOR = 0.2;
/** A revealed answer keeps less than half its evidential value. */
const REVEAL_STRENGTH_FACTOR = 0.4;

export interface GradingContext {
  /** The scaffold the learner had while attempting. Absent means "unknown". */
  readonly scaffold?: ScaffoldLevel;
  readonly thresholds?: GradingThresholds;
}

/* ------------------------------------------------------------------- helpers */

function gradeIndex(grade: Grade): number {
  return GRADES.indexOf(grade);
}

function gradeAt(index: number): Grade {
  const bounded = Math.min(Math.max(index, 0), GRADES.length - 1);
  return GRADES[bounded] ?? "again";
}

/** Step a grade down; `again` is the floor. */
export function downgrade(grade: Grade, steps = 1): Grade {
  if (steps <= 0) return grade;
  return gradeAt(gradeIndex(grade) - steps);
}

/** The lower of two grades. */
export function capGrade(grade: Grade, ceiling: Grade): Grade {
  return gradeIndex(grade) <= gradeIndex(ceiling) ? grade : ceiling;
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegative(value: number): boolean {
  return isFiniteNumber(value) && value >= 0;
}

function isPositive(value: number): boolean {
  return isFiniteNumber(value) && value > 0;
}

function isCount(value: number): boolean {
  return isNonNegative(value) && Number.isInteger(value);
}

/** ASCII references only — scripture never rides in on an evidence field. */
const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9:._>-]{0,63}$/;

function insufficient(missing: readonly string[]): GradeResult {
  return { kind: "insufficient_evidence", missing };
}

interface Verdict {
  readonly grade: Grade;
  readonly rationale: readonly string[];
  /** Accuracy-like factor in [0, 1] applied to the rung's evidence strength. */
  readonly quality: number;
  /** Extra multipliers for hints, reveals and coverage. */
  readonly penalty: number;
}

function strengthOf(
  exercise: HifzExercise,
  verdict: Verdict,
  scaffold: ScaffoldLevel | undefined,
): number {
  const scaffoldFactor = scaffold === undefined ? 1 : SCAFFOLD_STRENGTH_FACTOR[scaffold];
  const raw =
    evidenceStrength(exercise) * clamp01(verdict.quality) * clamp01(verdict.penalty) * scaffoldFactor;
  return roundTo(clamp01(raw), 3);
}

function hintFactor(hintsUsed: number): number {
  return Math.max(MIN_HINT_FACTOR, 1 - HINT_STRENGTH_PENALTY * hintsUsed);
}

/* ---------------------------------------------------------------- the gate */

/**
 * Grade one attempt from its observations.
 *
 * Never throws: malformed observations come back as `insufficient_evidence`, which
 * the caller records as an unusable attempt rather than as a failure.
 */
export function gradeAttempt(
  evidence: AttemptEvidence,
  context: GradingContext = {},
): GradeResult {
  // The ear-gate, before anything else. No observation, however complete, lets a
  // machine decide that a recitation was correct.
  if (evidence.exercise === "oral_recitation") {
    return { kind: "requires_human", reason: "hifz.grade.oral_recitation_requires_human" };
  }

  const thresholds = context.thresholds ?? DEFAULT_GRADING_THRESHOLDS;
  const scaffold = context.scaffold;
  const verdict = judge(evidence, thresholds);
  if (verdict === null || "missing" in verdict) {
    return insufficient(verdict === null ? ["evidence"] : verdict.missing);
  }

  const rationale = [...verdict.rationale];
  let grade = capGrade(verdict.grade, MAX_GRADE_BY_EXERCISE[evidence.exercise]);
  if (grade !== verdict.grade) rationale.push(`hifz.grade.capped_by_exercise.${evidence.exercise}`);

  if (scaffold !== undefined) {
    const capped = capGrade(grade, MAX_GRADE_BY_SCAFFOLD[scaffold]);
    if (capped !== grade) rationale.push(`hifz.grade.capped_by_scaffold.${scaffold}`);
    grade = capped;
  }

  return {
    kind: "graded",
    grade,
    evidenceStrength: strengthOf(evidence.exercise, verdict, scaffold),
    rationale,
  };
}

type Judgement = Verdict | { readonly missing: readonly string[] };

function judge(
  evidence: Exclude<AttemptEvidence, { exercise: "oral_recitation" }>,
  thresholds: GradingThresholds,
): Judgement | null {
  switch (evidence.exercise) {
    case "listen":
      return judgeListen(evidence, thresholds);
    case "recall_first":
      return judgeRecallFirst(evidence, thresholds);
    case "rebuild":
      return judgeRebuild(evidence, thresholds);
    case "gap_fill":
      return judgeGapFill(evidence, thresholds);
    case "next_ayah_cue":
      return judgeCue(evidence, thresholds);
    case "connect_chain":
      return judgeChain(evidence, thresholds);
  }
}

function judgeListen(
  evidence: Extract<AttemptEvidence, { exercise: "listen" }>,
  thresholds: GradingThresholds,
): Judgement {
  const missing: string[] = [];
  if (!isNonNegative(evidence.playedMs)) missing.push("playedMs");
  if (!isPositive(evidence.ayahDurationMs)) missing.push("ayahDurationMs");
  if (!isCount(evidence.replays)) missing.push("replays");
  if (missing.length > 0) return { missing };

  const coverage = clamp01(evidence.playedMs / evidence.ayahDurationMs);
  const rationale = ["hifz.grade.listen_is_exposure_not_recall"];
  if (coverage < thresholds.listen.minimumCoverage) {
    rationale.push("hifz.grade.listen_incomplete");
    return { grade: "again", rationale, quality: coverage, penalty: 1 };
  }
  if (coverage < thresholds.listen.fullCoverage) rationale.push("hifz.grade.listen_partial");
  if (evidence.replays >= thresholds.listen.replayConcern) {
    rationale.push("hifz.grade.listen_many_replays");
  }
  // Capped at `hard` downstream by MAX_GRADE_BY_EXERCISE; stated here as well so the
  // ceiling is visible at the point the grade is proposed.
  return { grade: "hard", rationale, quality: coverage, penalty: 1 };
}

function judgeRecallFirst(
  evidence: Extract<AttemptEvidence, { exercise: "recall_first" }>,
  thresholds: GradingThresholds,
): Judgement {
  const missing: string[] = [];
  if (!isCount(evidence.producedWordCount)) missing.push("producedWordCount");
  if (!isCount(evidence.expectedWordCount) || evidence.expectedWordCount < 1) {
    missing.push("expectedWordCount");
  }
  if (evidence.revealedAfterMs !== null && !isNonNegative(evidence.revealedAfterMs)) {
    missing.push("revealedAfterMs");
  }
  if (!isCount(evidence.hintsUsed)) missing.push("hintsUsed");
  if (missing.length > 0) return { missing };

  const ratio = clamp01(evidence.producedWordCount / evidence.expectedWordCount);
  const rationale: string[] = [];
  let grade: Grade;
  if (ratio >= thresholds.recallFirst.complete) grade = "easy";
  else if (ratio >= thresholds.recallFirst.good) grade = "good";
  else if (ratio >= thresholds.recallFirst.hard) grade = "hard";
  else grade = "again";

  let penalty = 1;
  if (evidence.revealedAfterMs !== null) {
    penalty *= REVEAL_STRENGTH_FACTOR;
    if (evidence.revealedAfterMs <= thresholds.recallFirst.gaveUpMs) {
      rationale.push("hifz.grade.revealed_immediately");
      grade = "again";
    } else {
      rationale.push("hifz.grade.answer_revealed");
      grade = capGrade(grade, "hard");
    }
  }
  if (evidence.hintsUsed > 0) {
    rationale.push("hifz.grade.hints_used");
    grade = downgrade(grade, evidence.hintsUsed);
    penalty *= hintFactor(evidence.hintsUsed);
  }
  return { grade, rationale, quality: ratio, penalty };
}

function judgeRebuild(
  evidence: Extract<AttemptEvidence, { exercise: "rebuild" }>,
  thresholds: GradingThresholds,
): Judgement {
  const missing: string[] = [];
  if (!Array.isArray(evidence.placements) || evidence.placements.length === 0) {
    missing.push("placements");
  } else {
    const seen = new Set<number>();
    for (const placement of evidence.placements) {
      if (placement === undefined || !isCount(placement.index) || seen.has(placement.index)) {
        missing.push("placements");
        break;
      }
      if (typeof placement.correct !== "boolean") {
        missing.push("placements");
        break;
      }
      seen.add(placement.index);
    }
  }
  if (!isCount(evidence.rescrambles)) missing.push("rescrambles");
  if (!isNonNegative(evidence.elapsedMs)) missing.push("elapsedMs");
  if (missing.length > 0) return { missing };

  const total = evidence.placements.length;
  const correct = evidence.placements.filter((placement) => placement.correct).length;
  const accuracy = correct / total;
  const rationale: string[] = [];
  let grade: Grade;
  if (accuracy >= 1) grade = "easy";
  else if (accuracy >= thresholds.rebuild.good) grade = "good";
  else if (accuracy >= thresholds.rebuild.hard) grade = "hard";
  else grade = "again";

  const perPlacement = evidence.rescrambles / total;
  let penalty = 1;
  if (perPlacement > thresholds.rebuild.rescramblesPerPlacement) {
    const steps = Math.max(1, Math.floor(perPlacement));
    rationale.push("hifz.grade.rescramble_churn");
    grade = downgrade(grade, steps);
    penalty *= Math.max(MIN_HINT_FACTOR, 1 / (1 + perPlacement));
  }
  if (evidence.elapsedMs / total > thresholds.rebuild.msPerPlacement) {
    rationale.push("hifz.grade.rebuild_laboured");
    grade = downgrade(grade, 1);
    penalty *= 0.8;
  }
  return { grade, rationale, quality: accuracy, penalty };
}

function judgeGapFill(
  evidence: Extract<AttemptEvidence, { exercise: "gap_fill" }>,
  thresholds: GradingThresholds,
): Judgement {
  if (!Array.isArray(evidence.gaps) || evidence.gaps.length === 0) return { missing: ["gaps"] };
  const seen = new Set<number>();
  for (const gap of evidence.gaps) {
    if (gap === undefined || !isCount(gap.wordIndex) || seen.has(gap.wordIndex)) {
      return { missing: ["gaps"] };
    }
    if (typeof gap.correct !== "boolean" || !isCount(gap.attempts)) return { missing: ["gaps"] };
    // A gap cannot be filled correctly without being attempted at least once.
    if (gap.correct && gap.attempts < 1) return { missing: ["gaps"] };
    seen.add(gap.wordIndex);
  }

  const total = evidence.gaps.length;
  const correct = evidence.gaps.filter((gap) => gap.correct).length;
  const firstTry = evidence.gaps.filter((gap) => gap.correct && gap.attempts <= 1).length;
  const accuracy = correct / total;
  const attemptsPerGap = evidence.gaps.reduce((sum, gap) => sum + gap.attempts, 0) / total;

  const rationale: string[] = [];
  let grade: Grade;
  if (correct === total && firstTry === total) grade = "easy";
  else if (accuracy >= thresholds.gapFill.good) grade = "good";
  else if (accuracy >= thresholds.gapFill.hard) grade = "hard";
  else grade = "again";

  let penalty = 1;
  if (attemptsPerGap > thresholds.gapFill.attemptsPerGap) {
    rationale.push("hifz.grade.gap_fill_repeated_attempts");
    grade = downgrade(grade, 1);
    penalty *= Math.max(MIN_HINT_FACTOR, 1 / attemptsPerGap);
  }
  return { grade, rationale, quality: accuracy, penalty };
}

function judgeCue(
  evidence: Extract<AttemptEvidence, { exercise: "next_ayah_cue" }>,
  thresholds: GradingThresholds,
): Judgement {
  const missing: string[] = [];
  if (typeof evidence.cueAyah !== "string" || !REFERENCE_RE.test(evidence.cueAyah)) {
    missing.push("cueAyah");
  }
  if (typeof evidence.producedFirstWords !== "boolean") missing.push("producedFirstWords");
  if (!isNonNegative(evidence.latencyMs)) missing.push("latencyMs");
  if (!isCount(evidence.hintsUsed)) missing.push("hintsUsed");
  if (missing.length > 0) return { missing };

  if (!evidence.producedFirstWords) {
    return {
      grade: "again",
      rationale: ["hifz.grade.cue_not_produced"],
      quality: 0,
      penalty: 1,
    };
  }

  const rationale: string[] = [];
  let grade: Grade;
  if (evidence.latencyMs <= thresholds.cue.easyMs) grade = "easy";
  else if (evidence.latencyMs <= thresholds.cue.goodMs) grade = "good";
  else if (evidence.latencyMs <= thresholds.cue.hardMs) grade = "hard";
  else grade = "again";
  if (evidence.latencyMs > thresholds.cue.easyMs) rationale.push("hifz.grade.cue_slow");

  let penalty = 1;
  if (evidence.hintsUsed > 0) {
    rationale.push("hifz.grade.hints_used");
    grade = downgrade(grade, evidence.hintsUsed);
    penalty *= hintFactor(evidence.hintsUsed);
  }
  // Quality falls off with latency: a join that fires instantly proves more.
  const quality = clamp01(thresholds.cue.goodMs / Math.max(evidence.latencyMs, 1));
  return { grade, rationale, quality, penalty };
}

function judgeChain(
  evidence: Extract<AttemptEvidence, { exercise: "connect_chain" }>,
  thresholds: GradingThresholds,
): Judgement {
  const missing: string[] = [];
  if (!isCount(evidence.ayahsRequested) || evidence.ayahsRequested < 1) {
    missing.push("ayahsRequested");
  }
  if (!isCount(evidence.ayahsProducedInOrder)) missing.push("ayahsProducedInOrder");
  if (
    missing.length === 0 &&
    evidence.ayahsProducedInOrder > evidence.ayahsRequested
  ) {
    missing.push("ayahsProducedInOrder");
  }
  if (!Array.isArray(evidence.breaks)) missing.push("breaks");
  else {
    for (const at of evidence.breaks) {
      if (!isCount(at) || at >= Math.max(evidence.ayahsRequested, 1)) {
        missing.push("breaks");
        break;
      }
    }
  }
  if (missing.length > 0) return { missing };

  const ratio = clamp01(evidence.ayahsProducedInOrder / evidence.ayahsRequested);
  const breaks = evidence.breaks.length;
  const rationale: string[] = [];
  let grade: Grade;
  if (ratio >= 1 && breaks === 0) grade = "easy";
  else if (ratio >= thresholds.chain.good) grade = "good";
  else if (ratio >= thresholds.chain.hard) grade = "hard";
  else grade = "again";

  let penalty = 1;
  if (breaks > 0) {
    rationale.push("hifz.grade.chain_broken");
    grade = downgrade(grade, breaks >= 2 ? 2 : 1);
    penalty *= Math.max(MIN_HINT_FACTOR, 1 / (1 + breaks));
  }
  return { grade, rationale, quality: ratio, penalty };
}

/* -------------------------------------------------------------------- bridge */

/** True when the attempt produced a grade the scheduler can apply. */
export function isGraded(
  result: GradeResult,
): result is Extract<GradeResult, { kind: "graded" }> {
  return result.kind === "graded";
}

/** True when the attempt produced a passing grade. `again` is not a pass. */
export function isPass(result: GradeResult): boolean {
  return result.kind === "graded" && result.grade !== "again";
}

/**
 * Turn a graded attempt into scheduler input. Returns `null` for anything that is
 * not a grade — an ungraded attempt must never reach the memory engine.
 */
export function reviewEvidenceOf(
  exercise: HifzExercise,
  result: GradeResult,
  at: Date,
): ReviewEvidence | null {
  if (result.kind !== "graded") return null;
  return { grade: result.grade, retrievalType: retrievalTypeOf(exercise), at };
}
