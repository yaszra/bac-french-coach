/**
 * Rate limiting for the paths worth attacking: sign-in, guardian claims,
 * classroom joins and the write API.
 *
 * A token bucket keyed by (bucket, subject). The in-memory store is correct for
 * a single process and is the development default; production supplies a shared
 * store (Postgres advisory rows or Redis) through the same interface, so the
 * call sites never change.
 */
export type LimitDecision = {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
};

export type RateLimitPolicy = {
  readonly capacity: number;
  readonly refillPerMinute: number;
};

export const POLICIES = {
  "auth:signin": { capacity: 8, refillPerMinute: 2 },
  "auth:signup": { capacity: 4, refillPerMinute: 1 },
  "auth:passwordReset": { capacity: 4, refillPerMinute: 1 },
  "family:claim": { capacity: 6, refillPerMinute: 2 },
  "classroom:join": { capacity: 10, refillPerMinute: 4 },
  "api:write": { capacity: 120, refillPerMinute: 60 },
  "api:read": { capacity: 600, refillPerMinute: 300 },
} as const satisfies Record<string, RateLimitPolicy>;

export type BucketName = keyof typeof POLICIES;

type Bucket = { tokens: number; lastRefillMs: number };

export interface RateLimitStore {
  take(key: string, policy: RateLimitPolicy, nowMs: number): Promise<LimitDecision>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  async take(key: string, policy: RateLimitPolicy, nowMs: number): Promise<LimitDecision> {
    const bucket = this.buckets.get(key) ?? { tokens: policy.capacity, lastRefillMs: nowMs };
    const elapsedMinutes = (nowMs - bucket.lastRefillMs) / 60_000;
    bucket.tokens = Math.min(
      policy.capacity,
      bucket.tokens + elapsedMinutes * policy.refillPerMinute,
    );
    bucket.lastRefillMs = nowMs;

    if (bucket.tokens < 1) {
      const deficit = 1 - bucket.tokens;
      const retryAfterMs = Math.ceil((deficit / policy.refillPerMinute) * 60_000);
      this.buckets.set(key, bucket);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: 0 };
  }

  /** Test helper: forget everything. */
  reset(): void {
    this.buckets.clear();
  }
}

let store: RateLimitStore = new MemoryRateLimitStore();
export function setRateLimitStore(next: RateLimitStore): void {
  store = next;
}

export async function rateLimit(
  bucket: BucketName,
  subject: string,
  now: Date = new Date(),
): Promise<LimitDecision> {
  return store.take(`${bucket}:${subject}`, POLICIES[bucket], now.getTime());
}
