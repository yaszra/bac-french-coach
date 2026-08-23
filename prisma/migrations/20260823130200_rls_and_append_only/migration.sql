-- Row-level security and the append-only guarantee.
--
-- Tenancy is enforced by the database, not by discipline in the query layer.
-- Every tenant-owned table is FORCE ROW LEVEL SECURITY, so even the table owner
-- is subject to the policy; the application connects as a non-owning role.
--
-- The tenant context is a transaction-local GUC set by withTenant():
--     SET LOCAL app.organization_id = '<org id>';
-- With no context set, current_setting(..., true) is NULL and every policy
-- evaluates false: a query without tenant context returns zero rows. It never
-- silently returns another organisation's data.

-- ── The application role ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqan_app') THEN
    CREATE ROLE itqan_app LOGIN NOSUPERUSER NOCREATEDB NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO itqan_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO itqan_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO itqan_app;

CREATE OR REPLACE FUNCTION app_current_organization() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')
$$;

-- ── Tenant-scoped tables ─────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'app_user', 'role_grant', 'relationship', 'learner_profile', 'classroom',
    'enrollment', 'assignment', 'learning_event', 'memory_state', 'attempt',
    'verification_request', 'verdict', 'consent_record', 'data_request',
    'audit_log', 'feature_flag_assignment', 'report_run', 'notification',
    'khatma_flag'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON %I
        USING ("organizationId" = app_current_organization())
        WITH CHECK ("organizationId" = app_current_organization())
    $p$, t);
  END LOOP;
END
$$;

-- The organisation row itself: readable only as your own organisation.
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organization
  USING (id = app_current_organization())
  WITH CHECK (id = app_current_organization());

-- Child tables keyed only by their parent: scoped through the parent row.
ALTER TABLE assignment_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignment_target FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assignment_target
  USING (EXISTS (
    SELECT 1 FROM assignment a
    WHERE a.id = assignment_target."assignmentId"
      AND a."organizationId" = app_current_organization()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM assignment a
    WHERE a.id = assignment_target."assignmentId"
      AND a."organizationId" = app_current_organization()));

ALTER TABLE credential ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credential
  USING (EXISTS (
    SELECT 1 FROM app_user u
    WHERE u.id = credential."userId"
      AND u."organizationId" = app_current_organization()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM app_user u
    WHERE u.id = credential."userId"
      AND u."organizationId" = app_current_organization()));

ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "session"
  USING ("organizationId" = app_current_organization())
  WITH CHECK ("organizationId" = app_current_organization());

-- ── The append-only guarantee ────────────────────────────────────────────────
-- LearningEvent is the source of truth. Nothing may edit or erase history.
-- (Erasure requests are served by a dedicated, audited maintenance path that
-- runs as the owner role outside this policy — see the privacy module.)
REVOKE UPDATE, DELETE ON learning_event FROM itqan_app;

CREATE OR REPLACE FUNCTION learning_event_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'learning_event is append-only (attempted %)', TG_OP
    USING ERRCODE = 'restrict_violation';
END
$$;

CREATE TRIGGER learning_event_no_update
  BEFORE UPDATE ON learning_event
  FOR EACH ROW EXECUTE FUNCTION learning_event_is_append_only();

CREATE TRIGGER learning_event_no_delete
  BEFORE DELETE ON learning_event
  FOR EACH ROW EXECUTE FUNCTION learning_event_is_append_only();

-- Verdicts are a human's word: correcting one means recording a new one.
CREATE TRIGGER verdict_no_update
  BEFORE UPDATE ON verdict
  FOR EACH ROW EXECUTE FUNCTION learning_event_is_append_only();

-- ── Integrity checks that belong in the database ─────────────────────────────
ALTER TABLE memory_state
  ADD CONSTRAINT memory_state_bounds CHECK (
    stability >= 0 AND difficulty >= 1 AND difficulty <= 10
    AND confidence >= 0 AND confidence <= 1
    AND reps >= 0 AND lapses >= 0
  );

ALTER TABLE attempt
  ADD CONSTRAINT attempt_grade_vocabulary CHECK (grade IN ('again', 'hard', 'good', 'easy'));

ALTER TABLE verdict
  ADD CONSTRAINT verdict_vocabulary CHECK (verdict IN ('passed', 'needs_work', 'not_attempted'));

ALTER TABLE audio_asset
  ADD CONSTRAINT audio_provenance_vocabulary CHECK (provenance IN ('human', 'studio_synth', 'library'));
