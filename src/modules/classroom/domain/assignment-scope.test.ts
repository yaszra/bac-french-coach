import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCKED_SETTINGS,
  MAX_UNITS_PER_ASSIGNMENT,
  checkScope,
  containsArabicScript,
  emptyDraft,
  furthestStep,
  reviewLines,
  stepComplete,
  unitsIn,
  type ScopeItem,
  type WizardDraft,
} from "./assignment-scope";

const range = (sura: number, from: number, to: number): ScopeItem => ({
  kind: "ayah_range",
  sura,
  ayahFrom: from,
  ayahTo: to,
});

const draft = (overrides: Partial<WizardDraft> = {}): WizardDraft => ({
  ...emptyDraft(),
  ...overrides,
});

describe("the sacred-content guard", () => {
  it("refuses a payload carrying Arabic script anywhere in a string", () => {
    // A single Arabic letter, not scripture — and still refused, because an
    // assignment scope has no legitimate reason to carry one.
    expect(containsArabicScript({ note: "ب" })).toBe(true);
  });

  it("finds Arabic nested inside arrays and objects", () => {
    expect(containsArabicScript([{ deep: { deeper: ["ok", "م"] } }])).toBe(true);
  });

  it("finds Arabic used as an object KEY, not only as a value", () => {
    expect(containsArabicScript({ "س": 1 })).toBe(true);
  });

  it("passes a scope made only of numbers and ids", () => {
    expect(containsArabicScript([range(78, 1, 5), { kind: "lesson", lessonId: "qaidah.l3" }])).toBe(
      false,
    );
  });

  it("ignores non-string leaves rather than stringifying them", () => {
    expect(containsArabicScript(null)).toBe(false);
    expect(containsArabicScript(42)).toBe(false);
    expect(containsArabicScript(undefined)).toBe(false);
  });

  it("makes an Arabic-bearing scope fail the check with a named problem", () => {
    const result = checkScope([{ kind: "lesson", lessonId: "ق" }], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("arabic_text_in_payload");
  });
});

describe("scope validation", () => {
  it("accepts a plain āyah range and counts its units", () => {
    const result = checkScope([range(78, 1, 5)], ["u1"]);
    expect(result).toEqual({ ok: true, units: 5 });
  });

  it("counts pages as units too", () => {
    expect(unitsIn({ kind: "pages", pageFrom: 3, pageTo: 5 })).toBe(3);
  });

  it("counts a lesson as one unit", () => {
    expect(unitsIn({ kind: "lesson", lessonId: "qaidah.l1" })).toBe(1);
  });

  it("refuses an empty scope", () => {
    const result = checkScope([], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("no_scope");
  });

  it("refuses an assignment with nobody to give it to", () => {
    const result = checkScope([range(1, 1, 7)], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("no_learners");
  });

  it("refuses a backwards range", () => {
    const result = checkScope([range(2, 10, 4)], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("empty_range");
  });

  it("refuses a sūrah outside the muṣḥaf", () => {
    const result = checkScope([range(115, 1, 2)], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("range_out_of_bounds");
  });

  it("refuses a page outside the layout", () => {
    const result = checkScope([{ kind: "pages", pageFrom: 600, pageTo: 700 }], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("range_out_of_bounds");
  });

  it("refuses non-integer references rather than rounding them", () => {
    const result = checkScope([range(2.5, 1, 3)], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("range_out_of_bounds");
  });

  it("refuses an empty lesson id", () => {
    const result = checkScope([{ kind: "lesson", lessonId: "  " }], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("unknown_lesson");
  });

  it("refuses a mis-typed range that would bury a learner", () => {
    const result = checkScope([range(2, 1, 286), range(3, 1, 200)], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toContain("too_many_units");
    expect(MAX_UNITS_PER_ASSIGNMENT).toBeGreaterThan(0);
  });

  it("reports every problem at once, in a stable order", () => {
    const result = checkScope([range(200, 9, 3)], []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toEqual(["empty_range", "range_out_of_bounds", "no_learners"]);
    }
  });

  it("never reports the same problem twice", () => {
    const result = checkScope([range(200, 1, 2), range(300, 1, 2)], ["u1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems).toEqual(["range_out_of_bounds"]);
  });
});

describe("the four steps", () => {
  it("starts on Who with nothing chosen", () => {
    expect(furthestStep(emptyDraft())).toBe("who");
  });

  it("will not leave Who without a learner", () => {
    expect(stepComplete(emptyDraft(), "who")).toBe(false);
  });

  it("moves to What once someone is chosen", () => {
    expect(furthestStep(draft({ learnerUserIds: ["u1"] }))).toBe("what");
  });

  it("moves to How once the references are valid", () => {
    expect(furthestStep(draft({ learnerUserIds: ["u1"], scope: [range(78, 1, 5)] }))).toBe("review");
  });

  it("holds at How when the settings lock nothing", () => {
    const incomplete = draft({
      learnerUserIds: ["u1"],
      scope: [range(78, 1, 5)],
      settings: { ...DEFAULT_LOCKED_SETTINGS, exercises: [] },
    });
    expect(furthestStep(incomplete)).toBe("how");
    expect(stepComplete(incomplete, "review")).toBe(false);
  });

  it("holds at How when repetitions are below one", () => {
    expect(
      stepComplete(
        draft({ settings: { ...DEFAULT_LOCKED_SETTINGS, repetitions: 0 } }),
        "how",
      ),
    ).toBe(false);
  });

  it("judges What on the references alone, before anyone is chosen", () => {
    expect(stepComplete(draft({ scope: [range(78, 1, 5)] }), "what")).toBe(true);
  });
});

describe("the review step", () => {
  it("states one line per learner, so nobody is summarised away", () => {
    const lines = reviewLines(
      draft({ learnerUserIds: ["u1", "u2", "u3"], scope: [range(78, 1, 5)] }),
    );
    expect(lines.map((line) => line.learnerUserId)).toEqual(["u1", "u2", "u3"]);
  });

  it("states the unit count each learner will actually receive", () => {
    const lines = reviewLines(
      draft({ learnerUserIds: ["u1"], scope: [range(78, 1, 5), { kind: "pages", pageFrom: 1, pageTo: 2 }] }),
    );
    expect(lines[0]!.units).toBe(7);
  });

  it("states whether an ear is required to finish", () => {
    const lines = reviewLines(draft({ learnerUserIds: ["u1"], scope: [range(78, 1, 5)] }));
    expect(lines[0]!.requiresVerification).toBe(true);
  });

  it("carries the locked exercises through unchanged", () => {
    const lines = reviewLines(draft({ learnerUserIds: ["u1"], scope: [range(78, 1, 5)] }));
    expect(lines[0]!.exercises).toEqual(DEFAULT_LOCKED_SETTINGS.exercises);
  });

  it("says nothing at all when nobody is chosen", () => {
    expect(reviewLines(draft({ scope: [range(78, 1, 5)] }))).toEqual([]);
  });

  it("carries only references — no Arabic reaches the review lines", () => {
    const lines = reviewLines(draft({ learnerUserIds: ["u1"], scope: [range(78, 1, 5)] }));
    expect(containsArabicScript(lines)).toBe(false);
  });
});
