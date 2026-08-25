import { describe, expect, it } from "vitest";

import {
  DEFAULT_SCHEDULING_POLICY,
  MAX_DIFFICULTY,
  MAX_STABILITY,
  MIN_DIFFICULTY,
  MIN_STABILITY,
  applyFuzz,
  applyReview,
  daysOverdue,
  dueAt,
  emptyState,
  initialDifficulty,
  initialStability,
  initialState,
  intervalDays,
  isDue,
  nextConfidence,
  nextState,
  retrievability,
} from "./fsrs";
import { mulberry32 } from "./simulate";
import { addDays } from "./time";
import { GRADES, type Grade, type MemoryState } from "./types";

const START = new Date("2026-01-01T08:00:00.000Z");

function recorded(overrides: Partial<MemoryState> = {}): MemoryState {
  return {
    unitId: "b:2:255",
    kind: "ayah_body",
    stability: 10,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    lastReviewAt: START,
    lastRetrievalType: "recall_first",
    confidence: 0.6,
    ...overrides,
  };
}

describe("retrievability", () => {
  it("is 1 at the moment of review and falls with elapsed time", () => {
    const state = recorded();
    expect(retrievability(state, START)).toBeCloseTo(1, 10);
    const oneDay = retrievability(state, addDays(START, 1));
    const tenDays = retrievability(state, addDays(START, 10));
    const hundredDays = retrievability(state, addDays(START, 100));
    expect(oneDay).toBeGreaterThan(tenDays);
    expect(tenDays).toBeGreaterThan(hundredDays);
  });

  it("hits the target retention exactly one stability after review (FSRS design property)", () => {
    const state = recorded({ stability: 17 });
    expect(retrievability(state, addDays(START, 17))).toBeCloseTo(0.9, 6);
  });

  it("stays in [0,1] and decreases monotonically for random states (property)", () => {
    const rand = mulberry32(1234);
    for (let trial = 0; trial < 200; trial += 1) {
      const stability = 0.05 + rand() * 400;
      const state = recorded({ stability });
      const elapsedA = rand() * 500;
      const elapsedB = elapsedA + rand() * 500 + 0.01;
      const first = retrievability(state, addDays(START, elapsedA));
      const second = retrievability(state, addDays(START, elapsedB));
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThanOrEqual(1);
      expect(second).toBeLessThanOrEqual(first);
    }
  });

  it("is 0 — not a guess — when nothing has been recorded", () => {
    expect(retrievability(emptyState("b:2:255", "ayah_body"), START)).toBe(0);
  });
});

describe("intervalDays", () => {
  it("equals stability at 90% target retention", () => {
    expect(intervalDays(recorded({ stability: 30 }))).toBeCloseTo(30, 6);
  });

  it("is monotone in stability (property)", () => {
    const rand = mulberry32(99);
    for (let trial = 0; trial < 200; trial += 1) {
      const lower = 1.1 + rand() * 150;
      const higher = lower + 0.5 + rand() * 100;
      const shorter = intervalDays(recorded({ stability: lower }));
      const longer = intervalDays(recorded({ stability: higher }));
      expect(longer).toBeGreaterThan(shorter);
    }
  });

  it("shortens when the target retention is raised", () => {
    const state = recorded({ stability: 50 });
    const relaxed = intervalDays(state, { ...DEFAULT_SCHEDULING_POLICY, targetRetention: 0.85 });
    const strict = intervalDays(state, { ...DEFAULT_SCHEDULING_POLICY, targetRetention: 0.95 });
    expect(strict).toBeLessThan(relaxed);
  });

  it("is clamped to the configured interval bounds", () => {
    expect(intervalDays(recorded({ stability: MIN_STABILITY }))).toBe(
      DEFAULT_SCHEDULING_POLICY.minimumIntervalDays,
    );
    expect(intervalDays(recorded({ stability: MAX_STABILITY }))).toBe(
      DEFAULT_SCHEDULING_POLICY.maximumIntervalDays,
    );
  });
});

