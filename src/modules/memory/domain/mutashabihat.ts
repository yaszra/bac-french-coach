/**
 * Mutashābihāt — the look-alike index.
 *
 * Similar passages are the single biggest cause of ḥifẓ error: the reciter slips
 * from one passage into another that begins the same way. This module builds, for
 * each unit, a ranked list of the units most likely to be confused with it — the
 * decoys a "which continuation is right?" exercise should offer.
 *
 * **This module never reads a file and contains no Arabic literal.** The caller
 * supplies word arrays derived from the verified corpus (`content/quran/`); the
 * engine only counts overlaps between opaque tokens.
 *
 * Algorithm — inverted index, not pairwise comparison:
 *   1. hash each unit's word n-grams (n configurable, default 4);
 *   2. invert: n-gram → the units containing it;
 *   3. walk each posting list once, accumulating shared-n-gram counts per pair.
 *
 * Cost is linear in the number of n-gram *occurrences*, times the posting-list cap.
 * N-grams shared by more than `maxPostingsPerNGram` units are skipped: a phrase that
 * appears everywhere carries no discriminative signal (the same intuition as IDF),
 * and skipping it is what keeps the walk linear instead of quadratic.
 *
 * Deterministic: every output list is fully ordered (score, then shared count, then
 * unit id), so the same corpus always produces the same decoys.
 */

import { clamp01 } from "./numeric";
import type { UnitId } from "./types";

export type SimilarityMetric = "dice" | "jaccard" | "overlap";

export interface UnitWords {
  readonly unitId: UnitId;
  /** Corpus-derived tokens for this unit, in recitation order. */
  readonly words: readonly string[];
  /** Extra unit ids that must never be offered as decoys for this unit. */
  readonly excludes?: readonly string[];
}

export interface MutashabihatConfig {
  /** n-gram width in words. */
  readonly n: number;
  /** Decoys kept per unit. */
  readonly topK: number;
  /** A pair must share at least this many n-grams to be considered at all. */
  readonly minSharedNGrams: number;
  /** A pair must score at least this to be kept. */
  readonly minScore: number;
  readonly metric: SimilarityMetric;
  /** Units within this many positions in the input array are immediate neighbours. */
  readonly sequentialNeighbourRadius: number;
  /** N-grams appearing in more units than this are skipped as non-discriminative. */
  readonly maxPostingsPerNGram: number;
}

export const DEFAULT_MUTASHABIHAT_CONFIG: MutashabihatConfig = {
  n: 4,
  topK: 5,
  minSharedNGrams: 1,
  minScore: 0,
  metric: "dice",
  sequentialNeighbourRadius: 1,
  maxPostingsPerNGram: 64,
};

export interface DecoyCandidate {
  readonly unitId: UnitId;
  /** Similarity in [0, 1] under the configured metric. */
  readonly score: number;
  /** Denominator-friendly evidence: how many n-grams the pair shares. */
  readonly sharedNGrams: number;
}

export interface LookAlikeEntry {
  readonly unitId: UnitId;
  /** Distinct n-grams this unit contributed. */
  readonly nGramCount: number;
  readonly decoys: readonly DecoyCandidate[];
}

export interface LookAlikeIndex {
  readonly config: MutashabihatConfig;
  readonly units: readonly LookAlikeEntry[];
  /** Non-discriminative n-grams skipped by the posting cap (observability). */
  readonly skippedNGrams: number;
}

/** Token separator; corpus tokens never contain whitespace. */
const TOKEN_SEPARATOR = " ";

/**
 * Distinct word n-grams of one unit. Units shorter than `n` contribute their whole
 * word sequence as a single gram, so short āyahs still participate.
 */
export function nGrams(words: readonly string[], n: number): readonly string[] {
  if (words.length === 0 || n < 1) return [];
  const width = Math.min(n, words.length);
  const grams = new Set<string>();
  for (let start = 0; start + width <= words.length; start += 1) {
    grams.add(words.slice(start, start + width).join(TOKEN_SEPARATOR));
  }
  return [...grams];
}

function similarity(
  shared: number,
  sizeA: number,
  sizeB: number,
  metric: SimilarityMetric,
): number {
  if (shared <= 0) return 0;
  if (metric === "jaccard") {
    const union = sizeA + sizeB - shared;
    return union <= 0 ? 0 : clamp01(shared / union);
  }
  if (metric === "overlap") {
    const smallest = Math.min(sizeA, sizeB);
    return smallest <= 0 ? 0 : clamp01(shared / smallest);
  }
  const total = sizeA + sizeB;
  return total <= 0 ? 0 : clamp01((2 * shared) / total);
}

