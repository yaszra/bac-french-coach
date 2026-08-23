/**
 * Measurement and experiment discipline — docs/16.
 */
import { describe, expect, it } from "vitest";
import {
  guardrails,
  northStar,
  rate,
  shouldShip,
  type ExperimentResult,
  type ScheduledRecallObservation,
} from "../src/core/measurement.js";

const T0 = Date.UTC(2026, 7, 1);

function obs(over: Partial<ScheduledRecallObservation> = {}): ScheduledRecallObservation {
  return {
    learnerId: "l1",
    targetId: "t1",
    delayDays: 7,
    independent: true,
    correct: true,
    occurredAt: T0,
    learnerActiveMinutes: 10,
    teacherMinutes: 2,
    ...over,
  };
}

describe("a rate refuses to exist without its denominator", () => {
  it("returns undefined rather than zero when nothing was measured", () => {
    const r = rate(0, 0, "reviews");
    expect(r.value).toBeUndefined();
    expect(r.statement).toBe("No reviews recorded yet.");
  });

  it("states the count and the total, never a bare percentage", () => {
    const r = rate(3, 4, "passages recalled");
    expect(r.statement).toBe("3 of 4 passages recalled.");
    expect(r.value).toBeCloseTo(0.75);
  });
});

describe("the north star counts only what it says it counts", () => {
  it("excludes assisted recalls rather than counting them as misses", () => {
    const result = northStar(
      [obs(), obs({ independent: false, correct: false })],
      3,
    );
    // Counting an assisted attempt as a miss would make the metric improve
    // whenever a learner stopped asking for help.
    expect(result.independentRecallRate.denominator).toBe(1);
    expect(result.excludedAsAssisted).toBe(1);
  });

  it("excludes recalls that happened before the target delay", () => {
    const result = northStar([obs({ delayDays: 1 }), obs({ delayDays: 7 })], 3);
    expect(result.independentRecallRate.denominator).toBe(1);
    expect(result.excludedAsTooSoon).toBe(1);
  });

  it("reports the rate with its denominator", () => {
    const result = northStar(
      [obs(), obs({ correct: false }), obs({ targetId: "t3" })],
      3,
    );
    expect(result.independentRecallRate.numerator).toBe(2);
    expect(result.independentRecallRate.denominator).toBe(3);
  });

  it("weights by learner effort and teacher time", () => {
    const result = northStar(
      [obs({ learnerActiveMinutes: 30, teacherMinutes: 6 })],
      3,
    );
    expect(result.recallsPerLearnerHour).toBeCloseTo(2);
    expect(result.recallsPerTeacherHour).toBeCloseTo(10);
  });

  it("returns undefined per-hour figures rather than dividing by zero", () => {
    const result = northStar(
      [obs({ learnerActiveMinutes: 0, teacherMinutes: 0 })],
      3,
    );
    expect(result.recallsPerLearnerHour).toBeUndefined();
    expect(result.recallsPerTeacherHour).toBeUndefined();
  });

  it("says nothing rather than something when there is no eligible data", () => {
    const result = northStar([], 3);
    expect(result.independentRecallRate.value).toBeUndefined();
    expect(result.independentRecallRate.statement).toMatch(/No .* recorded yet/);
  });
});

