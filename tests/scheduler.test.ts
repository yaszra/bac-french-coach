/**
 * Scheduler — acceptance criterion 12 and the educational-algorithm tests
 * from docs/13-testing-strategy.md.
 */
import { describe, expect, it } from "vitest";
import {
  gradeFromEvidence,
  initialState,
  intervalForRetention,
  isFragile,
  params,
  predictRecall,
  retrievability,
  review,
  SCHEDULER_VERSION,
  type SchedulingState,
} from "../src/core/scheduler.js";
import { MS_PER_DAY } from "../src/core/types.js";

const T0 = Date.UTC(2026, 0, 5);
const at = (days: number): number => T0 + days * MS_PER_DAY;

describe("forgetting curve", () => {
  it("is 1 at zero elapsed time and decays monotonically", () => {
    expect(retrievability(5, 0)).toBe(1);
    let prev = 1;
    for (let d = 1; d <= 60; d++) {
      const r = retrievability(5, d);
      expect(r).toBeLessThan(prev);
      expect(r).toBeGreaterThan(0);
      prev = r;
    }
  });

  it("makes stability legible: at 90% target, the interval equals stability", () => {
    for (const s of [1, 3, 7, 30, 120])
      expect(intervalForRetention(s, 0.9)).toBeCloseTo(s, 6);
  });

  it("a higher retention target yields a shorter interval", () => {
    expect(intervalForRetention(10, 0.95)).toBeLessThan(intervalForRetention(10, 0.9));
  });
});

describe("grades are derived from evidence, never self-reported", () => {
  it("maps outcome and hesitancy onto three grades", () => {
    expect(gradeFromEvidence(false, false)).toBe("again");
    expect(gradeFromEvidence(false, true)).toBe("again");
    expect(gradeFromEvidence(true, true)).toBe("hard");
    expect(gradeFromEvidence(true, false)).toBe("good");
  });
});

describe("criterion 12 — delayed clean recall changes stability logically and reproducibly", () => {
  it("increases stability and pushes the next review further out", () => {
    const s0 = initialState(true, T0);
    const d = review(s0, { correct: true, hesitant: false, occurredAt: at(3) });
    expect(d.stabilityDays).toBeGreaterThan(s0.stabilityDays);
    expect(d.nextReviewAt).toBeGreaterThan(at(3));
    expect(d.intervalDays).toBeCloseTo(d.stabilityDays, 6);
  });

  it("is reproducible: identical inputs give an identical decision", () => {
    const s0 = initialState(true, T0);
    const run = () => review(s0, { correct: true, hesitant: false, occurredAt: at(3) });
    expect(run()).toEqual(run());
  });

  it("records the algorithm version with every decision", () => {
    const d = review(initialState(true, T0), {
      correct: true,
      hesitant: false,
      occurredAt: at(3),
    });
    expect(d.algorithmVersion).toBe(SCHEDULER_VERSION);
  });

  it("grows stability monotonically across a run of clean delayed recalls", () => {
    let state: SchedulingState = initialState(true, T0);
    let day = 0;
    const seen: number[] = [state.stabilityDays];
    for (let i = 0; i < 6; i++) {
      day += Math.max(1, Math.round(state.stabilityDays));
      const d = review(state, { correct: true, hesitant: false, occurredAt: at(day) });
      expect(d.stabilityDays).toBeGreaterThan(state.stabilityDays);
      state = d;
      seen.push(d.stabilityDays);
    }
    expect(seen.at(-1)!).toBeGreaterThan(seen[0]!);
  });

  it("gives a human-readable reason naming the delay and the new interval", () => {
    const d = review(initialState(true, T0), {
      correct: true,
      hesitant: false,
      occurredAt: at(6),
    });
    expect(d.reason).toContain("Clean recall after 6d");
    expect(d.reason).toContain("next review in");
  });
});

describe("hesitant recall does not inflate intervals aggressively", () => {
  it("grows stability less than a clean recall at the same delay", () => {
    const s0 = initialState(true, T0);
    const clean = review(s0, { correct: true, hesitant: false, occurredAt: at(3) });
    const hesitant = review(s0, { correct: true, hesitant: true, occurredAt: at(3) });
    expect(hesitant.stabilityDays).toBeLessThan(clean.stabilityDays);
    expect(hesitant.stabilityDays).toBeGreaterThanOrEqual(s0.stabilityDays);
  });
});