describe("first review", () => {
  it("takes initial stability from the graded weight and orders again < hard < good < easy", () => {
    const stabilities = GRADES.map((grade) => initialStability(grade));
    expect(stabilities[0]).toBeCloseTo(DEFAULT_SCHEDULING_POLICY.weights[0], 10);
    for (let index = 1; index < stabilities.length; index += 1) {
      expect(stabilities[index] ?? 0).toBeGreaterThan(stabilities[index - 1] ?? 0);
    }
  });

  it("makes a failed first attempt the hardest and an easy one the easiest", () => {
    expect(initialDifficulty("again")).toBeGreaterThan(initialDifficulty("good"));
    expect(initialDifficulty("good")).toBeGreaterThan(initialDifficulty("easy"));
    for (const grade of GRADES) {
      expect(initialDifficulty(grade)).toBeGreaterThanOrEqual(MIN_DIFFICULTY);
      expect(initialDifficulty(grade)).toBeLessThanOrEqual(MAX_DIFFICULTY);
    }
  });

  it("does not count a first-review failure as a lapse", () => {
    const state = initialState("b:2:255", "ayah_body", "again", START);
    expect(state.lapses).toBe(0);
    expect(state.reps).toBe(1);
  });

  it("scales initial stability by the retrieval type: listening is not recall", () => {
    const listened = initialState("b:2:255", "ayah_body", "good", START, undefined, "listen");
    const recited = initialState(
      "b:2:255",
      "ayah_body",
      "good",
      START,
      undefined,
      "oral_recitation",
    );
    expect(listened.stability).toBeLessThan(recited.stability);
    expect(listened.confidence).toBeLessThan(recited.confidence);
  });

  it("routes an unrecorded unit through the first-review path", () => {
    const fresh = nextState(emptyState("b:2:255", "ayah_body"), "good", START);
    expect(fresh.reps).toBe(1);
    expect(fresh.stability).toBeCloseTo(initialState("b:2:255", "ayah_body", "good", START).stability, 10);
  });
});

describe("nextState", () => {
  it("never shortens the interval on a success (property)", () => {
    const rand = mulberry32(4242);
    const successGrades: readonly Grade[] = ["hard", "good", "easy"];
    for (let trial = 0; trial < 300; trial += 1) {
      const state = recorded({
        stability: 0.5 + rand() * 200,
        difficulty: 1 + rand() * 9,
        reps: 1 + Math.floor(rand() * 20),
      });
      const grade = successGrades[Math.floor(rand() * successGrades.length)] ?? "good";
      const now = addDays(START, rand() * 200);
      const updated = nextState(state, grade, now);
      expect(updated.stability).toBeGreaterThanOrEqual(state.stability);
      expect(intervalDays(updated)).toBeGreaterThanOrEqual(intervalDays(state));
    }
  });

  it("always reduces stability on 'again' (property)", () => {
    const rand = mulberry32(7);
    for (let trial = 0; trial < 300; trial += 1) {
      const state = recorded({
        stability: 0.5 + rand() * 300,
        difficulty: 1 + rand() * 9,
      });
      const updated = nextState(state, "again", addDays(START, rand() * 120));
      expect(updated.stability).toBeLessThan(state.stability);
      expect(updated.lapses).toBe(state.lapses + 1);
    }
  });

  it("does not oscillate: 30 successful reviews give non-decreasing intervals", () => {
    let state = initialState("b:2:255", "ayah_body", "good", START);
    let at = START;
    let previousInterval = intervalDays(state);
    for (let review = 0; review < 30; review += 1) {
      at = addDays(at, intervalDays(state));
      state = nextState(state, "good", at);
      const interval = intervalDays(state);
      expect(interval).toBeGreaterThanOrEqual(previousInterval);
      previousInterval = interval;
    }
    expect(state.reps).toBe(31);
    expect(state.lapses).toBe(0);
  });

  it("keeps stability and difficulty inside their clamps under extreme histories", () => {
    let state = initialState("b:2:255", "ayah_body", "easy", START);
    let at = START;
    for (let review = 0; review < 200; review += 1) {
      at = addDays(at, intervalDays(state));
      state = nextState(state, "easy", at);
    }
    expect(state.stability).toBeLessThanOrEqual(MAX_STABILITY);
    expect(state.difficulty).toBeGreaterThanOrEqual(MIN_DIFFICULTY);

    let failing = recorded({ stability: 5, difficulty: 5 });
    for (let review = 0; review < 100; review += 1) {
      failing = nextState(failing, "again", addDays(START, review));
    }
    expect(failing.stability).toBeGreaterThanOrEqual(MIN_STABILITY);
    expect(failing.difficulty).toBeLessThanOrEqual(MAX_DIFFICULTY);
  });

  it("grows stability more for a teacher-heard recitation than for passive listening", () => {
    const state = recorded({ stability: 20 });
    const at = addDays(START, 20);
    const listened = nextState(state, "good", at, DEFAULT_SCHEDULING_POLICY, "listen");
    const recited = nextState(state, "good", at, DEFAULT_SCHEDULING_POLICY, "oral_recitation");
    expect(recited.stability).toBeGreaterThan(listened.stability);
    expect(listened.stability).toBeGreaterThanOrEqual(state.stability);
  });

  it("moves difficulty up on failure and down on ease", () => {
    const state = recorded({ difficulty: 5 });
    expect(nextState(state, "again", addDays(START, 5)).difficulty).toBeGreaterThan(5);
    expect(nextState(state, "easy", addDays(START, 5)).difficulty).toBeLessThan(5);
  });
});

