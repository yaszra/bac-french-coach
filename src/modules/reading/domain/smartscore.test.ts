import { describe, expect, it } from "vitest";

import type { ActivityKind, ConceptObservation, EvidenceKind, Presentation } from "./evidence";
import {
  SMART_SCORE_DEFAULTS,
  bktStateFor,
  evidenceVariety,
  evidenceVarietyFactor,
  recencyFactor,
  sessionSpreadFactor,
  smartScore,
  smartScores,
} from "./smartscore";

const CONCEPT = "letter.beh.fathah";
const DAY = 86_400_000;
const START = new Date("2026-03-01T09:00:00.000Z");

interface ObsOptions {
  readonly evidenceKind?: EvidenceKind;
  readonly activityKind?: ActivityKind;
  readonly presentation?: Presentation;
  readonly session?: number;
  readonly dayOffset?: number;
  readonly conceptId?: string;
}

function obs(correct: boolean, index: number, options: ObsOptions = {}): ConceptObservation {
  const session = options.session ?? 1;
  return {
    conceptId: options.conceptId ?? CONCEPT,
    correct,
    at: new Date(START.getTime() + (options.dayOffset ?? session - 1) * DAY + index * 60_000),
    activityKind: options.activityKind ?? "recognition",
    evidenceKind: options.evidenceKind ?? "machine_checked",
    presentation: options.presentation ?? "ordered",
    sessionId: `s${session}`,
  };
}

function correctRun(count: number, options: ObsOptions = {}): ConceptObservation[] {
  return Array.from({ length: count }, (_unused, index) => obs(true, index, options));
}

describe("nothing recorded is a state, not a zero", () => {
  it("returns not_yet_recorded with a zero denominator and a null score", () => {
    const result = smartScore(CONCEPT, []);
    expect(result.state).toBe("not_yet_recorded");
    expect(result.score).toBeNull();
    expect(result.pKnown).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.denominator).toEqual({ attempts: 0, sessions: 0 });
    expect(result.scoredAttempts).toBe(0);
    expect(result.lastEvidenceAt).toBeNull();
    expect(result.reason.key).toBe("reading.smartscore.reason.not_yet_recorded");
  });

  it("ignores evidence recorded against a different concept", () => {
    const other = correctRun(6, { conceptId: "letter.teh" });
    expect(smartScore(CONCEPT, other).state).toBe("not_yet_recorded");
    expect(smartScore(CONCEPT, other).denominator.attempts).toBe(0);
  });

  it("keeps the score null when the only evidence is a learner's own word", () => {
    const solo = [
      obs(true, 0, { evidenceKind: "self_confirmed", activityKind: "production" }),
      obs(true, 1, { evidenceKind: "self_confirmed", activityKind: "production", session: 2 }),
    ];
    const result = smartScore(CONCEPT, solo);
    expect(result.score).toBeNull();
    expect(result.state).toBe("not_yet_recorded");
    // …but what happened is still on the record, with its denominator.
    expect(result.denominator).toEqual({ attempts: 2, sessions: 2 });
    expect(result.evidenceMix.self_confirmed).toBe(2);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.reason.key).toBe("reading.smartscore.reason.no_mastery_bearing_evidence");
  });

  it("never lets an advisory listener produce a score", () => {
    const advisory = correctRun(8, { evidenceKind: "advisory_only", activityKind: "production" });
    expect(smartScore(CONCEPT, advisory).score).toBeNull();
    expect(bktStateFor(CONCEPT, advisory)).toBeNull();
  });
});

describe("the score follows the evidence", () => {
  it("rises with correct evidence", () => {
    const two = smartScore(CONCEPT, correctRun(2)).score ?? 0;
    const six = smartScore(CONCEPT, correctRun(6)).score ?? 0;
    const twelve = smartScore(CONCEPT, correctRun(12)).score ?? 0;
    expect(two).toBeGreaterThan(0);
    expect(six).toBeGreaterThan(two);
    expect(twelve).toBeGreaterThan(six);
    expect(twelve).toBeLessThanOrEqual(100);
  });

  it("falls after a miss", () => {
    const run = correctRun(6);
    const withMiss = [...run, obs(false, 6)];
    expect(smartScore(CONCEPT, withMiss).score ?? 0).toBeLessThan(
      smartScore(CONCEPT, run).score ?? 0,
    );
  });

  it("never reports zero when there is real evidence on the record", () => {
    const misses = Array.from({ length: 12 }, (_unused, index) => obs(false, index));
    const result = smartScore(CONCEPT, misses);
    expect(result.score).not.toBeNull();
    expect(result.score ?? 0).toBeGreaterThanOrEqual(1);
    expect(result.state).toBe("emerging");
  });

  it("counts a teacher's verdict as evidence the score can move on", () => {
    const teacher = correctRun(4, { evidenceKind: "teacher_observed", activityKind: "production" });
    const result = smartScore(CONCEPT, teacher);
    expect(result.score).not.toBeNull();
    expect(result.scoredAttempts).toBe(4);
  });
});

