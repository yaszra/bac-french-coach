/**
 * Guardian and governance workflows.
 *
 * Consent, guardian claims, revocation, export, and deletion are product
 * surfaces with audit trails, not things an engineer does with psql. Every
 * command here writes an audit entry in the same transaction as its
 * effect, so "who approved this, and when?" is a query.
 *
 * The rule these exist to enforce: a pending claim grants nothing, and
 * revocation takes effect immediately.
 */
import type { EpochMs } from "../core/types.js";
import type { Actor, GuardianRelationship } from "../auth/policy.js";
import { AuthorizationError, authorize } from "../auth/policy.js";
import { CommandError } from "./commands.js";
import { nextId } from "./ids.js";

export interface AuditEntry {
  auditId: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  resourceKind: string;
  resourceId: string;
  outcome: "allowed" | "denied";
  reason: string | null;
  occurredAt: EpochMs;
}

export interface ClaimRecord extends GuardianRelationship {
  claimId: string;
  organizationId: string;
  claimedAt: EpochMs;
  approvedByUserId: string | null;
  approvedAt: EpochMs | null;
}

export interface ConsentRecord {
  consentId: string;
  organizationId: string;
  subjectUserId: string;
  grantedByUserId: string;
  purpose: string;
  grantedAt: EpochMs;
  withdrawnAt: EpochMs | null;
}

export type ExportStatus = "requested" | "ready" | "delivered" | "refused";
export type DeletionStatus = "requested" | "approved" | "completed" | "refused";

export interface DataRequestRecord {
  requestId: string;
  organizationId: string;
  subjectUserId: string;
  requestedByUserId: string;
  kind: "export" | "deletion";
  status: ExportStatus | DeletionStatus;
  requestedAt: EpochMs;
  decidedAt: EpochMs | null;
  decidedByUserId: string | null;
}

/**
 * Storage port for governance. Separate from the learning repository:
 * these records outlive learning data and are read by different people.
 */
export interface GovernanceStore {
  putClaim(record: ClaimRecord): Promise<void>;
  getClaim(claimId: string): Promise<ClaimRecord | undefined>;
  findClaim(
    guardianUserId: string,
    childUserId: string,
  ): Promise<ClaimRecord | undefined>;
  listClaimsForChild(childUserId: string): Promise<readonly ClaimRecord[]>;

  putConsent(record: ConsentRecord): Promise<void>;
  listConsents(subjectUserId: string): Promise<readonly ConsentRecord[]>;

  putDataRequest(record: DataRequestRecord): Promise<void>;
  getDataRequest(requestId: string): Promise<DataRequestRecord | undefined>;

  appendAudit(entry: AuditEntry): Promise<void>;
  listAudit(organizationId: string): Promise<readonly AuditEntry[]>;
}

