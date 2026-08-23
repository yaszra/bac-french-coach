/**
 * Transactional outbox — acceptance criterion 16.
 *
 * "A failed notification or AI service cannot lose or roll back learning
 * evidence." This is the test that proves the degradation contract.
 */
import { describe, expect, it } from "vitest";
import {
  EVENT_CATALOG,
  Outbox,
  buildEvent,
  resetEventSequence,
  type EventType,
  type LearningEventEnvelope,
} from "../src/app/events.js";
import {
  createAssignment,
  recordListen,
  submitRetrieval,
} from "../src/app/commands.js";
import {
  ACADEMY_A,
  CLASS_A,
  LEARNER_A,
  ORG_A,
  T0,
  DAY,
  learner,
  makeDeps,
  standardPolicy,
  teacher,
} from "./helpers.js";

function event(type: EventType, key = "k1"): LearningEventEnvelope {
  resetEventSequence();
  return buildEvent(
    {
      eventType: type,
      occurredAt: T0,
      organizationId: ORG_A,
      idempotencyKey: key,
      objectRefs: { label: "Al-Mulk 12-15" },
    },
    T0,
  );
}

describe("criterion 16 — downstream failure cannot touch learning evidence", () => {
  it("keeps persisted evidence intact when every delivery attempt fails", () => {
    const deps = makeDeps();
    const { assignmentId, targetId } = createAssignment(deps, {
      actor: teacher(),
      now: T0,
      learnerId: LEARNER_A,
      academyId: ACADEMY_A,
      classroomId: CLASS_A,
      targetKind: "segment",
      label: "Al-Mulk 12-15",
      corpusVersionId: "corpus-1",
      segmentIds: ["seg-1"],
      policy: standardPolicy,
      estimatedActiveMinutes: 9,
      dueAt: T0 + DAY,
      corpusReleasable: true,
    });
    for (let i = 0; i < 3; i++)
      recordListen(deps, { actor: learner(), now: T0 + i, assignmentId, segmentId: "seg-1" });
    submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 10,
      assignmentId,
      segmentId: "seg-1",
      scaffoldLevel: "oral_blank_page",
      startContext: "random_start",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "k-evidence",
    });

    const before = deps.repo.getMemoryState(targetId);
    const attemptsBefore = deps.repo.listAttempts(assignmentId).length;

    // The notification service is down and stays down.
    const result = deps.outbox.dispatch(() => {
      throw new Error("notification service unavailable");
    });

    expect(result.delivered).toBe(0);
    expect(deps.outbox.deadLetters.length).toBeGreaterThan(0);
    // Evidence and state are untouched.
    expect(deps.repo.listAttempts(assignmentId)).toHaveLength(attemptsBefore);
    expect(deps.repo.getMemoryState(targetId)).toEqual(before);
  });

  it("retries before dead-lettering, and a late recovery still delivers", () => {
    const outbox = new Outbox();
    outbox.append(event("review_completed"));

    let attempts = 0;
    outbox.dispatch(() => {
      attempts++;
      throw new Error("down");
    });
    expect(attempts).toBe(3);
    expect(outbox.deadLetters).toHaveLength(1);
    expect(outbox.deliveredEvents).toHaveLength(0);

    // Operator fixes the downstream fault and replays.
    outbox.replayDeadLetters();
    outbox.dispatch(() => {});
    expect(outbox.deliveredEvents).toHaveLength(1);
    expect(outbox.deadLetters).toHaveLength(0);
  });

  it("delivers healthy events even when one consumer keeps failing", () => {
    const outbox = new Outbox();
    outbox.append(event("review_completed", "good-1"));
    outbox.append(event("correction_added", "bad-1"));
    outbox.append(event("recitation_requested", "good-2"));

    const result = outbox.dispatch((e) => {
      if (e.eventType === "correction_added") throw new Error("sink rejected");
    });

    expect(result.delivered).toBe(2);
    expect(outbox.deadLetters.map((d) => d.event.eventType)).toEqual([
      "correction_added",
    ]);
  });
});

describe("idempotency", () => {
  it("drops a duplicate of the same event type and key", () => {
    const outbox = new Outbox();
    outbox.append(event("review_completed", "same"));
    outbox.append(event("review_completed", "same"));
    expect(outbox.pendingCount).toBe(1);
  });

  it("keeps distinct event types that share an idempotency key", () => {
    const outbox = new Outbox();
    outbox.append(event("review_completed", "shared"));
    outbox.append(event("review_scheduled", "shared"));
    expect(outbox.pendingCount).toBe(2);
  });
});

describe("no sacred text ever enters the event stream", () => {
  it("refuses to build an event carrying Arabic script in objectRefs", () => {
    expect(() =>
      buildEvent(
        {
          eventType: "retrieval_submitted",
          occurredAt: T0,
          organizationId: ORG_A,
          idempotencyKey: "k",
          objectRefs: { word: "ب" },
        },
        T0,
      ),
    ).toThrow(/sacred text must never leave/);
  });

  it("accepts reference labels, which are not sacred text", () => {
    expect(() => event("retrieval_submitted")).not.toThrow();
  });
});

describe("event catalog governance", () => {
  it("gives every event a purpose, a privacy class, a retention class, and a consumer", () => {
    for (const [type, entry] of Object.entries(EVENT_CATALOG)) {
      expect(entry.purpose, type).toBeTruthy();
      expect(entry.privacy, type).toBeTruthy();
      expect(entry.retention, type).toBeTruthy();
      expect(entry.consumers.length, `${type} has no named consumer`).toBeGreaterThan(0);
    }
  });

  it("stamps the catalog metadata onto every envelope", () => {
    const e = event("correction_added");
    expect(e.privacy).toBe("learning_evidence_sensitive");
    expect(e.retention).toBe("academy_policy_7y");
    expect(e.purpose).toBe(EVENT_CATALOG.correction_added.purpose);
  });

  it("records both occurred and received time, so clock skew stays visible", () => {
    resetEventSequence();
    const e = buildEvent(
      {
        eventType: "review_completed",
        occurredAt: T0,
        organizationId: ORG_A,
        idempotencyKey: "k",
      },
      T0 + 5000,
    );
    expect(e.occurredAt).toBe(T0);
    expect(e.receivedAt).toBe(T0 + 5000);
  });

  it("classifies retrieval and verification as learning evidence, not product telemetry", () => {
    for (const t of [
      "retrieval_submitted",
      "independent_recall_succeeded",
      "oral_verification_recorded",
      "review_completed",
    ] as EventType[])
      expect(EVENT_CATALOG[t].privacy).toMatch(/^learning_evidence/);
  });
});