describe("recency", () => {
  it("decays a score toward a floor rather than to nothing", () => {
    expect(recencyFactor(0)).toBe(1);
    expect(recencyFactor(45)).toBeLessThan(1);
    expect(recencyFactor(45)).toBeGreaterThan(SMART_SCORE_DEFAULTS.recencyFloor);
    expect(recencyFactor(10_000)).toBeCloseTo(SMART_SCORE_DEFAULTS.recencyFloor, 6);
  });

  it("lowers a stale score without erasing it", () => {
    const run = correctRun(10);
    const fresh = smartScore(CONCEPT, run);
    const stale = smartScore(CONCEPT, run, {
      now: new Date(START.getTime() + 200 * DAY),
    });
    expect(stale.score ?? 0).toBeLessThan(fresh.score ?? 0);
    expect(stale.score ?? 0).toBeGreaterThan(
      (fresh.score ?? 0) * SMART_SCORE_DEFAULTS.recencyFloor - 1,
    );
    expect(stale.pKnown).toBeCloseTo(fresh.pKnown ?? 0, 12);
  });
});

describe("evidence variety raises confidence, not the score", () => {
  it("counts distinct activity-and-evidence buckets", () => {
    const mixed = [
      obs(true, 0),
      obs(true, 1, { evidenceKind: "teacher_observed", activityKind: "production" }),
      obs(true, 2, { evidenceKind: "self_confirmed", activityKind: "production" }),
    ];
    expect(evidenceVariety(correctRun(5))).toBe(1);
    expect(evidenceVariety(mixed)).toBe(3);
    expect(evidenceVarietyFactor(correctRun(5))).toBeCloseTo(0.6, 10);
    expect(evidenceVarietyFactor(mixed)).toBeCloseTo(1, 10);
    expect(evidenceVarietyFactor([])).toBe(0);
  });

  it("gives a varied record more confidence than a uniform one of the same size", () => {
    const uniform = correctRun(6, { session: 1 }).concat(correctRun(0));
    const uniformTwoSessions = [
      ...correctRun(3, { session: 1 }),
      ...correctRun(3, { session: 2 }),
    ];
    const varied = [
      ...correctRun(3, { session: 1 }),
      obs(true, 0, { evidenceKind: "teacher_observed", activityKind: "production", session: 2 }),
      obs(true, 1, { evidenceKind: "teacher_observed", activityKind: "production", session: 2 }),
      obs(true, 2, { evidenceKind: "teacher_observed", activityKind: "production", session: 2 }),
    ];
    expect(uniform).toHaveLength(6);
    expect(smartScore(CONCEPT, varied).confidence).toBeGreaterThan(
      smartScore(CONCEPT, uniformTwoSessions).confidence,
    );
    expect(smartScore(CONCEPT, varied).evidenceVariety).toBe(2);
  });

  it("rewards spreading practice across sittings", () => {
    expect(sessionSpreadFactor(0)).toBe(0);
    expect(sessionSpreadFactor(1)).toBeCloseTo(0.7, 10);
    expect(sessionSpreadFactor(3)).toBeCloseTo(1, 10);
    const oneSitting = smartScore(CONCEPT, correctRun(6, { session: 1 }));
    const threeSittings = smartScore(CONCEPT, [
      ...correctRun(2, { session: 1 }),
      ...correctRun(2, { session: 2 }),
      ...correctRun(2, { session: 3 }),
    ]);
    expect(threeSittings.confidence).toBeGreaterThan(oneSitting.confidence);
  });

  it("keeps confidence strictly below certainty however much evidence arrives", () => {
    const many = Array.from({ length: 200 }, (_unused, index) =>
      obs(true, index, { session: (index % 5) + 1 }),
    );
    expect(smartScore(CONCEPT, many).confidence).toBeLessThan(1);
  });
});

describe("states", () => {
  it("stays emerging until the evidence is both strong and spread out", () => {
    const oneSitting = smartScore(CONCEPT, correctRun(10, { session: 1 }));
    expect(oneSitting.score ?? 0).toBeGreaterThan(SMART_SCORE_DEFAULTS.secureScore);
    expect(oneSitting.denominator.sessions).toBe(1);
    expect(oneSitting.state).toBe("emerging");
  });

  it("reads secure once the score, the confidence and the sittings all agree", () => {
    const spread = [
      ...correctRun(7, { session: 1 }),
      ...correctRun(7, { session: 2 }),
      ...correctRun(7, { session: 3 }),
    ];
    const result = smartScore(CONCEPT, spread);
    expect(result.state).toBe("secure");
    expect(result.confidence).toBeGreaterThanOrEqual(SMART_SCORE_DEFAULTS.secureConfidence);
    expect(result.denominator.sessions).toBe(3);
    expect(result.scoredAttempts).toBe(21);
  });

  it("carries a denominator with every state it reports", () => {
    for (const result of smartScores(
      [CONCEPT, "letter.teh"],
      [...correctRun(4), ...correctRun(2, { conceptId: "letter.teh", session: 2 })],
    )) {
      expect(result.denominator.attempts).toBeGreaterThan(0);
      expect(result.denominator.sessions).toBeGreaterThan(0);
      expect(result.reason.params["attempts"]).toBe(result.denominator.attempts);
    }
  });
});
