import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRIAGE_CONFIG,
  REASON_CEILING,
  REASON_FLOOR,
  TRIAGE_REASONS,
  noSignals,
  rankTriage,
  reasonsFor,
  scoreItem,
  type TriageConfig,
  type TriageSignals,
} from "./triage";

const NOW = new Date("2026-08-23T09:00:00.000Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000);
}
function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 86_400_000);
}

function signals(overrides: Partial<TriageSignals> & { learnerUserId: string }): TriageSignals {
  return { ...noSignals(overrides.learnerUserId), ...overrides };
}

const kinds = (learner: TriageSignals, config?: TriageConfig) =>
  reasonsFor(learner, NOW, config).map((r) => r.kind);

describe("triage · a learner with nothing recorded", () => {
  it("produces no reasons at all", () => {
    expect(reasonsFor(noSignals("u1"), NOW)).toEqual([]);
  });

  it("is not listed in the inbox", () => {
    const inbox = rankTriage([noSignals("u1"), noSignals("u2")], NOW);
    expect(inbox.items).toEqual([]);
    expect(inbox.moreCount).toBe(0);
  });

  it("still counts towards the denominator, so '0 of 2' is sayable", () => {
    expect(rankTriage([noSignals("u1"), noSignals("u2")], NOW).considered).toBe(2);
  });

  it("never claims an activity gap, because there is no activity to measure from", () => {
    // Twenty days of nothing — but nothing was ever recorded, so nothing is claimed.
    expect(kinds(signals({ learnerUserId: "u1", lastActivityAt: null }))).toEqual([]);
  });
});

describe("triage · a pending oral request", () => {
  it("is a reason the moment it exists", () => {
    expect(kinds(signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(0.25) }))).toEqual([
      "verification_waiting",
    ]);
  });

  it("ages towards full intensity", () => {
    const fresh = reasonsFor(signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(1) }), NOW);
    const old = reasonsFor(signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(40) }), NOW);
    expect(old[0]!.intensity).toBeGreaterThan(fresh[0]!.intensity);
  });

  it("caps at intensity 1 rather than growing without bound", () => {
    const ancient = reasonsFor(
      signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(5_000) }),
      NOW,
    );
    expect(ancient[0]!.intensity).toBe(1);
    expect(ancient[0]!.score).toBe(1);
    expect(REASON_CEILING.verification_waiting).toBe(1);
  });

  it("carries the wait in whole hours as a parameter, not as a sentence", () => {
    const [reason] = reasonsFor(
      signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(5.9) }),
      NOW,
    );
    expect(reason!.params).toEqual({ hoursWaiting: 5 });
    expect(reason!.messageKey).toBe("triage.reason.verification_waiting");
  });

  it("treats a clock skew into the future as zero waiting, never negative", () => {
    const [reason] = reasonsFor(
      signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(-3) }),
      NOW,
    );
    expect(reason!.intensity).toBe(0);
    expect(reason!.params.hoursWaiting).toBe(0);
  });

  it("outranks every other single reason, because the learner is blocked on a person", () => {
    const blocked = signals({ learnerUserId: "blocked", pendingVerificationSince: hoursAgo(0.1) });
    const buried = signals({
      learnerUserId: "buried",
      overdueReviews: 300,
      trackedUnits: 400,
      oldestDueAt: daysAgo(60),
    });
    const inbox = rankTriage([buried, blocked], NOW);
    expect(inbox.items.map((i) => i.learnerUserId)).toEqual(["blocked", "buried"]);
  });
});

describe("triage · lapses", () => {
  it("says nothing about a single lapse", () => {
    expect(kinds(signals({ learnerUserId: "u1", lapsesInWindow: 1 }))).toEqual([]);
  });

  it("names repeated lapses once the threshold is met", () => {
    expect(kinds(signals({ learnerUserId: "u1", lapsesInWindow: 2 }))).toEqual(["repeated_lapses"]);
  });

  it("reports the count as a parameter", () => {
    const [reason] = reasonsFor(signals({ learnerUserId: "u1", lapsesInWindow: 4 }), NOW);
    expect(reason!.params).toEqual({ lapses: 4 });
  });

  it("reaches full intensity at the severe threshold", () => {
    const [reason] = reasonsFor(
      signals({ learnerUserId: "u1", lapsesInWindow: DEFAULT_TRIAGE_CONFIG.severeLapses }),
      NOW,
    );
    expect(reason!.intensity).toBe(1);
  });
});

