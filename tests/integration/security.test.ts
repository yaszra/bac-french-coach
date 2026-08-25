import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { withTenant } from "../../src/modules/platform/db/tenant";
import { decodeSession, encodeSession, type SessionClaims } from "../../src/modules/platform/session/cookie";
import { assertAllowedMime } from "../../src/modules/platform/storage/port";
import { can, type Actor } from "../../src/modules/platform/authz/can";

/**
 * A red-team pass: each test is an attempt to get past a guarantee the product
 * makes, written from the attacker's side rather than the implementer's.
 *
 * A guarantee nobody has tried to break is a hope.
 */
const MIGRATOR = process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan";
const APP = process.env.DATABASE_URL ?? "postgresql://itqan_app:itqan_app@localhost:5432/itqan";

let migrator: Client;
let app: Client;

const VICTIM = "itest_sec_victim";
const ATTACKER = "itest_sec_attacker";

beforeAll(async () => {
  migrator = new Client({ connectionString: MIGRATOR });
  app = new Client({ connectionString: APP });
  await migrator.connect();
  await app.connect();
  for (const [id, slug] of [[VICTIM, "sec-victim"], [ATTACKER, "sec-attacker"]] as const) {
    await migrator.query(
      `INSERT INTO organization (id,name,slug,region,locale,"createdAt",settings)
       VALUES ($1,$2,$3,'eu','en',now(),'{}') ON CONFLICT (id) DO NOTHING`,
      [id, slug, slug],
    );
    await migrator.query(
      `INSERT INTO app_user (id,"organizationId","displayName",locale,"createdAt")
       VALUES ($1,$2,'Person','en',now()) ON CONFLICT (id) DO NOTHING`,
      [`${id}_user`, id],
    );
  }
  process.env.SESSION_SECRET = "s".repeat(48);
}, 60_000);

afterAll(async () => {
  await migrator.query(`DELETE FROM app_user WHERE "organizationId" IN ($1,$2)`, [VICTIM, ATTACKER]);
  await migrator.query(`DELETE FROM organization WHERE id IN ($1,$2)`, [VICTIM, ATTACKER]);
  await migrator.end();
  await app.end();
});

describe("tenant isolation, attacked", () => {
  it("refuses a tenant id crafted to break out of the SET LOCAL", async () => {
    // withTenant interpolates the organisation id into a SET LOCAL, which
    // parameter binding cannot cover — so the id is validated against a strict
    // shape first. These are the payloads that would matter if it were not.
    const payloads = [
      `${ATTACKER}'; SET LOCAL app.organization_id = '${VICTIM}`,
      `${ATTACKER}' OR '1'='1`,
      `${ATTACKER}'; DROP TABLE app_user; --`,
      `${ATTACKER} ${VICTIM}`,
      "'",
      "a".repeat(200),
    ];
    for (const payload of payloads) {
      await expect(withTenant(payload, async () => "reached")).rejects.toThrow(/unexpected shape/);
    }
  }, 60_000);

  it("refuses a missing tenant instead of quietly scoping to nothing", async () => {
    /* `RegExp.test` coerces its argument, so the guard's `test(undefined)` was
       `test("undefined")` — which matches. A job invoked with no organisation
       therefore passed validation, set the tenant to the literal string
       "undefined", matched no rows under RLS, and completed successfully
       having done nothing at all. Every scheduled job in the product was doing
       exactly that. An absent tenant has to be loud. */
    for (const missing of [undefined, null, 0, {}, []]) {
      await expect(
        withTenant(missing as unknown as string, async () => "reached"),
      ).rejects.toThrow(/unexpected shape/);
    }
  }, 60_000);

  it("cannot read another organisation by guessing a row id", async () => {
    await app.query("BEGIN");
    await app.query(`SET LOCAL app.organization_id = '${ATTACKER}'`);
    const stolen = await app.query(`SELECT id FROM app_user WHERE id = $1`, [`${VICTIM}_user`]);
    await app.query("COMMIT");
    expect(stolen.rowCount).toBe(0);
  }, 60_000);

  it("cannot widen its own context mid-transaction to reach another tenant", async () => {
    await app.query("BEGIN");
    await app.query(`SET LOCAL app.organization_id = '${ATTACKER}'`);
    // Even setting the GUC again only ever swaps which single tenant is visible;
    // there is no value that means "all".
    await app.query(`SET LOCAL app.organization_id = ''`);
    const all = await app.query(`SELECT count(*)::int AS n FROM app_user`);
    await app.query("COMMIT");
    expect(all.rows[0].n).toBe(0);
  }, 60_000);

  it("cannot turn off row-level security as the application role", async () => {
    await expect(app.query(`ALTER TABLE app_user DISABLE ROW LEVEL SECURITY`)).rejects.toThrow();
    await expect(app.query(`DROP POLICY tenant_isolation ON app_user`)).rejects.toThrow();
  }, 60_000);

  it("cannot grant itself the bypass", async () => {
    await expect(app.query(`ALTER ROLE itqan_app BYPASSRLS`)).rejects.toThrow();
  }, 60_000);
});

