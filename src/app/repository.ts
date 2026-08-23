/**
 * Repository ports.
 *
 * The pure engine never sees these. Adapters (PostgreSQL in production,
 * in-memory in tests) implement them; the command layer wires the two
 * together. Evidence tables are append-only by contract, not by
 * convention — the port exposes no update method for them.
 */
import type {
  AssignmentId,
  AttemptId,
  CorrectionCategory,
  LearnerId,
  MemoryTargetId,
  MemoryTargetKind,
  LearningState,
  VerificationDecision,
  EpochMs,
} from "../core/types.js";
import type { EvidencePolicy, EvidenceProgress, RetrievalAttempt } from "../core/evidence.js";
import type { StateContext } from "../core/states.js";
import type { SchedulingState } from "../core/scheduler.js";
import type { Enrollment, GuardianRelationship, Role } from "../auth/policy.js";

export interface AssignmentRecord {
  assignmentId: AssignmentId;
  organizationId: string;
  academyId: string;
  classroomId: string;
  learnerId: LearnerId;
  ownerUserId: string;
  ownerRole: Role;
  targetId: MemoryTargetId;
  targetKind: MemoryTargetKind;
  /** Display reference such as "Al-Mulk 12-15". Never sacred text. */
  label: string;
  corpusVersionId: string;
  segmentIds: readonly string[];
  currentPolicyVersion: string;
  estimatedActiveMinutes: number;
  createdAt: EpochMs;
  dueAt: EpochMs;
}

export interface AssignmentPolicyVersionRecord {
  assignmentId: AssignmentId;
  policyVersion: string;
  policy: EvidencePolicy;
  createdAt: EpochMs;
  createdByUserId: string;
  supersedes: string | null;
}

export interface MemoryStateRecord {
  targetId: MemoryTargetId;
  assignmentId: AssignmentId;
  learnerId: LearnerId;
  organizationId: string;
  state: LearningState;
  stateContext: StateContext;
  progress: EvidenceProgress;
  scheduling?: SchedulingState;
  /** Every computed transition records how it was computed. */
  engineVersion: string;
  policyVersion: string;
  reason: string;
  updatedAt: EpochMs;
}

export interface AttemptRecord extends RetrievalAttempt {
  assignmentId: AssignmentId;
  segmentId: string;
  learnerId: LearnerId;
  organizationId: string;
  /** Computed server-side. Never accepted from a client. */
  evidenceClass: "independent_recall" | "assisted_practice" | "scaffolded_practice";
  policyVersion: string;
  idempotencyKey: string;
}

export interface RecitationRequestRecord {
  requestId: string;
  assignmentId: AssignmentId;
  learnerId: LearnerId;
  organizationId: string;
  requestedAt: EpochMs;
  policyVersion: string;
  /** Snapshot of the evidence that justified the request. */
  evidenceSnapshot: EvidenceProgress;
  status: "pending" | "decided";
}

export interface CorrectionRecord {
  correctionId: string;
  verificationId: string;
  targetId: MemoryTargetId;
  category: CorrectionCategory;
  note?: string;
  addedAt: EpochMs;
  addedByUserId: string;
  resolvedAt: EpochMs | null;
  resolvedByUserId: string | null;
}

export interface VerificationRecord {
  verificationId: string;
  requestId: string;
  assignmentId: AssignmentId;
  targetId: MemoryTargetId;
  learnerId: LearnerId;
  organizationId: string;
  /** Pinned exactly — reconstructing what the teacher saw is a query. */
  policyVersion: string;
  corpusVersionId: string;
  verifierUserId: string;
  verifierRole: Role;
  decision: VerificationDecision;
  decidedAt: EpochMs;
  evidenceAttemptIds: readonly AttemptId[];
  /** Superseding decisions append; nothing is overwritten. */
  supersedes: string | null;
}

export interface ListenRecord {
  assignmentId: AssignmentId;
  segmentId: string;
  learnerId: LearnerId;
  completedAt: EpochMs;
}

export interface Repository {
  getAssignment(id: AssignmentId): AssignmentRecord | undefined;
  saveAssignment(record: AssignmentRecord): void;
  listAssignmentsForLearner(learnerId: LearnerId): readonly AssignmentRecord[];

  putPolicyVersion(record: AssignmentPolicyVersionRecord): void;
  getPolicyVersion(
    assignmentId: AssignmentId,
    policyVersion: string,
  ): AssignmentPolicyVersionRecord | undefined;

  getMemoryState(targetId: MemoryTargetId): MemoryStateRecord | undefined;
  saveMemoryState(record: MemoryStateRecord): void;
  listMemoryStatesForLearner(learnerId: LearnerId): readonly MemoryStateRecord[];

  /** Append-only. There is deliberately no updateAttempt. */
  appendAttempt(record: AttemptRecord): void;
  listAttempts(assignmentId: AssignmentId): readonly AttemptRecord[];
  findAttemptByIdempotencyKey(key: string): AttemptRecord | undefined;

  appendListen(record: ListenRecord): void;
  countListens(assignmentId: AssignmentId): number;

  createRecitationRequest(record: RecitationRequestRecord): void;
  getRecitationRequest(requestId: string): RecitationRequestRecord | undefined;
  markRequestDecided(requestId: string): void;

  /** Append-only. */
  appendVerification(record: VerificationRecord): void;
  listVerifications(assignmentId: AssignmentId): readonly VerificationRecord[];

  appendCorrection(record: CorrectionRecord): void;
  listCorrections(targetId: MemoryTargetId): readonly CorrectionRecord[];
  resolveCorrection(correctionId: string, byUserId: string, at: EpochMs): void;

  guardianRelationships(): readonly GuardianRelationship[];
  enrollments(): readonly Enrollment[];
}