describe("triage · overdue reviews", () => {
  it("carries its denominator so the count is readable", () => {
    const [reason] = reasonsFor(
      signals({ learnerUserId: "u1", overdueReviews: 9, trackedUnits: 140, oldestDueAt: daysAgo(2) }),
      NOW,
    );
    expect(reason!.params).toEqual({ overdue: 9, tracked: 140, daysOverdue: 2 });
  });

  it("takes the stronger of backlog size and backlog age", () => {
    const small = reasonsFor(
      signals({ learnerUserId: "u1", overdueReviews: 1, trackedUnits: 10, oldestDueAt: daysAgo(30) }),
      NOW,
    );
    const many = reasonsFor(
      signals({ learnerUserId: "u1", overdueReviews: 40, trackedUnits: 400, oldestDueAt: daysAgo(0) }),
      NOW,
    );
    expect(small[0]!.intensity).toBe(1);
    expect(many[0]!.intensity).toBe(1);
  });

  it("reports zero days when nothing records when the backlog fell due", () => {
    const [reason] = reasonsFor(
      signals({ learnerUserId: "u1", overdueReviews: 3, trackedUnits: 3, oldestDueAt: null }),
      NOW,
    );
    expect(reason!.params.daysOverdue).toBe(0);
  });

  it("is silent when nothing is overdue", () => {
    expect(kinds(signals({ learnerUserId: "u1", overdueReviews: 0, trackedUnits: 500 }))).toEqual([]);
  });
});

describe("triage · activity gap", () => {
  it("stays quiet inside the tolerance", () => {
    expect(kinds(signals({ learnerUserId: "u1", lastActivityAt: daysAgo(2) }))).toEqual([]);
  });

  it("names the gap in neutral terms once it is long enough", () => {
    const [reason] = reasonsFor(signals({ learnerUserId: "u1", lastActivityAt: daysAgo(6) }), NOW);
    expect(reason!.kind).toBe("activity_gap");
    expect(reason!.params).toEqual({ days: 6 });
  });

  it("grows with the gap and saturates", () => {
    const some = reasonsFor(signals({ learnerUserId: "u1", lastActivityAt: daysAgo(6) }), NOW);
    const long = reasonsFor(signals({ learnerUserId: "u1", lastActivityAt: daysAgo(40) }), NOW);
    expect(long[0]!.intensity).toBeGreaterThan(some[0]!.intensity);
    expect(long[0]!.intensity).toBe(1);
  });
});

describe("triage · recommendations", () => {
  it("reports one that still stands", () => {
    const [reason] = reasonsFor(
      signals({
        learnerUserId: "u1",
        recommendation: { action: "review_due", createdAt: daysAgo(1), actedAt: null },
      }),
      NOW,
    );
    expect(reason!.kind).toBe("recommendation_unacted");
    expect(reason!.params).toEqual({ days: 1 });
  });

  it("reports one that was acted on recently, as the quietest kind of news", () => {
    const [reason] = reasonsFor(
      signals({
        learnerUserId: "u1",
        recommendation: { action: "review_due", createdAt: daysAgo(3), actedAt: daysAgo(0) },
      }),
      NOW,
    );
    expect(reason!.kind).toBe("recommendation_acted");
    // The quietest band there is: below every score an unacted one can reach.
    expect(reason!.score).toBeLessThanOrEqual(REASON_FLOOR.recommendation_unacted);
  });

  it("forgets an acted recommendation once it is no longer news", () => {
    expect(
      kinds(
        signals({
          learnerUserId: "u1",
          recommendation: { action: "review_due", createdAt: daysAgo(30), actedAt: daysAgo(20) },
        }),
      ),
    ).toEqual([]);
  });
});

