/**
 * Shared PostgreSQL seeding for integration suites.
 *
 * Each suite creates and seeds its **own** database. Two suites sharing one
 * database race: whichever drops the schema first wins, and the failure
 * looks like a flake rather than the coupling it is.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

export const ORG = "11111111-1111-4111-8111-111111111111";
export const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
export const ACADEMY = "11111111-1111-4111-8111-111111111112";
export const CLASSROOM = "11111111-1111-4111-8111-111111111113";
export const TEACHER = "11111111-1111-4111-8111-111111111114";
export const LEARNER = "11111111-1111-4111-8111-111111111115";
export const CORPUS = "11111111-1111-4111-8111-111111111116";
export const AYAH = "11111111-1111-4111-8111-111111111117";
export const PASSAGE = "11111111-1111-4111-8111-111111111118";

const BASE_URL =
  process.env["ATHAR_TEST_DATABASE_URL"] ??
  "postgres://postgres:postgres@127.0.0.1:5432/athar_pg_test";

export function connectionFor(database: string): string {
  const url = new URL(BASE_URL);
  url.pathname = `/${database}`;
  return url.toString();
}

/** Run a command as the database superuser when the test runs as root. */
export function asPostgres(command: string): string {
  if (process.getuid?.() === 0)
    return execFileSync("su", ["postgres", "-c", command], { encoding: "utf8" });
  return execFileSync("bash", ["-c", command], { encoding: "utf8" });
}

export async function databaseReachable(): Promise<boolean> {
  const probe = new pg.Pool({
    connectionString: BASE_URL,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.query("SELECT 1");
    await probe.end();
    return true;
  } catch {
    await probe.end().catch(() => undefined);
    return false;
  }
}

export function recreateDatabase(database: string): void {
  asPostgres(`dropdb --if-exists ${database}`);
  asPostgres(`createdb ${database}`);
}

/**
 * Apply every migration and seed the fixtures a journey needs but does not
 * create: organizations, people, an approved corpus, and a released passage.
 */
export async function migrateAndSeed(pool: pg.Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const migrations = join(process.cwd(), "db", "migrations");
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

    await client.query(
      `INSERT INTO organization (id, name) VALUES ($1,'Org A'),($2,'Org B')`,
      [ORG, OTHER_ORG],
    );
    await client.query(
      `INSERT INTO academy (id, organization_id, name, territory)
       VALUES ($1,$2,'Academy A','GB')`,
      [ACADEMY, ORG],
    );
    await client.query(
      `INSERT INTO classroom (id, organization_id, academy_id, name)
       VALUES ($1,$2,$3,'Hifz 2')`,
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
    await client.query(
      `INSERT INTO surah (corpus_version_id, number, ayah_count) VALUES ($1,1,1)`,
      [CORPUS],
    );
    await client.query(
      `INSERT INTO ayah (id, corpus_version_id, surah_number, number_in_surah)
       VALUES ($1,$2,1,1)`,
      [AYAH, CORPUS],
    );
    await client.query(
      `INSERT INTO passage
         (id, organization_id, corpus_version_id, label, start_ayah_id, end_ayah_id,
          segment_count, released, release_blocks, released_at, released_by_user_id)
       VALUES ($1,$2,$3,'Al-Mulk 12-15',$4,$4,1,true,'{}', now(), $5)`,
      [PASSAGE, ORG, CORPUS, AYAH, TEACHER],
    );
  } finally {
    client.release();
  }
}
