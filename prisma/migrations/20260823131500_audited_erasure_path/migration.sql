-- The append-only guarantee and the right to erasure both have to be true.
--
-- Erasure is therefore not an exception to immutability; it is a NAMED path
-- through it. A statement may modify learning_event only while the transaction
-- declares which data request authorises it:
--
--     SET LOCAL app.erasure_request_id = '<DataRequest id>';
--
-- The application role cannot use this path at all — UPDATE and DELETE are
-- revoked from it — so only an audited maintenance job running as the owner can
-- erase, and every erasure names the request that asked for it.

CREATE OR REPLACE FUNCTION learning_event_is_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  authorising_request text := nullif(current_setting('app.erasure_request_id', true), '');
BEGIN
  IF authorising_request IS NULL THEN
    RAISE EXCEPTION 'learning_event is append-only (attempted %)', TG_OP
      USING ERRCODE = 'restrict_violation';
  END IF;

  INSERT INTO erasure_log (id, "requestId", "tableName", operation, "rowId", "erasedAt")
  VALUES (
    gen_random_uuid()::text,
    authorising_request,
    TG_TABLE_NAME,
    TG_OP,
    COALESCE(OLD.id, NEW.id),
    now()
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

-- Erasures are themselves a permanent record: what was removed, under which
-- request, and when. This table has no delete path of its own.
CREATE TABLE erasure_log (
  id          text PRIMARY KEY,
  "requestId" text NOT NULL,
  "tableName" text NOT NULL,
  operation   text NOT NULL,
  "rowId"     text NOT NULL,
  "erasedAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX erasure_log_request_idx ON erasure_log ("requestId");
GRANT SELECT ON erasure_log TO itqan_app;

-- TRUNCATE stays absolutely refused: erasure is per-subject, never wholesale.
