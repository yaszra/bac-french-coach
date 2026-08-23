/**
 * Centralized server-side authorization.
 *
 * Frontend hiding is never authorization. Every decision runs the same six
 * steps in the same order, and the tenant gate runs *before* the resource
 * is inspected — so a cross-tenant identifier can never be confirmed to
 * exist, even by timing or error shape.
 */

export type Role =
  | "platform_operator"
  | "org_admin"
  | "academy_admin"
  | "academic_director"
  | "teacher"
  | "assistant_teacher"
  | "guardian"
  | "tutoring_guardian"
  | "learner";

const STAFF_ROLES: ReadonlySet<Role> = new Set([
  "platform_operator",
  "org_admin",
  "academy_admin",
  "academic_director",
  "teacher",
  "assistant_teacher",
]);

export type Action =
  | "learner.practice.view"
  | "learner.attempt.submit"
  | "learner.recitation.request"
  | "verification.record"
  | "assignment.create"
  | "assignment.policy.edit"
  | "learner.profile.view"
  | "child.report.view"
  | "guardian.claim.approve"
  | "tutoring.grant.revoke"
  | "content.release"
  | "audit.read"
  | "learner.data.export";

export interface RoleAssignment {
  role: Role;
  academyId?: string;
  /** Classrooms this staff member actually teaches. */
  classroomIds?: readonly string[];
}

export interface Actor {
  userId: string;
  /**
   * Active organization, derived from the session — never from a request
   * parameter. This is the whole basis of tenant isolation.
   */
  organizationId: string;
  roles: readonly RoleAssignment[];
  sessionValid: boolean;
  mfaSatisfied: boolean;
}

export type ResourceKind =
  | "assignment"
  | "learner"
  | "verification_request"
  | "child_report"
  | "guardian_claim"
  | "tutoring_grant"
  | "content_release"
  | "audit_log";

export interface Resource {
  kind: ResourceKind;
  organizationId: string;
  academyId?: string;
  classroomId?: string;
  /** The learner this resource concerns, when applicable. */
  learnerId?: string;
  /** Who created the assignment behind this resource. */
  ownerUserId?: string;
  ownerRole?: Role;
  /** For verification requests: has the evidence threshold been met? */
  evidenceThresholdMet?: boolean;
}

export interface GuardianRelationship {
  guardianUserId: string;
  childUserId: string;
  status: "pending" | "approved" | "rejected";
  canViewChild: boolean;
  /** Separate capability. Viewing never implies tutoring. */
  canTutorAndApprove: boolean;
  /** Non-null means revoked; checked live, never cached into a session. */
  revokedAt: number | null;
  expiresAt: number | null;
}

export interface Enrollment {
  learnerId: string;
  classroomId: string;
  academyId: string;
}

/** Everything the decision needs, loaded fresh. Nothing is cached in a token. */
export interface PolicyContext {
  guardianRelationships: readonly GuardianRelationship[];
  enrollments: readonly Enrollment[];
  now: number;
}

export type DenialCode =
  | "unauthenticated"
  | "not_found"
  | "forbidden"
  | "mfa_required"
  | "policy_not_met";

export type Decision =
  | { allowed: true }
  | { allowed: false; code: DenialCode; reason: string };

const allow = (): Decision => ({ allowed: true });
const deny = (code: DenialCode, reason: string): Decision => ({
  allowed: false,
  code,
  reason,
});

/**
 * Which roles may perform an action *at all*, before relationships.
 * `true` here is necessary, never sufficient.
 */