describe("confidence", () => {
  it("is bounded below by the evidence weight of the observation", () => {
    const weight = DEFAULT_SCHEDULING_POLICY.evidenceWeights.oral_recitation;
    const updated = nextState(
      recorded({ confidence: 0 }),
      "good",
      addDays(START, 10),
      DEFAULT_SCHEDULING_POLICY,
      "oral_recitation",
    );
    expect(updated.confidence).toBeGreaterThanOrEqual(weight);
    expect(updated.confidence).toBeLessThanOrEqual(1);
  });

  it("decays as evidence goes stale", () => {
    const stale = nextConfidence(1, 10, 100, 0.1, 2);
    const fresh = nextConfidence(1, 10, 0, 0.1, 2);
    expect(stale).toBeLessThan(0.2);
    expect(fresh).toBe(1);
  });

  it("stays low when only weak evidence is ever collected (evidence rule)", () => {
    let state = initialState("b:2:255", "ayah_body", "good", START, DEFAULT_SCHEDULING_POLICY, "listen");
    let at = START;
    for (let review = 0; review < 10; review += 1) {
      at = addDays(at, intervalDays(state));
      state = nextState(state, "good", at, DEFAULT_SCHEDULING_POLICY, "listen");
    }
    expect(state.confidence).toBeLessThan(0.35);
  });
});

describe("scheduling helpers", () => {
  it("reports due dates only for recorded units", () => {
    expect(dueAt(emptyState("b:2:255", "ayah_body"))).toBeNull();
    expect(isDue(emptyState("b:2:255", "ayah_body"), START)).toBe(false);
    const state = recorded({ stability: 5 });
    expect(dueAt(state)?.getTime()).toBe(addDays(START, 5).getTime());
    expect(isDue(state, addDays(START, 4))).toBe(false);
    expect(isDue(state, addDays(START, 6))).toBe(true);
    expect(daysOverdue(state, addDays(START, 8))).toBeCloseTo(3, 6);
    expect(daysOverdue(state, addDays(START, 1))).toBe(0);
  });

  it("records an auditable outcome for each observation", () => {
    const state = recorded({ stability: 5 });
    const outcome = applyReview(
      state,
      { grade: "again", retrievalType: "review_blank", at: addDays(START, 6) },
    );
    expect(outcome.lapsed).toBe(true);
    expect(outcome.elapsedDays).toBeCloseTo(6, 6);
    expect(outcome.previous).toBe(state);
    expect(outcome.next.stability).toBeLessThan(state.stability);
    expect(outcome.dueAt.getTime()).toBeGreaterThan(outcome.reviewedAt.getTime());
    expect(outcome.retrievabilityBefore).toBeGreaterThan(0);
  });

  it("does not mark a first observation as a lapse", () => {
    const outcome = applyReview(emptyState("b:2:255", "ayah_body"), {
      grade: "again",
      retrievalType: "recall_first",
      at: START,
    });
    expect(outcome.lapsed).toBe(false);
    expect(outcome.next.lapses).toBe(0);
  });
});

