/**
 * Evidence taxonomy — acceptance criteria 5, 6, 7.
 *
 * These are the tests that protect the product's central promise: that a
 * filled page is not a claim about memory.
 */
import { describe, expect, it } from "vitest";
import {
  accumulate,
  classifyAttempt,
  emptyProgress,
  isIndependentRecall,
  meetsVerificationThreshold,
  type AssistanceKind,
  type RetrievalAttempt,
} from "../src/core/evidence.js";
import { SCAFFOLD_LADDER, type ScaffoldLevel, type StartContext } from "../src/core/types.js";
import type { AttemptId, MemoryTargetId } from "../src/core/types.js";

function attempt(over: Partial<RetrievalAttempt> = {}): RetrievalAttempt {
  return {
    attemptId: "att-1" as AttemptId,
    targetId: "tgt-1" as MemoryTargetId,
    occurredAt: 0,
    scaffoldLevel: "oral_blank_page",
    startContext: "random_start",
    correct: true,
    assistance: [],
    hesitant: false,
    ...over,
  };
}

const ALL_ASSISTANCE: AssistanceKind[] = [
  "hint",
  "revealed_anchor",
  "replayed_word",
  "answer_exposed",
  "tile_options_visible",
];

describe("criterion 5 — tile success is not memorization evidence", () => {
  it("classifies tile reconstruction as scaffolded practice, not independent recall", () => {
    const a = attempt({ scaffoldLevel: "full_tiles" });
    expect(classifyAttempt(a)).toBe("scaffolded_practice");
    expect(isIndependentRecall(a)).toBe(false);
  });

  it("does not advance verification progress no matter how many tiles succeed", () => {
    let progress = emptyProgress;
    for (let i = 0; i < 50; i++)
      progress = accumulate(progress, attempt({ scaffoldLevel: "full_tiles" }));
    expect(progress.independentRecalls).toBe(0);
    expect(progress.nonSerialIndependentRecalls).toBe(0);
  });

  it("treats every scaffolded rung below the cue-free zone the same way", () => {
    const scaffolded: ScaffoldLevel[] = [
      "full_tiles",
      "fewer_tiles_with_anchors",
      "gap_fill",
      "first_letter_cue",
    ];
    for (const level of scaffolded)
      expect(classifyAttempt(attempt({ scaffoldLevel: level }))).toBe(
        "scaffolded_practice",
      );
  });
});

describe("criterion 6 — any hint marks the attempt assisted", () => {
  it.each(ALL_ASSISTANCE)(
    "assistance %s marks a cue-free attempt as assisted",
    (kind) => {
      const a = attempt({ scaffoldLevel: "oral_blank_page", assistance: [kind] });
      expect(classifyAttempt(a)).toBe("assisted_practice");
      expect(isIndependentRecall(a)).toBe(false);
    },
  );

  it("assistance dominates the scaffold level at every rung", () => {
    for (const level of SCAFFOLD_LADDER)
      expect(
        classifyAttempt(attempt({ scaffoldLevel: level, assistance: ["hint"] })),
      ).toBe("assisted_practice");
  });

  it("an assisted correct attempt never counts toward the threshold", () => {
    let progress = emptyProgress;
    for (let i = 0; i < 20; i++)
      progress = accumulate(progress, attempt({ assistance: ["hint"] }));
    expect(progress.independentRecalls).toBe(0);
  });
});

describe("criterion 7 — cue-free recall and connection checks are distinct", () => {
  it("keeps serial-start and non-serial evidence in separate counters", () => {
    let progress = emptyProgress;
    progress = accumulate(progress, attempt({ startContext: "serial_start" }));
    progress = accumulate(progress, attempt({ startContext: "serial_start" }));
    expect(progress.independentRecalls).toBe(2);
    expect(progress.nonSerialIndependentRecalls).toBe(0);

    progress = accumulate(progress, attempt({ startContext: "boundary_probe" }));
    expect(progress.independentRecalls).toBe(3);
    expect(progress.nonSerialIndependentRecalls).toBe(1);
  });

  it("refuses the threshold when only serial evidence exists", () => {
    const policy = {
      policyVersion: "v1",
      requiredListens: 0,
      requiredIndependentRecalls: 2,
      requiredNonSerialRecalls: 1,
    };
    let progress = { ...emptyProgress, listensCompleted: 0 };
    progress = accumulate(progress, attempt({ startContext: "serial_start" }));
    progress = accumulate(progress, attempt({ startContext: "serial_start" }));
    expect(meetsVerificationThreshold(progress, policy)).toBe(false);

    progress = accumulate(progress, attempt({ startContext: "random_start" }));
    expect(meetsVerificationThreshold(progress, policy)).toBe(true);
  });

  it("counts random-start and boundary probes as non-serial", () => {
    const nonSerial: StartContext[] = ["random_start", "boundary_probe"];
    for (const ctx of nonSerial) {
      const p = accumulate(emptyProgress, attempt({ startContext: ctx }));
      expect(p.nonSerialIndependentRecalls).toBe(1);
    }
  });
});

describe("listens are part of the threshold, not decoration", () => {
  it("blocks verification readiness until the listen policy is satisfied", () => {
    const policy = {
      policyVersion: "v1",
      requiredListens: 3,
      requiredIndependentRecalls: 1,
      requiredNonSerialRecalls: 0,
    };
    const progress = accumulate(
      { ...emptyProgress, listensCompleted: 2 },
      attempt(),
    );
    expect(meetsVerificationThreshold(progress, policy)).toBe(false);
    expect(
      meetsVerificationThreshold({ ...progress, listensCompleted: 3 }, policy),
    ).toBe(true);
  });
});

describe("property: no combination of assistance and scaffold fabricates recall", () => {
  it("holds across the full cross product", () => {
    const assistanceSets: AssistanceKind[][] = [
      [],
      ["hint"],
      ["replayed_word", "revealed_anchor"],
      ALL_ASSISTANCE,
    ];
    for (const level of SCAFFOLD_LADDER)
      for (const assistance of assistanceSets) {
        const a = attempt({ scaffoldLevel: level, assistance });
        const cueFree = level === "no_answer_choices" || level === "oral_blank_page";
        const expected = assistance.length === 0 && cueFree;
        expect(isIndependentRecall(a)).toBe(expected);
      }
  });
});
