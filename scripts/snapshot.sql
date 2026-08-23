-- Generated companion to src/application/reconciliation.ts SNAPSHOT_SQL.
-- Kept in sync by tests/reconciliation.test.ts, which compares the two.
SELECT json_build_object(
  'corpusVersions', COALESCE((
    SELECT json_agg(json_build_object(
      'corpusVersionId', cv.id::text,
      'sha256', cv.sha256,
      'lifecycle', cv.lifecycle::text,
      'wordCount', (SELECT count(*)::int FROM word w WHERE w.corpus_version_id = cv.id),
      'layoutTokenCount', (SELECT count(*)::int FROM layout_token lt WHERE lt.corpus_version_id = cv.id)
    )) FROM corpus_version cv), '[]'::json),
  'attemptCount', (SELECT count(*)::int FROM attempt),
  'verificationCount', (SELECT count(*)::int FROM oral_verification),
  'correctionCount', (SELECT count(*)::int FROM correction),
  'learningEventCount', (SELECT count(*)::int FROM learning_event),
  'outboxPendingCount', (
    SELECT count(*)::int FROM outbox_message
     WHERE delivered_at IS NULL AND dead_lettered_at IS NULL),
  'danglingReferences', 0,
  'sequenceHighWaterMarks', json_build_object(
    'outbox_message_id_seq', COALESCE((SELECT max(id)::int FROM outbox_message), 0),
    'audit_log_id_seq', COALESCE((SELECT max(id)::int FROM audit_log), 0)
  )
) AS snapshot;
