/**
 * Memory engine — shared vocabulary.
 *
 * The memory engine is a per-learner, human-verified memory graph. This module owns
 * the nouns: unit identity, retrieval types, grades, `MemoryState`, review outcomes
 * and the scheduling policy config.
 *
 * Binding rules honoured here:
 * - Sacred content: unit ids are ASCII references (surah/āyah/page/concept keys).
 *   No Arabic literal ever appears in this module — or anywhere in the engine.
 * - Evidence: a `Grade` is a projection of *server-validated* evidence; nothing in
 *   this layer accepts a client's opinion of mastery.
 * - Honesty: "not yet recorded" is representable (`lastReviewAt: null`, `reps: 0`,
 *   `confidence: 0`) and is never dressed up as knowledge.
 */

/* -------------------------------------------------------------------- units */

export const UNIT_KINDS = [
  "ayah_transition",
  "ayah_body",
  "page_position",
  "reading_concept",
] as const;

export type UnitKind = (typeof UNIT_KINDS)[number];

/**
 * Stable unit identity. Ids are opaque strings with a documented grammar:
 *
 * - `t:2:255>2:256` — āyah transition (the *join*, the part that actually breaks)
 * - `b:2:255`       — āyah body
 * - `p:604:3`       — position on a muṣḥaf page (page 604, 3rd line-position)
 * - `c:letter.baa.fathah` — reading (Qāʿidah) concept
 *
 * Ids are references, never content: they carry no Arabic text.
 */
export type UnitId = string;

/** Number of surahs in the muṣḥaf — structural, used only to reject malformed ids. */
export const SURAH_COUNT = 114;

export interface AyahRef {
  readonly surah: number;
  readonly ayah: number;
}

export type ParsedUnitId =
  | { readonly kind: "ayah_transition"; readonly from: AyahRef; readonly to: AyahRef }
  | { readonly kind: "ayah_body"; readonly ayah: AyahRef }
  | { readonly kind: "page_position"; readonly page: number; readonly position: number }
  | { readonly kind: "reading_concept"; readonly conceptKey: string };

