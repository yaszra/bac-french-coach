import { describe, expect, it } from "vitest";

import { ARABIC_LETTERS, conceptsOfKind, letterById } from "./concepts";
import {
  CONFUSION_REASON_KEYS,
  KNOWN_CONFUSIONS,
  confusableWith,
  confusionScore,
  facetsOf,
  makhrajProximity,
  misconceptionBetween,
  shapeSimilarity,
} from "./confusion";

describe("shape similarity", () => {
  it("scores letters sharing a skeleton above unrelated letters", () => {
    // ب and ت share the bāʾ skeleton and differ only in their dots; ب and ع share
    // nothing at all.
    const sameSkeleton = confusionScore("letter.beh", "letter.teh").score;
    const unrelated = confusionScore("letter.beh", "letter.ain").score;
    expect(sameSkeleton).toBeGreaterThan(unrelated);
    expect(unrelated).toBe(0);
  });

  it("scores dots-moved above dots-added — ب/ن beats ب/ث", () => {
    const dotsMoved = confusionScore("letter.beh", "letter.noon").score;
    const twoMoreDots = confusionScore("letter.beh", "letter.theh").score;
    expect(dotsMoved).toBeGreaterThan(twoMoreDots);
  });

  it("gives every same-skeleton pair a non-zero shape component", () => {
    const bySkeleton = new Map<string, string[]>();
    for (const letter of ARABIC_LETTERS) {
      bySkeleton.set(letter.skeleton, [...(bySkeleton.get(letter.skeleton) ?? []), letter.id]);
    }
    for (const family of bySkeleton.values()) {
      for (const a of family) {
        for (const b of family) {
          if (a === b) continue;
          expect(confusionScore(a, b).components.shape).toBeGreaterThan(0);
        }
      }
    }
  });

  it("returns 0 shape similarity across skeletons and 1 for a letter with itself", () => {
    const beh = letterById("letter.beh");
    const ain = letterById("letter.ain");
    expect(beh).not.toBeNull();
    expect(ain).not.toBeNull();
    expect(shapeSimilarity(beh!, ain!)).toBe(0);
    expect(shapeSimilarity(beh!, beh!)).toBe(1);
  });
});

describe("makhraj proximity", () => {
  it("is highest for the same makhraj and falls off across regions", () => {
    const beh = letterById("letter.beh")!;
    const meem = letterById("letter.meem")!;
    const seen = letterById("letter.seen")!;
    const hamza = letterById("letter.hamza")!;
    expect(makhrajProximity(beh, meem)).toBe(1);
    expect(makhrajProximity(beh, seen)).toBeLessThan(1);
    expect(makhrajProximity(beh, hamza)).toBe(0);
  });
});

describe("curated misconceptions", () => {
  it("is symmetric and covers the pairs teachers actually hear", () => {
    expect(misconceptionBetween("letter.dad", "letter.zah")).not.toBeNull();
    expect(misconceptionBetween("letter.zah", "letter.dad")).not.toBeNull();
    expect(misconceptionBetween("letter.dad", "letter.zah")?.weight).toBe(
      misconceptionBetween("letter.zah", "letter.dad")?.weight,
    );
    expect(misconceptionBetween("letter.beh", "letter.ain")).toBeNull();
  });

  it("raises a pair that shares no skeleton — ض/ظ beats ض/م", () => {
    expect(confusionScore("letter.dad", "letter.zah").score).toBeGreaterThan(
      confusionScore("letter.dad", "letter.meem").score,
    );
    expect(confusionScore("letter.dad", "letter.zah").components.misconception).toBeGreaterThan(0);
  });

  it("names only concepts that exist, with i18n reason keys", () => {
    const keys = new Set(Object.values(CONFUSION_REASON_KEYS));
    for (const pair of KNOWN_CONFUSIONS) {
      expect(facetsOf(pair.a).kind).not.toBeNull();
      expect(facetsOf(pair.b).kind).not.toBeNull();
      expect(keys.has(pair.reasonKey as (typeof CONFUSION_REASON_KEYS)[keyof typeof CONFUSION_REASON_KEYS])).toBe(true);
      expect(pair.weight).toBeGreaterThan(0);
      expect(pair.weight).toBeLessThanOrEqual(1);
    }
  });
});

