import { describe, expect, it } from "vitest";
import {
  MemoryAttemptQueue,
  attemptKey,
  drainQueue,
  syncState,
  type QueuedAttempt,
  type SubmitOutcome,
} from "./queue";
import { PRECACHE_BUDGET_BYTES, planFits, trimToBudget, type PrecachePlan } from "./precache";

function attempt(over: Partial<QueuedAttempt> = {}): QueuedAttempt {
  return {
    idempotencyKey: attemptKey({
      learnerUserId: "u1",
      unitId: "t:78:1>78:2",
      retrievalType: "rebuild",
      occurredAtIso: "2026-08-23T19:00:00.000Z",
      nonce: "n1",
    }),
    learnerUserId: "u1",
    unitId: "t:78:1>78:2",
    retrievalType: "rebuild",
    evidence: { placements: [] },
    occurredAt: "2026-08-23T19:00:00.000Z",
    attempts: 0,
    ...over,
  };
}

describe("offline attempt queue", () => {
  it("carries evidence and no grade", () => {
    const queued = attempt();
    expect(Object.keys(queued)).not.toContain("grade");
    expect(Object.keys(queued)).not.toContain("score");
  });

  it("is idempotent before the network is involved", async () => {
    const store = new MemoryAttemptQueue();
    await store.enqueue(attempt());
    await store.enqueue(attempt());
    expect(await store.count()).toBe(1);
  });

  it("clears an attempt the server already had", async () => {
    const store = new MemoryAttemptQueue();
    await store.enqueue(attempt());
    const result = await drainQueue(store, async () => ({ kind: "duplicate" }) as SubmitOutcome);
    expect(result.deduplicated).toBe(1);
    expect(result.remaining).toBe(0);
  });

  it("keeps an attempt queued when the server is unreachable, and says why", async () => {
    const store = new MemoryAttemptQueue();
    await store.enqueue(attempt());
    const result = await drainQueue(store, async () => ({ kind: "unavailable", reason: "offline" }));
    expect(result.remaining).toBe(1);
    expect(result.errors[0]).toContain("offline");

    const [queued] = await store.all();
    expect(queued?.attempts).toBe(1);
  });

  it("stops retrying eventually but never hides the failure", async () => {
    const store = new MemoryAttemptQueue();
    await store.enqueue(attempt({ attempts: 8 }));
    const result = await drainQueue(store, async () => ({ kind: "accepted" }));
    expect(result.sent).toBe(0);
    expect(result.remaining).toBe(1);
    expect(result.errors[0]).toMatch(/gave up/);
  });

  it("drops an attempt the server rejected, and surfaces the reason", async () => {
    const store = new MemoryAttemptQueue();
    await store.enqueue(attempt());
    const result = await drainQueue(store, async () => ({ kind: "rejected", reason: "unit not assigned" }));
    expect(result.rejected).toBe(1);
    expect(result.remaining).toBe(0);
    expect(result.errors[0]).toContain("unit not assigned");
  });

  it("sends oldest first", async () => {
    const store = new MemoryAttemptQueue();
    await store.enqueue(attempt({ idempotencyKey: "b", occurredAt: "2026-08-23T20:00:00.000Z" }));
    await store.enqueue(attempt({ idempotencyKey: "a", occurredAt: "2026-08-23T18:00:00.000Z" }));
    const order: string[] = [];
    await drainQueue(store, async (q) => {
      order.push(q.idempotencyKey);
      return { kind: "accepted" };
    });
    expect(order).toEqual(["a", "b"]);
  });

  it("reports sync state honestly", () => {
    expect(syncState(0)).toEqual({ kind: "idle", pending: 0 });
    expect(syncState(3)).toEqual({ kind: "pending", pending: 3 });
    expect(syncState(3, "offline")).toEqual({ kind: "failing", pending: 3, lastError: "offline" });
  });

  it("gives different attempts different keys and the same attempt one key", () => {
    const base = {
      learnerUserId: "u1",
      unitId: "t:78:1>78:2",
      retrievalType: "rebuild",
      occurredAtIso: "2026-08-23T19:00:00.000Z",
      nonce: "n1",
    };
    expect(attemptKey(base)).toBe(attemptKey({ ...base }));
    expect(attemptKey(base)).not.toBe(attemptKey({ ...base, nonce: "n2" }));
    expect(attemptKey(base)).not.toBe(attemptKey({ ...base, learnerUserId: "u2" }));
  });
});

describe("pre-cache budget", () => {
  const plan = (bytes: number): PrecachePlan => ({
    learnerUserId: "u1",
    generatedAt: "2026-08-23T18:00:00.000Z",
    pages: [1, 2, 3, 4],
    units: ["t:78:1>78:2"],
    audioKeys: ["a1", "a2", "a3"],
    lessonIds: [],
    estimatedBytes: bytes,
  });

  it("knows when a plan does not fit", () => {
    expect(planFits(plan(1000)).fits).toBe(true);
    expect(planFits(plan(PRECACHE_BUDGET_BYTES + 1)).overBy).toBe(1);
  });

  it("drops audio before pages, and never drops the due units", () => {
    const oversized = plan(PRECACHE_BUDGET_BYTES + 3_000_000);
    const trimmed = trimToBudget(oversized, 1_000_000, 200_000);
    expect(trimmed.audioKeys.length).toBeLessThan(oversized.audioKeys.length);
    expect(trimmed.units).toEqual(oversized.units);
    expect(trimmed.estimatedBytes).toBeLessThanOrEqual(PRECACHE_BUDGET_BYTES);
  });

  it("keeps at least one page even under a hard budget", () => {
    const trimmed = trimToBudget(plan(PRECACHE_BUDGET_BYTES * 4), 1_000_000, 1_000_000);
    expect(trimmed.pages.length).toBeGreaterThanOrEqual(1);
  });
});
