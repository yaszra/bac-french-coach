import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  notifyVerifiers,
  openVerificationRequest,
  scopeOfUnit,
} from "../../src/modules/assessment/repo/verification-request";

/**
 * The ear-gate's entrance.
 *
 * Nothing in the product created a ḥifẓ verification request. The grader
 * answered `requires_human`, the learner's screen said "your teacher will
 * listen", and the teacher's queue stayed empty for ever — a promise the
 * product could not keep, and a whole mechanism with no way in. Every unit
 * test passed, because each piece worked; what was missing was the connection.
 */
const DIRECT = process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan";
const db = new PrismaClient({ datasources: { db: { url: DIRECT } } });

const ORG = "itest_ask_org";
const LEARNER = "itest_ask_learner";
const TEACHER = "itest_ask_teacher";
const TUTOR = "itest_ask_tutor";
const CLAIMANT = "itest_ask_claimant";

beforeAll(async () => {
  await db.organization.upsert({
    where: { id: ORG },
    create: { id: ORG, name: "Asking test", slug: "itest-ask", region: "eu", locale: "en" },
    update: {},
  });
  for (const id of [LEARNER, TEACHER, TUTOR, CLAIMANT]) {
    await db.user.upsert({
      where: { id },
      create: { id, organizationId: ORG, displayName: id, locale: "en" },
      update: {},
    });
  }
  await db.learnerProfile.upsert({
    where: { userId: LEARNER },
    create: { userId: LEARNER, organizationId: ORG, tier: "teen" },
    update: {},
  });

  // Three adults around one child: a teacher, a guardian trusted to tutor, and
  // a guardian whose claim is still waiting on that teacher.
  for (const [subject, kind, state, canTutor] of [
    [TEACHER, "teacher_student", "approved", false],
    [TUTOR, "guardian_child", "approved", true],
    [CLAIMANT, "guardian_child", "claimed", false],
  ] as const) {
    await db.relationship.upsert({
      where: {
        kind_subjectUserId_objectUserId: { kind, subjectUserId: subject, objectUserId: LEARNER },
      },
      create: {
        organizationId: ORG,
        kind,
        subjectUserId: subject,
        objectUserId: LEARNER,
        state,
        canTutor,
      },
      update: { state, canTutor },
    });
  }
}, 60_000);

beforeEach(async () => {
  await db.verificationRequest.deleteMany({ where: { organizationId: ORG } });
  await db.notification.deleteMany({ where: { organizationId: ORG } });
});

afterAll(async () => {
  await db.verificationRequest.deleteMany({ where: { organizationId: ORG } });
  await db.notification.deleteMany({ where: { organizationId: ORG } });
  await db.relationship.deleteMany({ where: { organizationId: ORG } });
  await db.learnerProfile.deleteMany({ where: { organizationId: ORG } });
  await db.user.deleteMany({ where: { organizationId: ORG } });
  await db.organization.deleteMany({ where: { id: ORG } });
  await db.$disconnect();
});

describe("the passage a request is about", () => {
  it("reads a body and a seam as references", () => {
    expect(scopeOfUnit("b:78:1")).toEqual({ sura: 78, ayahFrom: 1, ayahTo: 1 });
    expect(scopeOfUnit("t:78:1>78:2")).toEqual({ sura: 78, ayahFrom: 1, ayahTo: 2 });
  });

  it("refuses a unit that is not a passage a person can recite", () => {
    expect(scopeOfUnit("c:letter.beh")).toBeNull();
    expect(scopeOfUnit("nonsense")).toBeNull();
  });
});

describe("asking to be heard", () => {
  it("puts the learner in the queue, once, however often they ask", async () => {
    const first = await openVerificationRequest(db as never, {
      organizationId: ORG,
      learnerUserId: LEARNER,
      unitId: "b:78:1",
    });
    expect(first.kind).toBe("opened");

    const second = await openVerificationRequest(db as never, {
      organizationId: ORG,
      learnerUserId: LEARNER,
      unitId: "b:78:1",
    });
    // The same person still waiting is not two people waiting.
    expect(second.kind).toBe("already_waiting");
    expect(second.kind === "already_waiting" && second.requestId).toBe(
      first.kind === "opened" && first.requestId,
    );

    const waiting = await db.verificationRequest.count({
      where: { organizationId: ORG, learnerUserId: LEARNER, state: "pending" },
    });
    expect(waiting).toBe(1);
  }, 60_000);

  it("asks a different passage separately", async () => {
    await openVerificationRequest(db as never, {
      organizationId: ORG,
      learnerUserId: LEARNER,
      unitId: "b:78:1",
    });
    await openVerificationRequest(db as never, {
      organizationId: ORG,
      learnerUserId: LEARNER,
      unitId: "b:78:4",
    });
    expect(await db.verificationRequest.count({ where: { organizationId: ORG } })).toBe(2);
  }, 60_000);

  it("tells the people who could answer, and nobody else", async () => {
    const opened = await openVerificationRequest(db as never, {
      organizationId: ORG,
      learnerUserId: LEARNER,
      unitId: "b:78:1",
    });
    const told = await notifyVerifiers(db as never, {
      organizationId: ORG,
      learnerUserId: LEARNER,
      requestId: opened.kind === "opened" ? opened.requestId : "",
    });

    expect(told).toBe(2);
    const recipients = await db.notification.findMany({
      where: { organizationId: ORG, kind: "verification_requested" },
      select: { userId: true, deliveryState: true },
    });
    expect(recipients.map((row) => row.userId).sort()).toEqual([TEACHER, TUTOR].sort());
    // A claim that is still waiting on a teacher is not access, so it is not
    // notification either.
    expect(recipients.map((row) => row.userId)).not.toContain(CLAIMANT);
    // And no row sits at "waiting to send" for ever.
    expect(recipients.every((row) => row.deliveryState === "sent")).toBe(true);
  }, 60_000);
});
