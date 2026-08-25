import { describe, expect, it } from "vitest";
import { applyOverlay, nextVersion, versionForLearner, type LessonOverlay } from "./lesson-editor";

const BASE = { id: "letters.group1", kind: "letter", order: 1, prerequisites: [], titleKey: "lesson.letters.group1" };

function overlay(over: Partial<LessonOverlay> = {}): LessonOverlay {
  return {
    id: "o1",
    lessonId: "letters.group1",
    baseVersion: "1.0.0",
    patch: { titleKey: "lesson.letters.group1.revised" },
    authorUserId: "u_studio",
    createdAt: new Date("2026-08-23T10:00:00Z"),
    state: "published",
    ...over,
  };
}

describe("lesson overlays", () => {
  it("applies a published overlay and bumps the version", () => {
    const result = applyOverlay(BASE, "1.0.0", overlay());
    expect(result.kind).toBe("applied");
    if (result.kind === "applied") {
      expect(result.lesson.titleKey).toBe("lesson.letters.group1.revised");
      expect(result.version).toBe("1.0.1");
    }
  });

  it("refuses an overlay that is not published", () => {
    for (const state of ["draft", "in_review", "withdrawn"] as const) {
      expect(applyOverlay(BASE, "1.0.0", overlay({ state })).kind).toBe("refused");
    }
  });

  it("reports a stale overlay rather than merging it silently", () => {
    const result = applyOverlay(BASE, "1.2.0", overlay({ baseVersion: "1.0.0" }));
    expect(result).toEqual({ kind: "stale", baseVersion: "1.0.0", currentVersion: "1.2.0" });
  });

  it("refuses to change what is being taught, only how", () => {
    for (const key of ["id", "kind", "prerequisites", "order"]) {
      const result = applyOverlay(BASE, "1.0.0", overlay({ patch: { [key]: "tampered" } }));
      expect(result.kind).toBe("refused");
      if (result.kind === "refused") expect(result.reason).toContain(key);
    }
  });

  it("keeps a learner on the version they started, until they finish", () => {
    expect(versionForLearner("1.0.0", "1.1.0", false)).toBe("1.0.0");
    expect(versionForLearner("1.0.0", "1.1.0", true)).toBe("1.1.0");
    expect(versionForLearner(null, "1.1.0", false)).toBe("1.1.0");
  });

  it("bumps versions predictably", () => {
    expect(nextVersion("0.1.0")).toBe("0.1.1");
    expect(nextVersion("2.3.9")).toBe("2.3.10");
  });
});
