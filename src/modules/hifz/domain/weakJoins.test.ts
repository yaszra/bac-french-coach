import { describe, expect, it } from "vitest";
import { retrievability } from "@/modules/memory/domain/fsrs";
import type { MemoryState } from "@/modules/memory/domain/types";
import { splitByKind, weakJoins } from "./weakJoins";

const now = new Date("2026-03-01T09:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const body = (unitId: string, over: Partial<MemoryState> = {}): MemoryState => ({
  unitId,
  kind: "ayah_body",
  stability: 100,
  difficulty: 5,
  reps: 8,
  lapses: 0,
  lastReviewAt: daysAgo(1),
  lastRetrievalType: "recall_first",
  confidence: 0.9,
  ...over,
});

const join = (unitId: string, over: Partial<MemoryState> = {}): MemoryState => ({
  ...body(unitId),
  unitId,
  kind: "ayah_transition",
  ...over,
});

const strongBodies = [body("b:2:1"), body("b:2:2"), body("b:2:3")];

describe("weakJoins", () => {
  it("flags a transition whose recall trails the āyāt it joins", () => {
    const found = weakJoins({
      now,
      transitions: [join("t:2:1>2:2", { stability: 2, lastReviewAt: daysAgo(10) })],
      bodies: strongBodies,
    });
    expect(found).toHaveLength(1);
    const first = found[0];
    expect(first?.unitId).toBe("t:2:1>2:2");
    expect(first?.basis).toBe("measured");
    expect(first?.reason.key).toBe("hifz.weak_join.retrievability_gap");
    expect(first?.gap ?? 0).toBeGreaterThan(0.05);
    expect(first?.bodies).toEqual(["b:2:1", "b:2:2"]);
  });

  it("finds nothing on a uniformly strong page", () => {
    const uniform = [join("t:2:1>2:2"), join("t:2:2>2:3")];
    expect(weakJoins({ now, transitions: uniform, bodies: strongBodies })).toEqual([]);
  });

  it("flags a fresh-looking seam whose stability is a fraction of the bodies'", () => {
    const fresh = join("t:2:1>2:2", { stability: 3, lastReviewAt: daysAgo(0.01) });
    const found = weakJoins({ now, transitions: [fresh], bodies: strongBodies });
    expect(found).toHaveLength(1);
    expect(found[0]?.reason.key).toBe("hifz.weak_join.stability_gap");
    // It looks fine right now — which is exactly why the retrievability gap misses it.
    expect(retrievability(fresh, now)).toBeGreaterThan(0.99);
  });

  it("reports an unpractised seam honestly, with no invented number", () => {
    const unrecorded = join("t:2:1>2:2", {
      reps: 0,
      lapses: 0,
      lastReviewAt: null,
      confidence: 0,
      stability: 0.01,
    });
    const found = weakJoins({ now, transitions: [unrecorded], bodies: strongBodies });
    expect(found).toHaveLength(1);
    expect(found[0]?.basis).toBe("not_yet_recorded");
    expect(found[0]?.joinRetrievability).toBeNull();
    expect(found[0]?.gap).toBeNull();
    expect(found[0]?.reason.key).toBe("hifz.weak_join.not_yet_recorded");
  });

  it("can be told to leave unpractised seams out", () => {
    const unrecorded = join("t:2:1>2:2", { reps: 0, lastReviewAt: null, confidence: 0 });
    expect(
      weakJoins({ now, transitions: [unrecorded], bodies: strongBodies, includeUnrecorded: false }),
    ).toEqual([]);
  });

  it("claims nothing when a body it would compare against is missing", () => {
    const weak = join("t:2:1>2:2", { stability: 2, lastReviewAt: daysAgo(10) });
    expect(weakJoins({ now, transitions: [weak], bodies: [body("b:2:1")] })).toEqual([]);
  });

  it("claims nothing when a body has no evidence of its own", () => {
    const weak = join("t:2:1>2:2", { stability: 2, lastReviewAt: daysAgo(10) });
    const bodies = [body("b:2:1"), body("b:2:2", { reps: 0, lastReviewAt: null })];
    expect(weakJoins({ now, transitions: [weak], bodies })).toEqual([]);
  });

  it("ranks the worst seam first and lets a stall break the tie", () => {
    const equallyWeak = [
      join("t:2:1>2:2", { stability: 4, lastReviewAt: daysAgo(8) }),
      join("t:2:2>2:3", { stability: 4, lastReviewAt: daysAgo(8) }),
    ];
    const plain = weakJoins({ now, transitions: equallyWeak, bodies: strongBodies });
    expect(plain.map((item) => item.unitId)).toEqual(["t:2:1>2:2", "t:2:2>2:3"]);

    const withStall = weakJoins({
      now,
      transitions: equallyWeak,
      bodies: strongBodies,
      hesitations: [{ unitId: "t:2:2>2:3", wordIndex: 12, severity: 0.9 }],
    });
    expect(withStall[0]?.unitId).toBe("t:2:2>2:3");
    expect(withStall[0]?.hesitation).toBeCloseTo(0.9, 5);
    expect(withStall[1]?.hesitation).toBeNull();
  });

  it("never invents a weak join from a stall alone", () => {
    const found = weakJoins({
      now,
      transitions: [join("t:2:1>2:2")],
      bodies: strongBodies,
      hesitations: [{ unitId: "t:2:1>2:2", wordIndex: 3, severity: 1 }],
    });
    expect(found).toEqual([]);
  });

  it("honours a top-N limit over a stable ranking", () => {
    const many = [
      join("t:2:1>2:2", { stability: 2, lastReviewAt: daysAgo(20) }),
      join("t:2:2>2:3", { stability: 6, lastReviewAt: daysAgo(6) }),
    ];
    const found = weakJoins({ now, transitions: many, bodies: strongBodies, limit: 1 });
    expect(found).toHaveLength(1);
    expect(found[0]?.unitId).toBe("t:2:1>2:2");
  });

  it("splits a mixed state list into joins and bodies", () => {
    const split = splitByKind([...strongBodies, join("t:2:1>2:2")]);
    expect(split.bodies).toHaveLength(3);
    expect(split.transitions.map((state) => state.unitId)).toEqual(["t:2:1>2:2"]);
  });
});
