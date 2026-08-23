/**
 * PostgreSQL repository adapter.
 *
 * Implements the same port the in-memory adapter does, so the command
 * layer and every learning rule are identical in tests and in production.
 *
 * Two things it does that the in-memory adapter cannot:
 *  - real transactions, so state and its justifying events commit together
 *  - a tenant session variable, so row-level security applies as defence
 *    in depth beneath the application's own tenant checks
 */
import type { Pool, PoolClient } from "pg";
import type {
  AssignmentId,
  AttemptId,
  CorrectionCategory,
  EpochMs,
  LearnerId,
  MemoryTargetId,
  MemoryTargetKind,
  ScaffoldLevel,
  StartContext,
  VerificationDecision,
  LearningState,
} from "../core/types.js";
import type {
  AssignmentPolicyVersionRecord,
  AssignmentRecord,
  AttemptRecord,
  CorrectionRecord,
  Database,
  EventSink,
  ListenRecord,
  MemoryStateRecord,
  PassageRecord,
  RecitationRequestRecord,
  Repository,
  TxContext,
  TxScope,
  VerificationRecord,
} from "./repository.js";
import type { Enrollment, GuardianRelationship, Role } from "../auth/policy.js";
import type { LearningEventEnvelope } from "./events.js";

const ms = (d: Date | null): EpochMs | null => (d ? d.getTime() : null);
const ts = (v: EpochMs): Date => new Date(v);
const num = (v: string | number | null): number => (v === null ? 0 : Number(v));

/** Row shapes, named so the mapping functions stay readable. */
type Row = Record<string, unknown>;

export class PgRepository implements Repository {
  constructor(private readonly client: PoolClient) {}

  private async query(sql: string, params: unknown[] = []): Promise<Row[]> {
    const result = await this.client.query(sql, params);
    return result.rows as Row[];
  }

  // --- passages ---------------------------------------------------------

  async getPassage(passageId: string): Promise<PassageRecord | undefined> {
    const [row] = await this.query(
      `SELECT id, organization_id, corpus_version_id, label, start_ayah_id,
              end_ayah_id, segment_count, released, release_blocks
         FROM passage WHERE id = $1`,
      [passageId],
    );
    if (!row) return undefined;
    return {
      passageId: row["id"] as string,
      organizationId: row["organization_id"] as string,
      corpusVersionId: row["corpus_version_id"] as string,
      label: row["label"] as string,
      startAyahId: row["start_ayah_id"] as string,
      endAyahId: row["end_ayah_id"] as string,
      segmentCount: num(row["segment_count"] as number),
      released: row["released"] as boolean,
      releaseBlocks: (row["release_blocks"] as string[]) ?? [],
    };
  }

  async putPassage(r: PassageRecord): Promise<void> {
    await this.query(
      `INSERT INTO passage (id, organization_id, corpus_version_id, label,
                            start_ayah_id, end_ayah_id, segment_count,
                            released, release_blocks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label,
         segment_count = EXCLUDED.segment_count,
         released = EXCLUDED.released,
         release_blocks = EXCLUDED.release_blocks`,
      [
        r.passageId,
        r.organizationId,
        r.corpusVersionId,
        r.label,
        r.startAyahId,
        r.endAyahId,
        r.segmentCount,
        r.released,
        r.releaseBlocks,
      ],
    );
  }

  // --- assignments ------------------------------------------------------

  private async hydrateAssignment(row: Row): Promise<AssignmentRecord> {
    const segments = await this.query(
      `SELECT id FROM segment WHERE assignment_id = $1 ORDER BY ordinal`,
      [row["id"]],
    );
    return {
      assignmentId: row["id"] as AssignmentId,
      organizationId: row["organization_id"] as string,
      academyId: row["academy_id"] as string,
      classroomId: row["classroom_id"] as string,
      learnerId: row["learner_id"] as LearnerId,
      ownerUserId: row["owner_user_id"] as string,
      ownerRole: row["owner_role"] as Role,
      targetId: row["memory_target_id"] as MemoryTargetId,
      targetKind: row["target_kind"] as MemoryTargetKind,
      passageId: row["passage_id"] as string,
      label: row["label"] as string,
      corpusVersionId: row["corpus_version_id"] as string,
      segmentIds: segments.map((s) => s["id"] as string),
      currentPolicyVersion: row["current_policy_version"] as string,
      estimatedActiveMinutes: num(row["estimated_active_minutes"] as number),
      createdAt: ms(row["created_at"] as Date)!,
      dueAt: ms(row["due_at"] as Date)!,
    };
  }

