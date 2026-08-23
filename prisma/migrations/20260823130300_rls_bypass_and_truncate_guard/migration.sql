-- Closing a hole found by testing the append-only guarantee: row-level triggers
-- do not fire for TRUNCATE, so all learning history could be erased in one
-- statement. Statement-level BEFORE TRUNCATE triggers close it.
--
-- (Role attributes — BYPASSRLS on the migration role — are provisioning, not
-- schema; they live in prisma/provision.sql and are applied by a superuser
-- before the first migration. A migration cannot grant itself privileges it
-- does not hold, and should not try.)

CREATE OR REPLACE FUNCTION learning_event_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'learning_event is append-only (TRUNCATE refused)'
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER learning_event_no_truncate
  BEFORE TRUNCATE ON learning_event
  FOR EACH STATEMENT EXECUTE FUNCTION learning_event_no_truncate();

CREATE TRIGGER verdict_no_truncate
  BEFORE TRUNCATE ON verdict
  FOR EACH STATEMENT EXECUTE FUNCTION learning_event_no_truncate();

REVOKE TRUNCATE ON learning_event, verdict FROM itqan_app;
