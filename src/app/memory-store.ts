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
  RecitationRequestRecord,
  Repository,
  VerificationRecord,
} from "./repository.js";
import type { Enrollment, GuardianRelationship } from "../auth/policy.js";

export class AppendOnlyViolation extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} already exists; learning evidence is append-only.`);
    this.name = "AppendOnlyViolation";
  }
}

export class InMemoryRepository implements Repository {
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

  // --- assignments ------------------------------------------------------
  getAssignment(id: AssignmentId): AssignmentRecord | undefined {
    return this.assignments.get(id);
  }
  saveAssignment(record: AssignmentRecord): void {
    this.assignments.set(record.assignmentId, record);
  }
  listAssignmentsForLearner(learnerId: LearnerId): readonly AssignmentRecord[] {
    return [...this.assignments.values()].filter((a) => a.learnerId === learnerId);
  }

  // --- policy versions --------------------------------------------------
  private policyKey(assignmentId: AssignmentId, version: string): string {
    return `${assignmentId}::${version}`;
  }
  putPolicyVersion(record: AssignmentPolicyVersionRecord): void {
    const key = this.policyKey(record.assignmentId, record.policyVersion);
    if (this.policyVersions.has(key))
      throw new AppendOnlyViolation("AssignmentPolicyVersion", key);
    this.policyVersions.set(key, record);
  }
  getPolicyVersion(
    assignmentId: AssignmentId,
    policyVersion: string,
  ): AssignmentPolicyVersionRecord | undefined {
    return this.policyVersions.get(this.policyKey(assignmentId, policyVersion));
  }

  // --- memory state (mutable current view over immutable evidence) ------
  getMemoryState(targetId: MemoryTargetId): MemoryStateRecord | undefined {
    return this.memoryStates.get(targetId);
  }
  saveMemoryState(record: MemoryStateRecord): void {
    this.memoryStates.set(record.targetId, record);
  }
  listMemoryStatesForLearner(learnerId: LearnerId): readonly MemoryStateRecord[] {
    return [...this.memoryStates.values()].filter((m) => m.learnerId === learnerId);
  }

  // --- attempts (append-only) -------------------------------------------
  appendAttempt(record: AttemptRecord): void {
    if (this.attemptIds.has(record.attemptId))
      throw new AppendOnlyViolation("Attempt", record.attemptId);
    this.attemptIds.add(record.attemptId);
    this.attempts.push(record);
    this.idempotencyIndex.set(record.idempotencyKey, record);
  }
  listAttempts(assignmentId: AssignmentId): readonly AttemptRecord[] {
    return this.attempts.filter((a) => a.assignmentId === assignmentId);
  }
  findAttemptByIdempotencyKey(key: string): AttemptRecord | undefined {
    return this.idempotencyIndex.get(key);
  }

  // --- listens ----------------------------------------------------------
  appendListen(record: ListenRecord): void {
    this.listens.push(record);
  }
  countListens(assignmentId: AssignmentId): number {
    return this.listens.filter((l) => l.assignmentId === assignmentId).length;
  }

  // --- recitation requests ---------------------------------------------
  createRecitationRequest(record: RecitationRequestRecord): void {
    this.requests.set(record.requestId, record);
  }
  getRecitationRequest(requestId: string): RecitationRequestRecord | undefined {
    return this.requests.get(requestId);
  }
  markRequestDecided(requestId: string): void {
    const r = this.requests.get(requestId);
    if (r) this.requests.set(requestId, { ...r, status: "decided" });
  }

  // --- verifications (append-only) --------------------------------------
  appendVerification(record: VerificationRecord): void {
    if (this.verificationIds.has(record.verificationId))
      throw new AppendOnlyViolation("OralVerification", record.verificationId);
    this.verificationIds.add(record.verificationId);
    this.verifications.push(record);
  }
  listVerifications(assignmentId: AssignmentId): readonly VerificationRecord[] {
    return this.verifications.filter((v) => v.assignmentId === assignmentId);
  }

  // --- corrections ------------------------------------------------------
  appendCorrection(record: CorrectionRecord): void {
    if (this.corrections.has(record.correctionId))
      throw new AppendOnlyViolation("Correction", record.correctionId);
    this.corrections.set(record.correctionId, record);
  }
  listCorrections(targetId: MemoryTargetId): readonly CorrectionRecord[] {
    return [...this.corrections.values()].filter((c) => c.targetId === targetId);
  }
  /**
   * Resolution is a separate append (`CorrectionResolution` in the schema),
   * projected here onto the correction for read convenience.
   */
  resolveCorrection(correctionId: string, byUserId: string, at: EpochMs): void {
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

  // --- relationships ----------------------------------------------------
  guardianRelationships(): readonly GuardianRelationship[] {
    return this.seed.guardianRelationships ?? [];
  }
  enrollments(): readonly Enrollment[] {
    return this.seed.enrollments ?? [];
  }
}
