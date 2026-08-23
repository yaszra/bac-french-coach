/**
 * Teacher attention inbox — acceptance criterion 13.
 *
 * "The teacher's Today page prioritizes actionable evidence instead of
 * showing decorative charts."
 */
import { describe, expect, it } from "vitest";
import {
  ATTENTION_ORDER,
  attentionParams,
  buildAttentionInbox,
  type AttentionCategory,
  type LearnerSnapshot,
} from "../src/core/attention.js";
import { MS_PER_DAY, type LearnerId } from "../src/core/types.js";

const NOW = Date.UTC(2026, 0, 20, 9, 0, 0);
const ago = (d: number) => NOW - d * MS_PER_DAY;

function snapshot(over: Partial<LearnerSnapshot> = {}): LearnerSnapshot {
  return {
    learnerId: "learner-1" as LearnerId,
    displayName: "Amina S.",
    pendingVerifications: [],
    corrections: [],
    assignments: [],
    dueReviewCount: 0,
    overdueReviewCount: 0,
    lastActiveAt: ago(0),
    delayedRecalls: [],
    governanceRequests: [],
    ...over,
  };
}

const categoriesOf = (rows: readonly { category: AttentionCategory }[]) =>
  rows.map((r) => r.category);

describe("every row carries evidence, confidence, and exactly one action", () => {
  it("holds for every category the engine can emit", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          learnerId: "l1" as LearnerId,
          pendingVerifications: [
            { requestId: "r1", label: "Al-Mulk 12-15", requestedAt: ago(0.2) },
          ],
        }),
        snapshot({
          learnerId: "l2" as LearnerId,
          corrections: [
            { category: "join", addedAt: ago(9), resolvedAt: null },
            { category: "join", addedAt: ago(4), resolvedAt: null },
            { category: "join", addedAt: ago(1), resolvedAt: null },
          ],
        }),
        snapshot({
          learnerId: "l3" as LearnerId,
          assignments: [
            {
              assignmentId: "a1",
              label: "Al-Mulk 1-4",
              assignedAt: ago(3),
              dueAt: ago(-1),
              started: false,
            },
          ],
        }),
        snapshot({ learnerId: "l4" as LearnerId, overdueReviewCount: 30, dueReviewCount: 34 }),
        snapshot({ learnerId: "l5" as LearnerId, lastActiveAt: ago(9) }),
        snapshot({
          learnerId: "l6" as LearnerId,
          governanceRequests: [{ kind: "guardian_claim", requestedAt: ago(2) }],
        }),
        snapshot({
          learnerId: "l7" as LearnerId,
          delayedRecalls: [
            { correct: true, occurredAt: ago(9) },
            { correct: true, occurredAt: ago(6) },
            { correct: true, occurredAt: ago(3) },
            { correct: true, occurredAt: ago(1) },
          ],
        }),
      ],
      { now: NOW },
    );

    expect(inbox.rows.length).toBeGreaterThan(0);
    for (const row of inbox.rows) {
      expect(row.evidence.length, row.category).toBeGreaterThan(0);
      expect(row.confidence, row.category).toBeTruthy();
      expect(row.action.label, row.category).toBeTruthy();
      expect(row.action.route, row.category).toMatch(/^\//);
      expect(row.headline, row.category).toBeTruthy();
    }
  });

  it("never emits a bare score or an unexplained label", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          delayedRecalls: [
            { correct: true, occurredAt: ago(20) },
            { correct: true, occurredAt: ago(16) },
            { correct: false, occurredAt: ago(8) },
            { correct: false, occurredAt: ago(2) },
          ],
        }),
      ],
      { now: NOW },
    );
    for (const row of inbox.rows) {
      expect(row.headline).not.toMatch(/at.risk/i);
      expect(row.headline).not.toMatch(/^\d+(\.\d+)?%?$/);
      // Every piece of evidence states its denominator or its count.
      for (const e of row.evidence) expect(e.statement).toMatch(/\d/);
    }
  });
});

