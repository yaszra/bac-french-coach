/**
 * Shared domain types for the pure learning engine.
 *
 * Everything in src/core is deterministic and framework-free: no I/O, no
 * clocks (time is always passed in), no randomness without an injected
 * seed. Persistence, HTTP, and UI live outside this boundary.
 */

/** Branded opaque identifiers. */
export type LearnerId = string & { readonly __brand: "LearnerId" };
export type MemoryTargetId = string & { readonly __brand: "MemoryTargetId" };
export type AssignmentId = string & { readonly __brand: "AssignmentId" };
export type AttemptId = string & { readonly __brand: "AttemptId" };
export type VerifierId = string & { readonly __brand: "VerifierId" };

/** Milliseconds since Unix epoch. Always supplied by the caller. */
export type EpochMs = number;

export const MS_PER_DAY = 86_400_000;

/**
 * What a memory target can be. Targets are not merely course lessons:
 * connection boundaries and similar-ayah contrasts are first-class.
 */
export type MemoryTargetKind =
  | "ayah"
  | "segment"
  | "page_region"
  | "connection_boundary"
  | "similar_ayah_contrast"
  | "qaida_skill"
  | "recurring_correction";

/**
 * Learning states. See docs/04-learning-model.md for the full state
 * machine specification including legal and illegal transitions.
 */
export type LearningState =
  | "assigned"
  | "preparing"
  | "recalled_independently"
  | "ready_for_verification"
  | "verified"
  | "established"
  | "durable"
  | "fragile"
  | "repairing";

/** Scaffold ladder, from full support to blank-page oral recall. */
export type ScaffoldLevel =
  | "full_tiles"
  | "fewer_tiles_with_anchors"
  | "gap_fill"
  | "first_letter_cue"
  | "no_answer_choices"
  | "oral_blank_page";

export const SCAFFOLD_LADDER: readonly ScaffoldLevel[] = [
  "full_tiles",
  "fewer_tiles_with_anchors",
  "gap_fill",
  "first_letter_cue",
  "no_answer_choices",
  "oral_blank_page",
] as const;

/** Only these scaffold levels can produce independent-recall evidence. */
export const CUE_FREE_LEVELS: ReadonlySet<ScaffoldLevel> = new Set([
  "no_answer_choices",
  "oral_blank_page",
]);

/** Where the retrieval prompt started. Never conflated in evidence. */
export type StartContext = "serial_start" | "random_start" | "boundary_probe";

/** Learner self-report, used for calibration only — never for scoring. */
export type ConfidenceJudgment = "unsure" | "fairly_sure" | "certain";

/** Human verification outcomes. */
export type VerificationDecision =
  | "verified_cleanly"
  | "verified_minor_slip"
  | "practice_again"
  | "unable_to_assess";

/** Correction taxonomy for oral verification. */
export type CorrectionCategory =
  | "word_substitution"
  | "omission"
  | "insertion"
  | "order"
  | "join"
  | "similar_ayah"
  | "vowel"
  | "letter"
  | "makhraj"
  | "madd"
  | "ghunnah"
  | "waqf_ibtida"
  | "teacher_note";
