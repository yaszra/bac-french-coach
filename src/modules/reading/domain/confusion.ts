/**
 * The confusion model.
 *
 * Learners do not mix up letters at random. They mix up letters that share a written
 * skeleton and differ only in dots (bāʾ/tāʾ/thāʾ/nūn/yāʾ), letters articulated from
 * neighbouring places (ṣād/sīn, ḍād/ẓāʾ, qāf/kāf), and letters joined by a specific
 * documented misconception. This module scores that similarity so a recognition
 * exercise can offer distractors that are *plausible* — a distractor nobody would
 * ever pick teaches nothing — while never offering the answer itself.
 *
 * Three components, each independently inspectable:
 *
 * - **shape**        — same rasm skeleton, weighted by how the dots differ.
 * - **makhraj**      — articulation proximity in the seventeen-makhraj scheme.
 * - **misconception**— curated pairs teachers actually see, each with a reason key.
 *
 * Everything here is deterministic: the same inputs always produce the same
 * distractors, in the same order. No randomness, no clock, no I/O.
 */

import { reason, type Reason } from "@/modules/memory/domain/types";

import {
  HARAKAT,
  READING_LATTICE,
  conceptById,
  letterById,
  makhrajById,
  makhrajRegionDistance,
  type ArabicLetter,
  type ConceptId,
  type ConceptKind,
  type HarakahId,
  type LetterForm,
  type ReadingLattice,
} from "./concepts";

/* ------------------------------------------------------------------- facets */

/** What a concept is made of, as far as confusion is concerned. */
export interface ConceptFacets {
  readonly id: ConceptId;
  readonly kind: ConceptKind | null;
  readonly letter: ArabicLetter | null;
  readonly harakah: HarakahId | null;
  readonly form: LetterForm | null;
}

const HARAKAH_IDS: readonly HarakahId[] = HARAKAT.map((harakah) => harakah.id);
const HARAKAH_SUFFIXES: ReadonlyMap<string, HarakahId> = new Map(
  HARAKAT.map((harakah) => [harakah.id.slice("harakah.".length), harakah.id]),
);
const FORM_NAMES: ReadonlySet<string> = new Set(["isolated", "initial", "medial", "final"]);

/**
 * Decompose a concept id into (letter, ḥarakah, form). Unknown ids decompose to all
 * nulls rather than throwing — a stale id in a saved exercise must not crash a lesson.
 */
export function facetsOf(id: ConceptId): ConceptFacets {
  const concept = conceptById(id);
  const kind = concept?.kind ?? null;

  if (id.startsWith("letter.")) {
    const rest = id.slice("letter.".length);
    const dot = rest.indexOf(".");
    if (dot === -1) {
      return { id, kind, letter: letterById(id), harakah: null, form: null };
    }
    const harakah = HARAKAH_SUFFIXES.get(rest.slice(dot + 1)) ?? null;
    return {
      id,
      kind,
      letter: letterById(`letter.${rest.slice(0, dot)}`),
      harakah,
      form: null,
    };
  }

  if (id.startsWith("form.")) {
    const rest = id.slice("form.".length);
    const dot = rest.lastIndexOf(".");
    if (dot === -1) return { id, kind, letter: null, harakah: null, form: null };
    const formName = rest.slice(dot + 1);
    return {
      id,
      kind,
      letter: letterById(`letter.${rest.slice(0, dot)}`),
      harakah: null,
      form: FORM_NAMES.has(formName) ? (formName as LetterForm) : null,
    };
  }

  if (HARAKAH_IDS.includes(id as HarakahId)) {
    return { id, kind, letter: null, harakah: id as HarakahId, form: null };
  }

  return { id, kind, letter: null, harakah: null, form: null };
}

/* ------------------------------------------------------------- misconceptions */

/**
 * Confusion reason keys. Neutral and descriptive: they name what differs, never what
 * the learner "got wrong about themselves".
 */
export const CONFUSION_REASON_KEYS = {
  sameSkeleton: "reading.confusion.reason.same_skeleton_different_dots",
  sameSkeletonSameDotCount: "reading.confusion.reason.same_skeleton_dots_moved",
  sameMakhraj: "reading.confusion.reason.same_makhraj",
  nearMakhraj: "reading.confusion.reason.neighbouring_makhraj",
  emphaticPair: "reading.confusion.reason.emphatic_counterpart",
  interdentalSibilant: "reading.confusion.reason.interdental_and_sibilant",
  throatDepth: "reading.confusion.reason.throat_depth",
  similarShape: "reading.confusion.reason.similar_shape",
  sameLetterDifferentVowel: "reading.confusion.reason.same_letter_different_vowel",
  similarMark: "reading.confusion.reason.similar_mark",
} as const;

