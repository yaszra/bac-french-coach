/**
 * Process-wide database access.
 *
 * One pool, created lazily, so a route that never touches the database
 * does not open a connection. The application role is set per transaction
 * in `PgDatabase`, not here.
 */
import pg from "pg";
import { PgDatabase } from "../application/pg-store.js";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString)
      throw new Error("DATABASE_URL is not set; refusing to guess a database.");
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export function getDatabase(): PgDatabase {
  const role = process.env["ATHAR_APP_ROLE"];
  return new PgDatabase(getPool(), role ? { applicationRole: role } : {});
}
