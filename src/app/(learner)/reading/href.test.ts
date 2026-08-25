import { describe, expect, it } from "vitest";

import { isSittingId, lessonHref, lettersHref, readingHref, reviewHref, sittingIdFrom } from "./href";
import { isSessionId } from "@/modules/reading/ui/activity-id";

const NOW = new Date("2026-06-01T12:00:00.000Z");

describe("links into the reading surface", () => {
  it("points at the path, the letters and review", () => {
    expect(readingHref()).toBe("/reading");
    expect(lettersHref()).toBe("/reading/letters");
    expect(reviewHref()).toBe("/reading/review");
  });

  it("encodes a lesson id rather than pasting it in", () => {
    expect(lessonHref("letters.group1")).toBe("/reading/lesson/letters.group1");
    expect(lessonHref("a/b")).toBe("/reading/lesson/a%2Fb");
  });

  it("carries a sitting id when there is one", () => {
    expect(lessonHref("letters.group1", "s123")).toBe("/reading/lesson/letters.group1?sit=s123");
    expect(reviewHref("s123")).toBe("/reading/review?sit=s123");
  });
});

describe("a sitting id survives a round trip into an activity id", () => {
  it("mints one that an activity id will accept", () => {
    const minted = sittingIdFrom(undefined, NOW);
    expect(isSittingId(minted)).toBe(true);
    expect(isSessionId(minted)).toBe(true);
  });

  it("keeps a sitting id that is already valid, so a reload stays in the sitting", () => {
    expect(sittingIdFrom("abc123", NOW)).toBe("abc123");
  });

  it("replaces one that could not survive the round trip", () => {
    expect(sittingIdFrom("a~b", NOW)).not.toBe("a~b");
    expect(sittingIdFrom("", NOW)).not.toBe("");
    expect(sittingIdFrom("x".repeat(80), NOW)).not.toHaveLength(80);
  });

  it("is stable for a given moment", () => {
    expect(sittingIdFrom(undefined, NOW)).toBe(sittingIdFrom(undefined, NOW));
  });

  it("differs between sittings", () => {
    expect(sittingIdFrom(undefined, NOW)).not.toBe(
      sittingIdFrom(undefined, new Date(NOW.getTime() + 60_000)),
    );
  });
});
