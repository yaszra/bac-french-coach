import { describe, expect, it } from "vitest";
import { percentile, stillWaiting, verifyLatency } from "./verify-latency";
import { buildSchoolOverview, periodOf } from "./school-overview";

const NOW = new Date("2026-08-23T20:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

describe("verify latency — how long a learner waits for an ear", () => {
  it("says nothing at all below the minimum number of answered requests", () => {
    const summary = verifyLatency([
      { requestedAt: minutesAgo(60), decidedAt: minutesAgo(30) },
      { requestedAt: minutesAgo(50), decidedAt: minutesAgo(20) },
    ]);
    expect(summary).toEqual({ kind: "not_yet_recorded", answered: 2, needed: 3 });
  });

  it("reports median and p90 in whole minutes with its denominator", () => {
    const samples = [10, 20, 30, 40, 300].map((wait) => ({
      requestedAt: minutesAgo(wait + 5),
      decidedAt: minutesAgo(5),
    }));
    const summary = verifyLatency(samples);
    expect(summary).toMatchObject({ kind: "measured", medianMinutes: 30, answered: 5, denominator: 5 });
    if (summary.kind === "measured") expect(summary.p90Minutes).toBe(300);
  });

  it("counts unanswered requests in the denominator but never in the median", () => {
    const answered = [10, 20, 30, 40, 50].map((wait) => ({
      requestedAt: minutesAgo(wait),
      decidedAt: NOW,
    }));
    const summary = verifyLatency([...answered, { requestedAt: minutesAgo(4000), decidedAt: null }]);
    expect(summary).toMatchObject({ kind: "measured", answered: 5, denominator: 6, medianMinutes: 30 });
  });

  it("reports the queue that is still waiting separately, with its oldest wait", () => {
    const waiting = stillWaiting(
      [
        { requestedAt: minutesAgo(30), decidedAt: NOW },
        { requestedAt: minutesAgo(200), decidedAt: null },
        { requestedAt: minutesAgo(90), decidedAt: null },
      ],
      NOW,
    );
    expect(waiting).toEqual({ waiting: 2, longestWaitHours: 3 });
  });

  it("has no oldest wait when nobody is waiting", () => {
    expect(stillWaiting([{ requestedAt: minutesAgo(30), decidedAt: NOW }], NOW)).toEqual({
      waiting: 0,
      longestWaitHours: null,
    });
  });

  it("picks percentiles without interpolating past the data it has", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4], 0.9)).toBe(4);
    expect(percentile([], 0.5)).toBe(0);
  });

  it("never reports a negative wait when the clocks disagree", () => {
    const summary = verifyLatency(
      Array.from({ length: 5 }, () => ({ requestedAt: NOW, decidedAt: minutesAgo(10) })),
    );
    expect(summary).toMatchObject({ kind: "measured", medianMinutes: 0 });
  });
});

describe("the school overview", () => {
  const overview = buildSchoolOverview({
    period: periodOf(NOW, 7),
    learnersEnrolled: 40,
    learnersOnRoll: 52,
    learnersActive: 31,
    teachersWhoVerified: 3,
    teachers: 6,
    verifications: Array.from({ length: 6 }, (_, i) => ({
      requestedAt: minutesAgo(60 + i * 10),
      decidedAt: i < 5 ? minutesAgo(10) : null,
    })),
    coverage: [
      { id: "c1", label: "Juzʾ 30", value: 12, denominator: 40 },
      { id: "c2", label: "Juzʾ 29", value: 3, denominator: 40 },
      { id: "c3", label: "Juzʾ 28", value: 30, denominator: 40 },
    ],
    interventions: [
      { id: "u1", label: "Yūsuf", value: 4, denominator: 7 },
      { id: "u2", label: "Maryam", value: 9, denominator: 7 },
    ],
    dataRequests: { received: 1, running: 0, completed: 2, failed: 0 },
    now: NOW,
  });

  it("carries the period on the overview itself", () => {
    expect(overview.period.days).toBe(7);
    expect(overview.period.to).toEqual(NOW);
  });

  it("gives every figure its denominator", () => {
    for (const figure of [overview.enrolment, overview.activeLearners, overview.teacherUsage]) {
      expect(figure.denominator).toBeGreaterThan(0);
      expect(figure.measured.denominator).toBe(figure.denominator);
    }
  });

  it("refuses a rate over too few teachers rather than shrinking it", () => {
    const tiny = buildSchoolOverview({
      period: periodOf(NOW, 7),
      learnersEnrolled: 2,
      learnersOnRoll: 2,
      learnersActive: 1,
      teachersWhoVerified: 1,
      teachers: 2,
      verifications: [],
      coverage: [],
      interventions: [],
      dataRequests: { received: 0, running: 0, completed: 0, failed: 0 },
      now: NOW,
    });
    expect(tiny.teacherUsage.measured.kind).toBe("not_yet_recorded");
    expect(tiny.latency.kind).toBe("not_yet_recorded");
  });

  it("ranks coverage by what is least covered, and interventions by most needed", () => {
    expect(overview.coverage.map((row) => row.id)).toEqual(["c2", "c1", "c3"]);
    expect(overview.interventions.map((row) => row.id)).toEqual(["u2", "u1"]);
  });

  it("keeps ranked lists short enough to act on", () => {
    expect(overview.coverage.length).toBeLessThanOrEqual(5);
    expect(overview.interventions.length).toBeLessThanOrEqual(5);
  });

  it("shows the data requests in their real states", () => {
    expect(overview.dataRequests).toEqual({ received: 1, running: 0, completed: 2, failed: 0 });
  });
});