describe("the inbox order is fixed", () => {
  it("puts waiting verifications above everything else", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          learnerId: "quiet" as LearnerId,
          lastActiveAt: ago(30),
        }),
        snapshot({
          learnerId: "waiting" as LearnerId,
          pendingVerifications: [
            { requestId: "r1", label: "Al-Mulk 12-15", requestedAt: ago(0.1) },
          ],
        }),
      ],
      { now: NOW },
    );
    expect(inbox.rows[0]?.category).toBe("awaiting_verification");
  });

  it("emits categories in the documented order", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          pendingVerifications: [{ requestId: "r", label: "P", requestedAt: ago(1) }],
          corrections: [
            { category: "madd", addedAt: ago(8), resolvedAt: null },
            { category: "madd", addedAt: ago(2), resolvedAt: null },
          ],
          assignments: [
            { assignmentId: "a", label: "Q", assignedAt: ago(4), dueAt: ago(-2), started: false },
          ],
          overdueReviewCount: 40,
          dueReviewCount: 40,
          governanceRequests: [{ kind: "tutoring_grant", requestedAt: ago(1) }],
        }),
      ],
      { now: NOW },
    );
    const rank = new Map(ATTENTION_ORDER.map((c, i) => [c, i]));
    const ranks = categoriesOf(inbox.rows).map((c) => rank.get(c)!);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it("puts good news last, never above waiting work", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          learnerId: "improving" as LearnerId,
          delayedRecalls: [
            { correct: true, occurredAt: ago(9) },
            { correct: true, occurredAt: ago(6) },
            { correct: true, occurredAt: ago(2) },
          ],
        }),
        snapshot({
          learnerId: "waiting" as LearnerId,
          pendingVerifications: [{ requestId: "r", label: "P", requestedAt: ago(1) }],
        }),
      ],
      { now: NOW },
    );
    expect(inbox.rows.at(-1)?.category).toBe("recently_improved");
  });

  it("is deterministic — same input, same inbox", () => {
    const learners = [
      snapshot({ learnerId: "b" as LearnerId, lastActiveAt: ago(10) }),
      snapshot({ learnerId: "a" as LearnerId, lastActiveAt: ago(10) }),
    ];
    const one = buildAttentionInbox(learners, { now: NOW });
    const two = buildAttentionInbox([...learners].reverse(), { now: NOW });
    expect(categoriesOf(one.rows)).toEqual(categoriesOf(two.rows));
    expect(one.rows.map((r) => r.learnerId)).toEqual(two.rows.map((r) => r.learnerId));
  });
});

describe("confidence is earned, not asserted", () => {
  it("gives observed facts high confidence", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          pendingVerifications: [{ requestId: "r", label: "P", requestedAt: ago(1) }],
        }),
      ],
      { now: NOW },
    );
    expect(inbox.rows[0]?.confidence).toBe("high");
  });

  it("refuses to claim a recall trend below the minimum sample", () => {
    const tooFew = Array.from(
      { length: attentionParams.minRecallsForTrendClaim - 1 },
      (_, i) => ({ correct: i === 0, occurredAt: ago(10 - i) }),
    );
    const inbox = buildAttentionInbox([snapshot({ delayedRecalls: tooFew })], {
      now: NOW,
    });
    expect(categoriesOf(inbox.rows)).not.toContain("recall_decline");
  });

  it("raises confidence in a decline as the sample grows", () => {
    const small = buildAttentionInbox(
      [
        snapshot({
          delayedRecalls: [
            { correct: true, occurredAt: ago(12) },
            { correct: true, occurredAt: ago(10) },
            { correct: true, occurredAt: ago(6) },
            { correct: false, occurredAt: ago(2) },
          ],
        }),
      ],
      { now: NOW },
    );
    const large = buildAttentionInbox(
      [
        snapshot({
          delayedRecalls: [
            ...Array.from({ length: 4 }, (_, i) => ({
              correct: true,
              occurredAt: ago(30 - i * 2),
            })),
            ...Array.from({ length: 4 }, (_, i) => ({
              correct: false,
              occurredAt: ago(10 - i * 2),
            })),
          ],
        }),
      ],
      { now: NOW },
    );
    const smallRow = small.rows.find((r) => r.category === "recall_decline");
    const largeRow = large.rows.find((r) => r.category === "recall_decline");
    expect(smallRow?.confidence).toBe("low");
    expect(largeRow?.confidence).toBe("high");
  });

  it("says nothing about a trend when recall has not declined", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          delayedRecalls: [
            { correct: false, occurredAt: ago(12) },
            { correct: false, occurredAt: ago(9) },
            { correct: true, occurredAt: ago(5) },
            { correct: true, occurredAt: ago(2) },
          ],
        }),
      ],
      { now: NOW },
    );
    expect(categoriesOf(inbox.rows)).not.toContain("recall_decline");
  });

  it("shows the observation count behind every claim", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          delayedRecalls: [
            { correct: true, occurredAt: ago(12) },
            { correct: true, occurredAt: ago(10) },
            { correct: false, occurredAt: ago(6) },
            { correct: false, occurredAt: ago(2) },
          ],
        }),
      ],
      { now: NOW },
    );
    const row = inbox.rows.find((r) => r.category === "recall_decline")!;
    expect(row.evidence.some((e) => /4 delayed recalls in total/.test(e.statement))).toBe(
      true,
    );
  });
});