  private readonly assignmentSelect = `
    SELECT a.id, a.organization_id, a.academy_id, a.classroom_id, a.learner_id,
           a.owner_user_id, a.owner_role, a.memory_target_id, a.passage_id,
           a.current_policy_version, a.estimated_active_minutes,
           a.created_at, a.due_at,
           p.label, p.corpus_version_id, t.kind AS target_kind
      FROM assignment a
      JOIN passage p ON p.id = a.passage_id
      JOIN memory_target t ON t.id = a.memory_target_id`;

  async getAssignment(id: AssignmentId): Promise<AssignmentRecord | undefined> {
    const [row] = await this.query(`${this.assignmentSelect} WHERE a.id = $1`, [id]);
    return row ? this.hydrateAssignment(row) : undefined;
  }

  async saveAssignment(r: AssignmentRecord): Promise<void> {
    // The memory target belongs to the assignment's learner and is created
    // alongside it; the command layer owns its identifier.
    await this.query(
      `INSERT INTO memory_target (id, organization_id, learner_id, kind, passage_id)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [r.targetId, r.organizationId, r.learnerId, r.targetKind, r.passageId],
    );
    await this.query(
      `INSERT INTO assignment (id, organization_id, academy_id, classroom_id,
                               learner_id, passage_id, memory_target_id,
                               owner_user_id, owner_role, current_policy_version,
                               estimated_active_minutes, created_at, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET
         current_policy_version = EXCLUDED.current_policy_version,
         due_at = EXCLUDED.due_at`,
      [
        r.assignmentId,
        r.organizationId,
        r.academyId,
        r.classroomId,
        r.learnerId,
        r.passageId,
        r.targetId,
        r.ownerUserId,
        r.ownerRole,
        r.currentPolicyVersion,
        r.estimatedActiveMinutes,
        ts(r.createdAt),
        ts(r.dueAt),
      ],
    );
    for (const [i, segmentId] of r.segmentIds.entries())
      await this.query(
        `INSERT INTO segment (id, assignment_id, ordinal) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO NOTHING`,
        [segmentId, r.assignmentId, i + 1],
      );
  }

  async listAssignmentsForLearner(
    learnerId: LearnerId,
  ): Promise<readonly AssignmentRecord[]> {
    const rows = await this.query(
      `${this.assignmentSelect} WHERE a.learner_id = $1 ORDER BY a.created_at`,
      [learnerId],
    );
    const out: AssignmentRecord[] = [];
    for (const row of rows) out.push(await this.hydrateAssignment(row));
    return out;
  }

  // --- policy versions --------------------------------------------------

  async putPolicyVersion(r: AssignmentPolicyVersionRecord): Promise<void> {
    await this.query(
      `INSERT INTO assignment_policy_version
         (assignment_id, policy_version, required_listens,
          required_independent_recalls, required_non_serial_recalls,
          created_at, created_by_user_id, supersedes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        r.assignmentId,
        r.policyVersion,
        r.policy.requiredListens,
        r.policy.requiredIndependentRecalls,
        r.policy.requiredNonSerialRecalls,
        ts(r.createdAt),
        r.createdByUserId,
        r.supersedes,
      ],
    );
  }

  async getPolicyVersion(
    assignmentId: AssignmentId,
    policyVersion: string,
  ): Promise<AssignmentPolicyVersionRecord | undefined> {
    const [row] = await this.query(
      `SELECT * FROM assignment_policy_version
        WHERE assignment_id = $1 AND policy_version = $2`,
      [assignmentId, policyVersion],
    );
    if (!row) return undefined;
    return {
      assignmentId: row["assignment_id"] as AssignmentId,
      policyVersion: row["policy_version"] as string,
      policy: {
        policyVersion: row["policy_version"] as string,
        requiredListens: num(row["required_listens"] as number),
        requiredIndependentRecalls: num(row["required_independent_recalls"] as number),
        requiredNonSerialRecalls: num(row["required_non_serial_recalls"] as number),
      },
      createdAt: ms(row["created_at"] as Date)!,
      createdByUserId: row["created_by_user_id"] as string,
      supersedes: (row["supersedes"] as string | null) ?? null,
    };
  }

  // --- memory state -----------------------------------------------------

  private toMemoryState(row: Row): MemoryStateRecord {
    const record: MemoryStateRecord = {
      targetId: row["memory_target_id"] as MemoryTargetId,
      assignmentId: row["assignment_id"] as AssignmentId,
      learnerId: row["learner_id"] as LearnerId,
      organizationId: row["organization_id"] as string,
      state: row["state"] as LearningState,
      stateContext: {
        delayedSuccesses: num(row["delayed_successes"] as number),
        longestSuccessfulDelayDays: num(row["longest_delay_days"] as string),
      },
      progress: {
        independentRecalls: num(row["independent_recalls"] as number),
        nonSerialIndependentRecalls: num(row["non_serial_recalls"] as number),
        listensCompleted: num(row["listens_completed"] as number),
      },
      engineVersion: row["engine_version"] as string,
      policyVersion: row["policy_version"] as string,
      reason: row["reason"] as string,
      updatedAt: ms(row["updated_at"] as Date)!,
    };
    // Scheduling exists only once a human verification has set a baseline.
    if (row["stability_days"] !== null && row["last_reviewed_at"] !== null)
      record.scheduling = {
        stabilityDays: num(row["stability_days"] as string),
        difficulty: num(row["difficulty"] as string),
        lastReviewedAt: ms(row["last_reviewed_at"] as Date)!,
        nextReviewAt: ms(row["next_review_at"] as Date)!,
        algorithmVersion: row["algorithm_version"] as string,
      };
    return record;
  }

  async getMemoryState(
    targetId: MemoryTargetId,
  ): Promise<MemoryStateRecord | undefined> {
    const [row] = await this.query(
      `SELECT * FROM memory_state WHERE memory_target_id = $1`,
      [targetId],
    );
    return row ? this.toMemoryState(row) : undefined;
  }

  async saveMemoryState(r: MemoryStateRecord): Promise<void> {
    await this.query(
      `INSERT INTO memory_state
         (memory_target_id, organization_id, assignment_id, learner_id, state,
          delayed_successes, longest_delay_days, independent_recalls,
          non_serial_recalls, listens_completed, stability_days, difficulty,
          last_reviewed_at, next_review_at, engine_version, algorithm_version,
          policy_version, reason, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (memory_target_id) DO UPDATE SET
         state = EXCLUDED.state,
         delayed_successes = EXCLUDED.delayed_successes,
         longest_delay_days = EXCLUDED.longest_delay_days,
         independent_recalls = EXCLUDED.independent_recalls,
         non_serial_recalls = EXCLUDED.non_serial_recalls,
         listens_completed = EXCLUDED.listens_completed,
         stability_days = EXCLUDED.stability_days,
         difficulty = EXCLUDED.difficulty,
         last_reviewed_at = EXCLUDED.last_reviewed_at,
         next_review_at = EXCLUDED.next_review_at,
         engine_version = EXCLUDED.engine_version,
         algorithm_version = EXCLUDED.algorithm_version,
         policy_version = EXCLUDED.policy_version,
         reason = EXCLUDED.reason,
         updated_at = EXCLUDED.updated_at`,
      [
        r.targetId,
        r.organizationId,
        r.assignmentId,
        r.learnerId,
        r.state,
        r.stateContext.delayedSuccesses,
        r.stateContext.longestSuccessfulDelayDays,
        r.progress.independentRecalls,
        r.progress.nonSerialIndependentRecalls,
        r.progress.listensCompleted,
        r.scheduling?.stabilityDays ?? null,
        r.scheduling?.difficulty ?? null,
        r.scheduling ? ts(r.scheduling.lastReviewedAt) : null,
        r.scheduling ? ts(r.scheduling.nextReviewAt) : null,
        r.engineVersion,
        r.scheduling?.algorithmVersion ?? null,
        r.policyVersion,
        r.reason,
        ts(r.updatedAt),
      ],
    );
  }

  async listMemoryStatesForLearner(
    learnerId: LearnerId,
  ): Promise<readonly MemoryStateRecord[]> {
    const rows = await this.query(
      `SELECT * FROM memory_state WHERE learner_id = $1`,
      [learnerId],
    );
    return rows.map((r) => this.toMemoryState(r));
  }

  // --- attempts (append-only; the table has a trigger to match) ----------

  private async hydrateAttempt(row: Row): Promise<AttemptRecord> {
    const assistance = await this.query(
      `SELECT kind FROM assistance_event WHERE attempt_id = $1 ORDER BY kind`,
      [row["id"]],
    );
    const [confidence] = await this.query(
      `SELECT judgment FROM confidence_response WHERE attempt_id = $1`,
      [row["id"]],
    );
    const record: AttemptRecord = {
      attemptId: row["id"] as AttemptId,
      targetId: row["memory_target_id"] as MemoryTargetId,
      assignmentId: row["assignment_id"] as AssignmentId,
      segmentId: row["segment_id"] as string,
      learnerId: row["learner_id"] as LearnerId,
      organizationId: row["organization_id"] as string,
      occurredAt: ms(row["occurred_at"] as Date)!,
      scaffoldLevel: row["scaffold_level"] as ScaffoldLevel,
      startContext: row["start_context"] as StartContext,
      correct: row["correct"] as boolean,
      hesitant: row["hesitant"] as boolean,
      assistance: assistance.map((a) => a["kind"] as AttemptRecord["assistance"][number]),
      evidenceClass: row["evidence_class"] as AttemptRecord["evidenceClass"],
      policyVersion: row["policy_version"] as string,
      idempotencyKey: row["idempotency_key"] as string,
    };
    if (confidence)
      record.confidence = confidence["judgment"] as NonNullable<
        AttemptRecord["confidence"]
      >;
    return record;
  }

  async appendAttempt(r: AttemptRecord): Promise<void> {
    await this.query(
      `INSERT INTO attempt
         (id, organization_id, assignment_id, segment_id, memory_target_id,
          learner_id, occurred_at, scaffold_level, start_context, correct,
          hesitant, evidence_class, policy_version, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        r.attemptId,
        r.organizationId,
        r.assignmentId,
        r.segmentId,
        r.targetId,
        r.learnerId,
        ts(r.occurredAt),
        r.scaffoldLevel,
        r.startContext,
        r.correct,
        r.hesitant,
        r.evidenceClass,
        r.policyVersion,
        r.idempotencyKey,
      ],
    );
    for (const kind of r.assistance)
      await this.query(
        `INSERT INTO assistance_event (attempt_id, kind) VALUES ($1,$2)`,
        [r.attemptId, kind],
      );
    if (r.confidence)
      await this.query(
        `INSERT INTO confidence_response (attempt_id, judgment) VALUES ($1,$2)`,
        [r.attemptId, r.confidence],
      );
  }

  async listAttempts(assignmentId: AssignmentId): Promise<readonly AttemptRecord[]> {
    const rows = await this.query(
      `SELECT * FROM attempt WHERE assignment_id = $1 ORDER BY occurred_at, id`,
      [assignmentId],
    );
    const out: AttemptRecord[] = [];
    for (const row of rows) out.push(await this.hydrateAttempt(row));
    return out;
  }

  async findAttemptByIdempotencyKey(key: string): Promise<AttemptRecord | undefined> {
    const [row] = await this.query(`SELECT * FROM attempt WHERE idempotency_key = $1`, [
      key,
    ]);
    return row ? this.hydrateAttempt(row) : undefined;
  }

  // --- listens ----------------------------------------------------------

  async appendListen(r: ListenRecord): Promise<void> {
    const [assignment] = await this.query(
      `SELECT organization_id FROM assignment WHERE id = $1`,
      [r.assignmentId],
    );
    await this.query(
      `INSERT INTO passage_listen
         (organization_id, assignment_id, segment_id, learner_id, completed_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        assignment?.["organization_id"],
        r.assignmentId,
        r.segmentId,
        r.learnerId,
        ts(r.completedAt),
      ],
    );
  }

  async countListens(assignmentId: AssignmentId): Promise<number> {
    const [row] = await this.query(
      `SELECT count(*)::int AS n FROM passage_listen WHERE assignment_id = $1`,
      [assignmentId],
    );
    return num(row?.["n"] as number);
  }

  // --- recitation requests ---------------------------------------------

  async createRecitationRequest(r: RecitationRequestRecord): Promise<void> {
    await this.query(
      `INSERT INTO oral_recitation_request
         (id, organization_id, assignment_id, learner_id, requested_at,
          policy_version, independent_recalls, non_serial_recalls,
          listens_completed, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        r.requestId,
        r.organizationId,
        r.assignmentId,
        r.learnerId,
        ts(r.requestedAt),
        r.policyVersion,
        r.evidenceSnapshot.independentRecalls,
        r.evidenceSnapshot.nonSerialIndependentRecalls,
        r.evidenceSnapshot.listensCompleted,
        r.status,
      ],
    );
  }

  async getRecitationRequest(
    requestId: string,
  ): Promise<RecitationRequestRecord | undefined> {
    const [row] = await this.query(
      `SELECT * FROM oral_recitation_request WHERE id = $1`,
      [requestId],
    );
    if (!row) return undefined;
    return {
      requestId: row["id"] as string,
      assignmentId: row["assignment_id"] as AssignmentId,
      learnerId: row["learner_id"] as LearnerId,
      organizationId: row["organization_id"] as string,
      requestedAt: ms(row["requested_at"] as Date)!,
      policyVersion: row["policy_version"] as string,
      evidenceSnapshot: {
        independentRecalls: num(row["independent_recalls"] as number),
        nonSerialIndependentRecalls: num(row["non_serial_recalls"] as number),
        listensCompleted: num(row["listens_completed"] as number),
      },
      status: row["status"] as RecitationRequestRecord["status"],
    };
  }

  async markRequestDecided(requestId: string): Promise<void> {
    await this.query(
      `UPDATE oral_recitation_request SET status = 'decided' WHERE id = $1`,
      [requestId],
    );
  }

  // --- verifications (append-only) --------------------------------------

  async appendVerification(r: VerificationRecord): Promise<void> {
    await this.query(
      `INSERT INTO oral_verification
         (id, organization_id, request_id, assignment_id, memory_target_id,
          learner_id, policy_version, corpus_version_id, verifier_user_id,
          verifier_role, decision, decided_at, supersedes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        r.verificationId,
        r.organizationId,
        r.requestId,
        r.assignmentId,
        r.targetId,
        r.learnerId,
        r.policyVersion,
        r.corpusVersionId,
        r.verifierUserId,
        r.verifierRole,
        r.decision,
        ts(r.decidedAt),
        r.supersedes,
      ],
    );
    for (const attemptId of r.evidenceAttemptIds)
      await this.query(
        `INSERT INTO oral_verification_evidence (verification_id, attempt_id)
         VALUES ($1,$2)`,
        [r.verificationId, attemptId],
      );
  }

  async listVerifications(
    assignmentId: AssignmentId,
  ): Promise<readonly VerificationRecord[]> {
    const rows = await this.query(
      `SELECT * FROM oral_verification WHERE assignment_id = $1 ORDER BY decided_at`,
      [assignmentId],
    );
    const out: VerificationRecord[] = [];
    for (const row of rows) {
      const evidence = await this.query(
        `SELECT attempt_id FROM oral_verification_evidence WHERE verification_id = $1`,
        [row["id"]],
      );
      out.push({
        verificationId: row["id"] as string,
        requestId: row["request_id"] as string,
        assignmentId: row["assignment_id"] as AssignmentId,
        targetId: row["memory_target_id"] as MemoryTargetId,
        learnerId: row["learner_id"] as LearnerId,
        organizationId: row["organization_id"] as string,
        policyVersion: row["policy_version"] as string,
        corpusVersionId: row["corpus_version_id"] as string,
        verifierUserId: row["verifier_user_id"] as string,
        verifierRole: row["verifier_role"] as Role,
        decision: row["decision"] as VerificationDecision,
        decidedAt: ms(row["decided_at"] as Date)!,
        evidenceAttemptIds: evidence.map((e) => e["attempt_id"] as AttemptId),
        supersedes: (row["supersedes"] as string | null) ?? null,
      });
    }
    return out;
  }

  // --- corrections ------------------------------------------------------

  async appendCorrection(r: CorrectionRecord): Promise<void> {
    await this.query(
      `INSERT INTO correction
         (id, organization_id, verification_id, memory_target_id, category,
          note, added_at, added_by_user_id)
       SELECT $1, v.organization_id, $2, $3, $4, $5, $6, $7
         FROM oral_verification v WHERE v.id = $2`,
      [
        r.correctionId,
        r.verificationId,
        r.targetId,
        r.category,
        r.note ?? null,
        ts(r.addedAt),
        r.addedByUserId,
      ],
    );
  }

  async listCorrections(
    targetId: MemoryTargetId,
  ): Promise<readonly CorrectionRecord[]> {
    const rows = await this.query(
      `SELECT c.*, r.resolved_at, r.resolved_by_user_id
         FROM correction c
         LEFT JOIN correction_resolution r ON r.correction_id = c.id
        WHERE c.memory_target_id = $1
        ORDER BY c.added_at`,
      [targetId],
    );
    return rows.map((row) => {
      const record: CorrectionRecord = {
        correctionId: row["id"] as string,
        verificationId: row["verification_id"] as string,
        targetId: row["memory_target_id"] as MemoryTargetId,
        category: row["category"] as CorrectionCategory,
        addedAt: ms(row["added_at"] as Date)!,
        addedByUserId: row["added_by_user_id"] as string,
        resolvedAt: ms(row["resolved_at"] as Date | null),
        resolvedByUserId: (row["resolved_by_user_id"] as string | null) ?? null,
      };
      const note = row["note"] as string | null;
      if (note !== null) record.note = note;
      return record;
    });
  }

  /** Resolution is a separate append; the correction row is never edited. */
  async resolveCorrection(
    correctionId: string,
    byUserId: string,
    at: EpochMs,
  ): Promise<void> {
    await this.query(
      `INSERT INTO correction_resolution
         (correction_id, resolved_at, resolved_by_user_id, reason)
       VALUES ($1,$2,$3,$4)`,
      [correctionId, ts(at), byUserId, "resolved by verifier"],
    );
  }

  // --- relationships ----------------------------------------------------

  async guardianRelationships(): Promise<readonly GuardianRelationship[]> {
    const rows = await this.query(
      `SELECT guardian_user_id, child_user_id, status, can_view_child,
              can_tutor_and_approve, revoked_at, expires_at
         FROM guardian_relationship`,
    );
    return rows.map((row) => ({
      guardianUserId: row["guardian_user_id"] as string,
      childUserId: row["child_user_id"] as string,
      status: row["status"] as GuardianRelationship["status"],
      canViewChild: row["can_view_child"] as boolean,
      canTutorAndApprove: row["can_tutor_and_approve"] as boolean,
      revokedAt: ms(row["revoked_at"] as Date | null),
      expiresAt: ms(row["expires_at"] as Date | null),
    }));
  }

  async enrollments(): Promise<readonly Enrollment[]> {
    const rows = await this.query(
      `SELECT learner_id, classroom_id, academy_id FROM enrollment`,
    );
    return rows.map((row) => ({
      learnerId: row["learner_id"] as string,
      classroomId: row["classroom_id"] as string,
      academyId: row["academy_id"] as string,
    }));
  }
}

/**
 * PostgreSQL transaction boundary.
 *
 * Events are written to `outbox_message` inside the same transaction as
 * the state they justify. A dispatcher delivers them afterwards; a failing
 * consumer can never roll back evidence, because the evidence has already
 * committed.
 */
export class PgDatabase implements Database {
  constructor(
    private readonly pool: Pool,
    private readonly options: {
      /** Role to assume for RLS. Superusers bypass RLS, so tests set this. */
      applicationRole?: string;
    } = {},
  ) {}

