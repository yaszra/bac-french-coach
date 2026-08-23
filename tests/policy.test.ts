/**
 * Authorization and tenant isolation — acceptance criteria 8, 9, 14, 15.
 */
import { describe, expect, it } from "vitest";
import { authorize, type Actor, type PolicyContext, type Resource } from "../src/auth/policy.js";
import {
  ACADEMY_A,
  CLASS_A,
  LEARNER_A,
  ORG_A,
  ORG_B,
  T0,
  approvedGuardianship,
  enrollmentsA,
  guardian,
  learner,
  pendingGuardianship,
  teacher,
  tutoringGuardian,
} from "./helpers.js";

function ctx(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    guardianRelationships: [],
    enrollments: enrollmentsA,
    now: T0,
    ...overrides,
  };
}

const assignmentResource: Resource = {
  kind: "assignment",
  organizationId: ORG_A,
  academyId: ACADEMY_A,
  classroomId: CLASS_A,
  learnerId: LEARNER_A,
  ownerUserId: "teacher-a",
  ownerRole: "teacher",
};

describe("criterion 15 — cross-tenant access fails, and fails indistinguishably", () => {
  it("denies a foreign-tenant resource as not_found, never as forbidden", () => {
    const d = authorize(
      teacher(),
      "learner.profile.view",
      { ...assignmentResource, organizationId: ORG_B },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("not_found");
  });

  it("applies the tenant gate before any role or relationship check", () => {
    // An org admin with every capability still cannot reach another tenant.
    const admin = teacher({
      roles: [{ role: "org_admin" }],
    });
    const d = authorize(
      admin,
      "audit.read",
      { kind: "audit_log", organizationId: ORG_B },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("not_found");
  });

  it("does not leak existence through the denial reason", () => {
    const d = authorize(
      teacher(),
      "learner.profile.view",
      { ...assignmentResource, organizationId: ORG_B, learnerId: "secret-child" },
      ctx(),
    );
    if (!d.allowed) expect(d.reason).not.toContain("secret-child");
  });
});

describe("criterion 8 — a learner cannot self-approve teacher-assigned work", () => {
  it("denies a learner recording a verification on their own assignment", () => {
    const d = authorize(
      learner(),
      "verification.record",
      { ...assignmentResource, evidenceThresholdMet: true },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("forbidden");
  });

  it("denies even when the request claims the learner owns the assignment", () => {
    // Parameter mutation: the payload claims ownership; the stored resource
    // is what the policy reads.
    const d = authorize(
      learner(),
      "verification.record",
      { ...assignmentResource, ownerUserId: LEARNER_A, evidenceThresholdMet: true },
      ctx(),
    );
    expect(d.allowed).toBe(false);
  });

  it("denies a learner acting on another learner's work", () => {
    const d = authorize(
      learner(),
      "learner.attempt.submit",
      { ...assignmentResource, learnerId: "someone-else" },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("forbidden");
  });

  it("allows a learner to submit their own attempt", () => {
    expect(
      authorize(learner(), "learner.attempt.submit", assignmentResource, ctx()).allowed,
    ).toBe(true);
  });
});

describe("criterion 9 — only an authorized verifier records the oral decision", () => {
  it("allows a teacher who teaches the learner", () => {
    const d = authorize(
      teacher(),
      "verification.record",
      { ...assignmentResource, evidenceThresholdMet: true },
      ctx(),
    );
    expect(d.allowed).toBe(true);
  });

  it("denies a teacher from another classroom in the same academy", () => {
    const other = teacher({
      userId: "teacher-other",
      roles: [{ role: "teacher", academyId: ACADEMY_A, classroomIds: ["class-z"] }],
    });
    const d = authorize(
      other,
      "verification.record",
      { ...assignmentResource, evidenceThresholdMet: true },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("forbidden");
  });

  it("refuses verification when the evidence threshold is not met", () => {
    const d = authorize(
      teacher(),
      "verification.record",
      { ...assignmentResource, evidenceThresholdMet: false },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("policy_not_met");
  });

  it("requires MFA for staff", () => {
    const d = authorize(
      teacher({ mfaSatisfied: false }),
      "verification.record",
      { ...assignmentResource, evidenceThresholdMet: true },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("mfa_required");
  });

  it("rejects an invalid session before anything else", () => {
    const d = authorize(
      teacher({ sessionValid: false }),
      "verification.record",
      { ...assignmentResource, evidenceThresholdMet: true },
      ctx(),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("unauthenticated");
  });
});

describe("criterion 14 — guardian claims and tutoring grants", () => {
  it("a pending claim grants nothing and does not confirm the child exists", () => {
    const d = authorize(
      guardian(),
      "child.report.view",
      { kind: "child_report", organizationId: ORG_A, learnerId: LEARNER_A },
      ctx({ guardianRelationships: [pendingGuardianship("guardian-a", LEARNER_A)] }),
    );
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("not_found");
  });

  it("an approved claim with view permission grants the report", () => {
    const d = authorize(
      guardian(),
      "child.report.view",
      { kind: "child_report", organizationId: ORG_A, learnerId: LEARNER_A },
      ctx({ guardianRelationships: [approvedGuardianship("guardian-a", LEARNER_A)] }),
    );
    expect(d.allowed).toBe(true);
  });

  it("revocation takes effect immediately, at decision time", () => {
    const revoked = approvedGuardianship("guardian-a", LEARNER_A, {
      revokedAt: T0 - 1,
    });
    const d = authorize(
      guardian(),
      "child.report.view",
      { kind: "child_report", organizationId: ORG_A, learnerId: LEARNER_A },
      ctx({ guardianRelationships: [revoked] }),
    );
    expect(d.allowed).toBe(false);
  });

  it("an expired grant stops working without any cleanup job running", () => {
    const expired = approvedGuardianship("guardian-a", LEARNER_A, {
      expiresAt: T0 - 1,
    });
    const d = authorize(
      guardian(),
      "child.report.view",
      { kind: "child_report", organizationId: ORG_A, learnerId: LEARNER_A },
      ctx({ guardianRelationships: [expired] }),
    );
    expect(d.allowed).toBe(false);
  });

  it("viewing a child never implies permission to tutor and approve", () => {
    const viewOnly = approvedGuardianship("tutor-a", LEARNER_A, {
      canViewChild: true,
      canTutorAndApprove: false,
    });
    const c = ctx({ guardianRelationships: [viewOnly] });
    expect(
      authorize(
        tutoringGuardian(),
        "child.report.view",
        { kind: "child_report", organizationId: ORG_A, learnerId: LEARNER_A },
        c,
      ).allowed,
    ).toBe(true);
    expect(
      authorize(
        tutoringGuardian(),
        "verification.record",
        { ...assignmentResource, ownerUserId: "tutor-a", evidenceThresholdMet: true },
        c,
      ).allowed,
    ).toBe(false);
  });

  it("a tutoring guardian may approve only work they created themselves", () => {
    const grant = approvedGuardianship("tutor-a", LEARNER_A, {
      canViewChild: true,
      canTutorAndApprove: true,
    });
    const c = ctx({ guardianRelationships: [grant] });

    // Teacher-created work: denied.
    expect(
      authorize(
        tutoringGuardian(),
        "verification.record",
        { ...assignmentResource, evidenceThresholdMet: true },
        c,
      ).allowed,
    ).toBe(false);

    // Their own work: allowed.
    expect(
      authorize(
        tutoringGuardian(),
        "verification.record",
        {
          ...assignmentResource,
          ownerUserId: "tutor-a",
          ownerRole: "tutoring_guardian",
          evidenceThresholdMet: true,
        },
        c,
      ).allowed,
    ).toBe(true);
  });

  it("an academy administrator can revoke a tutoring grant", () => {
    const admin: Actor = {
      userId: "admin-a",
      organizationId: ORG_A,
      roles: [{ role: "academy_admin", academyId: ACADEMY_A }],
      sessionValid: true,
      mfaSatisfied: true,
    };
    const d = authorize(
      admin,
      "tutoring.grant.revoke",
      { kind: "tutoring_grant", organizationId: ORG_A, learnerId: LEARNER_A },
      ctx(),
    );
    expect(d.allowed).toBe(true);
  });
});

describe("role capability is necessary but never sufficient", () => {
  it("denies an action no held role can perform", () => {
    const d = authorize(learner(), "content.release", {
      kind: "content_release",
      organizationId: ORG_A,
    }, ctx());
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe("forbidden");
  });

  it("denies a teacher reading the audit log", () => {
    expect(
      authorize(teacher(), "audit.read", { kind: "audit_log", organizationId: ORG_A }, ctx())
        .allowed,
    ).toBe(false);
  });
});