describe("confusionScore", () => {
  it("is symmetric for every pair of letters", () => {
    for (const a of ARABIC_LETTERS) {
      for (const b of ARABIC_LETTERS) {
        expect(confusionScore(a.id, b.id).score).toBeCloseTo(
          confusionScore(b.id, a.id).score,
          12,
        );
      }
    }
  });

  it("stays inside [0, 1]", () => {
    for (const a of ARABIC_LETTERS) {
      for (const b of ARABIC_LETTERS) {
        const score = confusionScore(a.id, b.id).score;
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it("treats the same letter under a different vowel as its own kind of confusion", () => {
    const result = confusionScore("letter.beh.fathah", "letter.beh.kasrah");
    expect(result.components.vowel).toBeGreaterThan(0.5);
    expect(result.reasons.map((item) => item.key)).toContain(
      CONFUSION_REASON_KEYS.sameLetterDifferentVowel,
    );
  });

  it("discounts a pair that differs in more than one facet", () => {
    const sameVowel = confusionScore("letter.beh.fathah", "letter.teh.fathah").score;
    const differentVowel = confusionScore("letter.beh.fathah", "letter.teh.kasrah").score;
    expect(differentVowel).toBeLessThan(sameVowel);
  });

  it("reports one reason per key, never a duplicate", () => {
    const result = confusionScore("letter.qaf", "letter.kaf");
    const keys = result.reasons.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("returns unknown ids as unconfusable rather than throwing", () => {
    expect(confusionScore("letter.beh", "letter.does_not_exist").score).toBe(0);
  });
});

describe("confusableWith", () => {
  it("never offers the answer as a distractor", () => {
    for (const letter of ARABIC_LETTERS) {
      const distractors = confusableWith(letter.id, 6);
      expect(distractors.map((item) => item.conceptId)).not.toContain(letter.id);
    }
  });

  it("is deterministic — the same inputs give the same list in the same order", () => {
    const first = confusableWith("letter.sad", 4);
    const second = confusableWith("letter.sad", 4);
    const third = confusableWith("letter.sad", 4);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("respects k, and returns nothing for k of zero or below", () => {
    expect(confusableWith("letter.beh", 3)).toHaveLength(3);
    expect(confusableWith("letter.beh", 1)).toHaveLength(1);
    expect(confusableWith("letter.beh", 0)).toHaveLength(0);
    expect(confusableWith("letter.beh", -2)).toHaveLength(0);
    expect(confusableWith("letter.beh", 2.9)).toHaveLength(2);
  });

  it("returns at most the pool when k exceeds it", () => {
    // The three short-vowel marks confuse only each other: two candidates exist.
    expect(confusableWith("harakah.fathah", 10)).toHaveLength(2);
  });

  it("orders by score descending, then by id, and offers plausible letters first", () => {
    const distractors = confusableWith("letter.beh", 4);
    const scores = distractors.map((item) => item.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    // The bāʾ skeleton family: nūn, tāʾ, yāʾ, thāʾ.
    expect(distractors.slice(0, 3).map((item) => item.conceptId)).toEqual([
      "letter.noon",
      "letter.teh",
      "letter.yeh",
    ]);
  });

  it("honours an explicit exclusion", () => {
    const distractors = confusableWith("letter.beh", 3, { exclude: ["letter.noon"] });
    expect(distractors.map((item) => item.conceptId)).not.toContain("letter.noon");
    expect(distractors).toHaveLength(3);
  });

  it("draws distractors of the same kind and facet shape", () => {
    const forLetter = confusableWith("letter.beh", 5);
    for (const item of forLetter) {
      expect(facetsOf(item.conceptId).harakah).toBeNull();
      expect(facetsOf(item.conceptId).letter).not.toBeNull();
    }
    const forForm = confusableWith("form.beh.initial", 3);
    for (const item of forForm) {
      expect(facetsOf(item.conceptId).form).toBe("initial");
    }
  });

  it("respects a custom pool and a minimum score", () => {
    const pool = ["letter.ain", "letter.noon", "letter.teh"];
    expect(confusableWith("letter.beh", 5, { pool }).map((item) => item.conceptId)).toEqual([
      "letter.noon",
      "letter.teh",
      "letter.ain",
    ]);
    expect(
      confusableWith("letter.beh", 5, { pool, minScore: 0.1 }).map((item) => item.conceptId),
    ).toEqual(["letter.noon", "letter.teh"]);
  });

  it("finds distractors for every concept a recognition exercise can be built on", () => {
    for (const concept of conceptsOfKind("letter")) {
      expect(confusableWith(concept.id, 3).length).toBe(3);
    }
  });
});
