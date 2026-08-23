import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore, POLICIES } from "./limiter";

describe("token bucket", () => {
  it("allows up to capacity then refuses with a retry hint", async () => {
    const store = new MemoryRateLimitStore();
    const policy = POLICIES["auth:signin"];
    const t0 = 1_000_000;

    for (let i = 0; i < policy.capacity; i++) {
      const d = await store.take("k", policy, t0);
      expect(d.allowed).toBe(true);
    }
    const refused = await store.take("k", policy, t0);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills over time", async () => {
    const store = new MemoryRateLimitStore();
    const policy = POLICIES["auth:signin"];
    const t0 = 0;
    for (let i = 0; i < policy.capacity; i++) await store.take("k", policy, t0);
    expect((await store.take("k", policy, t0)).allowed).toBe(false);

    const oneMinuteLater = t0 + 60_000;
    expect((await store.take("k", policy, oneMinuteLater)).allowed).toBe(true);
  });

  it("keeps subjects independent", async () => {
    const store = new MemoryRateLimitStore();
    const policy = POLICIES["family:claim"];
    for (let i = 0; i < policy.capacity; i++) await store.take("a", policy, 0);
    expect((await store.take("a", policy, 0)).allowed).toBe(false);
    expect((await store.take("b", policy, 0)).allowed).toBe(true);
  });
});
