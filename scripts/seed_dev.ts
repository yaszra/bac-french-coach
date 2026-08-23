/**
 * Development and end-to-end seed.
 *
 * Creates one school with a teacher, three learners across the three tiers, a
 * guardian with one approved link and one pending claim, a classroom, and a
 * couple of assignments. It writes NO memory state and NO mastery: those exist
 * only as consequences of evidence, and seeding them would be exactly the fake
 * progress the product refuses to show.
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url } } });

const ORG_ID = "org_seed_madrasah";
const PASSWORD = "itqan-dev-password";

async function main() {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

  await prisma.organization.upsert({
    where: { id: ORG_ID },
    create: { id: ORG_ID, name: "Madrasah al-Nūr", slug: "al-nur", region: "eu", locale: "en" },
    update: {},
  });

  const people = [
    { id: "u_seed_teacher", name: "Ustādh Karīm", email: "teacher@itqan.test", role: "teacher" as const, tier: null },
    { id: "u_seed_parent", name: "Fāṭimah", email: "parent@itqan.test", role: "guardian" as const, tier: null },
    { id: "u_seed_admin", name: "School Office", email: "admin@itqan.test", role: "admin" as const, tier: null },
    { id: "u_seed_kid", name: "Yūsuf", email: null, role: "learner" as const, tier: "kids" as const },
    { id: "u_seed_teen", name: "Maryam", email: "maryam@itqan.test", role: "learner" as const, tier: "teen" as const },
    { id: "u_seed_adult", name: "Ibrāhīm", email: "adult@itqan.test", role: "learner" as const, tier: "adult" as const },
  ];

  for (const person of people) {
    await prisma.user.upsert({
      where: { id: person.id },
      create: {
        id: person.id,
        organizationId: ORG_ID,
        displayName: person.name,
        email: person.email,
        handle: person.email ? null : person.id.replace("u_seed_", ""),
        locale: "en",
      },
      update: { displayName: person.name },
    });

    if (person.email) {
      await prisma.credential.upsert({
        where: { userId: person.id },
        create: { userId: person.id, passwordHash },
        update: { passwordHash },
      });
    }

    if (person.tier) {
      await prisma.learnerProfile.upsert({
        where: { userId: person.id },
        create: {
          userId: person.id,
          organizationId: ORG_ID,
          tier: person.tier,
          timezone: "Europe/Paris",
          // Kids have their settings set for them; that is the tier's whole point.
          lockedSettings: person.tier === "kids" ? { reciter: "husary", speed: 1 } : {},
        },
        update: { tier: person.tier },
      });
    }

    await prisma.roleGrant.upsert({
      where: {
        userId_role_scopeType_scopeId: {
          userId: person.id,
          role: person.role,
          scopeType: person.role === "learner" ? "learner" : "organization",
          scopeId: person.role === "learner" ? person.id : ORG_ID,
        },
      },
      create: {
        organizationId: ORG_ID,
        userId: person.id,
        role: person.role,
        scopeType: person.role === "learner" ? "learner" : "organization",
        scopeId: person.role === "learner" ? person.id : ORG_ID,
      },
      update: {},
    });
  }

  const classroom = await prisma.classroom.upsert({
    where: { id: "c_seed_hifz" },
    create: {
      id: "c_seed_hifz",
      organizationId: ORG_ID,
      name: "Ḥifẓ — Tuesday evening",
      joinCode: "NUR2026",
      teacherUserId: "u_seed_teacher",
    },
    update: {},
  });

  for (const learnerId of ["u_seed_kid", "u_seed_teen", "u_seed_adult"]) {
    await prisma.enrollment.upsert({
      where: { classroomId_learnerUserId: { classroomId: classroom.id, learnerUserId: learnerId } },
      create: { organizationId: ORG_ID, classroomId: classroom.id, learnerUserId: learnerId },
      update: {},
    });
    await prisma.relationship.upsert({
      where: {
        kind_subjectUserId_objectUserId: {
          kind: "teacher_student",
          subjectUserId: "u_seed_teacher",
          objectUserId: learnerId,
        },
      },
      create: {
        organizationId: ORG_ID,
        kind: "teacher_student",
        subjectUserId: "u_seed_teacher",
        objectUserId: learnerId,
        state: "approved",
        approvedAt: new Date(),
        approvedBy: "u_seed_teacher",
      },
      update: {},
    });
  }

  // One approved guardian link, and one still waiting on the teacher — the
  // claim-as-a-claim trust model, visible in the seed.
  await prisma.relationship.upsert({
    where: {
      kind_subjectUserId_objectUserId: {
        kind: "guardian_child",
        subjectUserId: "u_seed_parent",
        objectUserId: "u_seed_kid",
      },
    },
    create: {
      organizationId: ORG_ID,
      kind: "guardian_child",
      subjectUserId: "u_seed_parent",
      objectUserId: "u_seed_kid",
      state: "approved",
      canTutor: true,
      approvedAt: new Date(),
      approvedBy: "u_seed_teacher",
    },
    update: {},
  });
  await prisma.relationship.upsert({
    where: {
      kind_subjectUserId_objectUserId: {
        kind: "guardian_child",
        subjectUserId: "u_seed_parent",
        objectUserId: "u_seed_teen",
      },
    },
    create: {
      organizationId: ORG_ID,
      kind: "guardian_child",
      subjectUserId: "u_seed_parent",
      objectUserId: "u_seed_teen",
      state: "claimed",
      canTutor: false,
    },
    update: {},
  });

  // Assignments carry references only — sūrah and āyah numbers, never Arabic.
  await prisma.assignment.upsert({
    where: { id: "a_seed_hifz" },
    create: {
      id: "a_seed_hifz",
      organizationId: ORG_ID,
      createdByUserId: "u_seed_teacher",
      classroomId: classroom.id,
      track: "hifz",
      scope: { sura: 78, ayahFrom: 1, ayahTo: 5 },
      settings: { reciterId: "husary", exercises: ["listen", "recall_first", "rebuild"] },
      targets: {
        create: [
          { learnerUserId: "u_seed_kid" },
          { learnerUserId: "u_seed_teen" },
          { learnerUserId: "u_seed_adult" },
        ],
      },
    },
    update: {},
  });

  await prisma.featureFlag.upsert({
    where: { key: "scheduler.fsrs_shadow" },
    create: {
      key: "scheduler.fsrs_shadow",
      description: "Run the FSRS-lite scheduler in shadow mode alongside the current one",
      mode: "on",
    },
    update: {},
  });

  console.log(`seeded organisation ${ORG_ID}: 6 people, 1 classroom, 1 assignment, 0 memory state`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
