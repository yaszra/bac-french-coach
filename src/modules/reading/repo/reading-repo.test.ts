import { describe, expect, it } from "vitest";

import { observationsFromRows, type StoredAttemptRow } from "../ui/evidence-shape";
import { conceptStatesFrom, type ReadingSnapshot } from "./reading-repo";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function snapshot(
  rows: readonly StoredAttemptRow[],
  options: { hasTeacher?: boolean; dueAt?: ReadonlyMap<string, Date> } = {},
): ReadingSnapshot {
  const hasTeacher = options.hasTeacher ?? false;
  return {
    now: NOW,
    hasTeacher,
    observations: observationsFromRows(rows, { hasTeacher }),
    dueAt: options.dueAt ?? new Map(),
  };
}

function attempts(conceptId: string, count: number, grade: "good" | "again" = "good"): StoredAttemptRow[] {
  return Array.from({ length: count }, (_, index) => ({
    conceptId,
    retrievalType: "recognition",
    grade,
    occurredAt: new Date(NOW.getTime() - (count - index) * 3_600_000),
  }));
}

describe("a concept with no evidence is not a concept at zero", () => {
  const [state] = conceptStatesFrom(["letter.beh"], snapshot([]));

  it("reads not_yet_recorded, with a null score", () => {
    expect(state?.smartScore.state).toBe("not_yet_recorded");
    expect(state?.smartScore.score).toBeNull();
  });

  it("carries an empty denominator rather than none at all", () => {
    expect(state?.smartScore.denominator).toEqual({ attempts: 0, sessions: 0 });
  });

  it("starts on the first rung with nothing closed", () => {
    expect(state?.ladder.workingOn).toBe("ordered");
    expect(state?.ladder.rung).toBeNull();
    expect(state?.ladder.complete).toBe(false);
  });

  it("has no due date, because nothing has been scheduled", () => {
    expect(state?.dueAt).toBeUndefined();
  });
});

describe("evidence moves the state, and says how much of it there is", () => {
  const [state] = conceptStatesFrom(["letter.beh"], snapshot(attempts("letter.beh", 4)));

  it("leaves not_yet_recorded behind", () => {
    expect(state?.smartScore.state).not.toBe("not_yet_recorded");
    expect(state?.smartScore.denominator.attempts).toBe(4);
  });

  it("counts sittings, not just answers", () => {
    expect(state?.smartScore.denominator.sessions).toBeGreaterThan(0);
  });
});

describe("what is unlocked does not depend on the order concepts were listed in", () => {
  it("gives the same answer either way round", () => {
    const rows = [...attempts("letter.alef", 12), ...attempts("harakah.fathah", 12)];
    const forwards = conceptStatesFrom(
      ["letter.alef", "harakah.fathah", "letter.alef.fathah"],
      snapshot(rows),
    );
    const backwards = conceptStatesFrom(
      ["letter.alef.fathah", "harakah.fathah", "letter.alef"],
      snapshot(rows),
    );
    const composite = (states: readonly { conceptId: string; unlocked: boolean }[]) =>
      states.find((state) => state.conceptId === "letter.alef.fathah")?.unlocked;
    expect(composite(forwards)).toBe(composite(backwards));
  });

  it("locks a concept whose prerequisites have no evidence", () => {
    const [state] = conceptStatesFrom(["letter.alef.fathah"], snapshot([]));
    expect(state?.unlocked).toBe(false);
  });

  it("locks an id the lattice has never heard of", () => {
    const [state] = conceptStatesFrom(["letter.nonesuch"], snapshot([]));
    expect(state?.unlocked).toBe(false);
  });
});

describe("a teacher changes who may close the final rung", () => {
  const rows = [
    ...attempts("letter.beh", 6),
    { conceptId: "letter.beh", retrievalType: "production", grade: "good", occurredAt: NOW },
  ];

  it("keeps a solo learner's own word as a self-confirmation", () => {
    const [state] = conceptStatesFrom(["letter.beh"], snapshot(rows, { hasTeacher: false }));
    expect(state?.ladder.teacherVerified).toBe(false);
  });

  it("never reports a self-confirmation as a teacher's verdict", () => {
    const [state] = conceptStatesFrom(["letter.beh"], snapshot(rows, { hasTeacher: true }));
    expect(state?.ladder.teacherVerified).toBe(false);
    expect(state?.ladder.verificationLabelKey).not.toBe("reading.ladder.verification.teacher_verified");
  });
});

describe("scheduled due dates are carried, not computed here", () => {
  it("attaches the scheduler's date when there is one", () => {
    const dueAt = new Map([["letter.beh", new Date(NOW.getTime() - 60_000)]]);
    const [state] = conceptStatesFrom(["letter.beh"], snapshot(attempts("letter.beh", 3), { dueAt }));
    expect(state?.dueAt?.getTime()).toBe(dueAt.get("letter.beh")?.getTime());
  });

  it("omits the field entirely when the scheduler has none", () => {
    const [state] = conceptStatesFrom(["letter.beh"], snapshot(attempts("letter.beh", 3)));
    expect("dueAt" in (state ?? {})).toBe(false);
  });
});
