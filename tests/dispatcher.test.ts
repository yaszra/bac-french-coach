/**
 * Outbox dispatcher.
 *
 * The delivery guarantees from docs/10: at-least-once with idempotent
 * consumers, exponential backoff with jitter, dead-lettering with operator
 * visibility, and no path by which a failing consumer touches evidence.
 */
import { describe, expect, it, vi } from "vitest";
import {
  backoffMs,
  dispatchOnce,
  fanOut,
  type OutboxMessage,
  type OutboxQueue,
} from "../src/application/dispatcher.js";
import { buildEvent, type LearningEventEnvelope } from "../src/application/events.js";
import { useDeterministicIds } from "../src/application/ids.js";

const NOW = Date.UTC(2026, 4, 1, 10, 0, 0);

function event(key: string): LearningEventEnvelope {
  useDeterministicIds();
  return buildEvent(
    {
      eventType: "review_completed",
      occurredAt: NOW,
      organizationId: "org-a",
      idempotencyKey: key,
    },
    NOW,
  );
}

/** A queue that records what the dispatcher did to it. */
class FakeQueue implements OutboxQueue {
  delivered: number[] = [];
  failed: { id: number; error: string; nextAttemptAt: number }[] = [];
  dead: { id: number; error: string }[] = [];

  constructor(private messages: OutboxMessage[]) {}

  async claim(limit: number): Promise<readonly OutboxMessage[]> {
    return this.messages.slice(0, limit);
  }
  async markDelivered(id: number): Promise<void> {
    this.delivered.push(id);
    this.messages = this.messages.filter((m) => m.id !== id);
  }
  async markFailed(id: number, error: string, nextAttemptAt: number): Promise<void> {
    this.failed.push({ id, error, nextAttemptAt });
    const message = this.messages.find((m) => m.id === id);
    if (message) message.attempts += 1;
  }
  async deadLetter(id: number, error: string): Promise<void> {
    this.dead.push({ id, error });
    this.messages = this.messages.filter((m) => m.id !== id);
  }
}

const message = (id: number, attempts = 0): OutboxMessage => ({
  id,
  event: event(`k-${id}`),
  attempts,
});

describe("happy path", () => {
  it("delivers every message and marks it", async () => {
    const queue = new FakeQueue([message(1), message(2)]);
    const result = await dispatchOnce(queue, async () => undefined, { now: NOW });
    expect(result).toEqual({ delivered: 2, retried: 0, deadLettered: 0 });
    expect(queue.delivered).toEqual([1, 2]);
  });

  it("respects the batch size", async () => {
    const queue = new FakeQueue([message(1), message(2), message(3)]);
    const result = await dispatchOnce(queue, async () => undefined, {
      now: NOW,
      batchSize: 2,
    });
    expect(result.delivered).toBe(2);
  });
});

describe("a failing consumer retries with backoff, then dead-letters", () => {
  it("schedules a retry rather than dropping the message", async () => {
    const queue = new FakeQueue([message(1)]);
    const result = await dispatchOnce(
      queue,
      async () => {
        throw new Error("sink unavailable");
      },
      { now: NOW, random: () => 0.5 },
    );
    expect(result.retried).toBe(1);
    expect(queue.dead).toEqual([]);
    expect(queue.failed[0]?.nextAttemptAt).toBeGreaterThan(NOW);
  });

  it("dead-letters once attempts are exhausted, with the error kept", async () => {
    const queue = new FakeQueue([message(1, 4)]);
    const result = await dispatchOnce(
      queue,
      async () => {
        throw new Error("sink permanently broken");
      },
      { now: NOW, maxAttempts: 5 },
    );
    expect(result.deadLettered).toBe(1);
    expect(queue.dead[0]?.error).toContain("permanently broken");
  });

  it("does not let one bad message block the rest of the batch", async () => {
    const queue = new FakeQueue([message(1), message(2), message(3)]);
    const result = await dispatchOnce(
      queue,
      async (e) => {
        if (e.idempotencyKey === "k-2") throw new Error("bad message");
      },
      { now: NOW },
    );
    expect(result.delivered).toBe(2);
    expect(result.retried).toBe(1);
    expect(queue.delivered).toEqual([1, 3]);
  });
});

describe("backoff", () => {
  it("grows exponentially", () => {
    const zeroJitter = () => 0;
    expect(backoffMs(1, 1000, zeroJitter)).toBe(2000);
    expect(backoffMs(2, 1000, zeroJitter)).toBe(4000);
    expect(backoffMs(3, 1000, zeroJitter)).toBe(8000);
  });

  it("adds jitter, so a recovering service is not hit by a thundering herd", () => {
    const withJitter = backoffMs(3, 1000, () => 1);
    const without = backoffMs(3, 1000, () => 0);
    expect(withJitter).toBeGreaterThan(without);
    expect(withJitter).toBeLessThanOrEqual(without * 1.5);
  });

  it("spreads retries across the window for different callers", () => {
    const delays = new Set(
      Array.from({ length: 20 }, (_, i) => backoffMs(3, 1000, () => i / 20)),
    );
    expect(delays.size).toBeGreaterThan(10);
  });
});

describe("fan-out", () => {
  it("delivers to every consumer even when one fails", async () => {
    const analytics = vi.fn(async () => {
      throw new Error("analytics down");
    });
    const notifications = vi.fn(async () => undefined);
    const consumer = fanOut({ analytics, notifications });

    await expect(consumer(event("k"))).rejects.toThrow(/analytics down/);
    // The healthy consumer still ran: one broken sink must not silence a
    // teacher's notification.
    expect(notifications).toHaveBeenCalledOnce();
  });

  it("collects every failure rather than reporting only the first", async () => {
    const consumer = fanOut({
      a: async () => {
        throw new Error("a failed");
      },
      b: async () => {
        throw new Error("b failed");
      },
    });
    await expect(consumer(event("k"))).rejects.toThrow(/a failed.*b failed/);
  });

  it("succeeds silently when every consumer succeeds", async () => {
    const consumer = fanOut({ a: async () => undefined, b: async () => undefined });
    await expect(consumer(event("k"))).resolves.toBeUndefined();
  });
});

describe("at-least-once delivery assumes idempotent consumers", () => {
  it("re-delivers a message whose consumer failed after doing its work", async () => {
    // The classic at-least-once case: the side effect happened, the
    // acknowledgement did not. A consumer keyed on idempotencyKey absorbs
    // the repeat; this test documents that the dispatcher will produce one.
    const seen: string[] = [];
    const queue = new FakeQueue([message(1)]);
    await dispatchOnce(
      queue,
      async (e) => {
        seen.push(e.idempotencyKey);
        throw new Error("acknowledgement lost");
      },
      { now: NOW },
    );
    await dispatchOnce(
      queue,
      async (e) => {
        seen.push(e.idempotencyKey);
      },
      { now: NOW + 5000 },
    );
    expect(seen).toEqual(["k-1", "k-1"]);
    expect(new Set(seen).size).toBe(1);
  });
});