describe("sessions, attacked", () => {
  const claims = (over: Partial<SessionClaims> = {}): SessionClaims => {
    const iat = Math.floor(Date.now() / 1000);
    return { sid: "s1", uid: "u1", org: ATTACKER, v: 1, iat, exp: iat + 3600, ...over };
  };

  it("rejects a cookie whose organisation was swapped", () => {
    const token = encodeSession(claims());
    const [, signature] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify(claims({ org: VICTIM }))).toString("base64url");
    expect(decodeSession(`${forged}.${signature}`, new Date())).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects a cookie with no signature at all", () => {
    const payload = Buffer.from(JSON.stringify(claims())).toString("base64url");
    expect(decodeSession(payload, new Date()).ok).toBe(false);
    expect(decodeSession(`${payload}.`, new Date()).ok).toBe(false);
  });

  it("rejects an unexpired cookie whose claims are the wrong shape", () => {
    // A payload that is not a session at all.
    const nonsense = Buffer.from(JSON.stringify({ hello: "world" })).toString("base64url");
    const result = decodeSession(`${nonsense}.anything`, new Date());
    expect(result.ok).toBe(false);
  });

  it("does not accept a cookie dated in the future", () => {
    const future = Math.floor(Date.now() / 1000) + 86_400;
    const token = encodeSession(claims({ iat: future, exp: future + 3600 }));
    expect(decodeSession(token, new Date())).toEqual({ ok: false, reason: "not_yet_valid" });
  });
});

describe("authorisation, attacked", () => {
  const base: Actor = { userId: "u_attacker", organizationId: ATTACKER, grants: [], relationships: [] };

  it("does not let a learner grant reach anyone else", () => {
    const learner: Actor = {
      ...base,
      grants: [{ role: "learner", scopeType: "learner", scopeId: "u_attacker", expiresAt: null }],
    };
    expect(can(learner, "learn:submitAttempt", { type: "learner", id: "u_victim" }).allowed).toBe(false);
    expect(can(learner, "teach:verifyRecitation", { type: "learner", id: "u_attacker" }).allowed).toBe(false);
    expect(can(learner, "admin:manageRoles", { type: "organization", id: ATTACKER }).allowed).toBe(false);
  });

  it("does not let a guardian's claim act as approval", () => {
    const guardian: Actor = {
      ...base,
      grants: [{ role: "guardian", scopeType: "organization", scopeId: ATTACKER, expiresAt: null }],
      relationships: [{ kind: "guardian_child", learnerUserId: "u_child", state: "claimed", canTutor: true }],
    };
    expect(can(guardian, "family:viewChild", { type: "learner", id: "u_child" }).allowed).toBe(false);
  });

  it("refuses a staff role reaching into another organisation", () => {
    const teacher: Actor = {
      ...base,
      grants: [{ role: "teacher", scopeType: "organization", scopeId: ATTACKER, expiresAt: null }],
      relationships: [{ kind: "teacher_student", learnerUserId: "u_former", state: "revoked", canTutor: false }],
    };
    expect(can(teacher, "teach:viewStudent", { type: "organization", id: VICTIM }).allowed).toBe(false);
  });

  it("does not let an expired grant work one second past its expiry", () => {
    const expired: Actor = {
      ...base,
      grants: [
        { role: "admin", scopeType: "organization", scopeId: ATTACKER, expiresAt: new Date("2026-08-23T12:00:00Z") },
      ],
    };
    expect(
      can(expired, "admin:manageMembers", { type: "organization", id: ATTACKER }, new Date("2026-08-23T11:59:59Z"))
        .allowed,
    ).toBe(true);
    expect(
      can(expired, "admin:manageMembers", { type: "organization", id: ATTACKER }, new Date("2026-08-23T12:00:01Z"))
        .allowed,
    ).toBe(false);
  });
});

describe("uploads, attacked", () => {
  it("refuses executable and markup content types", () => {
    for (const type of [
      "application/x-msdownload",
      "text/html",
      "image/svg+xml",
      "application/javascript",
      "application/x-sh",
    ]) {
      expect(() => assertAllowedMime("learner_recording", type)).toThrow();
    }
  });

  it("refuses a type allowed for one kind but not another", () => {
    // A .wav is a legitimate studio take and not a legitimate learner recording.
    expect(() => assertAllowedMime("studio_take", "audio/wav")).not.toThrow();
    expect(() => assertAllowedMime("learner_recording", "audio/wav")).toThrow();
  });

  it("is not fooled by a parameterised content type", () => {
    expect(() => assertAllowedMime("learner_recording", "audio/webm; codecs=opus")).toThrow();
  });
});

describe("the append-only log, attacked", () => {
  it("cannot be edited by declaring an erasure request from the application role", async () => {
    await app.query("BEGIN");
    await app.query(`SET LOCAL app.erasure_request_id = 'forged'`);
    await expect(app.query(`DELETE FROM learning_event`)).rejects.toThrow(/permission denied/i);
    await app.query("ROLLBACK");
  }, 60_000);

  it("records every erasure, so an erasure cannot be used to hide one", async () => {
    await migrator.query(
      `INSERT INTO learning_event (id,"organizationId","learnerUserId",type,"idempotencyKey",payload,"occurredAt","recordedAt",source)
       VALUES ('itest_sec_ev',$1,$2,'attempt.recorded','itest_sec_key','{}',now(),now(),'system')
       ON CONFLICT DO NOTHING`,
      [VICTIM, `${VICTIM}_user`],
    );
    await migrator.query("BEGIN");
    await migrator.query(`SET LOCAL app.erasure_request_id = 'itest_sec_request'`);
    await migrator.query(`DELETE FROM learning_event WHERE id = 'itest_sec_ev'`);
    await migrator.query("COMMIT");

    const logged = await migrator.query(
      `SELECT count(*)::int AS n FROM erasure_log WHERE "requestId" = 'itest_sec_request'`,
    );
    expect(logged.rows[0].n).toBe(1);

    // And the erasure log itself is not erasable by the application.
    await expect(app.query(`DELETE FROM erasure_log`)).rejects.toThrow(/permission denied/i);
    await migrator.query(`DELETE FROM erasure_log WHERE "requestId" = 'itest_sec_request'`);
  }, 60_000);
});
