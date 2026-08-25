import { describe, expect, it } from "vitest";

import {
  ANOMALY_KINDS,
  DEFAULT_ANOMALY_THRESHOLDS,
  detectAnomalies,
  detectAnomaliesAcross,
} from "./anomalies";
import type { ConceptObservation, EvidenceKind, Presentation } from "./evidence";
import { ladderState } from "./masteryLadder";

const CONCEPT = "letter.dad";
const DAY = 86_400_000;
const START = new Date("2026-03-01T09:00:00.000Z");
const NOW = new Date(START.getTime() + 5 * DAY);

interface ObsOptions {
  readonly session?: number;
  readonly index?: number;
  readonly elapsedMs?: number;
  readonly chosenConceptId?: string;
  readonly conceptId?: string;
  readonly presentation?: Presentation;
  readonly evidenceKind?: EvidenceKind;
}

function obs(correct: boolean, options: ObsOptions = {}): ConceptObservation {
  const session = options.session ?? 1;
  const index = options.index ?? 0;
  return {
    conceptId: options.conceptId ?? CONCEPT,
    correct,
    at: new Date(START.getTime() + (session - 1) * DAY + index * 60_000),
    activityKind: "recognition",
    evidenceKind: options.evidenceKind ?? "machine_checked",
    presentation: options.presentation ?? "ordered",
    sessionId: `s${session}`,
    ...(options.elapsedMs === undefined ? {} : { elapsedMs: options.elapsedMs }),
    ...(options.chosenConceptId === undefined ? {} : { chosenConceptId: options.chosenConceptId }),
  };
}

function many(count: number, correct: boolean, options: ObsOptions = {}): ConceptObservation[] {
  return Array.from({ length: count }, (_unused, index) =>
    obs(correct, { ...options, index: (options.index ?? 0) + index }),
  );
}

describe("nothing is flagged without enough data", () => {
  it("returns nothing for an empty record", () => {
    expect(detectAnomalies({ conceptId: CONCEPT, observations: [], now: NOW })).toEqual([]);
  });

  it("returns nothing for a handful of ordinary answers", () => {
    const observations = [
      ...many(3, true, { elapsedMs: 2400 }),
      obs(false, { index: 4, elapsedMs: 2100, chosenConceptId: "letter.zah" }),
    ];
    expect(detectAnomalies({ conceptId: CONCEPT, observations, now: NOW })).toEqual([]);
  });

  it("ignores observations recorded against another concept", () => {
    const other = many(10, true, { conceptId: "letter.seen", elapsedMs: 50 });
    expect(detectAnomalies({ conceptId: CONCEPT, observations: other, now: NOW })).toEqual([]);
  });

  it("keeps every anomaly kind neutral and namespaced", () => {
    expect(new Set(ANOMALY_KINDS).size).toBe(ANOMALY_KINDS.length);
    for (const kind of ANOMALY_KINDS) {
      expect(kind).toMatch(/^[a-z_]+$/);
    }
  });
});

