import { describe, expect, it } from "vitest";
import { taughtConceptIds } from "./anomaly-repo";
import { detectAnomaliesAcross } from "../domain/anomalies";
import type { ConceptObservation } from "../domain/evidence";

/**
 * The anomalies a teacher is actually shown.
 *
 * The engine was written, tested, exported — and read by nothing. No repo, no
 * action, no page: a teacher was never told about a single pattern it could
 * find. These check the join, not the detectors, which have their own tests.
 */
describe("the concepts anomalies are looked for in", () => {
  it("covers what the lessons teach, deduplicated", () => {
    const ids = taughtConceptIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids]).toEqual([...ids].sort());
  });

  it("finds a pattern in evidence the reading surface actually records", () => {
    const conceptId = taughtConceptIds()[0] as string;
    const now = new Date("2026-08-25T18:00:00Z");
    // Answers faster than anyone can read the prompt: the shape a teacher
    // should be told to look at, and never an accusation.
    const observations: readonly ConceptObservation[] = Array.from({ length: 40 }, (_, index) => ({
      conceptId,
      sessionId: "s1",
      index,
      correct: true,
      elapsedMs: 120,
      at: new Date(now.getTime() - (40 - index) * 1_000),
      retrievalType: "recognition",
      evidenceKind: "machine_checked",
    })) as never;

    const found = detectAnomaliesAcross([conceptId], observations, now);
    expect(found.length).toBeGreaterThan(0);
    for (const anomaly of found) {
      // Every finding carries what it was counted from — the honesty rule, at
      // the one place a teacher might otherwise read a rumour as a fact.
      expect(anomaly.denominator.attempts).toBeGreaterThan(0);
      expect(anomaly.reason.key.startsWith("reading.anomaly.reason.")).toBe(true);
    }
  });
});