/** Build the look-alike index. Pure, deterministic, no I/O. */
export function buildLookAlikeIndex(
  entries: readonly UnitWords[],
  config: Partial<MutashabihatConfig> = {},
): LookAlikeIndex {
  const merged: MutashabihatConfig = { ...DEFAULT_MUTASHABIHAT_CONFIG, ...config };
  const grams: string[][] = entries.map((entry) => [...nGrams(entry.words, merged.n)]);

  // 1. invert: n-gram -> unit positions
  const postings = new Map<string, number[]>();
  for (let index = 0; index < grams.length; index += 1) {
    for (const gram of grams[index] ?? []) {
      const list = postings.get(gram);
      if (list === undefined) postings.set(gram, [index]);
      else list.push(index);
    }
  }

  // 2. one walk per posting list, accumulating shared counts per ordered pair
  const shared = new Map<number, Map<number, number>>();
  let skippedNGrams = 0;
  const bump = (a: number, b: number): void => {
    let row = shared.get(a);
    if (row === undefined) {
      row = new Map<number, number>();
      shared.set(a, row);
    }
    row.set(b, (row.get(b) ?? 0) + 1);
  };
  for (const list of postings.values()) {
    if (list.length < 2) continue;
    if (list.length > merged.maxPostingsPerNGram) {
      skippedNGrams += 1;
      continue;
    }
    for (let i = 0; i < list.length; i += 1) {
      const a = list[i];
      if (a === undefined) continue;
      for (let j = i + 1; j < list.length; j += 1) {
        const b = list[j];
        if (b === undefined) continue;
        bump(a, b);
        bump(b, a);
      }
    }
  }

  // 3. score, exclude, rank
  const excluded = entries.map((entry, index) => {
    const set = new Set<string>(entry.excludes ?? []);
    set.add(entry.unitId);
    for (
      let offset = -merged.sequentialNeighbourRadius;
      offset <= merged.sequentialNeighbourRadius;
      offset += 1
    ) {
      const neighbour = entries[index + offset];
      if (neighbour !== undefined) set.add(neighbour.unitId);
    }
    return set;
  });

  const units: LookAlikeEntry[] = entries.map((entry, index) => {
    const row = shared.get(index);
    const sizeA = (grams[index] ?? []).length;
    const excludes = excluded[index] ?? new Set<string>();
    const candidates: DecoyCandidate[] = [];
    if (row !== undefined) {
      for (const [otherIndex, count] of row) {
        const other = entries[otherIndex];
        if (other === undefined) continue;
        if (excludes.has(other.unitId)) continue;
        // Symmetric exclusion: honour the other unit's exclusion list too.
        if ((excluded[otherIndex] ?? new Set<string>()).has(entry.unitId)) continue;
        if (count < merged.minSharedNGrams) continue;
        const score = similarity(count, sizeA, (grams[otherIndex] ?? []).length, merged.metric);
        if (score < merged.minScore) continue;
        candidates.push({ unitId: other.unitId, score, sharedNGrams: count });
      }
    }
    candidates.sort(
      (left, right) =>
        right.score - left.score ||
        right.sharedNGrams - left.sharedNGrams ||
        (left.unitId < right.unitId ? -1 : left.unitId > right.unitId ? 1 : 0),
    );
    return {
      unitId: entry.unitId,
      nGramCount: sizeA,
      decoys: candidates.slice(0, Math.max(0, merged.topK)),
    };
  });

  return { config: merged, units, skippedNGrams };
}

/** Decoys for one unit, or `[]` when the unit is not in the index. */
export function decoysFor(index: LookAlikeIndex, unitId: UnitId): readonly DecoyCandidate[] {
  return index.units.find((entry) => entry.unitId === unitId)?.decoys ?? [];
}

/** Similarity between two specific units as recorded in the index (0 when unrelated). */
export function similarityBetween(
  index: LookAlikeIndex,
  unitId: UnitId,
  otherUnitId: UnitId,
): number {
  return (
    index.units
      .find((entry) => entry.unitId === unitId)
      ?.decoys.find((decoy) => decoy.unitId === otherUnitId)?.score ?? 0
  );
}
