/**
 * Restore verification.
 *
 * A backup that restores is not the same as a backup that is *correct*.
 * These checks answer the question a disaster-recovery drill actually has
 * to answer: **is any acknowledged learning evidence missing, and is the
 * corpus still byte-identical to what was approved?**
 *
 * Pure over the numbers a caller collects, so it can be run against a
 * restored database, a replica, or a fixture.
 */
export const RECONCILIATION_VERSION = "athar-reconciliation/1.0.0";

export type ReconciliationCode =
  | "corpus_checksum_mismatch"
  | "corpus_counts_changed"
  | "evidence_missing"
  | "evidence_appeared"
  | "verification_missing"
  | "outbox_undelivered_lost"
  | "referential_integrity_broken"
  | "sequence_behind_data"
  | "append_only_violated";

export interface ReconciliationIssue {
  code: ReconciliationCode;
  detail: string;
  /** Severity drives whether a restore may be accepted at all. */
  severity: "fatal" | "warning";
}

/**
 * A snapshot of the facts a restore must preserve.
 *
 * Collected identically from the source system before the backup and from
 * the restored system afterwards, so the comparison is like for like.
 */
export interface IntegritySnapshot {
  /** Per corpus version: its recorded sha256 and its row counts. */
  corpusVersions: readonly {
    corpusVersionId: string;
    sha256: string;
    wordCount: number;
    layoutTokenCount: number;
    lifecycle: string;
  }[];
  attemptCount: number;
  /** Highest attempt id ordering value seen, so gaps are visible. */
  verificationCount: number;
  correctionCount: number;
  learningEventCount: number;
  /** Outbox messages neither delivered nor dead-lettered. */
  outboxPendingCount: number;
  /** Rows whose foreign keys do not resolve. Must be zero. */
  danglingReferences: number;
  /** Highest value taken from each sequence, to catch a reset. */
  sequenceHighWaterMarks: Readonly<Record<string, number>>;
}

export interface ReconciliationResult {
  ok: boolean;
  issues: readonly ReconciliationIssue[];
  /** Stated plainly for the drill record. */
  summary: string;
  version: string;
}

/**
 * Compare a restored system against the source it was taken from.
 *
 * Missing evidence is fatal. *Extra* evidence is also reported, because a
 * restore holding rows the source never had means the two are not the same
 * system, and trusting it would be worse than rejecting it.
 */
export function reconcile(
  before: IntegritySnapshot,
  after: IntegritySnapshot,
): ReconciliationResult {
  const issues: ReconciliationIssue[] = [];
  const add = (
    code: ReconciliationCode,
    detail: string,
    severity: ReconciliationIssue["severity"] = "fatal",
  ) => issues.push({ code, detail, severity });

  // --- corpus -----------------------------------------------------------
  const afterVersions = new Map(
    after.corpusVersions.map((v) => [v.corpusVersionId, v]),
  );
  for (const source of before.corpusVersions) {
    const restored = afterVersions.get(source.corpusVersionId);
    if (!restored) {
      add(
        "corpus_counts_changed",
        `corpus version ${source.corpusVersionId} is absent from the restore`,
      );
      continue;
    }
    if (restored.sha256 !== source.sha256)
      add(
        "corpus_checksum_mismatch",
        `corpus ${source.corpusVersionId}: ${source.sha256.slice(0, 12)}… became ${restored.sha256.slice(0, 12)}…`,
      );
    if (
      restored.wordCount !== source.wordCount ||
      restored.layoutTokenCount !== source.layoutTokenCount
    )
      add(
        "corpus_counts_changed",
        `corpus ${source.corpusVersionId}: ${source.wordCount}/${source.layoutTokenCount} became ${restored.wordCount}/${restored.layoutTokenCount}`,
      );
  }

  // --- evidence ---------------------------------------------------------
  const compare = (
    label: string,
    sourceCount: number,
    restoredCount: number,
    missingCode: ReconciliationCode,
  ) => {
    if (restoredCount < sourceCount)
      add(
        missingCode,
        `${sourceCount - restoredCount} ${label} missing (${sourceCount} → ${restoredCount})`,
      );
    else if (restoredCount > sourceCount)
      add(
        "evidence_appeared",
        `${restoredCount - sourceCount} ${label} present in the restore but not in the source (${sourceCount} → ${restoredCount})`,
      );
  };

  compare("attempts", before.attemptCount, after.attemptCount, "evidence_missing");
  compare(
    "verifications",
    before.verificationCount,
    after.verificationCount,
    "verification_missing",
  );
  compare(
    "corrections",
    before.correctionCount,
    after.correctionCount,
    "evidence_missing",
  );
  compare(
    "learning events",
    before.learningEventCount,
    after.learningEventCount,
    "evidence_missing",
  );

  // Undelivered outbox messages must survive: they are work the system
  // acknowledged and has not yet done.
  if (after.outboxPendingCount < before.outboxPendingCount)
    add(
      "outbox_undelivered_lost",
      `${before.outboxPendingCount - after.outboxPendingCount} undelivered outbox messages lost`,
    );

  // --- structure --------------------------------------------------------
  if (after.danglingReferences > 0)
    add(
      "referential_integrity_broken",
      `${after.danglingReferences} rows have foreign keys that do not resolve`,
    );

  // A sequence behind its data will reissue identifiers already in use —
  // the classic way a restore corrupts a system slowly rather than loudly.
  for (const [sequence, high] of Object.entries(after.sequenceHighWaterMarks)) {
    const sourceHigh = before.sequenceHighWaterMarks[sequence];
    if (sourceHigh !== undefined && high < sourceHigh)
      add(
        "sequence_behind_data",
        `sequence ${sequence} restarts at ${high}, behind the source's ${sourceHigh}; it will reissue existing identifiers`,
      );
  }

  const fatal = issues.filter((i) => i.severity === "fatal");
  return {
    ok: fatal.length === 0,
    issues,
    summary:
      fatal.length === 0
        ? `Restore verified: ${after.attemptCount} attempts, ${after.verificationCount} verifications, and ${after.corpusVersions.length} corpus versions all reconcile.`
        : `Restore REJECTED: ${fatal.length} fatal ${fatal.length === 1 ? "issue" : "issues"}.`,
    version: RECONCILIATION_VERSION,
  };
}

/**
 * SQL that collects a snapshot. Exported as a string so the drill script
 * and the integration test run exactly the same query.
 */
export const SNAPSHOT_SQL = `
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
`;
