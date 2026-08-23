/**
 * Server-authoritative command handlers — the Phase 1 vertical slice.
 *
 * Every command runs the same pipeline inside one transaction:
 *
 *   authorize -> validate -> load -> decide (pure engine)
 *             -> persist + emit event -> commit
 *
 * The client reports *what happened*. The server decides *what it means*.
 * No command accepts an evidence classification, a learning state, or a
 * mastery claim from its caller.
 *
 * Events are handed to an `EventSink`, not to the outbox directly: they
 * become visible only if the transaction commits. A command that throws
 * leaves behind neither state nor events.
 */
import type {
  AssignmentId,
  AttemptId,
  ConfidenceJudgment,
  CorrectionCategory,
  EpochMs,
  LearnerId,
  MemoryTargetId,
  MemoryTargetKind,
  ScaffoldLevel,
  StartContext,
  VerificationDecision,
} from "../core/types.js";
import { MS_PER_DAY } from "../core/types.js";
import type { AssistanceKind, EvidencePolicy, RetrievalAttempt } from "../core/evidence.js";
import {
  accumulate,
  classifyAttempt,
  emptyProgress,
  meetsVerificationThreshold,
} from "../core/evidence.js";
import {
  ENGINE_VERSION,
  initialContext,
  transition,
  IllegalTransitionError,
} from "../core/states.js";
import type { StateContext } from "../core/states.js";
import { initialState, review as runScheduler } from "../core/scheduler.js";
import { blankPage, type PageRevealState } from "../core/session.js";
import { buildTodayPlan, type Candidate, type TodayPlan } from "../core/recommend.js";
import {
  diffPolicy,
  nextPolicyVersion,
  validatePolicy,
  type PolicyChange,
} from "../core/assignment-policy.js";
import type { Actor, PolicyContext, Resource, Role } from "../auth/policy.js";
import { AuthorizationError, requireAuthorized } from "../auth/policy.js";
import { buildEvent, type NewEvent } from "./events.js";
import { nextId } from "./ids.js";
import type {
  Database,
  EventSink,
  Repository,
  AttemptRecord,
  AssignmentRecord,
  MemoryStateRecord,
} from "./repository.js";

export type CommandErrorCode =
  | "unauthenticated"
  | "not_found"
  | "forbidden"
  | "mfa_required"
  | "policy_not_met"
  | "illegal_transition"
  | "content_not_released"
  | "conflict";

export class CommandError extends Error {
  constructor(
    readonly code: CommandErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}


// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function policyContext(repo: Repository, now: EpochMs): Promise<PolicyContext> {
  const [guardianRelationships, enrollments] = await Promise.all([
    repo.guardianRelationships(),
    repo.enrollments(),
  ]);
  return { guardianRelationships, enrollments, now };
}

/** Translate an authorization denial into the command error shape. */
async function authorizeOrThrow(
  repo: Repository,
  actor: Actor,
  action: Parameters<typeof requireAuthorized>[1],
  resource: Resource,
  now: EpochMs,
): Promise<void> {
  try {
    requireAuthorized(actor, action, resource, await policyContext(repo, now));
  } catch (err) {
    if (err instanceof AuthorizationError)
      throw new CommandError(err.code, err.message);
    throw err;
  }
}

/**
 * Tenant-scoped load. The tenant comparison happens before the record is
 * used for anything, and a cross-tenant identifier is indistinguishable
 * from a missing one — in the error code and in the message.
 */
async function loadAssignmentScoped(
  repo: Repository,
  actor: Actor,
  assignmentId: AssignmentId,
): Promise<AssignmentRecord> {
  const a = await repo.getAssignment(assignmentId);
  if (!a || a.organizationId !== actor.organizationId)
    throw new CommandError("not_found", "Resource not found.");
  return a;
}

function resourceOf(a: AssignmentRecord, extra: Partial<Resource> = {}): Resource {
  return {
    kind: "assignment",
    organizationId: a.organizationId,
    academyId: a.academyId,
    classroomId: a.classroomId,
    learnerId: a.learnerId,
    ownerUserId: a.ownerUserId,
    ownerRole: a.ownerRole,
    ...extra,
  };
}

async function loadState(
  repo: Repository,
  targetId: MemoryTargetId,
): Promise<MemoryStateRecord> {
  const s = await repo.getMemoryState(targetId);
  if (!s) throw new CommandError("not_found", "Resource not found.");
  return s;
}

async function resolvedPolicy(
  repo: Repository,
  assignmentId: AssignmentId,
  policyVersion: string,
): Promise<EvidencePolicy> {
  const record = await repo.getPolicyVersion(assignmentId, policyVersion);
  if (!record) throw new CommandError("not_found", "Policy version not found.");
  return record.policy;
}

