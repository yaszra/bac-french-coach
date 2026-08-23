import { describe, expect, it } from "vitest";
import { MemoryObjectStore } from "./memory-store";
import { assertAllowedMime, contentKey } from "./port";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("object storage", () => {
  it("addresses objects by content, so an identical upload is one object", async () => {
    const store = new MemoryObjectStore();
    const a = await store.put({ kind: "recitation", bytes: bytes("take"), contentType: "audio/mpeg" });
    const b = await store.put({ kind: "recitation", bytes: bytes("take"), contentType: "audio/mpeg" });
    expect(a.key).toBe(b.key);
    expect(a.sha256).toBe(b.sha256);
  });

  it("refuses a content type outside the allow-list", () => {
    expect(() => assertAllowedMime("learner_recording", "application/x-msdownload")).toThrow();
    expect(() => assertAllowedMime("learner_recording", "audio/webm")).not.toThrow();
  });

  it("shards keys so no prefix grows unbounded", () => {
    const key = contentKey("talqin", bytes("x"), "mp3");
    expect(key).toMatch(/^talqin\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\.mp3$/);
  });

  it("purges a child's recording once its retention has passed", async () => {
    const store = new MemoryObjectStore();
    const purgeAfter = new Date("2026-01-01T00:00:00Z");
    const stored = await store.put({
      kind: "learner_recording",
      bytes: bytes("child voice"),
      contentType: "audio/webm",
      purgeAfter,
    });
    expect(await store.get(stored.key)).not.toBeNull();
    expect(store.purgeExpired(new Date("2025-12-31T00:00:00Z"))).toBe(0);
    expect(store.purgeExpired(new Date("2026-01-02T00:00:00Z"))).toBe(1);
    expect(await store.get(stored.key)).toBeNull();
  });
});
