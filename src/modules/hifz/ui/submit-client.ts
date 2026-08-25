"use client";

/**
 * Sending an attempt from the learner's device.
 *
 * The order matters and is not an implementation detail:
 *
 *   1. build an idempotency key
 *   2. WRITE TO THE QUEUE
 *   3. try the server
 *   4. clear the queue entry only when the server has actually taken it
 *
 * Queue-first means a connection that dies between steps 3 and 4 costs nothing:
 * the attempt replays, the server recognises the key, and it is recorded once.
 * Server-first would mean a learner's work exists only in a promise.
 *
 * The payload is observations. There is no field on it that could express a
 * grade, a score or a claim of mastery — the submission schema is strict, so a
 * client that tried would be rejected at the door rather than trusted.
 */

import { submitAttempt } from "../actions/submit-attempt";
import { attemptKey, type QueuedAttempt, type SubmitOutcome } from "@/modules/platform/offline/queue";
import type { AttemptEvidence } from "../domain/grading";
import type { ScaffoldLevel } from "@/modules/memory/domain/scaffold";
import { attemptQueue } from "./offline-store";

export type SubmitResult =
  | { readonly kind: "recorded"; readonly deduplicated: boolean }
  /** The ear-gate. Not a pass, and the interface must not dress it up as one. */
  | { readonly kind: "requires_human"; readonly reasonKey: string; readonly waiting: boolean }
  | { readonly kind: "queued"; readonly pending: number }
  | { readonly kind: "rejected"; readonly reason: string };

export interface AttemptInput {
  readonly learnerUserId: string;
  readonly unitId: string;
  readonly evidence: AttemptEvidence;
  readonly scaffold: ScaffoldLevel | null;
  /** A random component supplied once, at the moment the attempt happened. */
  readonly nonce: string;
  readonly occurredAt: Date;
}

function keyFor(input: AttemptInput): string {
  return attemptKey({
    learnerUserId: input.learnerUserId,
    unitId: input.unitId,
    retrievalType: input.evidence.exercise,
    occurredAtIso: input.occurredAt.toISOString(),
    nonce: input.nonce,
  });
}

function queuedFrom(input: AttemptInput, idempotencyKey: string): QueuedAttempt {
  return {
    idempotencyKey,
    learnerUserId: input.learnerUserId,
    unitId: input.unitId,
    retrievalType: input.evidence.exercise,
    evidence: input.evidence,
    occurredAt: input.occurredAt.toISOString(),
    attempts: 0,
  };
}

/** Send one queued attempt. Used both on the happy path and when draining. */
export async function sendQueued(
  attempt: QueuedAttempt,
  scaffold: ScaffoldLevel | null,
): Promise<SubmitOutcome> {
  try {
    const result = await submitAttempt({
      learnerUserId: attempt.learnerUserId,
      submission: { unitId: attempt.unitId, evidence: attempt.evidence, scaffold },
      idempotencyKey: attempt.idempotencyKey,
      source: "pwa_offline",
    });
    if (result.ok && result.outcome === "graded") {
      return result.deduplicated ? { kind: "duplicate" } : { kind: "accepted" };
    }
    if (result.ok) return { kind: "accepted" };
    if (result.error === "rate_limited") return { kind: "unavailable", reason: "rate_limited" };
    // A rejection will not become valid by being retried, so it is cleared and
    // surfaced rather than sitting in the queue forever.
    return { kind: "rejected", reason: result.detail ?? result.error };
  } catch (error) {
    return { kind: "unavailable", reason: error instanceof Error ? error.message : "offline" };
  }
}

/**
 * Record an attempt, whatever the network is doing.
 *
 * `queued` is a first-class success: the work is safe on the device. It is NOT
 * reported as recorded, because nothing is recorded until the server says so.
 */
export async function submitOrQueue(input: AttemptInput): Promise<SubmitResult> {
  const store = attemptQueue();
  const idempotencyKey = keyFor(input);
  const queued = queuedFrom(input, idempotencyKey);
  await store.enqueue(queued);

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { kind: "queued", pending: await store.count() };
  }

  try {
    const result = await submitAttempt({
      learnerUserId: input.learnerUserId,
      submission: { unitId: input.unitId, evidence: input.evidence, scaffold: input.scaffold },
      idempotencyKey,
      source: "web",
    });

    if (!result.ok) {
      if (result.error === "rate_limited") return { kind: "queued", pending: await store.count() };
      await store.remove(idempotencyKey);
      return { kind: "rejected", reason: result.detail ?? result.error };
    }

    await store.remove(idempotencyKey);
    if (result.outcome === "requires_human") {
      return { kind: "requires_human", reasonKey: result.reasonKey, waiting: result.waiting };
    }
    return { kind: "recorded", deduplicated: result.deduplicated };
  } catch {
    // The server was not reachable. The attempt is already on the device.
    return { kind: "queued", pending: await store.count() };
  }
}