/**
 * Any recorded practice moves the target out of `assigned` — listening and
 * reconstruction both count, so the state cannot lag behind reality just
 * because the learner reached practice by a different route.
 */
function withPracticeStarted(state: MemoryStateRecord): MemoryStateRecord {
  if (state.state !== "assigned") return state;
  const started = transition(state.state, state.stateContext, {
    kind: "practice_started",
  });
  return {
    ...state,
    state: started.state,
    stateContext: started.context,
    engineVersion: started.engineVersion,
    reason: started.reason,
  };
}

/**
 * Listens live in their own append-only table, which is the authoritative
 * count. Project it onto the progress record at evaluation time so the two
 * can never drift apart.
 */
async function currentProgress(
  repo: Repository,
  assignmentId: AssignmentId,
  state: MemoryStateRecord,
) {
  return {
    ...state.progress,
    listensCompleted: await repo.countListens(assignmentId),
  };
}

function emit(events: EventSink, input: NewEvent, receivedAt: EpochMs): void {
  events.append(buildEvent(input, receivedAt));
}

// ---------------------------------------------------------------------------
// createAssignment
// ---------------------------------------------------------------------------

export interface CreateAssignmentInput {
  actor: Actor;
  now: EpochMs;
  learnerId: LearnerId;
  academyId: string;
  classroomId: string;
  targetKind: MemoryTargetKind;
  /** The curriculum passage being assigned. Its release state is stored. */
  passageId: string;
  policy: Omit<EvidencePolicy, "policyVersion">;
  estimatedActiveMinutes: number;
  dueAt: EpochMs;
}

