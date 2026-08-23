/**
 * Blank-page invariant and the scaffold ladder.
 *
 * Named `ladder` rather than `session` to keep it distinct from
 * `server-session.test.ts`, which covers cookie signing.
 */
import { describe, expect, it } from "vitest";
import {
  applyAttemptToLadder,
  blankPage,
  feedsScheduler,
  initialLadder,
  isCueFree,
  ladderParams,
  revealToken,
  type LadderState,
} from "../src/core/session.js";
import { SCAFFOLD_LADDER, type AttemptId, type MemoryTargetId } from "../src/core/types.js";
import type { RetrievalAttempt } from "../src/core/evidence.js";

function attempt(over: Partial<RetrievalAttempt> = {}): RetrievalAttempt {
  return {
    attemptId: "a" as AttemptId,
    targetId: "t" as MemoryTargetId,
    occurredAt: 0,
    scaffoldLevel: "full_tiles",
    startContext: "serial_start",
    correct: true,
    assistance: [],
    hesitant: false,
    ...over,
  };
}

describe("criterion 11 — the page begins blank", () => {
  it("starts with nothing revealed", () => {
    expect(blankPage().revealedTokenIds).toEqual([]);
  });

  it("a filled page cannot be carried into the next session", () => {
    let page = blankPage();
    for (const id of ["t1", "t2", "t3"]) page = revealToken(page, id);
    expect(page.revealedTokenIds).toHaveLength(3);
    // The only constructor available for a new session is the blank one.
    expect(blankPage().revealedTokenIds).toEqual([]);
  });

  it("revealing is idempotent and additive only", () => {
    const page = revealToken(revealToken(blankPage(), "t1"), "t1");
    expect(page.revealedTokenIds).toEqual(["t1"]);
  });
});

describe("scaffold ladder", () => {
  it("advances only after the required number of clean unassisted recalls", () => {
    let state = initialLadder();
    const first = applyAttemptToLadder(state, attempt());
    expect(first.changed).toBe("held");
    state = first.state;
    const second = applyAttemptToLadder(state, attempt());
    expect(second.changed).toBe("advanced");
    expect(second.state.level).toBe("fewer_tiles_with_anchors");
  });

  it("does not advance on assisted correct attempts — help is not evidence for removing help", () => {
    let state = initialLadder();
    for (let i = 0; i < 10; i++) {
      const r = applyAttemptToLadder(state, attempt({ assistance: ["hint"] }));
      expect(r.changed).toBe("held");
      state = r.state;
    }
    expect(state.level).toBe("full_tiles");
  });

  it("retreats after consecutive failures", () => {
    let state: LadderState = initialLadder("gap_fill");
    state = applyAttemptToLadder(state, attempt({ correct: false })).state;
    const r = applyAttemptToLadder(state, attempt({ correct: false }));
    expect(r.changed).toBe("retreated");
    expect(r.state.level).toBe("fewer_tiles_with_anchors");
  });

  it("announces every change in words — cue withdrawal is never silent", () => {
    let state = initialLadder();
    state = applyAttemptToLadder(state, attempt()).state;
    const r = applyAttemptToLadder(state, attempt());
    expect(r.reason).toMatch(/support removed/i);
  });

  it("cannot oscillate: each retreat raises the bar to advance again", () => {
    // Start near the top so there is room to retreat repeatedly.
    let state: LadderState = initialLadder("no_answer_choices");
    const thresholds: number[] = [];
    for (let cycle = 0; cycle < 5; cycle++) {
      state = applyAttemptToLadder(state, attempt({ correct: false })).state;
      state = applyAttemptToLadder(state, attempt({ correct: false })).state;
      thresholds.push(state.advanceThresholdAtLevel);
    }
    // Never decreases, rises above the base, and saturates at the cap.
    for (let i = 1; i < thresholds.length; i++)
      expect(thresholds[i]!).toBeGreaterThanOrEqual(thresholds[i - 1]!);
    expect(thresholds[0]!).toBeGreaterThan(ladderParams.baseAdvanceThreshold);
    expect(thresholds.at(-1)!).toBe(ladderParams.maxAdvanceThreshold);
  });

  it("makes a level strictly harder to leave the second time around", () => {
    // First pass: base threshold of clean recalls advances out of full_tiles.
    let state: LadderState = initialLadder("full_tiles");
    let firstPass = 0;
    while (state.level === "full_tiles") {
      state = applyAttemptToLadder(state, attempt()).state;
      firstPass++;
    }
    expect(firstPass).toBe(ladderParams.baseAdvanceThreshold);

    // Fail back down to full_tiles.
    state = applyAttemptToLadder(state, attempt({ correct: false })).state;
    state = applyAttemptToLadder(state, attempt({ correct: false })).state;
    expect(state.level).toBe("full_tiles");

    // Second pass costs strictly more evidence — so the learner cannot be
    // bounced between rungs indefinitely.
    let secondPass = 0;
    while (state.level === "full_tiles") {
      state = applyAttemptToLadder(state, attempt()).state;
      secondPass++;
    }
    expect(secondPass).toBeGreaterThan(firstPass);
  });

  it("never moves past either end of the ladder", () => {
    let bottom: LadderState = initialLadder("full_tiles");
    for (let i = 0; i < 10; i++)
      bottom = applyAttemptToLadder(bottom, attempt({ correct: false })).state;
    expect(bottom.level).toBe("full_tiles");

    let top: LadderState = initialLadder("oral_blank_page");
    for (let i = 0; i < 10; i++)
      top = applyAttemptToLadder(top, attempt()).state;
    expect(top.level).toBe("oral_blank_page");
  });

  it("walks the whole ladder to cue-free with sustained clean recall", () => {
    let state = initialLadder();
    for (let i = 0; i < 40 && state.level !== "oral_blank_page"; i++)
      state = applyAttemptToLadder(state, attempt()).state;
    expect(state.level).toBe("oral_blank_page");
    expect(isCueFree(state.level)).toBe(true);
  });
});

describe("only independent recall reaches the scheduler", () => {
  it("rejects scaffolded and assisted attempts", () => {
    for (const level of SCAFFOLD_LADDER) {
      const cueFree = isCueFree(level);
      expect(feedsScheduler(attempt({ scaffoldLevel: level }))).toBe(cueFree);
      expect(
        feedsScheduler(attempt({ scaffoldLevel: level, assistance: ["hint"] })),
      ).toBe(false);
    }
  });
});