describe("false confidence is the guardrail that matters most", () => {
  const base = {
    verifiedCount: 10,
    establishedCount: 6,
    durableCount: 2,
    correctionsTotal: 8,
    correctionsRecurring: 3,
    overdueReviews: 4,
    dueReviews: 9,
    teacherMinutes: 120,
    verifiedLearners: 6,
    activeMinutes: 300,
    wallClockMinutes: 540,
    cueWithdrawalStarts: 20,
    cueWithdrawalAbandons: 3,
  };

  it("measures scaffolded success that never became independent recall", () => {
    const result = guardrails({
      ...base,
      scaffoldedSuccesses: [
        {
          learnerId: "l1",
          targetId: "t1",
          succeededAt: T0,
          laterAttemptExists: true,
          laterIndependentSuccess: false,
        },
        {
          learnerId: "l1",
          targetId: "t2",
          succeededAt: T0,
          laterAttemptExists: true,
          laterIndependentSuccess: true,
        },
      ],
    });
    expect(result.falseConfidence.numerator).toBe(1);
    expect(result.falseConfidence.denominator).toBe(2);
  });

  it("does not judge a success that has not been re-tested yet", () => {
    const result = guardrails({
      ...base,
      scaffoldedSuccesses: [
        {
          learnerId: "l1",
          targetId: "t1",
          succeededAt: T0,
          laterAttemptExists: false,
          laterIndependentSuccess: false,
        },
      ],
    });
    // Unknown, not false.
    expect(result.falseConfidence.denominator).toBe(0);
    expect(result.falseConfidence.value).toBeUndefined();
  });

  it("keeps active time distinct from wall-clock time", () => {
    const result = guardrails({ ...base, scaffoldedSuccesses: [] });
    expect(result.activeMinutes).toBe(300);
    expect(result.wallClockMinutes).toBe(540);
    expect(result.activeMinutes).not.toBe(result.wallClockMinutes);
  });

  it("reports teacher minutes per verified learner — the buyer's currency", () => {
    const result = guardrails({ ...base, scaffoldedSuccesses: [] });
    expect(result.teacherMinutesPerVerifiedLearner).toBe(20);
  });

  it("reports the review backlog as counts, not as a health score", () => {
    const result = guardrails({ ...base, scaffoldedSuccesses: [] });
    expect(result.reviewBacklog).toEqual({ overdue: 4, due: 9 });
  });

  it("measures abandonment during cue withdrawal", () => {
    const result = guardrails({ ...base, scaffoldedSuccesses: [] });
    expect(result.cueWithdrawalAbandonment.statement).toBe(
      "3 of 20 learners abandoned the session during cue withdrawal.",
    );
  });
});

describe("an experiment ships only on delayed recall", () => {
  const registration = {
    experimentKey: "cue-fading-order",
    learningHypothesis: "Fading anchors before tiles improves cue independence.",
    primaryOutcome: "independent_recall_after_delay" as const,
    guardrails: ["falseConfidence"] as const,
    population: "Junior learners in pilot academies",
    durationDays: 28,
    stoppingRule: "No interim looks; analyse at 28 days.",
  };

  const result = (over: Partial<ExperimentResult> = {}): ExperimentResult => ({
    registration,
    primaryDelta: 0.05,
    primarySampleSize: 400,
    guardrailRegressions: [],
    engagementDelta: 0,
    daysRun: 28,
    ...over,
  });

  it("ships a genuine improvement", () => {
    const decision = shouldShip(result());
    expect(decision.ship).toBe(true);
    expect(decision.reason).toMatch(/improved by 5\.0 percentage points/);
  });

  it("refuses an engagement win that lowered delayed recall", () => {
    const decision = shouldShip(
      result({ primaryDelta: -0.03, engagementDelta: 0.25 }),
    );
    expect(decision.ship).toBe(false);
    expect(decision.reason).toMatch(/failed experiment, not a trade-off/);
  });

  it("refuses a guardrail regression even when the primary improved", () => {
    const decision = shouldShip(
      result({ guardrailRegressions: ["falseConfidence"] }),
    );
    expect(decision.ship).toBe(false);
    expect(decision.reason).toMatch(/Guardrails regressed: falseConfidence/);
  });

  it("refuses a result stopped early on a favourable reading", () => {
    const decision = shouldShip(result({ daysRun: 9 }));
    expect(decision.ship).toBe(false);
    expect(decision.reason).toMatch(/Stopping early/);
  });

  it("refuses a sample too small to distinguish an effect from noise", () => {
    const decision = shouldShip(result({ primarySampleSize: 12 }));
    expect(decision.ship).toBe(false);
    expect(decision.reason).toMatch(/12 delayed-recall observations/);
  });

  it("refuses a flat result without blaming engagement", () => {
    const decision = shouldShip(result({ primaryDelta: 0, engagementDelta: -0.1 }));
    expect(decision.ship).toBe(false);
    expect(decision.reason).toBe("Delayed recall did not improve.");
  });

  it("only ever accepts a delayed-recall primary outcome", () => {
    // The type permits exactly one value, so an engagement primary cannot
    // be pre-registered at all.
    expect(registration.primaryOutcome).toBe("independent_recall_after_delay");
  });
});
