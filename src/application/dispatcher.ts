/**
 * Outbox dispatcher.
 *
 * Drains committed events to their consumers. Runs off the request path,
 * because a learner waiting on a notification service is a learner waiting
 * for nothing they asked for.
 *
 * Delivery is at-least-once with idempotent consumers. A consumer that
 * keeps failing dead-letters with operator visibility; it never blocks the
 * queue behind it, and it can never roll back the evidence that produced
 * the event.
 */
import type { LearningEventEnvelope } from "./events.js";

export interface OutboxMessage {
  id: number;
  event: LearningEventEnvelope;
  attempts: number;
}

export interface OutboxQueue {
  /** Oldest undelivered messages, up to `limit`. */
  claim(limit: number): Promise<readonly OutboxMessage[]>;
  markDelivered(id: number, at: number): Promise<void>;
  markFailed(id: number, error: string, nextAttemptAt: number): Promise<void>;
  deadLetter(id: number, error: string, at: number): Promise<void>;
}

export type Consumer = (event: LearningEventEnvelope) => Promise<void>;

export interface DispatchOptions {
  now: number;
  batchSize?: number;
  maxAttempts?: number;
  /** Base backoff in ms; doubled per attempt, with jitter. */
  backoffBaseMs?: number;
  /**
   * Deterministic jitter source. Injected so a retry schedule can be
   * tested; production passes Math.random.
   */
  random?: () => number;
}

export interface DispatchResult {
  delivered: number;
  retried: number;
  deadLettered: number;
}

/**
 * Exponential backoff with jitter.
 *
 * Jitter matters: without it, a downstream outage produces a thundering
 * herd of retries at exactly the same moment it recovers.
 */
export function backoffMs(
  attempt: number,
  baseMs: number,
  random: () => number,
): number {
  const exponential = baseMs * 2 ** attempt;
  const jitter = exponential * 0.5 * random();
  return Math.round(exponential + jitter);
}

export async function dispatchOnce(
  queue: OutboxQueue,
  consumer: Consumer,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const batchSize = options.batchSize ?? 50;
  const maxAttempts = options.maxAttempts ?? 5;
  const backoffBase = options.backoffBaseMs ?? 1000;
  const random = options.random ?? Math.random;

  const messages = await queue.claim(batchSize);
  const result: DispatchResult = { delivered: 0, retried: 0, deadLettered: 0 };

  for (const message of messages) {
    try {
      await consumer(message.event);
      await queue.markDelivered(message.id, options.now);
      result.delivered += 1;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const attempts = message.attempts + 1;
      if (attempts >= maxAttempts) {
        // Dead-lettered, not dropped: an operator can see it and replay it
        // once the downstream fault is fixed.
        await queue.deadLetter(message.id, error, options.now);
        result.deadLettered += 1;
      } else {
        await queue.markFailed(
          message.id,
          error,
          options.now + backoffMs(attempts, backoffBase, random),
        );
        result.retried += 1;
      }
    }
  }
  return result;
}

/**
 * Fan out one event to several consumers.
 *
 * Each consumer's failure is its own: a broken analytics sink must not
 * stop a teacher's notification. Errors are collected and rethrown
 * together so the dispatcher still applies backoff to the message.
 */
export function fanOut(consumers: Readonly<Record<string, Consumer>>): Consumer {
  return async (event) => {
    const failures: string[] = [];
    for (const [name, consumer] of Object.entries(consumers)) {
      try {
        await consumer(event);
      } catch (err) {
        failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (failures.length > 0) throw new Error(failures.join("; "));
  };
}
