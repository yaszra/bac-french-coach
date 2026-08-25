-- Provisioning — run ONCE by a superuser before the first migration, on every
-- environment. Role attributes are not schema and never belong in a migration.
--
--   psql "$SUPERUSER_URL" -f prisma/provision.sql
--
-- Two roles, deliberately:
--   itqan      — owns the schema, runs migrations, runs audited maintenance
--                (projection rebuild, erasure). BYPASSRLS, because FORCE ROW
--                LEVEL SECURITY binds even the owner.
--   itqan_app  — the runtime role every request handler connects as. No
--                BYPASSRLS, ever. Without a tenant context it sees nothing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqan') THEN
    CREATE ROLE itqan LOGIN CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqan_app') THEN
    CREATE ROLE itqan_app LOGIN NOSUPERUSER NOCREATEDB NOINHERIT;
  END IF;
END
$$;

ALTER ROLE itqan BYPASSRLS;
ALTER ROLE itqan_app NOBYPASSRLS;

-- Passwords are set per environment from secrets, never committed:
--   ALTER ROLE itqan PASSWORD :'migrator_password';
--   ALTER ROLE itqan_app PASSWORD :'app_password';
