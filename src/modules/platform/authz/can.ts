import type { Role, ScopeType } from "@prisma/client";

/**
 * One authorisation question, asked the same way everywhere:
 *
 *     can(actor, "verify:recitation", { type: "learner", id: learnerId })
 *
 * Authority comes from two places and no others:
 *   · RoleGrants — a role held AT a scope, optionally expiring.
 *   · Relationship grants — teacher↔student and guardian↔child, the latter
 *     only counting once approved, and only assigning/verifying when canTutor.
 *
 * There is no ambient "admin can do anything" branch: an owner's power is
 * expressed as grants at the organisation scope, so it is auditable.
 */

export type Action =
  // learning
  | "learn:practise"
  | "learn:submitAttempt"
  | "learn:requestVerification"
  // teaching
  | "teach:viewStudent"
  | "teach:assign"
  | "teach:verifyRecitation"
  | "teach:flagKhatma"
  | "teach:manageClassroom"
  // family
  | "family:claimChild"
  | "family:viewChild"
  | "family:assignHomeTask"
  | "family:manageConsent"
  | "family:exportData"
  // administration
  | "admin:manageMembers"
  | "admin:manageRoles"
  | "admin:viewSchoolReports"
  | "admin:handleDataRequest"
  // studio
  | "studio:reviewContent"
  | "studio:reviewAudio"
  | "studio:editLesson";

export type Scope = { readonly type: ScopeType; readonly id: string };

export type ActorGrant = {
  readonly role: Role;
  readonly scopeType: ScopeType;
  readonly scopeId: string;
  readonly expiresAt: Date | null;
};

export type ActorRelationship = {
  readonly kind: "teacher_student" | "guardian_child";
  readonly learnerUserId: string;
  readonly state: "claimed" | "approved" | "revoked";
  readonly canTutor: boolean;
};

export type Actor = {
  readonly userId: string;
  readonly organizationId: string;
  readonly grants: readonly ActorGrant[];
  readonly relationships: readonly ActorRelationship[];
  /** Scope ids the actor's classroom-scoped grants cover, resolved by the caller. */
  readonly classroomLearnerIds?: readonly string[];
};

/** Which roles may perform an action at all, before scope is considered. */
const ROLES_FOR_ACTION: Readonly<Record<Action, readonly Role[]>> = {
  "learn:practise": ["learner"],
  "learn:submitAttempt": ["learner"],
  "learn:requestVerification": ["learner"],

  "teach:viewStudent": ["teacher", "assistant", "admin", "owner", "guardian"],
  "teach:assign": ["teacher", "admin", "owner", "guardian"],
  "teach:verifyRecitation": ["teacher", "admin", "owner", "guardian"],
  "teach:flagKhatma": ["teacher", "assistant", "admin", "owner"],
  "teach:manageClassroom": ["teacher", "admin", "owner"],

  "family:claimChild": ["guardian"],
  "family:viewChild": ["guardian"],
  "family:assignHomeTask": ["guardian"],
  "family:manageConsent": ["guardian", "admin", "owner"],
  "family:exportData": ["guardian", "admin", "owner"],

  "admin:manageMembers": ["admin", "owner"],
  "admin:manageRoles": ["owner"],
  "admin:viewSchoolReports": ["admin", "owner"],
  "admin:handleDataRequest": ["admin", "owner", "support"],

  "studio:reviewContent": ["studio"],
  "studio:reviewAudio": ["studio"],
  "studio:editLesson": ["studio"],
};

/** Actions a guardian may only perform when the link says they tutor. */
const REQUIRES_TUTORING: ReadonlySet<Action> = new Set<Action>([
  "teach:assign",
  "teach:verifyRecitation",
]);

/** Actions that are about one learner and therefore need a relationship. */
const LEARNER_SCOPED: ReadonlySet<Action> = new Set<Action>([
  "teach:viewStudent",
  "teach:assign",
  "teach:verifyRecitation",
  "teach:flagKhatma",
  "family:viewChild",
  "family:assignHomeTask",
  "family:manageConsent",
  "family:exportData",
]);

export type Decision =
  | { readonly allowed: true; readonly via: string }
  | { readonly allowed: false; readonly reason: string };

function activeGrants(actor: Actor, now: Date): readonly ActorGrant[] {
  return actor.grants.filter((g) => g.expiresAt === null || g.expiresAt > now);
}

function coversScope(grant: ActorGrant, scope: Scope, actor: Actor): boolean {
  // An organisation-scoped grant covers everything inside that organisation.
  if (grant.scopeType === "organization") return grant.scopeId === actor.organizationId;
  if (grant.scopeType === scope.type && grant.scopeId === scope.id) return true;
  // A classroom-scoped grant covers the learners the caller resolved for it.
  if (grant.scopeType === "classroom" && scope.type === "learner") {
    return actor.classroomLearnerIds?.includes(scope.id) ?? false;
  }
  return false;
}

export function can(actor: Actor, action: Action, scope: Scope, now: Date = new Date()): Decision {
  if (scope.type === "organization" && scope.id !== actor.organizationId) {
    return { allowed: false, reason: "cross_tenant" };
  }

  const permitted = ROLES_FOR_ACTION[action];
  const grants = activeGrants(actor, now).filter(
    (g) => permitted.includes(g.role) && coversScope(g, scope, actor),
  );
  if (grants.length === 0) return { allowed: false, reason: "no_role_grant" };

  // A learner acts only upon themselves.
  if (grants.every((g) => g.role === "learner")) {
    const self = scope.type === "learner" && scope.id === actor.userId;
    return self
      ? { allowed: true, via: "learner:self" }
      : { allowed: false, reason: "learner_scope_is_self_only" };
  }

  if (LEARNER_SCOPED.has(action) && scope.type === "learner") {
    const link = actor.relationships.find(
      (r) => r.learnerUserId === scope.id && r.state === "approved",
    );
    const isStaff = grants.some((g) => g.role !== "guardian");

    if (!link && !isStaff) {
      const pending = actor.relationships.some(
        (r) => r.learnerUserId === scope.id && r.state === "claimed",
      );
      // A claim is a claim, not access. It waits for a teacher.
      return { allowed: false, reason: pending ? "claim_not_yet_approved" : "no_relationship" };
    }
    if (link?.kind === "guardian_child" && REQUIRES_TUTORING.has(action) && !link.canTutor) {
      return { allowed: false, reason: "guardian_not_tutoring" };
    }
    return { allowed: true, via: link ? `relationship:${link.kind}` : "role:staff" };
  }

  const strongest = grants[0];
  return { allowed: true, via: `role:${strongest?.role ?? "unknown"}` };
}

/** Throwing form, for action handlers that should never proceed unauthorised. */
export class NotAuthorized extends Error {
  constructor(
    readonly action: Action,
    readonly reason: string,
  ) {
    super(`not authorized: ${action} (${reason})`);
    this.name = "NotAuthorized";
  }
}

export function assertCan(actor: Actor, action: Action, scope: Scope, now?: Date): void {
  const decision = can(actor, action, scope, now);
  if (!decision.allowed) throw new NotAuthorized(action, decision.reason);
}
