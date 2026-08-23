import { describe, expect, it } from "vitest";
import { emptyState } from "@/modules/memory/domain/fsrs";
import { scaffoldRank } from "@/modules/memory/domain/scaffold";
import type { MemoryState } from "@/modules/memory/domain/types";
import {
  EXERCISE_SCAFFOLD_CEILING,
  decideScaffold,
  firstLetterSlice,
  hidesUntilCommitted,
  renderPlanFor,
} from "./scaffold-select";

const NOW = new Date("2026-08-23T09:00:00.000Z");

function strong(): MemoryState {
  return {
    ...emptyState("b:78:1", "ayah_body"),
    stability: 400,
    reps: 20,
    confidence: 1,
    lastReviewAt: NOW,
    lastRetrievalType: "connect_chain",
  };
}

function weak(): MemoryState {
  return {
    ...emptyState("b:78:1", "ayah_body"),
    stability: 0.5,
    reps: 1,
    confidence: 0.1,
    lastReviewAt: new Date("2026-08-01T09:00:00.000Z"),
    lastRetrievalType: "listen",
  };
}

describe("choosing the scaffold", () => {
  it("gives a unit with nothing recorded the full text", () => {
    const decision = decideScaffold({ exercise: "listen", mode: "practice", state: undefined, now: NOW });
    expect(decision.level).toBe("full_text");
    expect(decision.earned).toBe("full_text");
  });

  it("fades the scaffold as strength grows", () => {
    const weakLevel = decideScaffold({ exercise: "listen", mode: "practice", state: weak(), now: NOW }).earned;
    const strongLevel = decideScaffold({ exercise: "listen", mode: "practice", state: strong(), now: NOW }).earned;
    expect(scaffoldRank(strongLevel)).toBeGreaterThan(scaffoldRank(weakLevel));
  });

  it("shows nothing at all in test mode, whatever the strength", () => {
    for (const state of [undefined, weak(), strong()]) {
      const decision = decideScaffold({ exercise: "rebuild", mode: "test", state, now: NOW });
      expect(decision.level).toBe("blank");
      expect(decision.reasonKey).toBe("learner.scaffold.reason.test_mode");
    }
  });

  it("refuses hints in test mode", () => {
    expect(decideScaffold({ exercise: "gap_fill", mode: "test", state: strong(), now: NOW }).hintsAllowed).toBe(false);
  });

  it("allows hints in practice", () => {
    expect(decideScaffold({ exercise: "gap_fill", mode: "practice", state: weak(), now: NOW }).hintsAllowed).toBe(true);
  });

  it("still reports what the strength earned, even when the mode overrides it", () => {
    const decision = decideScaffold({ exercise: "rebuild", mode: "test", state: undefined, now: NOW });
    expect(decision.earned).toBe("full_text");
  });

  it("never shows more support than the rung allows", () => {
    for (const exercise of Object.keys(EXERCISE_SCAFFOLD_CEILING) as (keyof typeof EXERCISE_SCAFFOLD_CEILING)[]) {
      const decision = decideScaffold({ exercise, mode: "practice", state: undefined, now: NOW });
      expect(scaffoldRank(decision.level)).toBeGreaterThanOrEqual(
        scaffoldRank(EXERCISE_SCAFFOLD_CEILING[exercise]),
      );
    }
  });

  it("keeps a recall-first blank even for a learner with nothing recorded", () => {
    const decision = decideScaffold({ exercise: "recall_first", mode: "practice", state: undefined, now: NOW });
    expect(decision.level).toBe("blank");
    expect(decision.reasonKey).toBe("learner.scaffold.reason.exercise_floor");
  });

  it("never makes a strong unit easier than it has earned", () => {
    const decision = decideScaffold({ exercise: "rebuild", mode: "practice", state: strong(), now: NOW });
    expect(decision.level).toBe(decision.earned);
    expect(decision.reasonKey).toBe("learner.scaffold.reason.strength");
  });

  it("leaves listening with the page open", () => {
    expect(decideScaffold({ exercise: "listen", mode: "practice", state: weak(), now: NOW }).level).toBe("full_text");
  });
});

describe("what the page draws", () => {
  it("asks for the whole text", () => {
    expect(renderPlanFor("full_text", 7)).toEqual({ kind: "full_text" });
  });

  it("asks for first letters without saying which", () => {
    expect(renderPlanFor("first_letters", 7)).toEqual({ kind: "first_letters" });
  });

  it("carries the word count and nothing else", () => {
    expect(renderPlanFor("word_count", 7)).toEqual({ kind: "word_count", words: 7 });
  });

  it("refuses a negative word count", () => {
    expect(renderPlanFor("word_count", -3)).toEqual({ kind: "word_count", words: 0 });
  });

  it("asks for a blank", () => {
    expect(renderPlanFor("blank", 7)).toEqual({ kind: "blank" });
  });
});

describe("the first-letter slice", () => {
  // Deliberately an ordinary Arabic noun ("a house"), never scripture: this
  // module slices the caller's own string, so any Arabic word proves the point.
  const WORD = "\u0628\u064e\u064a\u0652\u062a";

  it("returns a prefix of the input, never a substitute", () => {
    expect(WORD.startsWith(firstLetterSlice(WORD))).toBe(true);
  });

  it("keeps the marks that belong to the letter", () => {
    expect(firstLetterSlice(WORD)).toBe("\u0628\u064e");
  });

  it("takes only the first letter, not the whole word", () => {
    expect(firstLetterSlice(WORD).length).toBeLessThan(WORD.length);
  });

  it("handles an empty string without throwing", () => {
    expect(firstLetterSlice("")).toBe("");
  });

  it("handles a single bare letter", () => {
    expect(firstLetterSlice("\u0628")).toBe("\u0628");
  });
});

describe("rungs that hide until the learner commits", () => {
  it("hides the recall-first and the chain", () => {
    expect(hidesUntilCommitted("recall_first")).toBe(true);
    expect(hidesUntilCommitted("connect_chain")).toBe(true);
  });

  it("does not hide the rungs that put words on screen", () => {
    for (const exercise of ["listen", "rebuild", "gap_fill"] as const) {
      expect(hidesUntilCommitted(exercise)).toBe(false);
    }
  });
});
