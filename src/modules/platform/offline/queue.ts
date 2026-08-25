/**
 * The offline attempt queue.
 *
 * A learner in a school hall with no signal still practises. Attempts are
 * queued locally with an idempotency key, and replayed when the connection
 * returns. The server re-grades every one of them: the client never decides
 * what an attempt was worth, so a queued attempt is evidence, not a verdict.
 *
 * "Pending sync" is shown honestly. Nothing is presented as recorded until the
 * server has said so.
 */
export type QueuedAttempt = {
  readonly idempotencyKey: string;
  readonly learnerUserId: string;
  readonly unitId: string;
  readonly retrievalType: string;
  /** Observations only. There is no grade here, by design. */
  readonly evidence: unknown;
  readonly occurredAt: string;
  readonly assignmentId?: string;
  readonly attempts: number;
  readonly lastError?: string;
};

export type SyncState =
  | { readonly kind: "idle"; readonly pending: 0 }
  | { readonly kind: "pending"; readonly pending: number }
  | { readonly kind: "syncing"; readonly pending: number }
  | { readonly kind: "failing"; readonly pending: number; readonly lastError: string };

export interface AttemptQueueStore {
  enqueue(attempt: QueuedAttempt): Promise<void>;
  peekBatch(limit: number): Promise<readonly QueuedAttempt[]>;
  remove(idempotencyKey: string): Promise<void>;
  markFailed(idempotencyKey: string, error: string): Promise<void>;
  count(): Promise<number>;
  all(): Promise<readonly QueuedAttempt[]>;
}

/**
 * IndexedDB in the browser; this in-memory implementation backs tests and the
 * server-side type checks. Same contract either way.
 */
export class MemoryAttemptQueue implements AttemptQueueStore {
  private readonly items = new Map<string, QueuedAttempt>();

  async enqueue(attempt: QueuedAttempt): Promise<void> {
    // Enqueueing the same key twice is a no-op: the queue is idempotent before
    // the network is even involved.
    if (!this.items.has(attempt.idempotencyKey)) this.items.set(attempt.idempotencyKey, attempt);
  }
  async peekBatch(limit: number): Promise<readonly QueuedAttempt[]> {
    return [...this.items.values()]
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .slice(0, limit);
  }
  async remove(idempotencyKey: string): Promise<void> {
    this.items.delete(idempotencyKey);
  }
  async markFailed(idempotencyKey: string, error: string): Promise<void> {
    const item = this.items.get(idempotencyKey);
    if (item) this.items.set(idempotencyKey, { ...item, attempts: item.attempts + 1, lastError: error });
  }
  async count(): Promise<number> {
    return this.items.size;
  }
  async all(): Promise<readonly QueuedAttempt[]> {
    return [...this.items.values()];
  }
}

export type SubmitOutcome =
  | { readonly kind: "accepted" }
  | { readonly kind: "duplicate" }
  | { readonly kind: "rejected"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Replay the queue. Accepted and duplicate both clear the item — a duplicate
 * means the server already has it, which is exactly what the idempotency key is
 * for. A rejection clears it too (retrying will not make it valid) but is
 * surfaced. Only an unavailable server leaves the item queued.
 */
export async function drainQueue(
  store: AttemptQueueStore,
  submit: (attempt: QueuedAttempt) => Promise<SubmitOutcome>,
  options: { readonly batchSize?: number; readonly maxAttempts?: number } = {},
): Promise<{ sent: number; deduplicated: number; rejected: number; remaining: number; errors: string[] }> {
  const batchSize = options.batchSize ?? 20;
  const maxAttempts = options.maxAttempts ?? 8;
  let sent = 0;
  let deduplicated = 0;
  let rejected = 0;
  const errors: string[] = [];

  const batch = await store.peekBatch(batchSize);
  for (const attempt of batch) {
    if (attempt.attempts >= maxAttempts) {
      // Give up on the network, not on the truth: the attempt stays visible as
      // failed rather than being silently dropped.
      errors.push(`${attempt.idempotencyKey}: gave up after ${attempt.attempts} attempts`);
      continue;
    }
    const outcome = await submit(attempt);
    switch (outcome.kind) {
      case "accepted":
        await store.remove(attempt.idempotencyKey);
        sent++;
        break;
      case "duplicate":
        await store.remove(attempt.idempotencyKey);
        deduplicated++;
        break;
      case "rejected":
        await store.remove(attempt.idempotencyKey);
        rejected++;
        errors.push(`${attempt.idempotencyKey}: ${outcome.reason}`);
        break;
      case "unavailable":
        await store.markFailed(attempt.idempotencyKey, outcome.reason);
        errors.push(`${attempt.idempotencyKey}: ${outcome.reason}`);
        break;
    }
  }

  return { sent, deduplicated, rejected, remaining: await store.count(), errors };
}

export function syncState(pending: number, lastError?: string): SyncState {
  if (pending === 0) return { kind: "idle", pending: 0 };
  if (lastError) return { kind: "failing", pending, lastError };
  return { kind: "pending", pending };
}

/**
 * An idempotency key must be stable for a given attempt and unique across
 * learners and units, so a replay is recognised and two different attempts
 * never collide. The client supplies the random component once, at the moment
 * the attempt happens, and it survives in the queue.
 */
export function attemptKey(input: {
  learnerUserId: string;
  unitId: string;
  retrievalType: string;
  occurredAtIso: string;
  nonce: string;
}): string {
  return [input.learnerUserId, input.unitId, input.retrievalType, input.occurredAtIso, input.nonce].join("|");
}