const ROLE_CAPABILITY: Readonly<Record<Action, ReadonlySet<Role>>> = {
  "learner.practice.view": new Set<Role>([
    "learner",
    "teacher",
    "assistant_teacher",
    "academy_admin",
    "academic_director",
    "guardian",
    "tutoring_guardian",
  ]),
  "learner.attempt.submit": new Set<Role>(["learner"]),
  "learner.recitation.request": new Set<Role>(["learner"]),
  "verification.record": new Set<Role>([
    "teacher",
    "assistant_teacher",
    "academy_admin",
    "academic_director",
    "tutoring_guardian",
  ]),
  "assignment.create": new Set<Role>([
    "teacher",
    "assistant_teacher",
    "academy_admin",
    "academic_director",
    "tutoring_guardian",
  ]),
  "assignment.policy.edit": new Set<Role>([
    "teacher",
    "academy_admin",
    "academic_director",
    "tutoring_guardian",
  ]),
  "learner.profile.view": new Set<Role>([
    "teacher",
    "assistant_teacher",
    "academy_admin",
    "academic_director",
    "org_admin",
    "guardian",
    "tutoring_guardian",
  ]),
  "child.report.view": new Set<Role>([
    "teacher",
    "assistant_teacher",
    "academy_admin",
    "academic_director",
    "guardian",
    "tutoring_guardian",
  ]),
  "guardian.claim.approve": new Set<Role>([
    "org_admin",
    "academy_admin",
    "academic_director",
  ]),
  "tutoring.grant.revoke": new Set<Role>([
    "org_admin",
    "academy_admin",
    "academic_director",
    "teacher",
    "guardian",
  ]),
  "content.release": new Set<Role>([
    "org_admin",
    "academy_admin",
    "academic_director",
  ]),
  "audit.read": new Set<Role>(["platform_operator", "org_admin", "academy_admin"]),
  "learner.data.export": new Set<Role>(["org_admin", "academy_admin", "guardian"]),
};

function rolesOf(actor: Actor): Set<Role> {
  return new Set(actor.roles.map((r) => r.role));
}

function isStaff(actor: Actor): boolean {
  return actor.roles.some((r) => STAFF_ROLES.has(r.role));
}

/** An active, approved guardian relationship — or undefined. */
export function activeGuardianship(
  ctx: PolicyContext,
  guardianUserId: string,
  childUserId: string,
): GuardianRelationship | undefined {
  return ctx.guardianRelationships.find(
    (g) =>
      g.guardianUserId === guardianUserId &&
      g.childUserId === childUserId &&
      g.status === "approved" &&
      g.revokedAt === null &&
      (g.expiresAt === null || g.expiresAt > ctx.now),
  );
}

/** Whether a staff member teaches this learner within this academy. */
function teachesLearner(
  actor: Actor,
  resource: Resource,
  ctx: PolicyContext,
): boolean {
  if (!resource.learnerId) return false;
  const enrollments = ctx.enrollments.filter(
    (e) => e.learnerId === resource.learnerId,
  );
  return actor.roles.some((ra) => {
    if (ra.role === "academy_admin" || ra.role === "academic_director")
      return enrollments.some((e) => e.academyId === ra.academyId);
    if (ra.role !== "teacher" && ra.role !== "assistant_teacher") return false;
    const taught = new Set(ra.classroomIds ?? []);
    return enrollments.some(
      (e) => e.academyId === ra.academyId && taught.has(e.classroomId),
    );
  });
}

/**
 * The single entry point for every authorization decision.
 */
