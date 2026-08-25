import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

/**
 * These tests exist to prove the guarantees the whole product rests on, against
 * a real Postgres — not against a mock that would agree with us.
 */
const MIGRATOR_URL = process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan";
const APP_URL = process.env.DATABASE_URL ?? "postgresql://itqan_app:itqan_app@localhost:5432/itqan";

let migrator: Client;
let app: Client;

const ORG_A = "itest_org_a";
const ORG_B = "itest_org_b";

beforeAll(async () => {
  migrator = new Client({ connectionString: MIGRATOR_URL });
  app = new Client({ connectionString: APP_URL });
  await migrator.connect();
  await app.connect();

  for (const [id, slug] of [[ORG_A, "itest-a"], [ORG_B, "itest-b"]] as const) {
    await migrator.query(
      `INSERT INTO organization (id, name, slug, region, locale, "createdAt", settings)
       VALUES ($1, $2, $3, 'eu', 'en', now(), '{}') ON CONFLICT (id) DO NOTHING`,
      [id, slug, slug],
    );
    await migrator.query(
      `INSERT INTO app_user (id, "organizationId", "displayName", locale, "createdAt")
       VALUES ($1, $2, 'Learner', 'en', now()) ON CONFLICT (id) DO NOTHING`,
      [`${id}_learner`, id],
    );
  }
});

afterAll(async () => {
  // Tearing this fixture down has to go through the same audited erasure path a
  // real erasure request uses — there is no other way to remove learning history.
  await migrator.query("BEGIN");
  await migrator.query(`SET LOCAL app.erasure_request_id = 'itest_teardown'`);
  await migrator.query(`DELETE FROM app_user WHERE "organizationId" IN ($1,$2)`, [ORG_A, ORG_B]);
  await migrator.query(`DELETE FROM organization WHERE id IN ($1,$2)`, [ORG_A, ORG_B]);
  await migrator.query("COMMIT");
  await migrator.query(`DELETE FROM erasure_log WHERE "requestId" = 'itest_teardown'`);
  await migrator.end();
  await app.end();
});

async function asTenant<T>(organizationId: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await app.query("BEGIN");
  try {
    await app.query(`SET LOCAL app.organization_id = '${organizationId}'`);
    const result = await app.query(sql, params);
    await app.query("COMMIT");
    return result.rows as T[];
  } catch (error) {
    await app.query("ROLLBACK");
    throw error;
  }
}

