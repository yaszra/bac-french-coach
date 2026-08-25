import { describe, expect, it } from "vitest";
import {
  mayBeServed,
  reviewAsset,
  reviewQueue,
  type QueueItem,
  type ReviewableAsset,
  type ReviewSubmission,
} from "./review";

const AT = new Date("2026-08-23T12:00:00Z");

function asset(over: Partial<ReviewableAsset> = {}): ReviewableAsset {
  return {
    id: "a1",
    kind: "talqin",
    provenance: "human",
    objectKey: "talqin/ab/cd/hash.mp3",
    sha256: "a".repeat(64),
    durationMs: 3200,
    reciterId: "husary",
    approval: "pending",
    ...over,
  };
}

function submission(over: Partial<ReviewSubmission> = {}): ReviewSubmission {
  return { assetId: "a1", decision: "approved", reasons: [], reviewerUserId: "u_studio", at: AT, ...over };
}

describe("reviewing a take", () => {
  it("records an approval", () => {
    expect(reviewAsset(asset(), submission())).toEqual({
      kind: "recorded",
      approval: "approved",
      reasons: [],
    });
  });

  it("never re-asks about something already approved", () => {
    const result = reviewAsset(asset({ approval: "approved" }), submission({ decision: "rejected", reasons: ["audio.clipped"] }));
    expect(result).toEqual({ kind: "refused", reason: "already_approved" });
  });

  it("refuses a rejection with no reason, because the next take needs one", () => {
    expect(reviewAsset(asset(), submission({ decision: "rejected", reasons: [] }))).toEqual({
      kind: "refused",
      reason: "rejection_needs_a_reason",
    });
  });

  it("carries rejection reasons through as keys", () => {
    const result = reviewAsset(
      asset(),
      submission({ decision: "rejected", reasons: ["audio.clipped", "recitation.pace_unsuitable"] }),
    );
    expect(result).toEqual({
      kind: "recorded",
      approval: "rejected",
      reasons: ["studio.rejection.audio.clipped", "studio.rejection.recitation.pace_unsuitable"],
    });
  });

  it("refuses to approve synthesis without naming the person who heard it", () => {
    const result = reviewAsset(asset({ provenance: "studio_synth" }), submission({ reviewerUserId: "" }));
    expect(result).toEqual({ kind: "refused", reason: "synthesis_needs_a_reviewer" });
  });
});

describe("the review queue", () => {
  function item(over: Partial<QueueItem>): QueueItem {
    return { ...asset(), queuedAt: AT, ...over } as QueueItem;
  }

  it("never shows an approved asset", () => {
    const queue = reviewQueue([item({ id: "done", approval: "approved" }), item({ id: "todo" })]);
    expect(queue.map((q) => q.id)).toEqual(["todo"]);
  });

  it("puts what blocks a lesson first", () => {
    const queue = reviewQueue([
      item({ id: "loose", queuedAt: new Date("2026-01-01") }),
      item({ id: "blocking", blocksLessonId: "letters.group1", queuedAt: new Date("2026-08-01") }),
    ]);
    expect(queue[0]?.id).toBe("blocking");
  });

  it("then synthesis, which cannot ship at all until someone hears it", () => {
    const queue = reviewQueue([
      item({ id: "human", provenance: "human", queuedAt: new Date("2026-01-01") }),
      item({ id: "synth", provenance: "studio_synth", queuedAt: new Date("2026-08-01") }),
    ]);
    expect(queue.map((q) => q.id)).toEqual(["synth", "human"]);
  });

  it("then oldest first", () => {
    const queue = reviewQueue([
      item({ id: "newer", queuedAt: new Date("2026-08-01") }),
      item({ id: "older", queuedAt: new Date("2026-01-01") }),
    ]);
    expect(queue.map((q) => q.id)).toEqual(["older", "newer"]);
  });
});

describe("whether an asset may reach a learner", () => {
  it("refuses anything not approved", () => {
    expect(mayBeServed(asset({ approval: "pending" })).servable).toBe(false);
    expect(mayBeServed(asset({ approval: "rejected" })).servable).toBe(false);
  });

  it("refuses synthesis with no reviewer, so the label always means something", () => {
    const result = mayBeServed(asset({ provenance: "studio_synth", approval: "approved" }));
    expect(result).toEqual({ servable: false, reasonKey: "studio.synthesis_without_reviewer" });
  });

  it("serves synthesis a person actually approved", () => {
    const result = mayBeServed(
      asset({ provenance: "studio_synth", approval: "approved", reviewedBy: "u_studio", reviewedAt: AT }),
    );
    expect(result.servable).toBe(true);
  });

  it("refuses human audio with nobody attributed", () => {
    const anonymous = asset({ approval: "approved" });
    const { reciterId: _dropped, ...withoutReciter } = anonymous;
    expect(mayBeServed(withoutReciter as ReviewableAsset).servable).toBe(false);
  });

  it("refuses library audio with no licence", () => {
    expect(mayBeServed(asset({ provenance: "library", approval: "approved" })).servable).toBe(false);
    expect(
      mayBeServed(asset({ provenance: "library", approval: "approved", license: "CC-BY-4.0" })).servable,
    ).toBe(true);
  });

  it("has no path that serves an unreviewed asset", () => {
    // Every combination of provenance at pending approval must refuse.
    for (const provenance of ["human", "studio_synth", "library"] as const) {
      expect(mayBeServed(asset({ provenance, approval: "pending" })).servable).toBe(false);
    }
  });
});
