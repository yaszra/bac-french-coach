/**
 * The full Phase 1 journey against real PostgreSQL.
 *
 * This is the test that distinguishes "the loop works" from "the loop
 * works in a Map". It runs the identical command layer against the real
 * schema, with the real triggers, constraints, and row-level security
 * active — and with no admin database edits anywhere in the journey.
 *
 * Skipped automatically when no database is reachable, so the suite stays
 * runnable on a laptop without PostgreSQL.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { PgDatabase } from "../src/application/pg-store.js";
import {
  createAssignment,
  openAssignment,
  recordListen,
  recordOralVerification,
  recordReviewOutcome,
  requestOralRecitation,
  submitRetrieval,
  getToday,
} from "../src/application/commands.js";
import { useDeterministicIds } from "../src/application/ids.js";
import type { Actor } from "../src/auth/policy.js";
import type { AssignmentId, LearnerId } from "../src/core/types.js";
import { MS_PER_DAY } from "../src/core/types.js";

const CONNECTION =
  process.env["ATHAR_TEST_DATABASE_URL"] ??
  "postgres://postgres:postgres@127.0.0.1:5432/athar_pg_test";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const ACADEMY = "11111111-1111-4111-8111-111111111112";
const CLASSROOM = "11111111-1111-4111-8111-111111111113";
const TEACHER = "11111111-1111-4111-8111-111111111114";
const LEARNER = "11111111-1111-4111-8111-111111111115" as LearnerId;
const CORPUS = "11111111-1111-4111-8111-111111111116";
const AYAH = "11111111-1111-4111-8111-111111111117";
const PASSAGE = "11111111-1111-4111-8111-111111111118";

const T0 = Date.UTC(2026, 2, 2, 9, 0, 0);

let pool: pg.Pool | undefined;
let db: PgDatabase;

async function reachable(): Promise<boolean> {
  const probe = new pg.Pool({ connectionString: CONNECTION, connectionTimeoutMillis: 2000 });
  try {
    await probe.query("SELECT 1");
    await probe.end();
    return true;
  } catch {
    await probe.end().catch(() => undefined);
    return false;
  }
}

/**
 * Probed at module scope, not in `beforeAll`: vitest evaluates `describe`
 * bodies during collection, so a flag set in `beforeAll` would always read
 * false when the skip decision is made.
 */
const available = await reachable();

/**
 * Seed only what a real deployment seeds outside the learning loop:
 * organizations, people, the approved corpus, and a released passage.
 * Everything the journey itself needs is created by commands.
 */