describe("row-level security", () => {
  it("shows an organisation only its own rows", async () => {
    const a = await asTenant<{ id: string }>(ORG_A, `SELECT id FROM app_user`);
    expect(a.map((r) => r.id)).toEqual([`${ORG_A}_learner`]);

    const b = await asTenant<{ id: string }>(ORG_B, `SELECT id FROM app_user`);
    expect(b.map((r) => r.id)).toEqual([`${ORG_B}_learner`]);
  });

  it("returns nothing at all without a tenant context", async () => {
    const rows = await app.query(`SELECT id FROM app_user`);
    expect(rows.rowCount).toBe(0);
  });

  it("refuses to write a row into another organisation", async () => {
    await expect(
      asTenant(
        ORG_A,
        `INSERT INTO app_user (id, "organizationId", "displayName", locale, "createdAt")
         VALUES ('itest_smuggled', $1, 'Smuggled', 'en', now())`,
        [ORG_B],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("does not let a tenant read another tenant's learning events", async () => {
    await migrator.query(
      `INSERT INTO learning_event (id, "organizationId", "learnerUserId", type, "idempotencyKey", payload, "occurredAt", "recordedAt", source)
       VALUES ('itest_ev_a', $1, $2, 'attempt.recorded', 'itest_key_a', '{}', now(), now(), 'system')
       ON CONFLICT DO NOTHING`,
      [ORG_A, `${ORG_A}_learner`],
    );
    const seenByB = await asTenant(ORG_B, `SELECT id FROM learning_event WHERE id = 'itest_ev_a'`);
    expect(seenByB).toHaveLength(0);
    const seenByA = await asTenant(ORG_A, `SELECT id FROM learning_event WHERE id = 'itest_ev_a'`);
    expect(seenByA).toHaveLength(1);
    await expect(
      migrator.query(`DELETE FROM learning_event WHERE id = 'itest_ev_a'`),
    ).rejects.toThrow(/append-only/);
  });
});

describe("append-only learning history", () => {
  it("refuses UPDATE, DELETE and TRUNCATE even for the owning role", async () => {
    await migrator.query(
      `INSERT INTO learning_event (id, "organizationId", "learnerUserId", type, "idempotencyKey", payload, "occurredAt", "recordedAt", source)
       VALUES ('itest_ev_immutable', $1, $2, 'attempt.recorded', 'itest_key_immutable', '{}', now(), now(), 'system')
       ON CONFLICT DO NOTHING`,
      [ORG_A, `${ORG_A}_learner`],
    );

    await expect(
      migrator.query(`UPDATE learning_event SET type = 'tampered' WHERE id = 'itest_ev_immutable'`),
    ).rejects.toThrow(/append-only/);
    await expect(
      migrator.query(`DELETE FROM learning_event WHERE id = 'itest_ev_immutable'`),
    ).rejects.toThrow(/append-only/);
    await expect(migrator.query(`TRUNCATE learning_event`)).rejects.toThrow(/append-only/);
  });

  it("erases only through the audited path, and records what it erased", async () => {
    await migrator.query(
      `INSERT INTO learning_event (id, "organizationId", "learnerUserId", type, "idempotencyKey", payload, "occurredAt", "recordedAt", source)
       VALUES ('itest_ev_erase', $1, $2, 'attempt.recorded', 'itest_key_erase', '{}', now(), now(), 'system')
       ON CONFLICT DO NOTHING`,
      [ORG_A, `${ORG_A}_learner`],
    );

    await migrator.query("BEGIN");
    await migrator.query(`SET LOCAL app.erasure_request_id = 'itest_request_1'`);
    await migrator.query(`DELETE FROM learning_event WHERE id = 'itest_ev_erase'`);
    await migrator.query("COMMIT");

    const gone = await migrator.query(`SELECT id FROM learning_event WHERE id = 'itest_ev_erase'`);
    expect(gone.rowCount).toBe(0);

    const logged = await migrator.query(
      `SELECT "tableName", operation, "rowId" FROM erasure_log WHERE "requestId" = 'itest_request_1'`,
    );
    expect(logged.rows).toEqual([
      { tableName: "learning_event", operation: "DELETE", rowId: "itest_ev_erase" },
    ]);
    await migrator.query(`DELETE FROM erasure_log WHERE "requestId" = 'itest_request_1'`);
  });

  it("still refuses erasure when the application role attempts it", async () => {
    await expect(
      asTenant(ORG_A, `DELETE FROM learning_event WHERE id = 'anything'`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("deduplicates a replayed offline attempt by idempotency key", async () => {
    // A previous run may have left the key behind; clear it through the audited path.
    await migrator.query("BEGIN");
    await migrator.query(`SET LOCAL app.erasure_request_id = 'itest_replay_reset'`);
    await migrator.query(`DELETE FROM learning_event WHERE "idempotencyKey" = 'itest_replay_key'`);
    await migrator.query("COMMIT");
    await migrator.query(`DELETE FROM erasure_log WHERE "requestId" = 'itest_replay_reset'`);

    const insert = () =>
      migrator.query(
        `INSERT INTO learning_event (id, "organizationId", "learnerUserId", type, "idempotencyKey", payload, "occurredAt", "recordedAt", source)
         VALUES (gen_random_uuid()::text, $1, $2, 'attempt.recorded', 'itest_replay_key', '{}', now(), now(), 'pwa_offline')`,
        [ORG_A, `${ORG_A}_learner`],
      );
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key|unique/i);
  });
});
