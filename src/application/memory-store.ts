/**
 * In-memory repository adapter.
 *
 * Used by tests and local development. It enforces the same invariants the
 * database enforces — most importantly, append-only evidence — so a test
 * that passes here is testing the real rule, not a lenient stand-in.
 */
import type {
  AssignmentId,
  AttemptId,
  EpochMs,
  LearnerId,
  MemoryTargetId,
} from "../core/types.js";
import type {
  AssignmentPolicyVersionRecord,
  AssignmentRecord,
  AttemptRecord,
  CorrectionRecord,
  ListenRecord,
  MemoryStateRecord,
  PassageRecord,
  RecitationRequestRecord,
  Repository,
  VerificationRecord,
} from "./repository.js";
import type { Enrollment, GuardianRelationship } from "../auth/policy.js";
import type { Database, EventSink, TxContext } from "./repository.js";
import type { LearningEventEnvelope } from "./events.js";
import type { Outbox } from "./events.js";

export class AppendOnlyViolation extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} already exists; learning evidence is append-only.`);
    this.name = "AppendOnlyViolation";
  }
}

export class InMemoryRepository implements Repository {
  private passages = new Map<string, PassageRecord>();
  private assignments = new Map<AssignmentId, AssignmentRecord>();
  private policyVersions = new Map<string, AssignmentPolicyVersionRecord>();
  private memoryStates = new Map<MemoryTargetId, MemoryStateRecord>();
  private attempts: AttemptRecord[] = [];
  private attemptIds = new Set<AttemptId>();
  private idempotencyIndex = new Map<string, AttemptRecord>();
  private listens: ListenRecord[] = [];
  private requests = new Map<string, RecitationRequestRecord>();
  private verifications: VerificationRecord[] = [];
  private verificationIds = new Set<string>();
  private corrections = new Map<string, CorrectionRecord>();

  constructor(
    private readonly seed: {
      guardianRelationships?: GuardianRelationship[];
      enrollments?: Enrollment[];
    } = {},
  ) {}

  // --- passages ---------------------------------------------------------
  async getPassage(passageId: string): Promise<PassageRecord | undefined> {
    return this.passages.get(passageId);
  }
  async putPassage(record: PassageRecord): Promise<void> {
    this.passages.set(record.passageId, record);
  }

  // --- assignments ------------------------------------------------------
  async getAssignment(id: AssignmentId): Promise<AssignmentRecord | undefined> {
    return this.assignments.get(id);
  }
  async saveAssignment(record: AssignmentRecord): Promise<void> {
    this.assignments.set(record.assignmentId, record);
  }
  async listAssignmentsForLearner(
    learnerId: LearnerId,
  ): Promise<readonly AssignmentRecord[]> {
    return [...this.assignments.values()].filter((a) => a.learnerId === learnerId);
  }

  // --- policy versions --------------------------------------------------
  private policyKey(assignmentId: AssignmentId, version: string): string {
    return `${assignmentId}::${version}`;
  }
  async putPolicyVersion(record: AssignmentPolicyVersionRecord): Promise<void> {
    const key = this.policyKey(record.assignmentId, record.policyVersion);
    if (this.policyVersions.has(key))
      throw new AppendOnlyViolation("AssignmentPolicyVersion", key);
    this.policyVersions.set(key, record);
  }
  async getPolicyVersion(
    assignmentId: AssignmentId,
    policyVersion: string,
  ): Promise<AssignmentPolicyVersionRecord | undefined> {
    return this.policyVersions.get(this.policyKey(assignmentId, policyVersion));
  }

  // --- memory state (mutable current view over immutable evidence) ------
  async getMemoryState(targetId: MemoryTargetId): Promise<MemoryStateRecord | undefined> {
    return this.memoryStates.get(targetId);
  }
  async saveMemoryState(record: MemoryStateRecord): Promise<void> {
    this.memoryStates.set(record.targetId, record);
  }
  async listMemoryStatesForLearner(
    learnerId: LearnerId,
  ): Promise<readonly MemoryStateRecord[]> {
    return [...this.memoryStates.values()].filter((m) => m.learnerId === learnerId);
  }

  // --- attempts (append-only) -------------------------------------------
  async appendAttempt(record: AttemptRecord): Promise<void> {
    if (this.attemptIds.has(record.attemptId))
      throw new AppendOnlyViolation("Attempt", record.attemptId);
    this.attemptIds.add(record.attemptId);
    this.attempts.push(record);
    this.idempotencyIndex.set(record.idempotencyKey, record);
  }
  async listAttempts(assignmentId: AssignmentId): Promise<readonly AttemptRecord[]> {
    return this.attempts.filter((a) => a.assignmentId === assignmentId);
  }
  async findAttemptByIdempotencyKey(key: string): Promise<AttemptRecord | undefined> {
    return this.idempotencyIndex.get(key);
  }

  // --- listens ----------------------------------------------------------
  async appendListen(record: ListenRecord): Promise<void> {
    this.listens.push(record);
  }
  async countListens(assignmentId: AssignmentId): Promise<number> {
    return this.listens.filter((l) => l.assignmentId === assignmentId).length;
  }

  // --- recitation requests ---------------------------------------------
  async createRecitationRequest(record: RecitationRequestRecord): Promise<void> {
    this.requests.set(record.requestId, record);
  }
  async getRecitationRequest(
    requestId: string,
  ): Promise<RecitationRequestRecord | undefined> {
    return this.requests.get(requestId);
  }
  async markRequestDecided(requestId: string): Promise<void> {
    const r = this.requests.get(requestId);
    if (r) this.requests.set(requestId, { ...r, status: "decided" });
  }

  // --- verifications (append-only) --------------------------------------
  async appendVerification(record: VerificationRecord): Promise<void> {
    if (this.verificationIds.has(record.verificationId))
      throw new AppendOnlyViolation("OralVerification", record.verificationId);
    this.verificationIds.add(record.verificationId);
    this.verifications.push(record);
  }
  async listVerifications(
    assignmentId: AssignmentId,
  ): Promise<readonly VerificationRecord[]> {
    return this.verifications.filter((v) => v.assignmentId === assignmentId);
  }

  // --- corrections ------------------------------------------------------
  async appendCorrection(record: CorrectionRecord): Promise<void> {
    if (this.corrections.has(record.correctionId))
      throw new AppendOnlyViolation("Correction", record.correctionId);
    this.corrections.set(record.correctionId, record);
  }
  async listCorrections(targetId: MemoryTargetId): Promise<readonly CorrectionRecord[]> {
    return [...this.corrections.values()].filter((c) => c.targetId === targetId);
  }
  /**
   * Resolution is a separate append (`CorrectionResolution` in the schema),
   * projected here onto the correction for read convenience.
   */
  async resolveCorrection(
    correctionId: string,
    byUserId: string,
    at: EpochMs,
  ): Promise<void> {
    const c = this.corrections.get(correctionId);
    if (!c) return;
    if (c.resolvedAt !== null)
      throw new AppendOnlyViolation("CorrectionResolution", correctionId);
    this.corrections.set(correctionId, {
      ...c,
      resolvedAt: at,
      resolvedByUserId: byUserId,
    });
  }

  // --- transaction support ---------------------------------------------
  /**
   * Shallow copies of every container. Records themselves are treated as
   * immutable, so copying the containers is a true rollback point.
   */
  snapshot(): RepositorySnapshot {
    return {
      passages: new Map(this.passages),
      assignments: new Map(this.assignments),
      policyVersions: new Map(this.policyVersions),
      memoryStates: new Map(this.memoryStates),
      attempts: [...this.attempts],
      attemptIds: new Set(this.attemptIds),
      idempotencyIndex: new Map(this.idempotencyIndex),
      listens: [...this.listens],
      requests: new Map(this.requests),
      verifications: [...this.verifications],
      verificationIds: new Set(this.verificationIds),
      corrections: new Map(this.corrections),
    };
  }

  restore(snap: RepositorySnapshot): void {
    this.passages = snap.passages;
    this.assignments = snap.assignments;
    this.policyVersions = snap.policyVersions;
    this.memoryStates = snap.memoryStates;
    this.attempts = snap.attempts;
    this.attemptIds = snap.attemptIds;
    this.idempotencyIndex = snap.idempotencyIndex;
    this.listens = snap.listens;
    this.requests = snap.requests;
    this.verifications = snap.verifications;
    this.verificationIds = snap.verificationIds;
    this.corrections = snap.corrections;
  }

  // --- relationships ----------------------------------------------------
  async guardianRelationships(): Promise<readonly GuardianRelationship[]> {
    return this.seed.guardianRelationships ?? [];
  }
  async enrollments(): Promise<readonly Enrollment[]> {
    return this.seed.enrollments ?? [];
  }
}

export interface RepositorySnapshot {
  passages: Map<string, PassageRecord>;
  assignments: Map<AssignmentId, AssignmentRecord>;
  policyVersions: Map<string, AssignmentPolicyVersionRecord>;
  memoryStates: Map<MemoryTargetId, MemoryStateRecord>;
  attempts: AttemptRecord[];
  attemptIds: Set<AttemptId>;
  idempotencyIndex: Map<string, AttemptRecord>;
  listens: ListenRecord[];
  requests: Map<string, RecitationRequestRecord>;
  verifications: VerificationRecord[];
  verificationIds: Set<string>;
  corrections: Map<string, CorrectionRecord>;
}

/**
 * In-memory transaction boundary.
 *
 * Buffers events and restores the pre-transaction snapshot if the body
 * throws, so a failed command leaves neither state nor events behind.
 */
export class MemoryDatabase implements Database {
  constructor(
    readonly repo: InMemoryRepository,
    readonly outbox: Outbox,
  ) {}

  async transaction<T>(fn: (ctx: TxContext) => Promise<T>): Promise<T> {
    const snapshot = this.repo.snapshot();
    const buffered: LearningEventEnvelope[] = [];
    const events: EventSink = { append: (e) => buffered.push(e) };
    try {
      const result = await fn({ repo: this.repo, events });
      // Commit: events reach the outbox only now.
      for (const e of buffered) this.outbox.append(e);
      return result;
    } catch (err) {
      this.repo.restore(snapshot);
      throw err;
    }
  }
}
