-- The erasure log was writable by the application role, which defeats its
-- purpose: an attacker able to erase data could then erase the record of having
-- erased it. Found by a red-team test, not by reading the schema.
--
-- Two causes, both fixed here:
--   1. The table was created after the blanket GRANT, and picked up write
--      privileges from ALTER DEFAULT PRIVILEGES instead.
--   2. Nothing ever revoked them.
--
-- The log is append-only from the trigger's point of view and read-only from
-- the application's. Even the owning role cannot rewrite history in it.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON erasure_log FROM itqan_app;
GRANT SELECT ON erasure_log TO itqan_app;

-- Default privileges are a footgun: every future table would silently arrive
-- writable by the application. Grants are made explicitly, per table, from here
-- on, so a new table is unreachable until someone decides it should not be.
ALTER DEFAULT PRIVILEGES FOR ROLE itqan IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM itqan_app;
ALTER DEFAULT PRIVILEGES FOR ROLE itqan IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM itqan_app;

-- Re-grant, explicitly, what the application actually needs today.
DO $$
DECLARE
  t text;
  app_tables text[] := ARRAY[
    'organization', 'app_user', 'credential', 'session', 'role_grant', 'relationship',
    'learner_profile', 'classroom', 'enrollment', 'assignment', 'assignment_target',
    'memory_state', 'attempt', 'verification_request', 'verdict', 'skill', 'skill_edge',
    'audio_asset', 'consent_record', 'data_request', 'audit_log', 'feature_flag',
    'feature_flag_assignment', 'report_run', 'notification', 'khatma_flag',
    'projection_checkpoint'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO itqan_app', t);
  END LOOP;
END
$$;

-- learning_event stays insert-and-read only: history is appended, never edited.
GRANT SELECT, INSERT ON learning_event TO itqan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON learning_event FROM itqan_app;

-- A verdict is a person's word. Correcting one means recording a new one.
REVOKE UPDATE, DELETE, TRUNCATE ON verdict FROM itqan_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO itqan_app;