export function authorize(
  actor: Actor,
  action: Action,
  resource: Resource,
  ctx: PolicyContext,
): Decision {
  // 1. Session -----------------------------------------------------------
  if (!actor.sessionValid)
    return deny("unauthenticated", "No valid session.");

  // 2. Tenant gate — BEFORE any resource inspection ----------------------
  // Cross-tenant access is indistinguishable from a missing resource.
  if (actor.organizationId !== resource.organizationId)
    return deny("not_found", "Resource not found.");

  // 3. Role capability ---------------------------------------------------
  const roles = rolesOf(actor);
  const capable = ROLE_CAPABILITY[action];
  const holdsCapableRole = [...roles].some((r) => capable.has(r));
  if (!holdsCapableRole)
    return deny("forbidden", `No role held by this actor may ${action}.`);

  // 4. MFA for staff -----------------------------------------------------
  if (isStaff(actor) && !actor.mfaSatisfied)
    return deny("mfa_required", "Staff accounts require multi-factor authentication.");

  // 5. Relationship and grant conditions ---------------------------------
  const isSelf = resource.learnerId === actor.userId;

  switch (action) {
    case "learner.attempt.submit":
    case "learner.recitation.request":
      // A learner may only ever act on themselves.
      if (!isSelf) return deny("forbidden", "Learners may only act on their own work.");
      return allow();

    case "learner.practice.view":
      if (roles.has("learner")) {
        if (!isSelf)
          return deny("forbidden", "Learners may only view their own practice.");
        return allow();
      }
      return relationshipForAdultViewing(actor, resource, ctx, roles);

    case "verification.record": {
      // Nobody verifies their own recitation — including an account that
      // holds a teaching role and is also enrolled as a learner. Checked
      // against the stored resource, never the request payload.
      if (isSelf)
        return deny("forbidden", "A learner cannot verify their own recitation.");

      if (resource.evidenceThresholdMet === false)
        return deny(
          "policy_not_met",
          "The assignment's evidence threshold is not satisfied.",
        );

      // A tutoring guardian may approve ONLY work they created, and only
      // while the grant is live.
      if (roles.has("tutoring_guardian") && !isStaff(actor)) {
        if (!resource.learnerId)
          return deny("forbidden", "No learner on this resource.");
        const grant = activeGuardianship(ctx, actor.userId, resource.learnerId);
        if (!grant || !grant.canTutorAndApprove)
          return deny("forbidden", "No active tutoring grant for this child.");
        if (resource.ownerUserId !== actor.userId)
          return deny(
            "forbidden",
            "A tutoring guardian may only approve work they created themselves.",
          );
        return allow();
      }

      if (!teachesLearner(actor, resource, ctx))
        return deny(
          "forbidden",
          "This learner is not in a classroom assigned to you.",
        );
      return allow();
    }

    case "assignment.create":
      if (roles.has("tutoring_guardian") && !isStaff(actor)) {
        if (!resource.learnerId)
          return deny("forbidden", "No learner on this resource.");
        const grant = activeGuardianship(ctx, actor.userId, resource.learnerId);
        if (!grant || !grant.canTutorAndApprove)
          return deny("forbidden", "No active tutoring grant for this child.");
        return allow();
      }
      if (roles.has("academy_admin") || roles.has("academic_director"))
        return allow();
      if (!teachesLearner(actor, resource, ctx))
        return deny("forbidden", "This learner is not in a classroom assigned to you.");
      return allow();

    case "assignment.policy.edit":
      if (roles.has("academy_admin") || roles.has("academic_director"))
        return allow();
      if (resource.ownerUserId !== actor.userId)
        return deny("forbidden", "Only the assignment owner may change its policy.");
      return allow();

    case "learner.profile.view":
    case "child.report.view":
      return relationshipForAdultViewing(actor, resource, ctx, roles);

    case "tutoring.grant.revoke":
      // Any authorized adult may revoke; revocation must never be blocked
      // by the grant holder's own state.
      if (roles.has("guardian") && !isStaff(actor)) {
        if (!resource.learnerId)
          return deny("forbidden", "No learner on this resource.");
        const own = activeGuardianship(ctx, actor.userId, resource.learnerId);
        if (!own)
          return deny("forbidden", "No approved relationship with this child.");
        return allow();
      }
      return allow();

    case "guardian.claim.approve":
    case "content.release":
    case "audit.read":
      return allow();

    case "learner.data.export":
      if (roles.has("guardian") && !isStaff(actor)) {
        if (!resource.learnerId)
          return deny("forbidden", "No learner on this resource.");
        const g = activeGuardianship(ctx, actor.userId, resource.learnerId);
        if (!g || !g.canViewChild)
          return deny("not_found", "Resource not found.");
        return allow();
      }
      return allow();
  }
}

/**
 * Adult viewing of a child's data.
 *
 * A pending claim grants nothing — and denies as `not_found`, so the
 * surface cannot be used to discover whether a child exists.
 */
function relationshipForAdultViewing(
  actor: Actor,
  resource: Resource,
  ctx: PolicyContext,
  roles: ReadonlySet<Role>,
): Decision {
  if (roles.has("guardian") || roles.has("tutoring_guardian")) {
    if (!isStaff(actor)) {
      if (!resource.learnerId) return deny("not_found", "Resource not found.");
      const g = activeGuardianship(ctx, actor.userId, resource.learnerId);
      if (!g || !g.canViewChild) return deny("not_found", "Resource not found.");
      return allow();
    }
  }
  if (roles.has("org_admin")) return allow();
  if (!teachesLearner(actor, resource, ctx))
    return deny("forbidden", "This learner is not in a classroom assigned to you.");
  return allow();
}

/** Throwing wrapper for command handlers. */
export class AuthorizationError extends Error {
  constructor(
    readonly code: DenialCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requireAuthorized(
  actor: Actor,
  action: Action,
  resource: Resource,
  ctx: PolicyContext,
): void {
  const decision = authorize(actor, action, resource, ctx);
  if (!decision.allowed)
    throw new AuthorizationError(decision.code, decision.reason);
}