describe("triage · combining reasons", () => {
  it("orders a learner's own reasons strongest first", () => {
    expect(
      kinds(
        signals({
          learnerUserId: "u1",
          overdueReviews: 30,
          trackedUnits: 100,
          oldestDueAt: daysAgo(10),
          pendingVerificationSince: hoursAgo(60),
          lapsesInWindow: 6,
        }),
      ),
    ).toEqual(["verification_waiting", "repeated_lapses", "reviews_overdue"]);
  });

  it("leads with the strongest reason", () => {
    const inbox = rankTriage(
      [signals({ learnerUserId: "u1", lapsesInWindow: 9, guardianClaimSince: hoursAgo(200) })],
      NOW,
    );
    expect(inbox.items[0]!.leadReason.kind).toBe("guardian_claim_waiting");
  });

  it("breaks a tie towards the learner carrying more situations, without changing the score", () => {
    const one = signals({ learnerUserId: "one", lapsesInWindow: 2 });
    const several = signals({
      learnerUserId: "several",
      lapsesInWindow: 2,
      overdueReviews: 2,
      trackedUnits: 40,
      oldestDueAt: daysAgo(1),
      lastActivityAt: daysAgo(5),
    });
    const inbox = rankTriage([one, several], NOW);
    expect(inbox.items.map((i) => i.learnerUserId)).toEqual(["several", "one"]);
    expect(inbox.items[0]!.score).toBe(inbox.items[1]!.score);
  });

  it("keeps a row's score identical to its strongest reason's", () => {
    const reasons = reasonsFor(
      signals({ learnerUserId: "u1", lapsesInWindow: 4, lastActivityAt: daysAgo(9) }),
      NOW,
    );
    expect(scoreItem(reasons)).toBe(reasons[0]!.score);
  });

  it("never lets co-occurrence overtake a genuinely blocked learner", () => {
    const many = signals({
      learnerUserId: "many",
      lapsesInWindow: 20,
      overdueReviews: 100,
      trackedUnits: 200,
      oldestDueAt: daysAgo(40),
      lastActivityAt: daysAgo(40),
      recommendation: { action: "review_due", createdAt: daysAgo(20), actedAt: null },
    });
    const waiting = signals({ learnerUserId: "waiting", pendingVerificationSince: hoursAgo(1) });
    expect(rankTriage([many, waiting], NOW).items[0]!.learnerUserId).toBe("waiting");
  });

  it("scores zero for an empty reason list rather than throwing", () => {
    expect(scoreItem([])).toBe(0);
  });
});

describe("triage · the inbox", () => {
  const roster = (count: number): TriageSignals[] =>
    Array.from({ length: count }, (_, index) =>
      signals({ learnerUserId: `u${String(index).padStart(2, "0")}`, lapsesInWindow: 2 + index }),
    );

  it("shows five rows by default", () => {
    expect(rankTriage(roster(12), NOW).items).toHaveLength(5);
  });

  it("counts the rest instead of hiding them", () => {
    const inbox = rankTriage(roster(12), NOW);
    expect(inbox.moreCount).toBe(7);
    expect(inbox.considered).toBe(12);
  });

  it("respects a configured limit", () => {
    const inbox = rankTriage(roster(12), NOW, { ...DEFAULT_TRIAGE_CONFIG, limit: 2 });
    expect(inbox.items).toHaveLength(2);
    expect(inbox.moreCount).toBe(10);
  });

  it("stamps the moment it was computed, rather than reading a clock", () => {
    expect(rankTriage([], NOW).at).toBe(NOW);
  });

  it("breaks exact ties by learner id, so the order never wobbles", () => {
    const a = signals({ learnerUserId: "b_learner", lapsesInWindow: 3 });
    const b = signals({ learnerUserId: "a_learner", lapsesInWindow: 3 });
    expect(rankTriage([a, b], NOW).items.map((i) => i.learnerUserId)).toEqual([
      "a_learner",
      "b_learner",
    ]);
  });

  it("is order-independent: shuffling the input does not change the ranking", () => {
    const input = [
      signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(10) }),
      signals({ learnerUserId: "u2", lapsesInWindow: 4 }),
      signals({ learnerUserId: "u3", overdueReviews: 5, trackedUnits: 20, oldestDueAt: daysAgo(3) }),
      signals({ learnerUserId: "u4", guardianClaimSince: hoursAgo(30) }),
    ];
    const forwards = rankTriage(input, NOW).items.map((i) => i.learnerUserId);
    const backwards = rankTriage([...input].reverse(), NOW).items.map((i) => i.learnerUserId);
    expect(backwards).toEqual(forwards);
  });

  it("ranks the six situations in the order a teacher would", () => {
    const inbox = rankTriage(
      [
        signals({ learnerUserId: "gap", lastActivityAt: daysAgo(5) }),
        signals({ learnerUserId: "claim", guardianClaimSince: hoursAgo(1) }),
        signals({ learnerUserId: "overdue", overdueReviews: 2, trackedUnits: 30, oldestDueAt: daysAgo(1) }),
        signals({ learnerUserId: "waiting", pendingVerificationSince: hoursAgo(1) }),
        signals({ learnerUserId: "lapses", lapsesInWindow: 2 }),
        signals({
          learnerUserId: "nudge",
          recommendation: { action: "review_due", createdAt: hoursAgo(1), actedAt: null },
        }),
      ],
      NOW,
      { ...DEFAULT_TRIAGE_CONFIG, limit: 10 },
    );
    expect(inbox.items.map((i) => i.learnerUserId)).toEqual([
      "waiting",
      "claim",
      "lapses",
      "overdue",
      "gap",
      "nudge",
    ]);
  });
});