const POSITIVE_INT_RE = /^[1-9][0-9]{0,3}$/;
const CONCEPT_KEY_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function parsePositiveInt(raw: string, max: number): number | null {
  if (!POSITIVE_INT_RE.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return value >= 1 && value <= max ? value : null;
}

function parseAyahRef(raw: string): AyahRef | null {
  const parts = raw.split(":");
  if (parts.length !== 2) return null;
  const surahRaw = parts[0];
  const ayahRaw = parts[1];
  if (surahRaw === undefined || ayahRaw === undefined) return null;
  const surah = parsePositiveInt(surahRaw, SURAH_COUNT);
  const ayah = parsePositiveInt(ayahRaw, 999);
  if (surah === null || ayah === null) return null;
  return { surah, ayah };
}

/** Parse a unit id, or `null` when it does not match the grammar. Never throws. */
export function parseUnitId(id: UnitId): ParsedUnitId | null {
  if (id.startsWith("t:")) {
    const parts = id.slice(2).split(">");
    if (parts.length !== 2) return null;
    const fromRaw = parts[0];
    const toRaw = parts[1];
    if (fromRaw === undefined || toRaw === undefined) return null;
    const from = parseAyahRef(fromRaw);
    const to = parseAyahRef(toRaw);
    if (from === null || to === null) return null;
    return { kind: "ayah_transition", from, to };
  }
  if (id.startsWith("b:")) {
    const ayah = parseAyahRef(id.slice(2));
    return ayah === null ? null : { kind: "ayah_body", ayah };
  }
  if (id.startsWith("p:")) {
    const parts = id.slice(2).split(":");
    if (parts.length !== 2) return null;
    const pageRaw = parts[0];
    const positionRaw = parts[1];
    if (pageRaw === undefined || positionRaw === undefined) return null;
    const page = parsePositiveInt(pageRaw, 9999);
    const position = parsePositiveInt(positionRaw, 999);
    if (page === null || position === null) return null;
    return { kind: "page_position", page, position };
  }
  if (id.startsWith("c:")) {
    const conceptKey = id.slice(2);
    return CONCEPT_KEY_RE.test(conceptKey) ? { kind: "reading_concept", conceptKey } : null;
  }
  return null;
}

export function isUnitId(id: string): boolean {
  return parseUnitId(id) !== null;
}

/** The `UnitKind` encoded by an id, or `null` when the id is malformed. */
export function unitKindOf(id: UnitId): UnitKind | null {
  return parseUnitId(id)?.kind ?? null;
}

export function bodyUnitId(ref: AyahRef): UnitId {
  return `b:${ref.surah}:${ref.ayah}`;
}

export function transitionUnitId(from: AyahRef, to: AyahRef): UnitId {
  return `t:${from.surah}:${from.ayah}>${to.surah}:${to.ayah}`;
}

export function pagePositionUnitId(page: number, position: number): UnitId {
  return `p:${page}:${position}`;
}

export function conceptUnitId(conceptKey: string): UnitId {
  return `c:${conceptKey}`;
}

/**
 * The two āyah bodies a transition joins, in order. `null` for non-transitions.
 * The policy uses this to spot a *weak join*: strong bodies, weak seam.
 */
export function bodiesOfTransition(id: UnitId): readonly [UnitId, UnitId] | null {
  const parsed = parseUnitId(id);
  if (parsed === null || parsed.kind !== "ayah_transition") return null;
  return [bodyUnitId(parsed.from), bodyUnitId(parsed.to)];
}

/* ---------------------------------------------------------------- retrieval */

/**
 * How the learner was asked to produce the memory. Ordered roughly by desirable
 * difficulty: `listen` is exposure, `oral_recitation` is the teacher's ear (the
 * final word).
 */
export const RETRIEVAL_TYPES = [
  "listen",
  "recall_first",
  "rebuild",
  "gap_fill",
  "next_ayah_cue",
  "connect_chain",
  "oral_recitation",
  "review_blank",
  "recognition",
  "production",
] as const;

export type RetrievalType = (typeof RETRIEVAL_TYPES)[number];

/** Retrieval types that exercise ḥifẓ units rather than reading concepts. */
export const HIFZ_RETRIEVAL_TYPES: readonly RetrievalType[] = [
  "listen",
  "recall_first",
  "rebuild",
  "gap_fill",
  "next_ayah_cue",
  "connect_chain",
  "oral_recitation",
  "review_blank",
];

export const READING_RETRIEVAL_TYPES: readonly RetrievalType[] = [
  "recognition",
  "production",
  "oral_recitation",
];

/* -------------------------------------------------------------------- grade */

/**
 * A grade is derived on the server from validated evidence (an ASR-checked
 * recitation, a teacher's verification, a checked written answer). No client ever
 * supplies a `Grade` directly.
 */
export const GRADES = ["again", "hard", "good", "easy"] as const;
export type Grade = (typeof GRADES)[number];

/** FSRS rating numbers: again=1, hard=2, good=3, easy=4. */
export const GRADE_RATING: Readonly<Record<Grade, 1 | 2 | 3 | 4>> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

export function isSuccessGrade(grade: Grade): boolean {
  return grade !== "again";
}

/* -------------------------------------------------------------------- state */

/**
 * The scheduler's belief about one unit for one learner.
 *
 * `confidence` (0..1) is *not* mastery: it is how much evidence backs this state.
 * A state built from one `listen` is weakly evidenced even if its stability is
 * high; the teacher inbox and the honesty rule both depend on that distinction.
 */
export interface MemoryState {
  readonly unitId: UnitId;
  readonly kind: UnitKind;
  /** Memory stability in days (interval at which retrievability hits ~90%). */
  readonly stability: number;
  /** FSRS difficulty, 1 (easiest) .. 10 (hardest). */
  readonly difficulty: number;
  readonly reps: number;
  readonly lapses: number;
  readonly lastReviewAt: Date | null;
  readonly lastRetrievalType: RetrievalType | null;
  /** 0..1 — how much evidence backs this state. 0 means "not yet recorded". */
  readonly confidence: number;
}

/** True when nothing has been recorded for this unit yet (honesty rule). */
export function hasEvidence(state: MemoryState): boolean {
  return state.reps > 0 && state.lastReviewAt !== null;
}

/** One server-validated observation, ready to be applied to a `MemoryState`. */
export interface ReviewEvidence {
  readonly grade: Grade;
  readonly retrievalType: RetrievalType;
  readonly at: Date;
}

/** The full, auditable result of applying one piece of evidence. */
export interface ReviewOutcome {
  readonly unitId: UnitId;
  readonly previous: MemoryState;
  readonly next: MemoryState;
  readonly grade: Grade;
  readonly retrievalType: RetrievalType;
  readonly reviewedAt: Date;
  /** Days since the previous review; 0 for a first review. */
  readonly elapsedDays: number;
  /** Modelled retrievability at review time (0 when nothing was recorded). */
  readonly retrievabilityBefore: number;
  /** Scheduled interval in days after this review (before any fuzz). */
  readonly intervalDays: number;
  readonly dueAt: Date;
  /** True when this observation was a lapse (a forgotten, previously-known unit). */
  readonly lapsed: boolean;
}

/* ------------------------------------------------------------------- policy */

/** FSRS-4.5 weight vector — exactly 17 parameters, `w0 … w16`. */
export type FsrsWeights = readonly [
  number, number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
];

/**
 * Scheduling configuration. Everything the FSRS-lite scheduler needs, so the
 * engine stays a pure function of (state, evidence, config).
 */
export interface SchedulingPolicy {
  readonly weights: FsrsWeights;
  /** Desired probability of recall at the scheduled review (default 0.90). */
  readonly targetRetention: number;
  /** Power-forgetting-curve exponent (FSRS-4.5: -0.5). */
  readonly decay: number;
  /** Power-forgetting-curve factor (FSRS-4.5: 19/81). */
  readonly factor: number;
  readonly minimumIntervalDays: number;
  readonly maximumIntervalDays: number;
  /** Post-lapse stability may never exceed this share of the pre-lapse stability. */
  readonly postLapseStabilityRatioCap: number;
  /** How much a single observation of each retrieval type licenses belief (0..1). */
  readonly evidenceWeights: Readonly<Record<RetrievalType, number>>;
  /** Retrieval-strength multiplier applied to the FSRS stability *gain*. */
  readonly retrievalStabilityFactors: Readonly<Record<RetrievalType, number>>;
  /** Confidence half-life, as a multiple of the unit's stability, in days. */
  readonly confidenceHalfLifeFactor: number;
}

/* ------------------------------------------------------------------ learner */

export const LEARNER_TIERS = ["kids", "teen", "adult"] as const;
export type LearnerTier = (typeof LEARNER_TIERS)[number];

/* ------------------------------------------------------------------- reason */

/**
 * A machine-readable explanation. `key` is an i18n key (never literal user text);
 * `params` are interpolation values. The teacher triage inbox renders the "why".
 */
export interface Reason {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export function reason(key: string, params: Readonly<Record<string, string | number>> = {}): Reason {
  return { key, params };
}