export interface ConfusionPair {
  readonly a: ConceptId;
  readonly b: ConceptId;
  /** 0..1 — how strongly teachers see this specific pair confused. */
  readonly weight: number;
  readonly reasonKey: string;
}

/**
 * Curated misconception edges. Symmetric: order of `a`/`b` is irrelevant to lookup.
 *
 * These come from what is actually observed in Qāʿidah teaching — the emphatic /
 * non-emphatic counterparts, the interdentals against the sibilants, the two deep
 * back consonants, and a short list of purely visual look-alikes across skeletons.
 * Pairs that already share a skeleton are left out: the shape component covers them.
 */
export const KNOWN_CONFUSIONS: readonly ConfusionPair[] = [
  // Emphatic (mufakhkham) against its light counterpart.
  { a: "letter.sad", b: "letter.seen", weight: 0.7, reasonKey: CONFUSION_REASON_KEYS.emphaticPair },
  { a: "letter.tah", b: "letter.teh", weight: 0.7, reasonKey: CONFUSION_REASON_KEYS.emphaticPair },
  { a: "letter.dad", b: "letter.dal", weight: 0.6, reasonKey: CONFUSION_REASON_KEYS.emphaticPair },
  { a: "letter.zah", b: "letter.thal", weight: 0.6, reasonKey: CONFUSION_REASON_KEYS.emphaticPair },
  // Interdentals against the whistling letters.
  {
    a: "letter.thal",
    b: "letter.zain",
    weight: 0.6,
    reasonKey: CONFUSION_REASON_KEYS.interdentalSibilant,
  },
  {
    a: "letter.theh",
    b: "letter.seen",
    weight: 0.55,
    reasonKey: CONFUSION_REASON_KEYS.interdentalSibilant,
  },
  {
    a: "letter.zah",
    b: "letter.zain",
    weight: 0.55,
    reasonKey: CONFUSION_REASON_KEYS.interdentalSibilant,
  },
  // The pair every teacher hears: ḍād and ẓāʾ.
  { a: "letter.dad", b: "letter.zah", weight: 0.75, reasonKey: CONFUSION_REASON_KEYS.sameMakhraj },
  // Deep back consonants.
  { a: "letter.qaf", b: "letter.kaf", weight: 0.65, reasonKey: CONFUSION_REASON_KEYS.nearMakhraj },
  // Throat.
  { a: "letter.hah", b: "letter.heh", weight: 0.6, reasonKey: CONFUSION_REASON_KEYS.throatDepth },
  { a: "letter.ain", b: "letter.hamza", weight: 0.55, reasonKey: CONFUSION_REASON_KEYS.throatDepth },
  { a: "letter.ain", b: "letter.hah", weight: 0.5, reasonKey: CONFUSION_REASON_KEYS.throatDepth },
  { a: "letter.khah", b: "letter.ghain", weight: 0.5, reasonKey: CONFUSION_REASON_KEYS.sameMakhraj },
  { a: "letter.alef", b: "letter.hamza", weight: 0.5, reasonKey: CONFUSION_REASON_KEYS.similarShape },
  // Purely visual look-alikes across skeletons.
  { a: "letter.dal", b: "letter.reh", weight: 0.4, reasonKey: CONFUSION_REASON_KEYS.similarShape },
  { a: "letter.waw", b: "letter.reh", weight: 0.3, reasonKey: CONFUSION_REASON_KEYS.similarShape },
  { a: "letter.kaf", b: "letter.lam", weight: 0.3, reasonKey: CONFUSION_REASON_KEYS.similarShape },
  { a: "letter.alef", b: "letter.lam", weight: 0.35, reasonKey: CONFUSION_REASON_KEYS.similarShape },
  // Marks.
  {
    a: "harakah.fathah",
    b: "harakah.dammah",
    weight: 0.5,
    reasonKey: CONFUSION_REASON_KEYS.similarMark,
  },
  {
    a: "harakah.fathah",
    b: "harakah.kasrah",
    weight: 0.6,
    reasonKey: CONFUSION_REASON_KEYS.similarMark,
  },
  {
    a: "harakah.dammah",
    b: "harakah.kasrah",
    weight: 0.5,
    reasonKey: CONFUSION_REASON_KEYS.similarMark,
  },
  { a: "tanwin.fath", b: "harakah.fathah", weight: 0.5, reasonKey: CONFUSION_REASON_KEYS.similarMark },
  { a: "tanwin.damm", b: "harakah.dammah", weight: 0.5, reasonKey: CONFUSION_REASON_KEYS.similarMark },
  { a: "tanwin.kasr", b: "harakah.kasrah", weight: 0.5, reasonKey: CONFUSION_REASON_KEYS.similarMark },
  { a: "tanwin.fath", b: "tanwin.damm", weight: 0.55, reasonKey: CONFUSION_REASON_KEYS.similarMark },
  { a: "tanwin.fath", b: "tanwin.kasr", weight: 0.6, reasonKey: CONFUSION_REASON_KEYS.similarMark },
  { a: "tanwin.damm", b: "tanwin.kasr", weight: 0.55, reasonKey: CONFUSION_REASON_KEYS.similarMark },
  { a: "sukun", b: "shaddah", weight: 0.4, reasonKey: CONFUSION_REASON_KEYS.similarMark },
];

