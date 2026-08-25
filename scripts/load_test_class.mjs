#!/usr/bin/env node
/**
 * A thirty-student live class, which is the load that actually matters.
 *
 * Itqān's traffic is not a smooth curve. It is a teacher saying "begin", and
 * thirty children starting at the same second: thirty presence connections,
 * thirty session plans, and a burst of attempts a few minutes later. If that
 * moment is slow, the lesson is slow, and there is no making it up afterwards.
 *
 * This drives the real database through the real projection path — not a mock —
 * and reports the numbers the SLOs are written against.
 *
 *   node scripts/load_test_class.mjs [--students 30] [--minutes 10]
 */
import { PrismaClient } from "@prisma/client";
import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const readArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};

const STUDENTS = readArg("students", 30);
const MINUTES = readArg("minutes", 10);
const ORG = "loadtest_org";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan" } },
});

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[index] * 100) / 100;
}

function report(label, samples) {
  console.log(
    `  ${label.padEnd(28)} n=${String(samples.length).padStart(5)}  ` +
      `p50 ${String(percentile(samples, 50)).padStart(7)}ms  ` +
      `p95 ${String(percentile(samples, 95)).padStart(7)}ms  ` +
      `max ${String(percentile(samples, 100)).padStart(7)}ms`,
  );
}

async function setup() {
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: "Load test", slug: "loadtest", region: "eu", locale: "en" },
    update: {},
  });
  const learners = [];
  for (let i = 0; i < STUDENTS; i++) {
    const id = `loadtest_learner_${i}`;
    await db.user.upsert({
      where: { id },
      create: { id, organizationId: ORG, displayName: `Learner ${i}`, locale: "en" },
      update: {},
    });
    await db.learnerProfile.upsert({
      where: { userId: id },
      create: { userId: id, organizationId: ORG, tier: "teen" },
      update: {},
    });
    learners.push(id);
  }
  return learners;
}

async function teardown() {
  await db.memoryState.deleteMany({ where: { organizationId: ORG } });
  await db.attempt.deleteMany({ where: { organizationId: ORG } });
  await db.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = 'loadtest'`).catch(() => {});
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL app.erasure_request_id = 'loadtest'`);
    await tx.learningEvent.deleteMany({ where: { organizationId: ORG } });
  });
  await db.$executeRawUnsafe(`DELETE FROM erasure_log WHERE "requestId" = 'loadtest'`);
  await db.learnerProfile.deleteMany({ where: { organizationId: ORG } });
  await db.user.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
}

async function main() {
  console.log(`[load] ${STUDENTS} students, ${MINUTES} minutes of practice\n`);
  const learners = await setup();

  // 1. "Begin." Everyone's plan is loaded in the same second.
  const planSamples = [];
  const startAll = performance.now();
  await Promise.all(
    learners.map(async (learnerUserId) => {
      const started = performance.now();
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.organization_id = '${ORG}'`);
        await tx.memoryState.findMany({ where: { learnerUserId }, orderBy: { dueAt: "asc" }, take: 50 });
        await tx.assignmentTarget.findMany({ where: { learnerUserId, completedAt: null } });
      });
      planSamples.push(performance.now() - started);
    }),
  );
  const openWall = performance.now() - startAll;

  // 2. The burst: attempts arriving from thirty devices at once.
  const attemptsPerLearner = Math.max(1, Math.round((MINUTES * 60) / 20));
  const attemptSamples = [];
  for (let round = 0; round < attemptsPerLearner; round++) {
    await Promise.all(
      learners.map(async (learnerUserId, index) => {
        const started = performance.now();
        const unitId = `b:78:${(index % 5) + 1}`;
        await db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL app.organization_id = '${ORG}'`);
          await tx.learningEvent.create({
            data: {
              organizationId: ORG,
              learnerUserId,
              type: "attempt.recorded",
              unitId,
              idempotencyKey: randomUUID(),
              payload: { unitId, unitKind: "ayah_body", retrievalType: "rebuild", grade: "good" },
              occurredAt: new Date(),
              source: "web",
            },
          });
        });
        attemptSamples.push(performance.now() - started);
      }),
    );
  }

  console.log("[load] results");
  report("open the session plan", planSamples);
  report("submit an attempt", attemptSamples);
  console.log(`  ${"whole class opening".padEnd(28)} ${Math.round(openWall)}ms wall clock`);
  console.log(`  ${"events written".padEnd(28)} ${attemptSamples.length}`);

  // The SLOs this is written against.
  const failures = [];
  if (percentile(planSamples, 95) > 500) failures.push(`p95 session plan ${percentile(planSamples, 95)}ms > 500ms`);
  if (percentile(attemptSamples, 95) > 200) failures.push(`p95 attempt write ${percentile(attemptSamples, 95)}ms > 200ms`);
  if (openWall > 3000) failures.push(`class opening took ${Math.round(openWall)}ms > 3000ms`);

  await teardown();
  await db.$disconnect();

  if (failures.length > 0) {
    console.error(`\n[load] BUDGET EXCEEDED:`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log("\n[load] within budget");
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
