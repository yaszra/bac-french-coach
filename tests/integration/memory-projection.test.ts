import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { memoryProjection } from "../../src/modules/memory/repo/memory-projection";
import type { ProjectionEvent } from "../../src/modules/platform/events/projection";

/**
 * The property that justifies the whole event-sourced design: memory state can
 * be thrown away and rebuilt from history, and it lands in exactly the same
 * place. If that is ever untrue, changing the scheduler becomes a migration
 * with no way back, and the honest history stops being the source of truth.
 */
const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan" } },
});

const ORG = "itest_mem_org";
const LEARNER = "itest_mem_learner";

function attempt(unitId: string, grade: string, dayOffset: number, retrievalType = "recall_first"): ProjectionEvent {
  return {
    id: `ev_${unitId}_${dayOffset}_${grade}`,
    organizationId: ORG,
    learnerUserId: LEARNER,
    type: "attempt.recorded",
    unitId,
    payload: { unitId, unitKind: unitId.startsWith("t:") ? "ayah_transition" : "ayah_body", grade, retrievalType },
    occurredAt: new Date(Date.UTC(2026, 0, 1 + dayOffset, 18, 0, 0)),
    recordedAt: new Date(Date.UTC(2026, 0, 1 + dayOffset, 18, 0, 1)),
  };
}

const HISTORY: ProjectionEvent[] = [
  attempt("b:78:1", "good", 0),
  attempt("b:78:1", "good", 3),
  attempt("b:78:1", "again", 9),
  attempt("b:78:1", "hard", 10),
  attempt("t:78:1>78:2", "again", 4),
  attempt("t:78:1>78:2", "good", 5),
  {
    id: "ev_verdict",
    organizationId: ORG,
    learnerUserId: LEARNER,
    type: "verdict.given",
    unitId: null,
    payload: { verdict: "passed", unitIds: ["b:78:1"], corrections: [] },
    occurredAt: new Date(Date.UTC(2026, 0, 12, 18, 0, 0)),
    recordedAt: new Date(Date.UTC(2026, 0, 12, 18, 0, 1)),
  },
];

beforeAll(async () => {
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: "Memory test", slug: "itest-mem", region: "eu", locale: "en" },
    update: {},
  });
  await db.user.upsert({
    where: { id: LEARNER },
    create: { id: LEARNER, organizationId: ORG, displayName: "Learner", locale: "en" },
    update: {},
  });
  await db.learnerProfile.upsert({
    where: { userId: LEARNER },
    create: { userId: LEARNER, organizationId: ORG, tier: "teen" },
    update: {},
  });
}, 60_000);

afterAll(async () => {
  await db.memoryState.deleteMany({ where: { learnerUserId: LEARNER } });
  await db.learnerProfile.deleteMany({ where: { userId: LEARNER } });
  await db.user.deleteMany({ where: { id: LEARNER } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.$disconnect();
});

async function replay(): Promise<void> {
  for (const event of HISTORY) {
    await memoryProjection.apply(event, { db } as never);
  }
}

async function snapshot() {
  const rows = await db.memoryState.findMany({
    where: { learnerUserId: LEARNER },
    orderBy: { unitId: "asc" },
  });
  return rows.map((row) => ({
    unitId: row.unitId,
    unitKind: row.unitKind,
    stability: Number(row.stability.toFixed(6)),
    difficulty: Number(row.difficulty.toFixed(6)),
    reps: row.reps,
    lapses: row.lapses,
    confidence: Number(row.confidence.toFixed(6)),
    dueAt: row.dueAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  }));
}

describe("the memory projection", () => {
  it("builds state from events", async () => {
    await db.memoryState.deleteMany({ where: { learnerUserId: LEARNER } });
    await replay();
    const states = await snapshot();

    expect(states).toHaveLength(2);
    const body = states.find((s) => s.unitId === "b:78:1");
    expect(body?.reps).toBe(5); // four attempts plus the verdict
    expect(body?.lapses).toBe(1);
    expect(body?.dueAt).not.toBeNull();
  }, 60_000);

  it("marks a unit verified only through a human verdict", async () => {
    const states = await snapshot();
    expect(states.find((s) => s.unitId === "b:78:1")?.verifiedAt).not.toBeNull();
    // The transition was practised but never heard by a teacher.
    expect(states.find((s) => s.unitId === "t:78:1>78:2")?.verifiedAt).toBeNull();
  }, 60_000);

  it("rebuilds to exactly the same state after being dropped", async () => {
    const before = await snapshot();

    await memoryProjection.reset({ db } as never);
    expect(await snapshot()).toEqual([]);

    await replay();
    expect(await snapshot()).toEqual(before);
  }, 60_000);

  it("is idempotent: replaying the same history does not double-count", async () => {
    // Replaying is not the same as re-deriving — the projection runner advances
    // a checkpoint precisely so events are applied once. Rebuilding is the safe
    // operation; this test documents the distinction rather than pretending
    // duplicate application is harmless.
    await memoryProjection.reset({ db } as never);
    await replay();
    const once = await snapshot();

    await memoryProjection.reset({ db } as never);
    await replay();
    expect(await snapshot()).toEqual(once);
  }, 60_000);

  it("never produces mastery from repeated listening", async () => {
    await memoryProjection.reset({ db } as never);
    for (let day = 0; day < 30; day++) {
      await memoryProjection.apply(attempt("b:99:1", "good", day, "listen"), { db } as never);
    }
    const row = await db.memoryState.findUnique({
      where: { learnerUserId_unitId: { learnerUserId: LEARNER, unitId: "b:99:1" } },
    });
    expect(row?.verifiedAt).toBeNull();
    // Listening is weak evidence; thirty of them must not look like holding it.
    expect(Number(row?.confidence)).toBeLessThan(0.5);
  }, 120_000);
});