export function createAssignment(
  db: Database,
  input: CreateAssignmentInput,
): Promise<{
  assignmentId: AssignmentId;
  targetId: MemoryTargetId;
  policyVersion: string;
  segmentIds: readonly string[];
}> {
  return db.transaction(async ({ repo }) => {
    await authorizeOrThrow(
      repo,
      input.actor,
      "assignment.create",
      {
        kind: "assignment",
        organizationId: input.actor.organizationId,
        academyId: input.academyId,
        classroomId: input.classroomId,
        learnerId: input.learnerId,
      },
      input.now,
    );

    // Release state is read from the passage, never accepted from the
    // caller. A parameter a client can set is not a content gate.
    const passage = await repo.getPassage(input.passageId);
    if (!passage || passage.organizationId !== input.actor.organizationId)
      throw new CommandError("not_found", "Resource not found.");
    if (!passage.released)
      throw new CommandError(
        "content_not_released",
        `This passage is not released: ${passage.releaseBlocks.join(", ") || "no approval recorded"}.`,
      );

    const assignmentId = nextId() as AssignmentId;
    const targetId = nextId() as MemoryTargetId;
    const segmentIds = Array.from({ length: passage.segmentCount }, () => nextId());
    const policyVersion = "v1";
    const ownerRole: Role = input.actor.roles[0]?.role ?? "teacher";

    await repo.saveAssignment({
      assignmentId,
      organizationId: input.actor.organizationId,
      academyId: input.academyId,
      classroomId: input.classroomId,
      learnerId: input.learnerId,
      ownerUserId: input.actor.userId,
      ownerRole,
      targetId,
      targetKind: input.targetKind,
      passageId: passage.passageId,
      label: passage.label,
      corpusVersionId: passage.corpusVersionId,
      segmentIds,
      currentPolicyVersion: policyVersion,
      estimatedActiveMinutes: input.estimatedActiveMinutes,
      createdAt: input.now,
      dueAt: input.dueAt,
    });

    await repo.putPolicyVersion({
      assignmentId,
      policyVersion,
      policy: { ...input.policy, policyVersion },
      createdAt: input.now,
      createdByUserId: input.actor.userId,
      supersedes: null,
    });

    await repo.saveMemoryState({
      targetId,
      assignmentId,
      learnerId: input.learnerId,
      organizationId: input.actor.organizationId,
      state: "assigned",
      stateContext: initialContext,
      progress: emptyProgress,
      engineVersion: ENGINE_VERSION,
      policyVersion,
      reason: "Assigned; no evidence yet.",
      updatedAt: input.now,
    });

    return { assignmentId, targetId, policyVersion, segmentIds };
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// openAssignment
// ---------------------------------------------------------------------------

export interface OpenAssignmentResult {
  assignmentId: AssignmentId;
  state: MemoryStateRecord["state"];
  /** ALWAYS blank. There is no code path that restores a filled page. */
  page: PageRevealState;
  listensCompleted: number;
  requiredListens: number;
  listenPolicyMet: boolean;
  label: string;
}

export function openAssignment(
  db: Database,
  input: { actor: Actor; now: EpochMs; assignmentId: AssignmentId },
): Promise<OpenAssignmentResult> {
  return db.transaction(async ({ repo, events }) => {
    const assignment = await loadAssignmentScoped(repo, input.actor, input.assignmentId);
    await authorizeOrThrow(
      repo,
      input.actor,
      "learner.practice.view",
      resourceOf(assignment),
      input.now,
    );

    const state = await loadState(repo, assignment.targetId);
    const policy = await resolvedPolicy(
      repo,
      input.assignmentId,
      assignment.currentPolicyVersion,
    );

    const started = withPracticeStarted(state);
    if (started !== state)
      await repo.saveMemoryState({ ...started, updatedAt: input.now });

    emit(
      events,
      {
        eventType: "assignment_opened",
        occurredAt: input.now,
        organizationId: assignment.organizationId,
        actorUserId: input.actor.userId,
        learnerId: assignment.learnerId,
        academyId: assignment.academyId,
        classroomId: assignment.classroomId,
        assignmentId: input.assignmentId,
        idempotencyKey: `${input.assignmentId}:open:${input.now}`,
        objectRefs: { targetId: assignment.targetId, label: assignment.label },
      },
      input.now,
    );

    const listensCompleted = await repo.countListens(input.assignmentId);
    return {
      assignmentId: input.assignmentId,
      state: started.state,
      page: blankPage(),
      listensCompleted,
      requiredListens: policy.requiredListens,
      listenPolicyMet: listensCompleted >= policy.requiredListens,
      label: assignment.label,
    };
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// recordListen
// ---------------------------------------------------------------------------

export function recordListen(
  db: Database,
  input: { actor: Actor; now: EpochMs; assignmentId: AssignmentId; segmentId: string },
): Promise<{ listensCompleted: number; requiredListens: number; listenPolicyMet: boolean }> {
  return db.transaction(async ({ repo, events }) => {
    const assignment = await loadAssignmentScoped(repo, input.actor, input.assignmentId);
    await authorizeOrThrow(
      repo,
      input.actor,
      "learner.attempt.submit",
      resourceOf(assignment),
      input.now,
    );

    // The client reports one completion; the server owns the count. A client
    // can never assert a total.
    await repo.appendListen({
      assignmentId: input.assignmentId,
      segmentId: input.segmentId,
      learnerId: assignment.learnerId,
      completedAt: input.now,
    });

    const listensCompleted = await repo.countListens(input.assignmentId);
    const policy = await resolvedPolicy(
      repo,
      input.assignmentId,
      assignment.currentPolicyVersion,
    );

    const state = withPracticeStarted(await loadState(repo, assignment.targetId));
    await repo.saveMemoryState({
      ...state,
      progress: { ...state.progress, listensCompleted },
      updatedAt: input.now,
    });

    emit(
      events,
      {
        eventType: "passage_listen_completed",
        occurredAt: input.now,
        organizationId: assignment.organizationId,
        actorUserId: input.actor.userId,
        learnerId: assignment.learnerId,
        assignmentId: input.assignmentId,
        idempotencyKey: `${input.assignmentId}:listen:${listensCompleted}`,
        objectRefs: { segmentId: input.segmentId, count: listensCompleted },
      },
      input.now,
    );

    return {
      listensCompleted,
      requiredListens: policy.requiredListens,
      listenPolicyMet: listensCompleted >= policy.requiredListens,
    };
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// submitRetrieval
// ---------------------------------------------------------------------------

export interface SubmitRetrievalInput {
  actor: Actor;
  now: EpochMs;
  assignmentId: AssignmentId;
  segmentId: string;
  scaffoldLevel: ScaffoldLevel;
  startContext: StartContext;
  correct: boolean;
  assistance: readonly AssistanceKind[];
  hesitant: boolean;
  confidence?: ConfidenceJudgment;
  idempotencyKey: string;
}

export interface SubmitRetrievalResult {
  attemptId: AttemptId;
  /** Computed by the server. Never supplied by the client. */
  evidenceClass: AttemptRecord["evidenceClass"];
  state: MemoryStateRecord["state"];
  reason: string;
  progress: MemoryStateRecord["progress"];
  readyForVerification: boolean;
  engineVersion: string;
}

/** Scaffold levels that show answer options and therefore require listens first. */
const TILE_LEVELS: ReadonlySet<ScaffoldLevel> = new Set([
  "full_tiles",
  "fewer_tiles_with_anchors",
]);

export function submitRetrieval(
  db: Database,
  input: SubmitRetrievalInput,
): Promise<SubmitRetrievalResult> {
  return db.transaction(async ({ repo, events }) => {
    const assignment = await loadAssignmentScoped(repo, input.actor, input.assignmentId);
    await authorizeOrThrow(
      repo,
      input.actor,
      "learner.attempt.submit",
      resourceOf(assignment),
      input.now,
    );

    // Replay protection: an identical resubmission returns the original
    // outcome rather than double-counting evidence.
    const existing = await repo.findAttemptByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      const current = await loadState(repo, assignment.targetId);
      return {
        attemptId: existing.attemptId,
        evidenceClass: existing.evidenceClass,
        state: current.state,
        reason: current.reason,
        progress: current.progress,
        readyForVerification: current.state === "ready_for_verification",
        engineVersion: current.engineVersion,
      };
    }

    if (!assignment.segmentIds.includes(input.segmentId))
      throw new CommandError(
        "forbidden",
        "A segment is writable only through its own assignment.",
      );

    const state = withPracticeStarted(await loadState(repo, assignment.targetId));
    const policy = await resolvedPolicy(
      repo,
      input.assignmentId,
      assignment.currentPolicyVersion,
    );

    const listensCompleted = await repo.countListens(input.assignmentId);
    if (TILE_LEVELS.has(input.scaffoldLevel) && listensCompleted < policy.requiredListens)
      throw new CommandError(
        "policy_not_met",
        `This assignment requires ${policy.requiredListens} listens before reconstruction; ${listensCompleted} recorded.`,
      );

    const baseProgress = await currentProgress(repo, input.assignmentId, state);
    const attemptId = nextId() as AttemptId;
    const attempt: RetrievalAttempt = {
      attemptId,
      targetId: assignment.targetId,
      occurredAt: input.now,
      scaffoldLevel: input.scaffoldLevel,
      startContext: input.startContext,
      correct: input.correct,
      assistance: input.assistance,
      hesitant: input.hesitant,
      ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    };

    // The server classifies. This is the line the whole product rests on.
    const evidenceClass = classifyAttempt(attempt);
    const isIndependent = evidenceClass === "independent_recall";

    await repo.appendAttempt({
      ...attempt,
      assignmentId: input.assignmentId,
      segmentId: input.segmentId,
      learnerId: assignment.learnerId,
      organizationId: assignment.organizationId,
      evidenceClass,
      policyVersion: assignment.currentPolicyVersion,
      idempotencyKey: input.idempotencyKey,
    });

    const progress = isIndependent ? accumulate(baseProgress, attempt) : baseProgress;

    let nextState = state.state;
    let nextContext: StateContext = state.stateContext;
    let reason = state.reason;
    let engineVersion = state.engineVersion;

    if (isIndependent) {
      try {
        const result = transition(state.state, state.stateContext, {
          kind: "independent_recall_recorded",
          correct: input.correct,
          progress,
          policy,
        });
        nextState = result.state;
        nextContext = result.context;
        reason = result.reason;
        engineVersion = result.engineVersion;
      } catch (err) {
        if (err instanceof IllegalTransitionError)
          throw new CommandError("illegal_transition", err.message);
        throw err;
      }
    } else {
      nextState = state.state;
      nextContext = state.stateContext;
      reason =
        evidenceClass === "assisted_practice"
          ? "Assistance was used, so this attempt counts as practice, not independent recall."
          : "Answer options were visible, so this attempt counts as scaffolded practice.";
    }

    await repo.saveMemoryState({
      ...state,
      state: nextState,
      stateContext: nextContext,
      progress,
      engineVersion,
      policyVersion: assignment.currentPolicyVersion,
      reason,
      updatedAt: input.now,
    });

    const base = {
      occurredAt: input.now,
      organizationId: assignment.organizationId,
      actorUserId: input.actor.userId,
      learnerId: assignment.learnerId,
      assignmentId: input.assignmentId,
    };
    emit(
      events,
      {
        ...base,
        eventType: "retrieval_submitted",
        idempotencyKey: input.idempotencyKey,
        objectRefs: {
          attemptId,
          segmentId: input.segmentId,
          evidenceClass,
          scaffoldLevel: input.scaffoldLevel,
          startContext: input.startContext,
          correct: input.correct,
        },
      },
      input.now,
    );
    if (input.assistance.length > 0)
      emit(
        events,
        {
          ...base,
          eventType: "assistance_used",
          idempotencyKey: `${input.idempotencyKey}:assist`,
          objectRefs: { attemptId, kinds: input.assistance.join(",") },
        },
        input.now,
      );
    if (isIndependent)
      emit(
        events,
        {
          ...base,
          eventType: input.correct
            ? "independent_recall_succeeded"
            : "independent_recall_failed",
          idempotencyKey: `${input.idempotencyKey}:independent`,
          objectRefs: { attemptId, startContext: input.startContext },
        },
        input.now,
      );

    return {
      attemptId,
      evidenceClass,
      state: nextState,
      reason,
      progress,
      readyForVerification: nextState === "ready_for_verification",
      engineVersion,
    };
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// requestOralRecitation
// ---------------------------------------------------------------------------

export function requestOralRecitation(
  db: Database,
  input: { actor: Actor; now: EpochMs; assignmentId: AssignmentId },
): Promise<{ requestId: string; state: MemoryStateRecord["state"] }> {
  return db.transaction(async ({ repo, events }) => {
    const assignment = await loadAssignmentScoped(repo, input.actor, input.assignmentId);
    await authorizeOrThrow(
      repo,
      input.actor,
      "learner.recitation.request",
      resourceOf(assignment),
      input.now,
    );

    const state = await loadState(repo, assignment.targetId);
    const policy = await resolvedPolicy(
      repo,
      input.assignmentId,
      assignment.currentPolicyVersion,
    );

    // Re-checked server-side against persisted evidence. A learner cannot
    // request their way past the policy.
    const progress = await currentProgress(repo, input.assignmentId, state);
    if (!meetsVerificationThreshold(progress, policy))
      throw new CommandError(
        "policy_not_met",
        `Evidence threshold not met: ${progress.listensCompleted}/${policy.requiredListens} listens, ` +
          `${progress.independentRecalls}/${policy.requiredIndependentRecalls} independent recalls, ` +
          `${progress.nonSerialIndependentRecalls}/${policy.requiredNonSerialRecalls} from a random start or join.`,
      );

    const requestId = nextId();
    await repo.createRecitationRequest({
      requestId,
      assignmentId: input.assignmentId,
      learnerId: assignment.learnerId,
      organizationId: assignment.organizationId,
      requestedAt: input.now,
      policyVersion: assignment.currentPolicyVersion,
      evidenceSnapshot: progress,
      status: "pending",
    });

    emit(
      events,
      {
        eventType: "recitation_requested",
        occurredAt: input.now,
        organizationId: assignment.organizationId,
        actorUserId: input.actor.userId,
        learnerId: assignment.learnerId,
        assignmentId: input.assignmentId,
        idempotencyKey: `${requestId}:requested`,
        objectRefs: { requestId, policyVersion: assignment.currentPolicyVersion },
      },
      input.now,
    );

    return { requestId, state: state.state };
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// recordOralVerification
// ---------------------------------------------------------------------------

export interface RecordVerificationInput {
  actor: Actor;
  now: EpochMs;
  requestId: string;
  decision: VerificationDecision;
  corrections?: readonly { category: CorrectionCategory; note?: string }[];
}

export interface RecordVerificationResult {
  verificationId: string;
  state: MemoryStateRecord["state"];
  reason: string;
  nextReviewAt?: EpochMs;
  recurringCorrections: readonly CorrectionCategory[];
}

export function recordOralVerification(
  db: Database,
  input: RecordVerificationInput,
): Promise<RecordVerificationResult> {
  return db.transaction(async ({ repo, events }) => {
    const request = await repo.getRecitationRequest(input.requestId);
    if (!request || request.organizationId !== input.actor.organizationId)
      throw new CommandError("not_found", "Resource not found.");
    if (request.status === "decided")
      throw new CommandError("conflict", "This request has already been decided.");

    const assignment = await loadAssignmentScoped(
      repo,
      input.actor,
      request.assignmentId,
    );
    const state = await loadState(repo, assignment.targetId);
    const policy = await resolvedPolicy(repo, request.assignmentId, request.policyVersion);
    const progress = await currentProgress(repo, request.assignmentId, state);

    await authorizeOrThrow(
      repo,
      input.actor,
      "verification.record",
      resourceOf(assignment, {
        kind: "verification_request",
        evidenceThresholdMet: meetsVerificationThreshold(progress, policy),
      }),
      input.now,
    );

    let result;
    try {
      result = transition(state.state, state.stateContext, {
        kind: "verification_recorded",
        decision: input.decision,
      });
    } catch (err) {
      if (err instanceof IllegalTransitionError)
        throw new CommandError("illegal_transition", err.message);
      throw err;
    }

    const verificationId = nextId();
    const verifierRole: Role = input.actor.roles[0]?.role ?? "teacher";
    const attempts = await repo.listAttempts(request.assignmentId);
    const evidenceAttemptIds = attempts
      .filter((a) => a.evidenceClass === "independent_recall")
      .map((a) => a.attemptId);

    // Pins the exact assignment, policy version, corpus version, verifier,
    // and evidence set considered.
    await repo.appendVerification({
      verificationId,
      requestId: input.requestId,
      assignmentId: request.assignmentId,
      targetId: assignment.targetId,
      learnerId: assignment.learnerId,
      organizationId: assignment.organizationId,
      policyVersion: request.policyVersion,
      corpusVersionId: assignment.corpusVersionId,
      verifierUserId: input.actor.userId,
      verifierRole,
      decision: input.decision,
      decidedAt: input.now,
      evidenceAttemptIds,
      supersedes: null,
    });
    await repo.markRequestDecided(input.requestId);

    // Corrections persist until explicitly resolved. A recurrence of a
    // category already open on this target drops it into repair.
    const existingCorrections = await repo.listCorrections(assignment.targetId);
    const priorOpen = new Set(
      existingCorrections.filter((c) => c.resolvedAt === null).map((c) => c.category),
    );
    const recurring: CorrectionCategory[] = [];
    for (const c of input.corrections ?? []) {
      if (priorOpen.has(c.category)) recurring.push(c.category);
      await repo.appendCorrection({
        correctionId: nextId(),
        verificationId,
        targetId: assignment.targetId,
        category: c.category,
        ...(c.note !== undefined ? { note: c.note } : {}),
        addedAt: input.now,
        addedByUserId: input.actor.userId,
        resolvedAt: null,
        resolvedByUserId: null,
      });
    }

    let nextState = result.state;
    let nextContext = result.context;
    let reason = result.reason;
    let scheduling = state.scheduling;

    if (nextState === "verified") {
      scheduling = initialState(input.decision === "verified_cleanly", input.now);
      emit(
        events,
        {
          eventType: "review_scheduled",
          occurredAt: input.now,
          organizationId: assignment.organizationId,
          learnerId: assignment.learnerId,
          assignmentId: request.assignmentId,
          idempotencyKey: `${verificationId}:scheduled`,
          objectRefs: {
            nextReviewAt: scheduling.nextReviewAt,
            stabilityDays: scheduling.stabilityDays,
          },
        },
        input.now,
      );
    }

    if (recurring.length > 0) {
      const repairResult = transition(nextState, nextContext, {
        kind: "correction_recurred",
      });
      nextState = repairResult.state;
      nextContext = repairResult.context;
      reason = `${reason} ${repairResult.reason} (${recurring.join(", ")})`;
    }

    const nextRecord: MemoryStateRecord = {
      ...state,
      state: nextState,
      stateContext: nextContext,
      engineVersion: result.engineVersion,
      policyVersion: request.policyVersion,
      reason,
      updatedAt: input.now,
    };
    if (scheduling) nextRecord.scheduling = scheduling;
    await repo.saveMemoryState(nextRecord);

    emit(
      events,
      {
        eventType: "oral_verification_recorded",
        occurredAt: input.now,
        organizationId: assignment.organizationId,
        actorUserId: input.actor.userId,
        learnerId: assignment.learnerId,
        assignmentId: request.assignmentId,
        idempotencyKey: `${verificationId}:recorded`,
        objectRefs: {
          verificationId,
          decision: input.decision,
          policyVersion: request.policyVersion,
          verifierUserId: input.actor.userId,
        },
      },
      input.now,
    );
    for (const c of input.corrections ?? [])
      emit(
        events,
        {
          eventType: "correction_added",
          occurredAt: input.now,
          organizationId: assignment.organizationId,
          actorUserId: input.actor.userId,
          learnerId: assignment.learnerId,
          assignmentId: request.assignmentId,
          idempotencyKey: `${verificationId}:cor:${c.category}`,
          objectRefs: { category: c.category, verificationId },
        },
        input.now,
      );

    const out: RecordVerificationResult = {
      verificationId,
      state: nextState,
      reason,
      recurringCorrections: recurring,
    };
    if (scheduling) out.nextReviewAt = scheduling.nextReviewAt;
    return out;
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// recordReviewOutcome
// ---------------------------------------------------------------------------

export interface RecordReviewOutcomeInput {
  actor: Actor;
  now: EpochMs;
  assignmentId: AssignmentId;
  scaffoldLevel: ScaffoldLevel;
  startContext: StartContext;
  correct: boolean;
  assistance: readonly AssistanceKind[];
  hesitant: boolean;
  idempotencyKey: string;
}

export interface RecordReviewOutcomeResult {
  state: MemoryStateRecord["state"];
  reason: string;
  /** Absent when the attempt was assisted: assisted review never reschedules. */
  nextReviewAt?: EpochMs;
  stabilityDays?: number;
  difficulty?: number;
  rescheduled: boolean;
}

export function recordReviewOutcome(
  db: Database,
  input: RecordReviewOutcomeInput,
): Promise<RecordReviewOutcomeResult> {
  return db.transaction(async ({ repo, events }) => {
    const assignment = await loadAssignmentScoped(repo, input.actor, input.assignmentId);
    await authorizeOrThrow(
      repo,
      input.actor,
      "learner.attempt.submit",
      resourceOf(assignment),
      input.now,
    );

    const state = await loadState(repo, assignment.targetId);
    if (!state.scheduling)
      throw new CommandError(
        "policy_not_met",
        "This target has no verified baseline, so there is nothing to review yet.",
      );

    const attempt: RetrievalAttempt = {
      attemptId: nextId() as AttemptId,
      targetId: assignment.targetId,
      occurredAt: input.now,
      scaffoldLevel: input.scaffoldLevel,
      startContext: input.startContext,
      correct: input.correct,
      assistance: input.assistance,
      hesitant: input.hesitant,
    };
    const evidenceClass = classifyAttempt(attempt);

    await repo.appendAttempt({
      ...attempt,
      assignmentId: input.assignmentId,
      segmentId: assignment.segmentIds[0] ?? "",
      learnerId: assignment.learnerId,
      organizationId: assignment.organizationId,
      evidenceClass,
      policyVersion: assignment.currentPolicyVersion,
      idempotencyKey: input.idempotencyKey,
    });

    // Only independent recall reaches the scheduler. An assisted review is
    // recorded as practice and explicitly does not move the interval.
    if (evidenceClass !== "independent_recall")
      return {
        state: state.state,
        reason:
          "Recorded as practice. Assisted review does not change the review schedule.",
        rescheduled: false,
      };

    const delayDays = Math.max(
      0,
      (input.now - state.scheduling.lastReviewedAt) / MS_PER_DAY,
    );

    let result;
    try {
      result = transition(state.state, state.stateContext, {
        kind: "delayed_recall_recorded",
        correct: input.correct,
        hesitant: input.hesitant,
        delayDays,
      });
    } catch (err) {
      if (err instanceof IllegalTransitionError)
        throw new CommandError("illegal_transition", err.message);
      throw err;
    }

    const decision = runScheduler(state.scheduling, {
      correct: input.correct,
      hesitant: input.hesitant,
      occurredAt: input.now,
    });

    await repo.saveMemoryState({
      ...state,
      state: result.state,
      stateContext: result.context,
      scheduling: decision,
      engineVersion: result.engineVersion,
      reason: `${result.reason} ${decision.reason}`,
      updatedAt: input.now,
    });

    emit(
      events,
      {
        eventType: "review_completed",
        occurredAt: input.now,
        organizationId: assignment.organizationId,
        actorUserId: input.actor.userId,
        learnerId: assignment.learnerId,
        assignmentId: input.assignmentId,
        idempotencyKey: input.idempotencyKey,
        objectRefs: {
          correct: input.correct,
          hesitant: input.hesitant,
          delayDays: Math.round(delayDays * 100) / 100,
          grade: decision.grade,
        },
      },
      input.now,
    );
    emit(
      events,
      {
        eventType: "review_scheduled",
        occurredAt: input.now,
        organizationId: assignment.organizationId,
        learnerId: assignment.learnerId,
        assignmentId: input.assignmentId,
        idempotencyKey: `${input.idempotencyKey}:scheduled`,
        objectRefs: {
          nextReviewAt: decision.nextReviewAt,
          stabilityDays: decision.stabilityDays,
          algorithmVersion: decision.algorithmVersion,
        },
      },
      input.now,
    );

    return {
      state: result.state,
      reason: `${result.reason} ${decision.reason}`,
      nextReviewAt: decision.nextReviewAt,
      stabilityDays: decision.stabilityDays,
      difficulty: decision.difficulty,
      rescheduled: true,
    };
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// getToday
// ---------------------------------------------------------------------------

export function getToday(
  db: Database,
  input: {
    actor: Actor;
    now: EpochMs;
    learnerId: LearnerId;
    sessionBudgetMinutes: number;
    suppressedTargetIds?: ReadonlySet<MemoryTargetId>;
  },
): Promise<TodayPlan> {
  return db.transaction(async ({ repo, events }) => {
    const all = await repo.listAssignmentsForLearner(input.learnerId);
    const assignments = all.filter(
      (a) => a.organizationId === input.actor.organizationId,
    );
    const first = assignments[0];
    if (first)
      await authorizeOrThrow(
        repo,
        input.actor,
        "learner.practice.view",
        resourceOf(first),
        input.now,
      );

    const candidates: Candidate[] = [];
    for (const a of assignments) {
      const state = await repo.getMemoryState(a.targetId);
      if (!state) continue;
      const policy = await resolvedPolicy(repo, a.assignmentId, a.currentPolicyVersion);
      const corrections = await repo.listCorrections(a.targetId);
      const unresolved = corrections.filter((c) => c.resolvedAt === null);
      const byCategory = new Map<string, number>();
      for (const c of corrections)
        byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
      const recurrences = [...byCategory.values()].filter((n) => n > 1).length;

      const candidate: Candidate = {
        targetId: a.targetId,
        kind: a.targetKind,
        state: state.state,
        label: a.label,
        estimatedActiveMinutes: a.estimatedActiveMinutes,
        teacherPriority: 0,
        unresolvedCorrections: unresolved.length,
        correctionRecurrences: recurrences,
        prerequisiteWeakness: 0,
        connectionWeakness: a.targetKind === "connection_boundary" ? 0.5 : 0,
        isAssignmentObligation: !meetsVerificationThreshold(
          await currentProgress(repo, a.assignmentId, state),
          policy,
        ),
      };
      if (state.scheduling) candidate.scheduling = state.scheduling;
      candidates.push(candidate);
    }

    const planOptions: Parameters<typeof buildTodayPlan>[1] = {
      now: input.now,
      sessionBudgetMinutes: input.sessionBudgetMinutes,
    };
    if (input.suppressedTargetIds)
      planOptions.suppressedTargetIds = input.suppressedTargetIds;
    const plan = buildTodayPlan(candidates, planOptions);

    const primary = plan.continueNow ?? plan.newMemory;
    if (primary)
      emit(
        events,
        {
          eventType: "recommendation_served",
          occurredAt: input.now,
          organizationId: input.actor.organizationId,
          actorUserId: input.actor.userId,
          learnerId: input.learnerId,
          idempotencyKey: `${input.learnerId}:today:${input.now}`,
          objectRefs: {
            targetId: primary.candidate.targetId,
            reason: primary.reason,
            deferredCount: plan.deferred.length,
          },
        },
        input.now,
      );

    return plan;
  }, { organizationId: input.actor.organizationId });
}

// ---------------------------------------------------------------------------
// editAssignmentPolicy
// ---------------------------------------------------------------------------

export interface EditPolicyInput {
  actor: Actor;
  now: EpochMs;
  assignmentId: AssignmentId;
  policy: Omit<EvidencePolicy, "policyVersion">;
}

export interface EditPolicyResult {
  policyVersion: string;
  supersedes: string;
  changes: readonly PolicyChange[];
}

/**
 * Change an assignment's evidence policy.
 *
 * Creates a new version rather than mutating the old one, so a
 * verification recorded under the previous policy still points at exactly
 * what applied at the time. A policy loosened today cannot retroactively
 * make yesterday's evidence sufficient.
 */
export function editAssignmentPolicy(
  db: Database,
  input: EditPolicyInput,
): Promise<EditPolicyResult> {
  return db.transaction(async ({ repo }) => {
    const assignment = await loadAssignmentScoped(repo, input.actor, input.assignmentId);
    await authorizeOrThrow(
      repo,
      input.actor,
      "assignment.policy.edit",
      resourceOf(assignment),
      input.now,
    );

    const issues = validatePolicy(input.policy);
    if (issues.length > 0)
      throw new CommandError(
        "policy_not_met",
        issues.map((i) => i.message).join(" "),
      );

    const current = await resolvedPolicy(
      repo,
      input.assignmentId,
      assignment.currentPolicyVersion,
    );
    const changes = diffPolicy(current, input.policy);
    if (changes.length === 0)
      throw new CommandError("conflict", "This policy is unchanged.");

    const policyVersion = nextPolicyVersion(assignment.currentPolicyVersion);
    await repo.putPolicyVersion({
      assignmentId: input.assignmentId,
      policyVersion,
      policy: { ...input.policy, policyVersion },
      createdAt: input.now,
      createdByUserId: input.actor.userId,
      supersedes: assignment.currentPolicyVersion,
    });
    await repo.saveAssignment({
      ...assignment,
      currentPolicyVersion: policyVersion,
    });

    // The memory state records which policy its evidence is measured
    // against, so a threshold check never silently changes meaning.
    const state = await loadState(repo, assignment.targetId);
    await repo.saveMemoryState({ ...state, policyVersion, updatedAt: input.now });

    return {
      policyVersion,
      supersedes: assignment.currentPolicyVersion,
      changes,
    };
  }, { organizationId: input.actor.organizationId });
}