function audit(
  actor: Actor | null,
  action: string,
  resourceKind: string,
  resourceId: string,
  outcome: "allowed" | "denied",
  reason: string | null,
  now: EpochMs,
  organizationId: string,
): AuditEntry {
  return {
    auditId: nextId(),
    organizationId,
    actorUserId: actor?.userId ?? null,
    action,
    resourceKind,
    resourceId,
    outcome,
    reason,
    occurredAt: now,
  };
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

/**
 * A guardian claims a relationship with a child.
 *
 * The claim is created in `pending` with no capabilities at all. Anyone can
 * claim; nobody gains anything by claiming. That asymmetry is what makes it
 * safe to let the flow be self-service.
 */
export async function claimGuardianship(
  store: GovernanceStore,
  input: { actor: Actor; now: EpochMs; childUserId: string },
): Promise<{ claimId: string; status: "pending" }> {
  const existing = await store.findClaim(input.actor.userId, input.childUserId);
  if (existing)
    throw new CommandError("conflict", "A claim already exists for this child.");

  const claimId = nextId();
  await store.putClaim({
    claimId,
    organizationId: input.actor.organizationId,
    guardianUserId: input.actor.userId,
    childUserId: input.childUserId,
    status: "pending",
    // Explicitly false. A pending claim carries no capability, and the
    // database CHECK constraint refuses any row that says otherwise.
    canViewChild: false,
    canTutorAndApprove: false,
    revokedAt: null,
    expiresAt: null,
    claimedAt: input.now,
    approvedByUserId: null,
    approvedAt: null,
  });
  await store.appendAudit(
    audit(
      input.actor,
      "guardian.claim.created",
      "guardian_claim",
      claimId,
      "allowed",
      null,
      input.now,
      input.actor.organizationId,
    ),
  );
  return { claimId, status: "pending" };
}

export interface ApproveClaimInput {
  actor: Actor;
  now: EpochMs;
  claimId: string;
  /** The two capabilities are granted separately and deliberately. */
  canViewChild: boolean;
  canTutorAndApprove: boolean;
  /** Optional expiry. A grant with an end date is easier to justify. */
  expiresAt?: EpochMs;
}

export async function approveGuardianClaim(
  store: GovernanceStore,
  input: ApproveClaimInput,
): Promise<ClaimRecord> {
  const claim = await store.getClaim(input.claimId);
  if (!claim || claim.organizationId !== input.actor.organizationId)
    throw new CommandError("not_found", "Resource not found.");

  const decision = authorize(
    input.actor,
    "guardian.claim.approve",
    {
      kind: "guardian_claim",
      organizationId: claim.organizationId,
      learnerId: claim.childUserId,
    },
    { guardianRelationships: [], enrollments: [], now: input.now },
  );
  if (!decision.allowed) {
    await store.appendAudit(
      audit(
        input.actor,
        "guardian.claim.approve",
        "guardian_claim",
        input.claimId,
        "denied",
        decision.reason,
        input.now,
        claim.organizationId,
      ),
    );
    throw new AuthorizationError(decision.code, decision.reason);
  }

  if (claim.status !== "pending")
    throw new CommandError("conflict", `This claim is already ${claim.status}.`);

  // Tutoring without viewing is incoherent: an adult who may approve a
  // child's work must be able to see it.
  if (input.canTutorAndApprove && !input.canViewChild)
    throw new CommandError(
      "policy_not_met",
      "Tutoring permission requires permission to view the child.",
    );

  const approved: ClaimRecord = {
    ...claim,
    status: "approved",
    canViewChild: input.canViewChild,
    canTutorAndApprove: input.canTutorAndApprove,
    approvedByUserId: input.actor.userId,
    approvedAt: input.now,
    ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
  };
  await store.putClaim(approved);
  await store.appendAudit(
    audit(
      input.actor,
      "guardian.claim.approved",
      "guardian_claim",
      input.claimId,
      "allowed",
      `view=${input.canViewChild} tutor=${input.canTutorAndApprove}`,
      input.now,
      claim.organizationId,
    ),
  );
  return approved;
}

/**
 * Revoke a grant.
 *
 * Takes effect immediately: authorization reads `revokedAt` live on every
 * decision, so there is no session to expire and no cache to invalidate.
 * Any authorized adult can do this, and a revocation is never blocked by
 * the grant holder's own state.
 */
export async function revokeGuardianship(
  store: GovernanceStore,
  input: { actor: Actor; now: EpochMs; claimId: string; reason: string },
): Promise<ClaimRecord> {
  const claim = await store.getClaim(input.claimId);
  if (!claim || claim.organizationId !== input.actor.organizationId)
    throw new CommandError("not_found", "Resource not found.");

  const decision = authorize(
    input.actor,
    "tutoring.grant.revoke",
    {
      kind: "tutoring_grant",
      organizationId: claim.organizationId,
      learnerId: claim.childUserId,
    },
    {
      guardianRelationships: [claim],
      enrollments: [],
      now: input.now,
    },
  );
  if (!decision.allowed) {
    await store.appendAudit(
      audit(
        input.actor,
        "guardian.grant.revoke",
        "tutoring_grant",
        input.claimId,
        "denied",
        decision.reason,
        input.now,
        claim.organizationId,
      ),
    );
    throw new AuthorizationError(decision.code, decision.reason);
  }

  const revoked: ClaimRecord = {
    ...claim,
    revokedAt: input.now,
    canViewChild: false,
    canTutorAndApprove: false,
  };
  await store.putClaim(revoked);
  await store.appendAudit(
    audit(
      input.actor,
      "guardian.grant.revoked",
      "tutoring_grant",
      input.claimId,
      "allowed",
      input.reason,
      input.now,
      claim.organizationId,
    ),
  );
  return revoked;
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

export async function recordConsent(
  store: GovernanceStore,
  input: {
    actor: Actor;
    now: EpochMs;
    subjectUserId: string;
    /** Specific and stated. "General purposes" is not a purpose. */
    purpose: string;
  },
): Promise<ConsentRecord> {
  if (input.purpose.trim().length < 8)
    throw new CommandError(
      "policy_not_met",
      "Consent requires a specific stated purpose.",
    );

  const record: ConsentRecord = {
    consentId: nextId(),
    organizationId: input.actor.organizationId,
    subjectUserId: input.subjectUserId,
    grantedByUserId: input.actor.userId,
    purpose: input.purpose,
    grantedAt: input.now,
    withdrawnAt: null,
  };
  await store.putConsent(record);
  await store.appendAudit(
    audit(
      input.actor,
      "consent.granted",
      "consent",
      record.consentId,
      "allowed",
      input.purpose,
      input.now,
      record.organizationId,
    ),
  );
  return record;
}

export async function withdrawConsent(
  store: GovernanceStore,
  input: { actor: Actor; now: EpochMs; consentId: string; subjectUserId: string },
): Promise<void> {
  const consents = await store.listConsents(input.subjectUserId);
  const consent = consents.find((c) => c.consentId === input.consentId);
  if (!consent || consent.organizationId !== input.actor.organizationId)
    throw new CommandError("not_found", "Resource not found.");
  if (consent.withdrawnAt !== null)
    throw new CommandError("conflict", "This consent was already withdrawn.");

  await store.putConsent({ ...consent, withdrawnAt: input.now });
  await store.appendAudit(
    audit(
      input.actor,
      "consent.withdrawn",
      "consent",
      input.consentId,
      "allowed",
      consent.purpose,
      input.now,
      consent.organizationId,
    ),
  );
}

// ---------------------------------------------------------------------------
// Export and deletion
// ---------------------------------------------------------------------------

export async function requestDataExport(
  store: GovernanceStore,
  input: {
    actor: Actor;
    now: EpochMs;
    subjectUserId: string;
    guardianships: readonly GuardianRelationship[];
  },
): Promise<DataRequestRecord> {
  const decision = authorize(
    input.actor,
    "learner.data.export",
    {
      kind: "learner",
      organizationId: input.actor.organizationId,
      learnerId: input.subjectUserId,
    },
    {
      guardianRelationships: input.guardianships,
      enrollments: [],
      now: input.now,
    },
  );
  if (!decision.allowed) {
    await store.appendAudit(
      audit(
        input.actor,
        "data.export.requested",
        "learner",
        input.subjectUserId,
        "denied",
        decision.reason,
        input.now,
        input.actor.organizationId,
      ),
    );
    throw new AuthorizationError(decision.code, decision.reason);
  }

  const record: DataRequestRecord = {
    requestId: nextId(),
    organizationId: input.actor.organizationId,
    subjectUserId: input.subjectUserId,
    requestedByUserId: input.actor.userId,
    kind: "export",
    status: "requested",
    requestedAt: input.now,
    decidedAt: null,
    decidedByUserId: null,
  };
  await store.putDataRequest(record);
  await store.appendAudit(
    audit(
      input.actor,
      "data.export.requested",
      "learner",
      input.subjectUserId,
      "allowed",
      null,
      input.now,
      record.organizationId,
    ),
  );
  return record;
}

/**
 * Request deletion.
 *
 * Deliberately two-step: requesting is not deleting. Learning evidence is
 * append-only and may be under a retention obligation the academy owes to
 * someone other than the requester, so an authorized adult decides.
 */
export async function requestDeletion(
  store: GovernanceStore,
  input: {
    actor: Actor;
    now: EpochMs;
    subjectUserId: string;
    guardianships: readonly GuardianRelationship[];
  },
): Promise<DataRequestRecord> {
  const decision = authorize(
    input.actor,
    "learner.data.export",
    {
      kind: "learner",
      organizationId: input.actor.organizationId,
      learnerId: input.subjectUserId,
    },
    {
      guardianRelationships: input.guardianships,
      enrollments: [],
      now: input.now,
    },
  );
  if (!decision.allowed)
    throw new AuthorizationError(decision.code, decision.reason);

  const record: DataRequestRecord = {
    requestId: nextId(),
    organizationId: input.actor.organizationId,
    subjectUserId: input.subjectUserId,
    requestedByUserId: input.actor.userId,
    kind: "deletion",
    status: "requested",
    requestedAt: input.now,
    decidedAt: null,
    decidedByUserId: null,
  };
  await store.putDataRequest(record);
  await store.appendAudit(
    audit(
      input.actor,
      "data.deletion.requested",
      "learner",
      input.subjectUserId,
      "allowed",
      null,
      input.now,
      record.organizationId,
    ),
  );
  return record;
}

export async function decideDataRequest(
  store: GovernanceStore,
  input: {
    actor: Actor;
    now: EpochMs;
    requestId: string;
    outcome: "approved" | "refused";
    reason: string;
  },
): Promise<DataRequestRecord> {
  const request = await store.getDataRequest(input.requestId);
  if (!request || request.organizationId !== input.actor.organizationId)
    throw new CommandError("not_found", "Resource not found.");
  if (request.status !== "requested")
    throw new CommandError("conflict", `This request is already ${request.status}.`);

  const isAdmin = input.actor.roles.some(
    (r) => r.role === "org_admin" || r.role === "academy_admin",
  );
  if (!isAdmin)
    throw new AuthorizationError(
      "forbidden",
      "Only an administrator can decide a data request.",
    );

  // A refusal must say why. An unexplained refusal is not a decision a
  // subject can challenge.
  if (input.outcome === "refused" && input.reason.trim().length === 0)
    throw new CommandError("policy_not_met", "A refusal must state its reason.");

  const decided: DataRequestRecord = {
    ...request,
    status: input.outcome === "approved"
      ? request.kind === "export"
        ? "ready"
        : "approved"
      : "refused",
    decidedAt: input.now,
    decidedByUserId: input.actor.userId,
  };
  await store.putDataRequest(decided);
  await store.appendAudit(
    audit(
      input.actor,
      `data.${request.kind}.${input.outcome}`,
      "learner",
      request.subjectUserId,
      "allowed",
      input.reason,
      input.now,
      request.organizationId,
    ),
  );
  return decided;
}