describe("a miss shortens the interval and never lengthens it", () => {
  it("contracts stability on a lapse", () => {
    const s0 = initialState(true, T0);
    const lapse = review(s0, { correct: false, hesitant: false, occurredAt: at(3) });
    expect(lapse.stabilityDays).toBeLessThan(s0.stabilityDays);
    expect(lapse.grade).toBe("again");
  });

  it("never drops stability below the floor", () => {
    let state: SchedulingState = initialState(false, T0);
    for (let i = 0; i < 20; i++) {
      state = review(state, {
        correct: false,
        hesitant: false,
        occurredAt: at(i + 1),
      });
      expect(state.stabilityDays).toBeGreaterThanOrEqual(params.minStabilityDays);
    }
  });
});

describe("deterministic policy clamps prevent unstable jumps", () => {
  it("caps growth at the configured multiple even when massively overdue", () => {
    const s0 = initialState(true, T0);
    const d = review(s0, { correct: true, hesitant: false, occurredAt: at(365) });
    expect(d.stabilityDays).toBeLessThanOrEqual(
      s0.stabilityDays * params.maxStabilityGrowth + 1e-9,
    );
    expect(d.reason).toContain("capped");
  });

  it("keeps intervals within policy bounds over a long clean run", () => {
    let state: SchedulingState = initialState(true, T0);
    let day = 0;
    for (let i = 0; i < 40; i++) {
      day += Math.max(1, Math.round(state.stabilityDays));
      const d = review(state, { correct: true, hesitant: false, occurredAt: at(day) });
      expect(d.intervalDays).toBeGreaterThanOrEqual(params.minIntervalDays);
      expect(d.intervalDays).toBeLessThanOrEqual(params.maxIntervalDays);
      state = d;
    }
  });
});

describe("adaptive difficulty does not oscillate", () => {
  it("moves monotonically under a constant grade and converges", () => {
    const grades = [
      { correct: true, hesitant: false, dir: -1 },
      { correct: true, hesitant: true, dir: +1 },
      { correct: false, hesitant: false, dir: +1 },
    ];
    for (const g of grades) {
      let state: SchedulingState = initialState(true, T0);
      let prev = state.difficulty;
      const deltas: number[] = [];
      for (let i = 1; i <= 15; i++) {
        const d = review(state, {
          correct: g.correct,
          hesitant: g.hesitant,
          occurredAt: at(i),
        });
        const delta = d.difficulty - prev;
        // Direction never reverses.
        if (Math.abs(delta) > 1e-9) expect(Math.sign(delta)).toBe(g.dir);
        deltas.push(Math.abs(delta));
        prev = d.difficulty;
        state = d;
      }
      // Step sizes shrink: the sequence converges rather than ringing.
      expect(deltas.at(-1)!).toBeLessThanOrEqual(deltas[0]! + 1e-9);
      expect(prev).toBeGreaterThanOrEqual(params.minDifficulty);
      expect(prev).toBeLessThanOrEqual(params.maxDifficulty);
    }
  });

  it("keeps difficulty inside its bounds under an alternating sequence", () => {
    let state: SchedulingState = initialState(true, T0);
    for (let i = 1; i <= 30; i++) {
      state = review(state, {
        correct: i % 2 === 0,
        hesitant: i % 3 === 0,
        occurredAt: at(i * 2),
      });
      expect(state.difficulty).toBeGreaterThanOrEqual(params.minDifficulty);
      expect(state.difficulty).toBeLessThanOrEqual(params.maxDifficulty);
    }
  });

  it("makes an easier item grow faster than a harder one at the same delay", () => {
    const base = initialState(true, T0);
    const easy: SchedulingState = { ...base, difficulty: 2 };
    const hard: SchedulingState = { ...base, difficulty: 9 };
    const de = review(easy, { correct: true, hesitant: false, occurredAt: at(3) });
    const dh = review(hard, { correct: true, hesitant: false, occurredAt: at(3) });
    expect(de.stabilityDays).toBeGreaterThan(dh.stabilityDays);
  });
});

describe("spacing effect", () => {
  it("rewards a recall that was more overdue with more stability", () => {
    const s0 = initialState(true, T0);
    const onTime = review(s0, { correct: true, hesitant: false, occurredAt: at(3) });
    const late = review(s0, { correct: true, hesitant: false, occurredAt: at(6) });
    expect(late.stabilityDays).toBeGreaterThan(onTime.stabilityDays);
  });
});

describe("fragility", () => {
  it("flags a target once predicted recall falls below the policy floor", () => {
    const s = initialState(true, T0);
    expect(isFragile(s, T0)).toBe(false);
    expect(predictRecall(s, at(3))).toBeCloseTo(0.9, 2);
    expect(isFragile(s, at(60))).toBe(true);
  });
});

describe("initial state after verification", () => {
  it("grants less stability for a verification with a minor slip", () => {
    expect(initialState(false, T0).stabilityDays).toBeLessThan(
      initialState(true, T0).stabilityDays,
    );
  });
});