  async transaction<T>(
    fn: (ctx: TxContext) => Promise<T>,
    scope?: TxScope,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (this.options.applicationRole)
        await client.query(`SET LOCAL ROLE ${quoteIdent(this.options.applicationRole)}`);
      if (scope)
        // Row-level security reads this. `SET LOCAL` scopes it to the
        // transaction, so it cannot leak to the next user of the connection.
        await client.query("SELECT set_config('athar.org_id', $1, true)", [
          scope.organizationId,
        ]);

      const repo = new PgRepository(client);
      const buffered: LearningEventEnvelope[] = [];
      const events: EventSink = { append: (e) => buffered.push(e) };

      const result = await fn({ repo, events });

      for (const e of buffered) {
        await client.query(
          `INSERT INTO learning_event
             (id, organization_id, event_type, schema_version, occurred_at,
              received_at, actor_user_id, learner_id, assignment_id,
              object_refs, active_duration_ms, purpose, privacy_class,
              retention_class, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (event_type, idempotency_key) DO NOTHING`,
          [
            e.eventId,
            e.organizationId,
            e.eventType,
            e.schemaVersion,
            new Date(e.occurredAt),
            new Date(e.receivedAt),
            e.actorUserId ?? null,
            e.learnerId ?? null,
            e.assignmentId ?? null,
            JSON.stringify(e.objectRefs),
            e.activeDurationMs ?? null,
            e.purpose,
            e.privacy,
            e.retention,
            e.idempotencyKey,
          ],
        );
        await client.query(
          `INSERT INTO outbox_message (organization_id, payload) VALUES ($1,$2)`,
          [e.organizationId, JSON.stringify(e)],
        );
      }

      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Role names cannot be parameterised, so they are validated and quoted. */
function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new Error(`Unsafe role identifier: ${name}`);
  return `"${name}"`;
}
