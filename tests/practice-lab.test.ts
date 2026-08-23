/**
 * The Practice Lab.
 *
 * "They must never affect memorization state. Accuracy always outranks
 * speed. Never rank children publicly by recitation speed, error count, or
 * overall memorization."
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adjustSpan,
  buildClassBoard,
  initialListeningSpan,
  listeningSpanParams,
  summarize,
  type PracticeAttempt,
} from "../src/core/practice-lab.js";

const T0 = Date.UTC(2026, 9, 1);

const attempt = (over: Partial<PracticeAttempt> = {}): PracticeAttempt => ({
  activity: "listening_span",
  learnerId: "l1",
  occurredAt: T0,
  correct: true,
  elapsedMs: 4000,
  ...over,
});

describe("optional practice cannot touch memorization state", () => {
  it("returns a summary that says so in its own type", () => {
    const summary = summarize("listening_span", [attempt()]);
    expect(summary.affectsMemorizationState).toBe(false);
  });

  it("returns nothing the memory engine could consume", () => {
    const summary = summarize("listening_span", [attempt()]);
    // No scaffold level, start context, assistance list, or evidence class:
    // it cannot be passed to classifyAttempt or to the scheduler because it
    // lacks every field either one requires.
    for (const field of [
      "scaffoldLevel",
      "startContext",
      "assistance",
      "evidenceClass",
      "state",
      "stabilityDays",
      "nextReviewAt",
    ])
      expect(summary, `summary exposes ${field}`).not.toHaveProperty(field);
  });

  it("imports nothing that could write learner state", () => {
    const source = readFileSync("src/core/practice-lab.ts", "utf8");
    for (const module of ["evidence.js", "states.js", "scheduler.js", "repository"])
      expect(source, `practice-lab imports ${module}`).not.toMatch(
        new RegExp(`from\\s+["'][^"']*${module.replace(".", "\\.")}`),
      );
  });
});

describe("summaries state their denominator", () => {
  it("reports correct out of attempted", () => {
    const summary = summarize("similar_ayah_discrimination", [
      attempt({ correct: true }),
      attempt({ correct: false }),
      attempt({ correct: true }),
    ]);
    expect(summary.statement).toBe("2 of 3 correct.");
  });

  it("says nothing happened rather than reporting zero", () => {
    expect(summarize("class_accuracy_game", []).statement).toBe(
      "No practice recorded in this session.",
    );
  });

  it("uses a median so one interruption does not define the session", () => {
    const summary = summarize("listening_span", [
      attempt({ elapsedMs: 3000 }),
      attempt({ elapsedMs: 4000 }),
      attempt({ elapsedMs: 90_000 }),
    ]);
    expect(summary.medianElapsedMs).toBe(4000);
  });

  it("reports no time at all when there were no attempts", () => {
    expect(summarize("whole_mushaf_reading", []).medianElapsedMs).toBeUndefined();
  });
});

describe("a class board is not a leaderboard", () => {
  const results = [
    { learnerId: "slow-accurate", correct: 10, attempted: 10, medianElapsedMs: 20_000 },
    { learnerId: "fast-inaccurate", correct: 4, attempted: 10, medianElapsedMs: 1_000 },
    { learnerId: "middling", correct: 7, attempted: 10, medianElapsedMs: 5_000 },
  ];

  it("orders by accuracy, never by speed", () => {
    const board = buildClassBoard(results);
    expect(board.rows.map((r) => r.learnerId)).toEqual([
      "slow-accurate",
      "middling",
      "fast-inaccurate",
    ]);
  });

  it("declares itself unranked in its own type", () => {
    expect(buildClassBoard(results).ranked).toBe(false);
  });

  it("returns no position, place, or name to display", () => {
    const board = buildClassBoard(results);
    for (const row of board.rows) {
      expect(row).not.toHaveProperty("position");
      expect(row).not.toHaveProperty("rank");
      expect(row).not.toHaveProperty("displayName");
      // Accuracy with its denominator, and nothing to rank on.
      expect(row.statement).toMatch(/^\d+ of \d+ correct$/);
    }
  });

  it("does not expose elapsed time on the board at all", () => {
    for (const row of buildClassBoard(results).rows)
      expect(row).not.toHaveProperty("medianElapsedMs");
  });

  it("reports the class total with its denominator", () => {
    expect(buildClassBoard(results).classStatement).toBe(
      "21 of 30 correct across the class.",
    );
  });

  it("says an empty class is empty", () => {
    expect(buildClassBoard([]).classStatement).toMatch(/No practice recorded/);
  });

  it("is deterministic when two learners are equally accurate", () => {
    const tied = [
      { learnerId: "b", correct: 5, attempted: 10, medianElapsedMs: 1000 },
      { learnerId: "a", correct: 5, attempted: 10, medianElapsedMs: 9000 },
    ];
    expect(buildClassBoard(tied).rows.map((r) => r.learnerId)).toEqual(["a", "b"]);
  });
});

describe("listening span adapts without grinding", () => {
  it("rises after sustained accuracy", () => {
    let state = initialListeningSpan;
    for (let i = 0; i < listeningSpanParams.correctToAdvance; i++)
      state = adjustSpan(state, true);
    expect(state.span).toBe(listeningSpanParams.startingSpan + 1);
  });

  it("falls immediately on a miss, so nobody is stuck above their level", () => {
    let state = initialListeningSpan;
    for (let i = 0; i < 6; i++) state = adjustSpan(state, true);
    const raised = state.span;
    state = adjustSpan(state, false);
    expect(state.span).toBe(raised - 1);
    expect(state.consecutiveCorrect).toBe(0);
  });

  it("never falls below the starting span", () => {
    let state = initialListeningSpan;
    for (let i = 0; i < 10; i++) state = adjustSpan(state, false);
    expect(state.span).toBe(listeningSpanParams.startingSpan);
  });

  it("never rises above the maximum", () => {
    let state = initialListeningSpan;
    for (let i = 0; i < 100; i++) state = adjustSpan(state, true);
    expect(state.span).toBe(listeningSpanParams.maxSpan);
  });
});
