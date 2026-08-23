"use client";

/**
 * The learner's offline queue, on the device.
 *
 * A learner in a school hall with no signal still practises. Every attempt is
 * written to IndexedDB with an idempotency key BEFORE anything is sent, so the
 * evidence survives a dropped connection, a closed tab and a flat battery — and
 * so a replay is recognised by the server rather than counted twice.
 *
 * What is queued is observations. There is no grade in here, and there is no
 * "pending pass": until the server has re-graded the attempt, the honest state is
 * "waiting to sync", and that is exactly what the interface says.
 */

import {
  drainQueue,
  syncState,
  type AttemptQueueStore,
  type QueuedAttempt,
  type SubmitOutcome,
  type SyncState,
} from "@/modules/platform/offline/queue";

const DB_NAME = "itqan-attempts";
const DB_VERSION = 1;
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "idempotencyKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb unavailable"));
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("indexeddb request failed"));
        tx.oncomplete = () => db.close();
      }),
  );
}

/**
 * IndexedDB-backed queue.
 *
 * Every method degrades to "the queue is empty" rather than throwing when the
 * browser has no IndexedDB (private mode, an old device, a locked-down school
 * machine). A learner on such a device loses offline buffering, not the ability
 * to practise — and the interface never claims otherwise.
 */
export class IndexedDbAttemptQueue implements AttemptQueueStore {
  private async safe<T>(work: () => Promise<T>, fallback: T): Promise<T> {
    if (typeof indexedDB === "undefined") return fallback;
    try {
      return await work();
    } catch {
      return fallback;
    }
  }

  async enqueue(attempt: QueuedAttempt): Promise<void> {
    await this.safe(async () => {
      const existing = await run<QueuedAttempt | undefined>("readonly", (store) =>
        store.get(attempt.idempotencyKey),
      );
      // Enqueueing the same key twice is a no-op: idempotent before the network
      // is even involved.
      if (existing !== undefined) return;
      await run("readwrite", (store) => store.put(attempt) as IDBRequest<IDBValidKey>);
    }, undefined);
  }

  async peekBatch(limit: number): Promise<readonly QueuedAttempt[]> {
    const all = await this.all();
    return [...all].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(0, limit);
  }

  async remove(idempotencyKey: string): Promise<void> {
    await this.safe(
      () => run("readwrite", (store) => store.delete(idempotencyKey) as IDBRequest<undefined>),
      undefined,
    );
  }

  async markFailed(idempotencyKey: string, error: string): Promise<void> {
    await this.safe(async () => {
      const item = await run<QueuedAttempt | undefined>("readonly", (store) => store.get(idempotencyKey));
      if (item === undefined) return;
      await run("readwrite", (store) =>
        store.put({ ...item, attempts: item.attempts + 1, lastError: error }) as IDBRequest<IDBValidKey>,
      );
    }, undefined);
  }

  async count(): Promise<number> {
    return this.safe(() => run<number>("readonly", (store) => store.count()), 0);
  }

  async all(): Promise<readonly QueuedAttempt[]> {
    return this.safe(() => run<QueuedAttempt[]>("readonly", (store) => store.getAll()), []);
  }
}

let queue: AttemptQueueStore | null = null;

export function attemptQueue(): AttemptQueueStore {
  queue ??= new IndexedDbAttemptQueue();
  return queue;
}

/* ------------------------------------------------------------------ draining */

export type SubmitFn = (attempt: QueuedAttempt) => Promise<SubmitOutcome>;

/**
 * Push whatever is queued at the server.
 *
 * The result is reported as a `SyncState`, which has no "done" that means
 * "passed" — only how many attempts are still waiting and whether the last push
 * failed. What the attempts were worth is the server's answer, and it arrives
 * with the next page load, not from here.
 */
export async function syncNow(submit: SubmitFn): Promise<SyncState> {
  const store = attemptQueue();
  const result = await drainQueue(store, submit);
  const lastError = result.errors[0];
  return syncState(result.remaining, lastError);
}

export async function pendingCount(): Promise<number> {
  return attemptQueue().count();
}