describe("applyFuzz", () => {
  it("leaves short intervals untouched", () => {
    expect(applyFuzz(1, 0.9)).toBe(1);
    expect(applyFuzz(2.4, 0.1)).toBe(2.4);
  });

  it("is deterministic for a given draw and stays within the FSRS fuzz band", () => {
    // The published FSRS fuzz band: 1 day, plus 15% / 10% / 5% of the interval in
    // the [2.5,7), [7,20) and [20,∞) ranges. Rounding adds at most another day.
    const fuzzDelta = (interval: number): number =>
      1 +
      0.15 * Math.max(0, Math.min(interval, 7) - 2.5) +
      0.1 * Math.max(0, Math.min(interval, 20) - 7) +
      0.05 * Math.max(0, interval - 20);

    const rand = mulberry32(31);
    for (let trial = 0; trial < 200; trial += 1) {
      const interval = 2.5 + rand() * 300;
      const draw = rand();
      const fuzzed = applyFuzz(interval, draw);
      expect(applyFuzz(interval, draw)).toBe(fuzzed);
      expect(fuzzed).toBeGreaterThanOrEqual(2);
      expect(fuzzed).toBeLessThanOrEqual(DEFAULT_SCHEDULING_POLICY.maximumIntervalDays);
      expect(Math.abs(fuzzed - interval)).toBeLessThanOrEqual(fuzzDelta(interval) + 1);
    }
  });

  it("spreads a fixed interval across the band as the draw moves", () => {
    const low = applyFuzz(50, 0);
    const high = applyFuzz(50, 0.999);
    expect(low).toBeLessThan(50);
    expect(high).toBeGreaterThan(50);
  });
});

describe("confidence is bounded by the strength of the evidence", () => {
  const listenWeight = DEFAULT_SCHEDULING_POLICY.evidenceWeights.listen;
  const oralWeight = DEFAULT_SCHEDULING_POLICY.evidenceWeights.oral_recitation;

  it("never lets repeated listening approach the confidence of real recall", () => {
    let state = emptyState("b:78:1", "ayah_body");
    for (let day = 0; day < 60; day++) {
      state = nextState(state, "good", new Date(Date.UTC(2026, 0, 1 + day)), DEFAULT_SCHEDULING_POLICY, "listen");
    }
    // Sixty listens are sixty pieces of weak evidence, not one strong one.
    expect(state.confidence).toBeLessThanOrEqual(listenWeight + 1e-9);
  });

  it("lets strong evidence raise confidence to its own strength", () => {
    let state = emptyState("b:78:2", "ayah_body");
    state = nextState(state, "good", new Date(Date.UTC(2026, 0, 1)), DEFAULT_SCHEDULING_POLICY, "listen");
    const afterListening = state.confidence;
    state = nextState(state, "good", new Date(Date.UTC(2026, 0, 2)), DEFAULT_SCHEDULING_POLICY, "oral_recitation");

    expect(state.confidence).toBeGreaterThan(afterListening);
    expect(state.confidence).toBeLessThanOrEqual(oralWeight + 1e-9);
  });

  it("does not let weak evidence erode confidence that stronger evidence earned", () => {
    let state = emptyState("b:78:3", "ayah_body");
    state = nextState(state, "good", new Date(Date.UTC(2026, 0, 1)), DEFAULT_SCHEDULING_POLICY, "oral_recitation");
    const earned = state.confidence;
    state = nextState(state, "good", new Date(Date.UTC(2026, 0, 1)), DEFAULT_SCHEDULING_POLICY, "listen");

    expect(state.confidence).toBeCloseTo(earned, 6);
  });
});