function pairKey(a: ConceptId, b: ConceptId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const MISCONCEPTION_INDEX: ReadonlyMap<string, ConfusionPair> = new Map(
  KNOWN_CONFUSIONS.map((pair) => [pairKey(pair.a, pair.b), pair]),
);

/** The curated misconception edge between two concepts, if one exists. */
export function misconceptionBetween(a: ConceptId, b: ConceptId): ConfusionPair | null {
  return MISCONCEPTION_INDEX.get(pairKey(a, b)) ?? null;
}

/* ------------------------------------------------------------------- scoring */

/** Component weights. Sum above 1 on purpose; the total is clamped. */
export const CONFUSION_WEIGHTS = {
  shape: 0.45,
  makhraj: 0.3,
  misconception: 0.45,
} as const;

/** Two concepts differing in more than one facet are easier to tell apart. */
const MULTI_FACET_DISCOUNT = 0.6;
/** A different letter *position* makes a pair a little easier to separate. */
const DIFFERENT_FORM_DISCOUNT = 0.7;
/** Same letter, different short vowel — a real and very common confusion. */
const VOWEL_ONLY_CONFUSION = 0.62;

export interface ConfusionComponents {
  readonly shape: number;
  readonly makhraj: number;
  readonly misconception: number;
  readonly vowel: number;
}

export interface ConfusionResult {
  readonly a: ConceptId;
  readonly b: ConceptId;
  /** 0..1. Symmetric: `confusionScore(a, b).score === confusionScore(b, a).score`. */
  readonly score: number;
  readonly components: ConfusionComponents;
  /** Machine-readable "why" — i18n keys, never literal text. */
  readonly reasons: readonly Reason[];
}

/** Written-shape similarity between two letters, 0..1. */
export function shapeSimilarity(a: ArabicLetter, b: ArabicLetter): number {
  if (a.id === b.id) return 1;
  if (a.skeleton !== b.skeleton) return 0;
  const base = 0.55;
  const countDelta = Math.abs(a.dots.count - b.dots.count);
  if (countDelta === 0) return base + 0.3;
  if (countDelta === 1) return a.dots.position === b.dots.position ? base + 0.25 : base + 0.28;
  if (countDelta === 2) return base + 0.15;
  return base + 0.05;
}

/** Articulation proximity between two makhārij, 0..1. */
export function makhrajProximity(a: ArabicLetter, b: ArabicLetter): number {
  if (a.makhraj === b.makhraj) return 1;
  const left = makhrajById(a.makhraj);
  const right = makhrajById(b.makhraj);
  if (left === null || right === null) return 0;
  if (left.region === right.region) {
    const depthDelta = Math.abs(left.depth - right.depth);
    return depthDelta <= 1 ? 0.6 : 0.35;
  }
  const regionDelta = makhrajRegionDistance(a.makhraj, b.makhraj);
  if (regionDelta === null) return 0;
  return regionDelta <= 1 ? 0.1 : 0;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

const ZERO_COMPONENTS: ConfusionComponents = {
  shape: 0,
  makhraj: 0,
  misconception: 0,
  vowel: 0,
};

/**
 * How confusable two concepts are, 0..1, with the components and reason keys that
 * produced the number. Symmetric and deterministic.
 */
export function confusionScore(a: ConceptId, b: ConceptId): ConfusionResult {
  if (a === b) {
    return {
      a,
      b,
      score: 1,
      components: { ...ZERO_COMPONENTS, shape: 1 },
      reasons: [],
    };
  }

  const left = facetsOf(a);
  const right = facetsOf(b);
  const reasons: Reason[] = [];

  const curated = misconceptionBetween(a, b);
  const letterCurated =
    left.letter !== null && right.letter !== null
      ? misconceptionBetween(left.letter.id, right.letter.id)
      : null;
  const misconception = curated?.weight ?? letterCurated?.weight ?? 0;
  const misconceptionKey = curated?.reasonKey ?? letterCurated?.reasonKey ?? null;

  // Same letter, different short vowel: the letter facets are identical, so the shape
  // and makhraj components say nothing. Score it as the vocalic confusion it is.
  if (
    left.letter !== null &&
    right.letter !== null &&
    left.letter.id === right.letter.id &&
    left.harakah !== right.harakah
  ) {
    reasons.push(
      reason(CONFUSION_REASON_KEYS.sameLetterDifferentVowel, { letter: left.letter.id }),
    );
    const score = clamp01(Math.max(VOWEL_ONLY_CONFUSION, misconception));
    return { a, b, score, components: { ...ZERO_COMPONENTS, vowel: score }, reasons };
  }

  if (left.letter === null || right.letter === null) {
    // Marks, rules and other letterless concepts: only the curated edges apply.
    if (misconception > 0 && misconceptionKey !== null) {
      reasons.push(reason(misconceptionKey, { a, b }));
    }
    const score = clamp01(misconception);
    return { a, b, score, components: { ...ZERO_COMPONENTS, misconception }, reasons };
  }

  const shape = shapeSimilarity(left.letter, right.letter);
  const makhraj = makhrajProximity(left.letter, right.letter);

  if (shape > 0) {
    const sameCount = left.letter.dots.count === right.letter.dots.count;
    reasons.push(
      reason(
        sameCount
          ? CONFUSION_REASON_KEYS.sameSkeletonSameDotCount
          : CONFUSION_REASON_KEYS.sameSkeleton,
        { skeleton: left.letter.skeleton },
      ),
    );
  }
  if (makhraj >= 1) {
    reasons.push(reason(CONFUSION_REASON_KEYS.sameMakhraj, { makhraj: left.letter.makhraj }));
  } else if (makhraj >= 0.6) {
    reasons.push(reason(CONFUSION_REASON_KEYS.nearMakhraj, { makhraj: left.letter.makhraj }));
  }
  if (misconception > 0 && misconceptionKey !== null) {
    reasons.push(reason(misconceptionKey, { a: left.letter.id, b: right.letter.id }));
  }

  let score = clamp01(
    CONFUSION_WEIGHTS.shape * shape +
      CONFUSION_WEIGHTS.makhraj * makhraj +
      CONFUSION_WEIGHTS.misconception * misconception,
  );

  if (left.harakah !== right.harakah) score *= MULTI_FACET_DISCOUNT;
  if (left.form !== right.form) score *= DIFFERENT_FORM_DISCOUNT;

  return {
    a,
    b,
    score: clamp01(score),
    components: { shape, makhraj, misconception, vowel: 0 },
    reasons,
  };
}

/* --------------------------------------------------------------- distractors */

export interface Distractor {
  readonly conceptId: ConceptId;
  readonly score: number;
  readonly reasons: readonly Reason[];
}

export interface ConfusableOptions {
  /** Candidate pool. Defaults to concepts of the same kind and the same facet shape. */
  readonly pool?: readonly ConceptId[];
  /** Drop candidates scoring below this. Default 0 (keep, so `k` can be satisfied). */
  readonly minScore?: number;
  /** Ids that must never be offered (already on screen, or explicitly excluded). */
  readonly exclude?: readonly ConceptId[];
  readonly lattice?: ReadingLattice;
}

function defaultPool(target: ConceptId, lattice: ReadingLattice): readonly ConceptId[] {
  const targetFacets = facetsOf(target);
  const kind = conceptById(target)?.kind ?? null;
  return lattice.concepts
    .filter((concept) => {
      if (concept.id === target) return false;
      if (kind !== null && concept.kind !== kind) return false;
      const facets = facetsOf(concept.id);
      // A letter-bearing concept is only ever confused with another letter-bearing
      // one; a bare mark with another bare mark.
      if ((facets.letter === null) !== (targetFacets.letter === null)) return false;
      if (facets.form !== targetFacets.form) return false;
      return true;
    })
    .map((concept) => concept.id);
}

/**
 * The top `k` distractors for a recognition exercise on `conceptId`.
 *
 * Guarantees, all of them tested:
 * - the answer is never among the distractors;
 * - the result is deterministic — score descending, then id ascending;
 * - at most `k` items come back, and `k <= 0` returns nothing.
 */
export function confusableWith(
  conceptId: ConceptId,
  k: number,
  options: ConfusableOptions = {},
): readonly Distractor[] {
  const limit = Number.isFinite(k) ? Math.max(0, Math.floor(k)) : 0;
  if (limit === 0) return [];

  const lattice = options.lattice ?? READING_LATTICE;
  const excluded = new Set<ConceptId>([conceptId, ...(options.exclude ?? [])]);
  const minScore = options.minScore ?? 0;
  const pool = options.pool ?? defaultPool(conceptId, lattice);

  const scored: Distractor[] = [];
  const seen = new Set<ConceptId>();
  for (const candidate of pool) {
    if (excluded.has(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    const result = confusionScore(conceptId, candidate);
    if (result.score < minScore) continue;
    scored.push({ conceptId: candidate, score: result.score, reasons: result.reasons });
  }

  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    return x.conceptId < y.conceptId ? -1 : x.conceptId > y.conceptId ? 1 : 0;
  });

  return scored.slice(0, limit);
}