describe("answers arriving faster than anyone can read", () => {
  it("is flagged with its counts once there is enough timed evidence", () => {
    const observations = [
      ...many(5, true, { elapsedMs: 120 }),
      ...many(3, false, { index: 10, elapsedMs: 2600 }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    const guessing = found.find((anomaly) => anomaly.kind === "possible_guessing");
    expect(guessing).toBeDefined();
    expect(guessing?.reason.key).toBe("reading.anomaly.reason.answers_faster_than_plausible");
    expect(guessing?.counts["fastAnswers"]).toBe(5);
    expect(guessing?.counts["timedAnswers"]).toBe(8);
    expect(guessing?.counts["thresholdMs"]).toBe(DEFAULT_ANOMALY_THRESHOLDS.implausibleMs);
    expect(guessing?.denominator.attempts).toBe(8);
    expect(guessing?.severity).toBe("attention");
  });

  it("is not flagged when only a few answers were quick", () => {
    const observations = [
      ...many(2, true, { elapsedMs: 120 }),
      ...many(8, true, { index: 10, elapsedMs: 2600 }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("possible_guessing");
  });

  it("is not flagged on too few timed answers, however fast they were", () => {
    const observations = many(4, true, { elapsedMs: 40 });
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("possible_guessing");
  });

  it("ignores answers with no recorded time rather than assuming one", () => {
    const observations = many(10, true);
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("possible_guessing");
  });
});

describe("systematic confusion versus ordinary error", () => {
  it("flags errors concentrated on one other concept, and names it", () => {
    const observations = [
      ...many(4, true, { elapsedMs: 2400 }),
      obs(false, { index: 10, elapsedMs: 2500, chosenConceptId: "letter.zah" }),
      obs(false, { index: 11, elapsedMs: 2500, chosenConceptId: "letter.zah" }),
      obs(false, { index: 12, elapsedMs: 2500, chosenConceptId: "letter.zah" }),
      obs(false, { index: 13, elapsedMs: 2500, chosenConceptId: "letter.dal" }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    const confusion = found.find((anomaly) => anomaly.kind === "systematic_confusion");
    expect(confusion).toBeDefined();
    expect(confusion?.relatedConceptId).toBe("letter.zah");
    expect(confusion?.counts["towardCount"]).toBe(3);
    expect(confusion?.counts["errors"]).toBe(4);
    expect(confusion?.reason.key).toBe(
      "reading.anomaly.reason.errors_concentrated_on_one_concept",
    );
  });

  it("does not flag errors spread evenly across several concepts", () => {
    const observations = [
      obs(false, { index: 0, chosenConceptId: "letter.zah" }),
      obs(false, { index: 1, chosenConceptId: "letter.dal" }),
      obs(false, { index: 2, chosenConceptId: "letter.sad" }),
      obs(false, { index: 3, chosenConceptId: "letter.tah" }),
      obs(false, { index: 4, chosenConceptId: "letter.thal" }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("systematic_confusion");
  });

  it("does not flag two errors toward the same concept — that is a coincidence", () => {
    const observations = [
      ...many(6, true),
      obs(false, { index: 10, chosenConceptId: "letter.zah" }),
      obs(false, { index: 11, chosenConceptId: "letter.zah" }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("systematic_confusion");
  });

  it("breaks ties between equally frequent choices deterministically", () => {
    const observations = [
      obs(false, { index: 0, chosenConceptId: "letter.zah" }),
      obs(false, { index: 1, chosenConceptId: "letter.zah" }),
      obs(false, { index: 2, chosenConceptId: "letter.zah" }),
      obs(false, { index: 3, chosenConceptId: "letter.dal" }),
      obs(false, { index: 4, chosenConceptId: "letter.dal" }),
      obs(false, { index: 5, chosenConceptId: "letter.dal" }),
    ];
    const first = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    const second = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(first).toEqual(second);
  });
});

describe("regression across sessions", () => {
  it("flags a session markedly worse than the ones before it", () => {
    const observations = [
      ...many(6, true, { session: 1 }),
      ...many(6, true, { session: 2 }),
      ...many(2, true, { session: 3 }),
      ...many(4, false, { session: 3, index: 10 }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    const regression = found.find((anomaly) => anomaly.kind === "regression");
    expect(regression).toBeDefined();
    expect(regression?.counts["priorAttempts"]).toBe(12);
    expect(regression?.counts["priorCorrect"]).toBe(12);
    expect(regression?.counts["latestAttempts"]).toBe(6);
    expect(regression?.counts["latestCorrect"]).toBe(2);
    expect(regression?.denominator.sessions).toBe(3);
  });

  it("does not flag a steady record", () => {
    const observations = [
      ...many(5, true, { session: 1 }),
      ...many(5, true, { session: 2 }),
      ...many(4, true, { session: 3 }),
      ...many(1, false, { session: 3, index: 10 }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("regression");
  });

  it("does not flag on two sessions — that is not yet a trend", () => {
    const observations = [...many(6, true, { session: 1 }), ...many(6, false, { session: 2 })];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("regression");
  });
});

describe("gaps and stalls", () => {
  it("flags a long silence, with the number of days", () => {
    const observations = many(4, true, { session: 1 });
    const found = detectAnomalies({
      conceptId: CONCEPT,
      observations,
      now: new Date(START.getTime() + 40 * DAY),
    });
    const gap = found.find((anomaly) => anomaly.kind === "long_gap");
    expect(gap).toBeDefined();
    // Floored whole days since the last recorded answer, not since the session began.
    expect(gap?.counts["days"]).toBe(39);
    expect(gap?.reason.key).toBe("reading.anomaly.reason.no_evidence_recorded_recently");
  });

  it("does not flag a recent record, nor a barely-started one", () => {
    expect(
      detectAnomalies({ conceptId: CONCEPT, observations: many(4, true), now: NOW }).map(
        (anomaly) => anomaly.kind,
      ),
    ).not.toContain("long_gap");
    expect(
      detectAnomalies({
        conceptId: CONCEPT,
        observations: many(2, true),
        now: new Date(START.getTime() + 90 * DAY),
      }),
    ).toEqual([]);
  });

  it("flags a rung that has sat just short of its threshold for several sittings", () => {
    const nearly: ConceptObservation[] = [];
    for (let session = 1; session <= 5; session += 1) {
      nearly.push(obs(true, { session, index: 0, presentation: "ordered" }));
    }
    const ladder = ladderState(CONCEPT, nearly, { hasTeacher: false });
    expect(ladder.rungs.ordered.met).toBe(false);
    const found = detectAnomalies({ conceptId: CONCEPT, observations: nearly, now: NOW, ladder });
    const stalled = found.find((anomaly) => anomaly.kind === "stalled_near_threshold");
    expect(stalled).toBeDefined();
    expect(stalled?.counts["correct"]).toBe(5);
    expect(stalled?.counts["requiredCorrect"]).toBe(6);
    expect(stalled?.counts["sessions"]).toBe(5);
    expect(stalled?.severity).toBe("notice");
  });

  it("does not flag a learner who is nowhere near the threshold yet", () => {
    const early = [obs(true, { session: 1 }), obs(true, { session: 2 })];
    const ladder = ladderState(CONCEPT, early, { hasTeacher: false });
    const found = detectAnomalies({ conceptId: CONCEPT, observations: early, now: NOW, ladder });
    expect(found.map((anomaly) => anomaly.kind)).not.toContain("stalled_near_threshold");
  });
});

describe("every anomaly carries what it is based on", () => {
  it("reports a denominator, neutral reason key and no accusation on every finding", () => {
    const observations = [
      ...many(6, true, { session: 1, elapsedMs: 90 }),
      ...many(6, true, { session: 2, elapsedMs: 90 }),
      obs(false, { session: 3, index: 0, elapsedMs: 90, chosenConceptId: "letter.zah" }),
      obs(false, { session: 3, index: 1, elapsedMs: 90, chosenConceptId: "letter.zah" }),
      obs(false, { session: 3, index: 2, elapsedMs: 90, chosenConceptId: "letter.zah" }),
      obs(false, { session: 3, index: 3, elapsedMs: 90, chosenConceptId: "letter.zah" }),
    ];
    const found = detectAnomalies({ conceptId: CONCEPT, observations, now: NOW });
    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const anomaly of found) {
      expect(anomaly.reason.key).toMatch(/^reading\.anomaly\.reason\./);
      expect(anomaly.denominator.attempts).toBeGreaterThan(0);
      expect(Object.keys(anomaly.counts).length).toBeGreaterThan(0);
      expect(["notice", "attention"]).toContain(anomaly.severity);
    }
    // Deterministic ordering: the most actionable finding first.
    expect(found[0]?.kind).toBe("systematic_confusion");
  });

  it("scans several concepts in a stable order", () => {
    const observations = [
      ...many(8, true, { elapsedMs: 100 }),
      ...many(8, true, { conceptId: "letter.zah", index: 20, elapsedMs: 100 }),
    ];
    const found = detectAnomaliesAcross(["letter.zah", CONCEPT], observations, NOW);
    expect(found).toHaveLength(2);
    expect(found.map((anomaly) => anomaly.conceptId)).toEqual(["letter.dad", "letter.zah"]);
    expect(detectAnomaliesAcross([CONCEPT, "letter.zah"], observations, NOW)).toEqual(found);
  });
});
