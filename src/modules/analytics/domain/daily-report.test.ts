import { describe, expect, it } from "vitest";
import { buildDailyReport, type ReportEvent } from "./daily-report";
import { rate, parts, MINIMUM_OBSERVATIONS } from "./denominator";

const DAY = "2026-08-23";

function attempt(over: Partial<ReportEvent["payload"]> & { unitId?: string } = {}): ReportEvent {
  const { unitId = "b:78:1", ...payload } = over;
  return {
    type: "attempt.recorded",
    unitId,
    occurredAt: new Date(`${DAY}T18:00:00Z`),
    payload: { retrievalType: "recall_first", grade: "good", durationMs: 60_000, ...payload },
  };
}

describe("rates carry their denominator", () => {
  it("refuses to claim a rate from too little evidence", () => {
    const measured = rate(1, 2);
    expect(measured.kind).toBe("not_yet_recorded");
    expect(parts(measured)).toEqual({ percent: null, numerator: null, denominator: 2 });
  });

  it("reports the numerator and denominator alongside the percentage", () => {
    const measured = rate(8, 10);
    expect(parts(measured)).toEqual({ percent: 80, numerator: 8, denominator: 10 });
  });

  it("needs at least the minimum number of observations", () => {
    expect(rate(0, MINIMUM_OBSERVATIONS - 1).kind).toBe("not_yet_recorded");
    expect(rate(0, MINIMUM_OBSERVATIONS).kind).toBe("measured");
  });
});

describe("the daily report", () => {
  it("says plainly when nothing was recorded", () => {
    const report = buildDailyReport({
      learnerUserId: "u1",
      forDate: DAY,
      events: [],
      reviewsDue: 12,
      wordsHeld: 300,
      wordsHeldLastWeek: 280,
    });
    expect(report.state).toBe("nothing_recorded");
    expect(report.reviewsDone).toBe(0);
    // The due count is still true and still shown.
    expect(report.reviewsDue).toBe(12);
    expect(report.unassistedRecall.kind).toBe("not_yet_recorded");
  });

  it("counts only unassisted exercises towards recall", () => {
    const events = [
      ...Array.from({ length: 6 }, () => attempt({ retrievalType: "listen", grade: "easy" })),
      ...Array.from({ length: 6 }, () => attempt({ retrievalType: "recall_first", grade: "again" })),
    ];
    const report = buildDailyReport({
      learnerUserId: "u1",
      forDate: DAY,
      events,
      reviewsDue: 6,
      wordsHeld: 100,
      wordsHeldLastWeek: null,
    });
    // Six listens do not make a learner look like they recalled anything.
    expect(parts(report.unassistedRecall)).toEqual({ percent: 0, numerator: 0, denominator: 6 });
  });

  it("surfaces at most three struggles, each with one suggested action", () => {
    const events = [
      ...Array.from({ length: 2 }, () => attempt({ unitId: "t:78:1>78:2", grade: "again" })),
      ...Array.from({ length: 3 }, () => attempt({ unitId: "b:78:5", grade: "again" })),
      ...Array.from({ length: 2 }, () => attempt({ unitId: "b:78:7", grade: "again" })),
      ...Array.from({ length: 2 }, () => attempt({ unitId: "b:78:9", grade: "again" })),
    ];
    const report = buildDailyReport({
      learnerUserId: "u1",
      forDate: DAY,
      events,
      reviewsDue: 9,
      wordsHeld: 100,
      wordsHeldLastWeek: 90,
    });
    expect(report.struggles.length).toBe(3);
    for (const struggle of report.struggles) {
      expect(struggle.suggestedActionKey).toMatch(/^action\./);
      expect(struggle.observations).toBeGreaterThanOrEqual(2);
    }
    // A weak join is named as a join, because that is what a teacher acts on.
    expect(report.struggles.some((s) => s.reasonKey === "struggle.weakJoin")).toBe(true);
  });

  it("does not call a single slip a struggle", () => {
    const report = buildDailyReport({
      learnerUserId: "u1",
      forDate: DAY,
      events: [attempt({ grade: "again" })],
      reviewsDue: 1,
      wordsHeld: 10,
      wordsHeldLastWeek: null,
    });
    expect(report.struggles).toEqual([]);
  });

  it("reports the trend in words, with no comparison invented when there is no last week", () => {
    const report = buildDailyReport({
      learnerUserId: "u1",
      forDate: DAY,
      events: [attempt()],
      reviewsDue: 1,
      wordsHeld: 412,
      wordsHeldLastWeek: null,
    });
    expect(report.trend).toEqual({ wordsHeld: 412, wordsHeldLastWeek: null });
  });
});
