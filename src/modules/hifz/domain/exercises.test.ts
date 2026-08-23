import { describe, expect, it } from "vitest";
import type { MemoryState } from "@/modules/memory/domain/types";
import {
  EXERCISE_LADDER,
  allowedExercises,
  evidenceStrength,
  exerciseRank,
  highestAllowedExercise,
  isMachineGradable,
  ladderStrength,
  nextExercise,
} from "./exercises";

const now = new Date("2026-03-01T09:00:00Z");

const state = (over: Partial<MemoryState> = {}): MemoryState => ({
  unitId: "b:2:1",
  kind: "ayah_body",
  stability: 10,
  difficulty: 5,
  reps: 3,
  lapses: 0,
  lastReviewAt: new Date("2026-03-01T08:00:00Z"),
  lastRetrievalType: "recall_first",
  confidence: 0.6,
  ...over,
});

describe("the exercise ladder", () => {
  it("is ordered weakest evidence first", () => {
    expect([...EXERCISE_LADDER]).toEqual([
      "listen",
      "recall_first",
      "rebuild",
      "gap_fill",
      "next_ayah_cue",
      "connect_chain",
      "oral_recitation",
    ]);
  });

  it("gives strictly rising evidence strength along the ladder", () => {
    const strengths = EXERCISE_LADDER.map(evidenceStrength);
    for (let i = 1; i < strengths.length; i += 1) {
      expect(strengths[i]).toBeGreaterThan(strengths[i - 1] ?? -1);
    }
  });

  it("puts listening near zero and unassisted recitation at one", () => {
    expect(evidenceStrength("listen")).toBeLessThan(0.1);
    expect(evidenceStrength("oral_recitation")).toBe(1);
  });

  it("marks the ear as the one rung a machine may not grade", () => {
    for (const exercise of EXERCISE_LADDER) {
      expect(isMachineGradable(exercise)).toBe(exercise !== "oral_recitation");
    }
  });
});

describe("nextExercise", () => {
  it("steps down on a failure and never below the first rung", () => {
    expect(nextExercise("gap_fill", { kind: "graded", grade: "again" })).toBe("rebuild");
    expect(nextExercise("listen", { kind: "graded", grade: "again" })).toBe("listen");
  });

  it("repeats the rung on a hard pass", () => {
    expect(nextExercise("rebuild", { kind: "graded", grade: "hard" })).toBe("rebuild");
  });

  it("steps up one rung on a good pass", () => {
    expect(nextExercise("rebuild", { kind: "graded", grade: "good" })).toBe("gap_fill");
  });

  it("steps up two on an easy pass but never leaps over the chain into the ear", () => {
    expect(nextExercise("recall_first", { kind: "graded", grade: "easy" })).toBe("gap_fill");
    expect(nextExercise("next_ayah_cue", { kind: "graded", grade: "easy" })).toBe("connect_chain");
    expect(nextExercise("connect_chain", { kind: "graded", grade: "easy" })).toBe("oral_recitation");
  });

  it("does not move the ladder when nothing was proved", () => {
    expect(nextExercise("gap_fill", { kind: "requires_human" })).toBe("gap_fill");
    expect(nextExercise("gap_fill", { kind: "insufficient_evidence" })).toBe("gap_fill");
  });
});

describe("allowedExercises", () => {
  it("offers only the recitation to listen to when nothing is recorded", () => {
    const fresh = state({ reps: 0, lastReviewAt: null, confidence: 0, stability: 0.01 });
    expect(allowedExercises(fresh, { now })).toEqual(["listen"]);
    expect(ladderStrength(fresh, { now })).toBe(0);
  });

  it("does not ask a learner who cannot rebuild to connect from blank", () => {
    const weak = state({ stability: 1, confidence: 0.1, reps: 1 });
    const allowed = allowedExercises(weak, { now });
    expect(allowed).toContain("listen");
    expect(allowed).not.toContain("connect_chain");
    expect(allowed).not.toContain("oral_recitation");
  });

  it("opens the whole ladder once the unit is strongly held", () => {
    const strong = state({ stability: 200, confidence: 1, reps: 12 });
    expect(allowedExercises(strong, { now })).toEqual([...EXERCISE_LADDER]);
    expect(highestAllowedExercise(strong, { now })).toBe("oral_recitation");
  });

  it("always returns a contiguous prefix of the ladder", () => {
    for (const stability of [0.5, 2, 8, 20, 60, 400]) {
      const allowed = allowedExercises(state({ stability }), { now });
      const ranks = allowed.map(exerciseRank);
      expect(ranks).toEqual(ranks.map((_, index) => index));
    }
  });

  it("is conservative rather than flattering when no moment is supplied", () => {
    const unit = state({ stability: 30, lastReviewAt: new Date("2025-01-01T00:00:00Z") });
    expect(ladderStrength(unit, {})).toBeLessThanOrEqual(ladderStrength(unit, { now: unit.lastReviewAt ?? now }));
  });
});
