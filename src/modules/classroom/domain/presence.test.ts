import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESENCE_CONFIG,
  encodeFrame,
  stateOf,
  summarise,
  toFrame,
  workingCount,
  type PresenceBeat,
} from "./presence";

const NOW = new Date("2026-08-23T18:00:00.000Z");
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

describe("presence", () => {
  it("calls a learner working inside the working window", () => {
    expect(stateOf(secondsAgo(10), NOW)).toBe("working");
  });

  it("calls them idle once the working window has passed", () => {
    expect(stateOf(secondsAgo(120), NOW)).toBe("idle");
  });

  it("calls them away once the presence window has passed", () => {
    expect(stateOf(secondsAgo(1_200), NOW)).toBe("away");
  });

  it("calls a learner with no beat away, never absent", () => {
    expect(stateOf(null, NOW)).toBe("away");
  });

  it("treats the window boundary as still inside it", () => {
    expect(stateOf(secondsAgo(DEFAULT_PRESENCE_CONFIG.workingWithinSeconds), NOW)).toBe("working");
  });

  it("keeps every rostered learner on the list, even with no beats", () => {
    const entries = summarise(["u1", "u2"], [], NOW);
    expect(entries.map((entry) => entry.learnerUserId)).toEqual(["u1", "u2"]);
    expect(entries.every((entry) => entry.state === "away")).toBe(true);
  });

  it("keeps the roster's order, so the list never reshuffles under a teacher", () => {
    const beats: readonly PresenceBeat[] = [
      { learnerUserId: "u3", at: secondsAgo(1) },
      { learnerUserId: "u1", at: secondsAgo(1) },
    ];
    expect(summarise(["u1", "u2", "u3"], beats, NOW).map((e) => e.learnerUserId)).toEqual([
      "u1",
      "u2",
      "u3",
    ]);
  });

  it("uses the most recent beat when several arrive out of order", () => {
    const beats: readonly PresenceBeat[] = [
      { learnerUserId: "u1", at: secondsAgo(500) },
      { learnerUserId: "u1", at: secondsAgo(5) },
      { learnerUserId: "u1", at: secondsAgo(300) },
    ];
    const [entry] = summarise(["u1"], beats, NOW);
    expect(entry!.state).toBe("working");
    expect(entry!.secondsSince).toBe(5);
  });

  it("ignores beats for learners outside this classroom", () => {
    const entries = summarise(["u1"], [{ learnerUserId: "stranger", at: secondsAgo(1) }], NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.state).toBe("away");
  });

  it("never reports a negative age when a clock runs ahead", () => {
    const [entry] = summarise(["u1"], [{ learnerUserId: "u1", at: secondsAgo(-30) }], NOW);
    expect(entry!.secondsSince).toBe(0);
  });

  it("counts the working ones with their denominator", () => {
    const entries = summarise(
      ["u1", "u2", "u3"],
      [
        { learnerUserId: "u1", at: secondsAgo(3) },
        { learnerUserId: "u2", at: secondsAgo(400) },
      ],
      NOW,
    );
    expect(workingCount(entries)).toEqual({ working: 1, roster: 3 });
  });

  it("carries nothing but an id, a state and an age on the wire", () => {
    const frame = toFrame(summarise(["u1"], [{ learnerUserId: "u1", at: secondsAgo(4) }], NOW), NOW);
    expect(frame.entries).toEqual([["u1", "working", 4]]);
    expect(Object.keys(frame).sort()).toEqual(["at", "entries"]);
  });

  it("encodes a frame as a single server-sent event", () => {
    const encoded = encodeFrame(toFrame([], NOW));
    expect(encoded.startsWith("data: ")).toBe(true);
    expect(encoded.endsWith("\n\n")).toBe(true);
    expect(encoded.trimEnd().split("\n")).toHaveLength(1);
  });

  it("is pure: the same beats at the same moment summarise identically", () => {
    const beats = [{ learnerUserId: "u1", at: secondsAgo(9) }];
    expect(summarise(["u1"], beats, NOW)).toEqual(summarise(["u1"], beats, NOW));
  });
});