async function seed(client: pg.PoolClient): Promise<void> {
  const migrations = join(import.meta.dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).sort())
    await client.query(readFileSync(join(migrations, file), "utf8"));

  await client.query(
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athar_app') THEN
         CREATE ROLE athar_app NOLOGIN;
       END IF;
     END $$;
     GRANT USAGE ON SCHEMA public TO athar_app;
     GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO athar_app;
     GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO athar_app;`,
  );

  await client.query(`INSERT INTO organization (id, name) VALUES ($1,'Org A'),($2,'Org B')`, [
    ORG,
    OTHER_ORG,
  ]);
  await client.query(
    `INSERT INTO academy (id, organization_id, name, territory) VALUES ($1,$2,'Academy A','GB')`,
    [ACADEMY, ORG],
  );
  await client.query(
    `INSERT INTO classroom (id, organization_id, academy_id, name) VALUES ($1,$2,$3,'Hifz 2')`,
    [CLASSROOM, ORG, ACADEMY],
  );
  await client.query(
    `INSERT INTO app_user (id, organization_id, display_name)
     VALUES ($1,$3,'Ustadh Kareem'),($2,$3,'Amina S.')`,
    [TEACHER, LEARNER, ORG],
  );
  await client.query(
    `INSERT INTO enrollment (organization_id, academy_id, classroom_id, learner_id)
     VALUES ($1,$2,$3,$4)`,
    [ORG, ACADEMY, CLASSROOM, LEARNER],
  );

  // An approved, published corpus. No Qur'anic text: the token is an
  // opaque synthetic identifier, as everywhere else in this repository.
  await client.query(
    `INSERT INTO corpus_version
       (id, edition, lifecycle, sha256, surah_count, ayah_count, word_count,
        page_count, expected_lines_per_page, published_at)
     VALUES ($1,'test-edition','published','deadbeef',1,1,1,1,15, now())`,
    [CORPUS],
  );
  await client.query(`INSERT INTO surah (corpus_version_id, number, ayah_count) VALUES ($1,1,1)`, [
    CORPUS,
  ]);
  await client.query(
    `INSERT INTO ayah (id, corpus_version_id, surah_number, number_in_surah) VALUES ($1,$2,1,1)`,
    [AYAH, CORPUS],
  );
  await client.query(
    `INSERT INTO passage
       (id, organization_id, corpus_version_id, label, start_ayah_id, end_ayah_id,
        segment_count, released, release_blocks, released_at, released_by_user_id)
     VALUES ($1,$2,$3,'Al-Mulk 12-15',$4,$4,1,true,'{}', now(), $5)`,
    [PASSAGE, ORG, CORPUS, AYAH, TEACHER],
  );
}

const teacher: Actor = {
  userId: TEACHER,
  organizationId: ORG,
  roles: [{ role: "teacher", academyId: ACADEMY, classroomIds: [CLASSROOM] }],
  sessionValid: true,
  mfaSatisfied: true,
};
const learner: Actor = {
  userId: LEARNER,
  organizationId: ORG,
  roles: [{ role: "learner" }],
  sessionValid: true,
  mfaSatisfied: false,
};

beforeAll(async () => {
  if (!available) return;
  const admin = new pg.Pool({ connectionString: CONNECTION });
  const client = await admin.connect();
  try {
    // A clean schema per run, so the journey starts from nothing.
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await seed(client);
  } finally {
    client.release();
    await admin.end();
  }
  pool = new pg.Pool({ connectionString: CONNECTION });
  // Run as a non-superuser so row-level security actually applies.
  db = new PgDatabase(pool, { applicationRole: "athar_app" });
  useDeterministicIds();
}, 60_000);

afterAll(async () => {
  await pool?.end();
});

const maybe = () => (available ? it : it.skip);

describe("the Phase 1 journey against real PostgreSQL", () => {
  let assignmentId: AssignmentId;
  let segmentId: string;
  let targetId: string;

  maybe()("a teacher assigns a released passage", async () => {
    const created = await createAssignment(db, {
      actor: teacher,
      now: T0,
      learnerId: LEARNER,
      academyId: ACADEMY,
      classroomId: CLASSROOM,
      targetKind: "segment",
      passageId: PASSAGE,
      policy: {
        requiredListens: 3,
        requiredIndependentRecalls: 2,
        requiredNonSerialRecalls: 1,
      },
      estimatedActiveMinutes: 9,
      dueAt: T0 + MS_PER_DAY,
    });
    assignmentId = created.assignmentId;
    segmentId = created.segmentIds[0]!;
    targetId = created.targetId;
    expect(created.policyVersion).toBe("v1");
  });

  maybe()("Today surfaces the assignment with a reason", async () => {
    const plan = await getToday(db, {
      actor: learner,
      now: T0,
      learnerId: LEARNER,
      sessionBudgetMinutes: 20,
    });
    const primary = plan.newMemory ?? plan.continueNow;
    expect(primary?.candidate.label).toBe("Al-Mulk 12-15");
    expect(primary?.reason).toMatch(/assigned/i);
  });

  maybe()("the page is blank on open", async () => {
    const opened = await openAssignment(db, { actor: learner, now: T0 + 1, assignmentId });
    expect(opened.page.revealedTokenIds).toEqual([]);
    expect(opened.state).toBe("preparing");
    expect(opened.listenPolicyMet).toBe(false);
  });

  maybe()("listens are counted by the server", async () => {
    let result;
    for (let i = 0; i < 3; i++)
      result = await recordListen(db, {
        actor: learner,
        now: T0 + 10 + i,
        assignmentId,
        segmentId,
      });
    expect(result!.listensCompleted).toBe(3);
    expect(result!.listenPolicyMet).toBe(true);
  });

  maybe()("a tile reconstruction fills the page but creates no recall evidence", async () => {
    const r = await submitRetrieval(db, {
      actor: learner,
      now: T0 + 20,
      assignmentId,
      segmentId,
      scaffoldLevel: "full_tiles",
      startContext: "serial_start",
      correct: true,
      assistance: ["tile_options_visible"],
      hesitant: false,
      idempotencyKey: "pg-tiles",
    });
    expect(r.evidenceClass).toBe("assisted_practice");
    expect(r.progress.independentRecalls).toBe(0);
  });

  maybe()("assistance is persisted alongside the attempt", async () => {
    const { rows } = await pool!.query(
      `SELECT kind FROM assistance_event e
         JOIN attempt a ON a.id = e.attempt_id
        WHERE a.idempotency_key = 'pg-tiles'`,
    );
    expect(rows.map((r) => r["kind"])).toEqual(["tile_options_visible"]);
  });

  maybe()("cue-free recalls reach the verification threshold", async () => {
    const first = await submitRetrieval(db, {
      actor: learner,
      now: T0 + 30,
      assignmentId,
      segmentId,
      scaffoldLevel: "no_answer_choices",
      startContext: "serial_start",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "pg-serial",
    });
    expect(first.state).toBe("recalled_independently");

    const second = await submitRetrieval(db, {
      actor: learner,
      now: T0 + 40,
      assignmentId,
      segmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "boundary_probe",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "pg-boundary",
    });
    expect(second.state).toBe("ready_for_verification");
  });

  maybe()("a replayed submission does not double-count", async () => {
    const replay = await submitRetrieval(db, {
      actor: learner,
      now: T0 + 41,
      assignmentId,
      segmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "boundary_probe",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "pg-boundary",
    });
    expect(replay.progress.independentRecalls).toBe(2);
    const { rows } = await pool!.query(
      `SELECT count(*)::int AS n FROM attempt WHERE assignment_id = $1`,
      [assignmentId],
    );
    expect(rows[0]!["n"]).toBe(3);
  });

  let requestId: string;

  maybe()("the learner requests a recitation", async () => {
    const r = await requestOralRecitation(db, {
      actor: learner,
      now: T0 + 50,
      assignmentId,
    });
    requestId = r.requestId;
    expect(requestId).toBeTruthy();
  });

  maybe()("the learner cannot record the verification themselves", async () => {
    await expect(
      recordOralVerification(db, {
        actor: learner,
        now: T0 + 60,
        requestId,
        decision: "verified_cleanly",
      }),
    ).rejects.toThrow();
    const { rows } = await pool!.query(`SELECT count(*)::int AS n FROM oral_verification`);
    expect(rows[0]!["n"]).toBe(0);
  });

  maybe()("a teacher in another organization sees nothing", async () => {
    await expect(
      recordOralVerification(db, {
        actor: { ...teacher, organizationId: OTHER_ORG },
        now: T0 + 60,
        requestId,
        decision: "verified_cleanly",
      }),
    ).rejects.toThrow(/not found/i);
  });

  maybe()("the teacher verifies, pinning policy and corpus versions", async () => {
    const result = await recordOralVerification(db, {
      actor: teacher,
      now: T0 + 70,
      requestId,
      decision: "verified_minor_slip",
      corrections: [{ category: "join", note: "hesitates into the next ayah" }],
    });
    expect(result.state).toBe("verified");
    expect(result.nextReviewAt).toBeGreaterThan(T0 + 70);

    const { rows } = await pool!.query(
      `SELECT policy_version, corpus_version_id, verifier_user_id,
              (SELECT count(*)::int FROM oral_verification_evidence e
                WHERE e.verification_id = v.id) AS evidence_count
         FROM oral_verification v WHERE v.assignment_id = $1`,
      [assignmentId],
    );
    expect(rows[0]!["policy_version"]).toBe("v1");
    expect(rows[0]!["corpus_version_id"]).toBe(CORPUS);
    expect(rows[0]!["verifier_user_id"]).toBe(TEACHER);
    expect(rows[0]!["evidence_count"]).toBe(2);
  });

  maybe()("the next session still begins from a blank page", async () => {
    const reopened = await openAssignment(db, {
      actor: learner,
      now: T0 + 80,
      assignmentId,
    });
    expect(reopened.page.revealedTokenIds).toEqual([]);
    expect(reopened.state).toBe("verified");
  });

  maybe()("a delayed clean recall raises stability and reschedules", async () => {
    const before = await pool!.query(
      `SELECT stability_days FROM memory_state WHERE memory_target_id = $1`,
      [targetId],
    );
    const result = await recordReviewOutcome(db, {
      actor: learner,
      now: T0 + 6 * MS_PER_DAY,
      assignmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "random_start",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "pg-review-1",
    });
    expect(result.state).toBe("established");
    expect(result.rescheduled).toBe(true);
    expect(result.stabilityDays!).toBeGreaterThan(
      Number(before.rows[0]!["stability_days"]),
    );
  });

  maybe()("every state transition recorded how it was computed", async () => {
    const { rows } = await pool!.query(
      `SELECT engine_version, algorithm_version, policy_version, reason
         FROM memory_state WHERE memory_target_id = $1`,
      [targetId],
    );
    expect(rows[0]!["engine_version"]).toMatch(/^athar-states\//);
    expect(rows[0]!["algorithm_version"]).toMatch(/^athar-scheduler\//);
    expect(rows[0]!["policy_version"]).toBe("v1");
    expect(String(rows[0]!["reason"])).toContain("Stability");
  });
});

describe("transactional integrity against real PostgreSQL", () => {
  maybe()("a rejected command writes neither state nor events", async () => {
    const eventsBefore = await pool!.query(`SELECT count(*)::int AS n FROM learning_event`);
    const outboxBefore = await pool!.query(`SELECT count(*)::int AS n FROM outbox_message`);
    const assignmentsBefore = await pool!.query(`SELECT count(*)::int AS n FROM assignment`);

    // An unreleased passage: authorization passes, the content gate does not.
    const draft = "33333333-3333-4333-8333-333333333333";
    await pool!.query(
      `INSERT INTO passage (id, organization_id, corpus_version_id, label,
                            start_ayah_id, end_ayah_id, segment_count, released,
                            release_blocks)
       VALUES ($1,$2,$3,'Draft passage',$4,$4,1,false,'{approval_missing}')`,
      [draft, ORG, CORPUS, AYAH],
    );

    await expect(
      createAssignment(db, {
        actor: teacher,
        now: T0,
        learnerId: LEARNER,
        academyId: ACADEMY,
        classroomId: CLASSROOM,
        targetKind: "segment",
        passageId: draft,
        policy: {
          requiredListens: 1,
          requiredIndependentRecalls: 1,
          requiredNonSerialRecalls: 0,
        },
        estimatedActiveMinutes: 5,
        dueAt: T0 + MS_PER_DAY,
      }),
    ).rejects.toThrow(/not released/);

    const eventsAfter = await pool!.query(`SELECT count(*)::int AS n FROM learning_event`);
    const outboxAfter = await pool!.query(`SELECT count(*)::int AS n FROM outbox_message`);
    const assignmentsAfter = await pool!.query(`SELECT count(*)::int AS n FROM assignment`);

    expect(eventsAfter.rows[0]!["n"]).toBe(eventsBefore.rows[0]!["n"]);
    expect(outboxAfter.rows[0]!["n"]).toBe(outboxBefore.rows[0]!["n"]);
    expect(assignmentsAfter.rows[0]!["n"]).toBe(assignmentsBefore.rows[0]!["n"]);
  });

  maybe()("committed events carry no Qur'anic text, only references", async () => {
    const { rows } = await pool!.query(`SELECT object_refs FROM learning_event`);
    expect(rows.length).toBeGreaterThan(0);
    const arabic = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
    for (const row of rows)
      expect(arabic.test(JSON.stringify(row["object_refs"]))).toBe(false);
  });

  maybe()("every committed event reached the outbox", async () => {
    const events = await pool!.query(`SELECT count(*)::int AS n FROM learning_event`);
    const outbox = await pool!.query(`SELECT count(*)::int AS n FROM outbox_message`);
    expect(outbox.rows[0]!["n"]).toBe(events.rows[0]!["n"]);
  });
});