describe("corrections", () => {
  it("surfaces a recurring correction that is still unresolved", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          corrections: [
            { category: "join", addedAt: ago(9), resolvedAt: null },
            { category: "join", addedAt: ago(3), resolvedAt: null },
          ],
        }),
      ],
      { now: NOW },
    );
    const row = inbox.rows.find((r) => r.category === "repeated_corrections");
    expect(row?.headline).toContain("join");
    expect(row?.confidence).toBe("medium");
  });

  it("stays quiet once every instance is resolved", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          corrections: [
            { category: "join", addedAt: ago(9), resolvedAt: ago(8) },
            { category: "join", addedAt: ago(3), resolvedAt: ago(2) },
          ],
        }),
      ],
      { now: NOW },
    );
    expect(categoriesOf(inbox.rows)).not.toContain("repeated_corrections");
  });

  it("does not call a single correction a pattern", () => {
    const inbox = buildAttentionInbox(
      [snapshot({ corrections: [{ category: "madd", addedAt: ago(2), resolvedAt: null }] })],
      { now: NOW },
    );
    expect(categoriesOf(inbox.rows)).not.toContain("repeated_corrections");
  });
});

describe("honest reporting of quiet learners", () => {
  it("reports no recorded activity as exactly that", () => {
    const inbox = buildAttentionInbox([snapshot({ lastActiveAt: null })], { now: NOW });
    const row = inbox.rows.find((r) => r.category === "inactivity");
    expect(row?.headline).toMatch(/No practice has ever been recorded/);
    expect(row?.evidence[0]?.observations).toBe(0);
  });

  it("does not flag a learner who practised yesterday", () => {
    const inbox = buildAttentionInbox([snapshot({ lastActiveAt: ago(1) })], { now: NOW });
    expect(categoriesOf(inbox.rows)).not.toContain("inactivity");
  });
});

describe("capping is stated, never silent", () => {
  it("reports how many items are not shown", () => {
    const many = Array.from({ length: 10 }, (_, i) =>
      snapshot({
        learnerId: `l${i}` as LearnerId,
        pendingVerifications: [
          { requestId: `r${i}`, label: "P", requestedAt: ago(i + 1) },
        ],
      }),
    );
    const inbox = buildAttentionInbox(many, { now: NOW, maxRows: 3 });
    expect(inbox.rows).toHaveLength(3);
    expect(inbox.cappedNotice).toContain("7 further");
    expect(inbox.cappedNotice).toContain("Nothing has been dismissed");
  });

  it("counts every category even when rows are capped", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      snapshot({
        learnerId: `l${i}` as LearnerId,
        pendingVerifications: [{ requestId: `r${i}`, label: "P", requestedAt: ago(1) }],
      }),
    );
    const inbox = buildAttentionInbox(many, { now: NOW, maxRows: 2 });
    expect(inbox.counts.awaiting_verification).toBe(5);
  });

  it("says nothing about capping when everything fits", () => {
    const inbox = buildAttentionInbox([snapshot()], { now: NOW });
    expect(inbox.cappedNotice).toBeUndefined();
  });
});

describe("an empty inbox is a valid, quiet answer", () => {
  it("emits no rows for a learner with nothing needing attention", () => {
    const inbox = buildAttentionInbox([snapshot()], { now: NOW });
    expect(inbox.rows).toEqual([]);
    for (const c of ATTENTION_ORDER) expect(inbox.counts[c]).toBe(0);
  });
});

describe("a row carries an identifier, not a destination", () => {
  it("names the request id for a waiting verification", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          pendingVerifications: [
            { requestId: "req-42", label: "Al-Mulk 12-15", requestedAt: ago(1) },
          ],
        }),
      ],
      { now: NOW },
    );
    expect(inbox.rows[0]?.actionTargetId).toBe("req-42");
  });

  it("names the learner for every other category", () => {
    const inbox = buildAttentionInbox(
      [snapshot({ learnerId: "learner-7" as LearnerId, lastActiveAt: ago(30) })],
      { now: NOW },
    );
    for (const row of inbox.rows) expect(row.actionTargetId).toBe("learner-7");
  });

  it("gives every row an identifier the server can rebuild a route from", () => {
    const inbox = buildAttentionInbox(
      [
        snapshot({
          pendingVerifications: [{ requestId: "r", label: "P", requestedAt: ago(1) }],
          corrections: [
            { category: "join", addedAt: ago(8), resolvedAt: null },
            { category: "join", addedAt: ago(2), resolvedAt: null },
          ],
          assignments: [
            { assignmentId: "a", label: "Q", assignedAt: ago(4), dueAt: ago(-2), started: false },
          ],
          overdueReviewCount: 40,
          dueReviewCount: 40,
          governanceRequests: [{ kind: "tutoring_grant", requestedAt: ago(1) }],
        }),
      ],
      { now: NOW },
    );
    expect(inbox.rows.length).toBeGreaterThan(3);
    for (const row of inbox.rows) expect(row.actionTargetId.length).toBeGreaterThan(0);
  });
});