describe("triage · the contract the console relies on", () => {
  it("gives every reason kind a message key and never a sentence", () => {
    for (const kind of TRIAGE_REASONS) {
      expect(`triage.reason.${kind}`).toMatch(/^triage\.reason\.[a-z_]+$/);
    }
  });

  it("carries only numbers as parameters — never a name, never text", () => {
    const reasons = reasonsFor(
      signals({
        learnerUserId: "u1",
        pendingVerificationSince: hoursAgo(3),
        guardianClaimSince: hoursAgo(3),
        lapsesInWindow: 3,
        overdueReviews: 3,
        trackedUnits: 30,
        oldestDueAt: daysAgo(1),
        lastActivityAt: daysAgo(9),
        recommendation: { action: "review_due", createdAt: daysAgo(2), actedAt: null },
      }),
      NOW,
    );
    expect(reasons).toHaveLength(6);
    for (const reason of reasons) {
      for (const value of Object.values(reason.params)) {
        expect(typeof value).toBe("number");
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("gives each kind its own non-overlapping band, so no backlog outweighs a person waiting", () => {
    for (let index = 1; index < TRIAGE_REASONS.length; index++) {
      const stronger = TRIAGE_REASONS[index - 1]!;
      const weaker = TRIAGE_REASONS[index]!;
      expect(REASON_CEILING[weaker]).toBeLessThanOrEqual(REASON_FLOOR[stronger] + 1e-9);
    }
  });

  it("keeps every score inside 0..1", () => {
    const reasons = reasonsFor(
      signals({
        learnerUserId: "u1",
        pendingVerificationSince: hoursAgo(9_000),
        lapsesInWindow: 99,
        overdueReviews: 999,
        trackedUnits: 999,
        oldestDueAt: daysAgo(900),
        lastActivityAt: daysAgo(900),
      }),
      NOW,
    );
    for (const reason of reasons) {
      expect(reason.score).toBeGreaterThan(0);
      expect(reason.score).toBeLessThanOrEqual(1);
      expect(reason.intensity).toBeLessThanOrEqual(1);
    }
    expect(scoreItem(reasons)).toBe(1);
  });

  it("is pure: the same signals at the same moment rank identically", () => {
    const input = [
      signals({ learnerUserId: "u1", pendingVerificationSince: hoursAgo(10) }),
      signals({ learnerUserId: "u2", lapsesInWindow: 4 }),
    ];
    expect(rankTriage(input, NOW)).toEqual(rankTriage(input, NOW));
  });

  it("does not mutate the signals it was given", () => {
    const input = signals({ learnerUserId: "u1", lapsesInWindow: 3 });
    const snapshot = JSON.stringify(input);
    rankTriage([input], NOW);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
