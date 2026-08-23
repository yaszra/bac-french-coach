/**
 * Restore verification — acceptance criterion 17.
 *
 * "A restored backup passes integrity and evidence-reconciliation checks."
 *
 * The pure tests below corrupt a snapshot in each way a bad restore can be
 * bad, and require the specific issue. The integration test runs a real
 * pg_dump / pg_restore cycle and then damages the restore, so the check is
 * proven against actual PostgreSQL rather than against a fixture.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import pg from "pg";
import {
  ACADEMY,
  CLASSROOM,
  LEARNER,
  ORG,
  PASSAGE,
  TEACHER,
  asPostgres,
  connectionFor,
  databaseReachable,
  migrateAndSeed,
  recreateDatabase,
} from "./pg-seed.js";
import { PgDatabase } from "../src/application/pg-store.js";
import {
  createAssignment,
  recordListen,
  recordOralVerification,
  requestOralRecitation,
  submitRetrieval,
} from "../src/application/commands.js";
import { useDeterministicIds } from "../src/application/ids.js";
import type { Actor } from "../src/auth/policy.js";
import {
  SNAPSHOT_SQL,
  reconcile,
  type IntegritySnapshot,
} from "../src/application/reconciliation.js";

function snapshot(over: Partial<IntegritySnapshot> = {}): IntegritySnapshot {
  return {
    corpusVersions: [
      {
        corpusVersionId: "c1",
        sha256: "a".repeat(64),
        wordCount: 100,
        layoutTokenCount: 100,
        lifecycle: "published",
      },
    ],
    attemptCount: 40,
    verificationCount: 8,
    correctionCount: 5,
    learningEventCount: 120,
    outboxPendingCount: 3,
    danglingReferences: 0,
    sequenceHighWaterMarks: { outbox_message_id_seq: 120, audit_log_id_seq: 40 },
    ...over,
  };
}

describe("an identical restore reconciles", () => {
  it("accepts a faithful copy", () => {
    const result = reconcile(snapshot(), snapshot());
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.summary).toMatch(/Restore verified/);
  });
});

describe("each way a restore can be wrong is caught", () => {
  it("catches a corpus that no longer hashes the same", () => {
    const after = snapshot({
      corpusVersions: [
        {
          corpusVersionId: "c1",
          sha256: "b".repeat(64),
          wordCount: 100,
          layoutTokenCount: 100,
          lifecycle: "published",
        },
      ],
    });
    const result = reconcile(snapshot(), after);
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("corpus_checksum_mismatch");
  });

  it("catches a corpus that lost rows", () => {
    const after = snapshot({
      corpusVersions: [
        {
          corpusVersionId: "c1",
          sha256: "a".repeat(64),
          wordCount: 99,
          layoutTokenCount: 100,
          lifecycle: "published",
        },
      ],
    });
    expect(reconcile(snapshot(), after).issues.map((i) => i.code)).toContain(
      "corpus_counts_changed",
    );
  });

  it("catches a corpus version that vanished entirely", () => {
    const result = reconcile(snapshot(), snapshot({ corpusVersions: [] }));
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.detail).toMatch(/absent from the restore/);
  });

  it("catches missing attempts", () => {
    const result = reconcile(snapshot(), snapshot({ attemptCount: 39 }));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("evidence_missing");
    expect(result.issues[0]?.detail).toMatch(/1 attempts missing \(40 → 39\)/);
  });

  it("catches a missing verification", () => {
    expect(
      reconcile(snapshot(), snapshot({ verificationCount: 7 })).issues.map(
        (i) => i.code,
      ),
    ).toContain("verification_missing");
  });

  it("catches missing learning events", () => {
    expect(
      reconcile(snapshot(), snapshot({ learningEventCount: 1 })).issues.map(
        (i) => i.code,
      ),
    ).toContain("evidence_missing");
  });

  it("also catches evidence that appeared from nowhere", () => {
    // A restore holding rows the source never had means the two are not
    // the same system, and trusting it would be worse than rejecting it.
    const result = reconcile(snapshot(), snapshot({ attemptCount: 41 }));
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("evidence_appeared");
  });

  it("catches undelivered outbox work that was lost", () => {
    expect(
      reconcile(snapshot(), snapshot({ outboxPendingCount: 0 })).issues.map(
        (i) => i.code,
      ),
    ).toContain("outbox_undelivered_lost");
  });

  it("catches broken referential integrity", () => {
    expect(
      reconcile(snapshot(), snapshot({ danglingReferences: 3 })).issues.map(
        (i) => i.code,
      ),
    ).toContain("referential_integrity_broken");
  });

  it("catches a sequence that will reissue identifiers already in use", () => {
    const result = reconcile(
      snapshot(),
      snapshot({
        sequenceHighWaterMarks: { outbox_message_id_seq: 5, audit_log_id_seq: 40 },
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.detail).toMatch(/reissue existing identifiers/);
  });

  it("reports every problem, not only the first", () => {
    const result = reconcile(
      snapshot(),
      snapshot({ attemptCount: 1, verificationCount: 0, danglingReferences: 2 }),
    );
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
    expect(result.summary).toMatch(/Restore REJECTED/);
  });
});

describe("the drill script and the module share one query", () => {
  it("keeps scripts/snapshot.sql identical to SNAPSHOT_SQL", () => {
    const onDisk = readFileSync("scripts/snapshot.sql", "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim();
    // Two copies of a query that can drift is two queries.
    expect(onDisk).toBe(SNAPSHOT_SQL.trim());
  });
});

// ---------------------------------------------------------------------------
// Against real PostgreSQL
// ---------------------------------------------------------------------------

/** This suite owns its own source database, so no other suite can race it. */
const SOURCE = "athar_drill_source";
const available = await databaseReachable();
const maybe = () => (available ? it : it.skip);

