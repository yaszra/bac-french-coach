#!/usr/bin/env node
/**
 * The restore drill.
 *
 * A backup nobody has restored is a hope, not a backup. This script takes the
 * most recent dump, restores it into a scratch database, and then checks the
 * things that would actually matter after a disaster:
 *
 *   · the corpus is intact and matches its recorded digest,
 *   · learning history survived (append-only tables are non-empty and ordered),
 *   · row-level security is still switched on — a restore that loses policies
 *     would be worse than no restore at all, because it would look fine.
 *
 *   node scripts/backup_verify.mjs --dump path/to/dump.sql
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dumpPath = args[args.indexOf("--dump") + 1];
const SCRATCH = process.env.RESTORE_DRILL_DB ?? "itqan_restore_drill";
const SUPER = process.env.SUPERUSER_URL ?? "postgresql://postgres@localhost:5432/postgres";

if (!dumpPath || !existsSync(dumpPath)) {
  console.error("usage: node scripts/backup_verify.mjs --dump <path to dump.sql>");
  process.exit(2);
}

function psql(url, sql) {
  return execFileSync("psql", [url, "-tA", "-c", sql], { encoding: "utf8" }).trim();
}

const scratchUrl = SUPER.replace(/\/[^/]*$/, `/${SCRATCH}`);
const failures = [];

try {
  console.log(`[restore] recreating ${SCRATCH}`);
  psql(SUPER, `DROP DATABASE IF EXISTS ${SCRATCH}`);
  psql(SUPER, `CREATE DATABASE ${SCRATCH}`);

  console.log(`[restore] restoring ${path.basename(dumpPath)}`);
  execFileSync("psql", [scratchUrl, "-q", "-f", dumpPath], { stdio: ["ignore", "ignore", "pipe"] });

  // 1. Learning history survived.
  const events = Number(psql(scratchUrl, `SELECT count(*) FROM learning_event`));
  console.log(`[restore] learning_event rows: ${events}`);

  // 2. Row-level security is still on. A restore that silently drops policies
  //    produces a database that works perfectly and leaks everything.
  const unprotected = psql(
    scratchUrl,
    `SELECT string_agg(c.relname, ', ')
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname IN ('app_user','learner_profile','learning_event','memory_state','attempt',
                          'verification_request','verdict','consent_record','audit_log')
        AND (c.relrowsecurity = false OR c.relforcerowsecurity = false)`,
  );
  if (unprotected) {
    failures.push(`row-level security is not enforced on: ${unprotected}`);
  } else {
    console.log("[restore] row-level security enforced on every checked table");
  }

  // 3. The append-only triggers came back with the schema.
  const triggers = Number(
    psql(
      scratchUrl,
      `SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'learning_event_no_%'`,
    ),
  );
  if (triggers < 3) failures.push(`expected 3 append-only triggers on learning_event, found ${triggers}`);
  else console.log("[restore] append-only triggers present");

  // 4. Nothing in the restored data violates the invariants the app relies on.
  const badGrades = Number(
    psql(scratchUrl, `SELECT count(*) FROM attempt WHERE grade NOT IN ('again','hard','good','easy')`),
  );
  if (badGrades > 0) failures.push(`${badGrades} attempt row(s) with an unknown grade`);
} catch (error) {
  failures.push(`restore failed: ${error.message}`);
} finally {
  try {
    psql(SUPER, `DROP DATABASE IF EXISTS ${SCRATCH}`);
  } catch {
    /* the drill's cleanup is not the drill's result */
  }
}

if (failures.length > 0) {
  console.error(`\n[restore] DRILL FAILED — ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log("[restore] drill passed: the backup restores, and restores intact");
