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
import type { LearningEventEnvelope } from "./events.js";

/**
 * A passage from the curriculum.
 *
 * `released` is stored state, set by the content release pipeline. It is
 * deliberately not a parameter the assignment caller supplies: a caller
 * that can assert "this content is approved" is not a release gate.
 */
export interface PassageRecord {
  passageId: string;
  organizationId: string;
  /** Pinned, so a corpus bump cannot silently change an assignment. */
  corpusVersionId: string;
  /** Display reference such as "Al-Mulk 12-15". Never sacred text. */
  label: string;
  startAyahId: string;
  endAyahId: string;
  /** How many segments an assignment over this passage is split into. */
  segmentCount: number;
  released: boolean;
  /** Why it is not released, for the admin surface. Empty when released. */
  releaseBlocks: readonly string[];
}

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
  passageId: string;
  /** Denormalized from the passage at creation time, and pinned. */
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

/**
 * Every method is asynchronous because every production implementation
 * performs I/O. The pure engine stays synchronous; only the boundary is
 * async, which is what keeps the learning logic testable without a
 * database.
 */
export interface Repository {
  getPassage(passageId: string): Promise<PassageRecord | undefined>;
  putPassage(record: PassageRecord): Promise<void>;

  getAssignment(id: AssignmentId): Promise<AssignmentRecord | undefined>;
  saveAssignment(record: AssignmentRecord): Promise<void>;
  listAssignmentsForLearner(learnerId: LearnerId): Promise<readonly AssignmentRecord[]>;

  putPolicyVersion(record: AssignmentPolicyVersionRecord): Promise<void>;
  getPolicyVersion(
    assignmentId: AssignmentId,
    policyVersion: string,
  ): Promise<AssignmentPolicyVersionRecord | undefined>;

  getMemoryState(targetId: MemoryTargetId): Promise<MemoryStateRecord | undefined>;
  saveMemoryState(record: MemoryStateRecord): Promise<void>;
  listMemoryStatesForLearner(
    learnerId: LearnerId,
  ): Promise<readonly MemoryStateRecord[]>;

  /** Append-only. There is deliberately no updateAttempt. */
  appendAttempt(record: AttemptRecord): Promise<void>;
  listAttempts(assignmentId: AssignmentId): Promise<readonly AttemptRecord[]>;
  findAttemptByIdempotencyKey(key: string): Promise<AttemptRecord | undefined>;

  appendListen(record: ListenRecord): Promise<void>;
  countListens(assignmentId: AssignmentId): Promise<number>;

  createRecitationRequest(record: RecitationRequestRecord): Promise<void>;
  getRecitationRequest(requestId: string): Promise<RecitationRequestRecord | undefined>;
  markRequestDecided(requestId: string): Promise<void>;

  /** Append-only. */
  appendVerification(record: VerificationRecord): Promise<void>;
  listVerifications(assignmentId: AssignmentId): Promise<readonly VerificationRecord[]>;

  appendCorrection(record: CorrectionRecord): Promise<void>;
  listCorrections(targetId: MemoryTargetId): Promise<readonly CorrectionRecord[]>;
  resolveCorrection(correctionId: string, byUserId: string, at: EpochMs): Promise<void>;

  guardianRelationships(): Promise<readonly GuardianRelationship[]>;
  enrollments(): Promise<readonly Enrollment[]>;
}

/**
 * Collects events during a transaction.
 *
 * Events reach the outbox only if the transaction commits. A rolled-back
 * command emits nothing — which is the whole point of a transactional
 * outbox, and the reason this is not a plain `outbox.append` call inside
 * the command body.
 */
export interface EventSink {
  append(event: LearningEventEnvelope): void;
}

export interface TxContext {
  repo: Repository;
  events: EventSink;
}

/**
 * The transaction boundary. State and the events that justify it commit
 * together, or neither does.
 */
/**
 * Tenant scope for a transaction.
 *
 * The organization always comes from the session-derived actor, never from
 * a request parameter. Adapters use it to set the database session variable
 * that row-level security reads.
 */
export interface TxScope {
  organizationId: string;
}

export interface Database {
  transaction<T>(fn: (ctx: TxContext) => Promise<T>, scope?: TxScope): Promise<T>;
}