async function snapshotOf(database: string): Promise<IntegritySnapshot> {
  const output = asPostgres(
    `psql -tAX -d ${database} -f ${process.cwd()}/scripts/snapshot.sql`,
  );
  return JSON.parse(output.trim()) as IntegritySnapshot;
}

describe("a real dump and restore cycle", () => {
  const RESTORED = "athar_drill_restored";
  const dumpPath = "/tmp/athar-reconcile-test.pgc";

  /**
   * Seed a source database with real evidence: an attempt and a human
   * verification. Reconciling an empty database would prove nothing.
   */
  beforeAll(async () => {
    if (!available) return;
    recreateDatabase(SOURCE);
    const pool = new pg.Pool({ connectionString: connectionFor(SOURCE) });
    try {
      await migrateAndSeed(pool);
      const db = new PgDatabase(pool, { applicationRole: "athar_app" });
      const actorBase = {
        organizationId: ORG,
        sessionValid: true as const,
        mfaSatisfied: true,
      };
      const teacher: Actor = {
        ...actorBase,
        userId: TEACHER,
        roles: [{ role: "teacher", academyId: ACADEMY, classroomIds: [CLASSROOM] }],
      };
      const learner: Actor = {
        ...actorBase,
        userId: LEARNER,
        roles: [{ role: "learner" }],
        mfaSatisfied: false,
      };
      const now = Date.UTC(2026, 9, 1, 9, 0, 0);

      useDeterministicIds();
      const { assignmentId, segmentIds } = await createAssignment(db, {
        actor: teacher,
        now,
        learnerId: LEARNER as never,
        academyId: ACADEMY,
        classroomId: CLASSROOM,
        targetKind: "segment",
        passageId: PASSAGE,
        policy: {
          requiredListens: 1,
          requiredIndependentRecalls: 1,
          requiredNonSerialRecalls: 0,
        },
        estimatedActiveMinutes: 5,
        dueAt: now + 86_400_000,
      });
      const segmentId = segmentIds[0]!;
      await recordListen(db, { actor: learner, now: now + 1, assignmentId, segmentId });
      await submitRetrieval(db, {
        actor: learner,
        now: now + 2,
        assignmentId,
        segmentId,
        scaffoldLevel: "oral_blank_page",
        startContext: "random_start",
        correct: true,
        assistance: [],
        hesitant: false,
        idempotencyKey: "drill-1",
      });
      const { requestId } = await requestOralRecitation(db, {
        actor: learner,
        now: now + 3,
        assignmentId,
      });
      await recordOralVerification(db, {
        actor: teacher,
        now: now + 4,
        requestId,
        decision: "verified_cleanly",
      });
    } finally {
      await pool.end();
    }
  }, 120_000);

  afterAll(() => {
    if (!available) return;
    asPostgres(`dropdb --if-exists ${SOURCE}`);
  });

  maybe()(
    "reconciles a faithful restore, and rejects a damaged one",
    async () => {
      const before = await snapshotOf(SOURCE);
      // The source must actually contain evidence, or this proves nothing.
      expect(before.attemptCount).toBeGreaterThan(0);
      expect(before.verificationCount).toBeGreaterThan(0);

      asPostgres(`rm -f ${dumpPath}`);
      asPostgres(`pg_dump --format=custom --file=${dumpPath} ${SOURCE}`);
      asPostgres(`dropdb --if-exists ${RESTORED}`);
      asPostgres(`createdb ${RESTORED}`);
      asPostgres(`pg_restore --exit-on-error --dbname=${RESTORED} ${dumpPath}`);

      const after = await snapshotOf(RESTORED);
      const faithful = reconcile(before, after);
      expect(faithful.issues).toEqual([]);
      expect(faithful.ok).toBe(true);

      // Now damage the restore the way a bad backup does: lose evidence.
      //
      // Note what it takes to do this deliberately. Deleting an `attempt`
      // is blocked twice over — by the append-only trigger and by the
      // foreign key from `oral_verification_evidence` — so the damage is
      // applied to `learning_event`, which has no such protection and is
      // exactly the kind of row a partial restore silently drops.
      asPostgres(
        `psql -q -d ${RESTORED} -c "DELETE FROM learning_event WHERE ctid IN (SELECT ctid FROM learning_event LIMIT 1)"`,
      );
      const damaged = await snapshotOf(RESTORED);
      const rejected = reconcile(before, damaged);

      expect(rejected.ok).toBe(false);
      expect(rejected.issues.map((i) => i.code)).toContain("evidence_missing");
      expect(rejected.issues[0]?.detail).toMatch(/1 learning events missing/);
      expect(rejected.summary).toMatch(/REJECTED/);

      asPostgres(`dropdb --if-exists ${RESTORED}`);
      asPostgres(`rm -f ${dumpPath}`);
    },
    120_000,
  );

  maybe()("proves the append-only trigger survives a restore", async () => {
    asPostgres(`rm -f ${dumpPath}`);
    asPostgres(`pg_dump --format=custom --file=${dumpPath} ${SOURCE}`);
    asPostgres(`dropdb --if-exists ${RESTORED}`);
    asPostgres(`createdb ${RESTORED}`);
    asPostgres(`pg_restore --exit-on-error --dbname=${RESTORED} ${dumpPath}`);

    // A restore that drops the safety rails is not a usable restore.
    let blocked = false;
    try {
      asPostgres(`psql -v ON_ERROR_STOP=1 -q -d ${RESTORED} -c "DELETE FROM attempt"`);
    } catch {
      blocked = true;
    }
    expect(blocked, "append-only trigger did not survive the restore").toBe(true);

    asPostgres(`dropdb --if-exists ${RESTORED}`);
    asPostgres(`rm -f ${dumpPath}`);
  }, 120_000);
});
