import { describe, expect, it } from "vitest";
import { can, assertCan, NotAuthorized, type Actor } from "./can";

const NOW = new Date("2026-08-23T10:00:00Z");

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "u_teacher",
    organizationId: "org_a",
    grants: [],
    relationships: [],
    ...overrides,
  };
}

describe("can()", () => {
  it("refuses anything in another organisation", () => {
    const a = actor({
      grants: [{ role: "owner", scopeType: "organization", scopeId: "org_a", expiresAt: null }],
    });
    const d = can(a, "admin:manageMembers", { type: "organization", id: "org_b" }, NOW);
    expect(d).toEqual({ allowed: false, reason: "cross_tenant" });
  });

  it("refuses without a role grant", () => {
    const d = can(actor(), "teach:assign", { type: "learner", id: "u_kid" }, NOW);
    expect(d.allowed).toBe(false);
  });

  it("ignores expired grants", () => {
    const a = actor({
      grants: [
        {
          role: "teacher",
          scopeType: "organization",
          scopeId: "org_a",
          expiresAt: new Date("2026-08-01T00:00:00Z"),
        },
      ],
      relationships: [
        { kind: "teacher_student", learnerUserId: "u_kid", state: "approved", canTutor: false },
      ],
    });
    expect(can(a, "teach:viewStudent", { type: "learner", id: "u_kid" }, NOW).allowed).toBe(false);
  });

  it("lets a teacher act on a learner they are linked to", () => {
    const a = actor({
      grants: [{ role: "teacher", scopeType: "organization", scopeId: "org_a", expiresAt: null }],
      relationships: [
        { kind: "teacher_student", learnerUserId: "u_kid", state: "approved", canTutor: false },
      ],
    });
    const d = can(a, "teach:verifyRecitation", { type: "learner", id: "u_kid" }, NOW);
    expect(d).toEqual({ allowed: true, via: "relationship:teacher_student" });
  });

  it("treats a guardian's unapproved claim as a claim, not access", () => {
    const a = actor({
      userId: "u_parent",
      grants: [{ role: "guardian", scopeType: "organization", scopeId: "org_a", expiresAt: null }],
      relationships: [
        { kind: "guardian_child", learnerUserId: "u_kid", state: "claimed", canTutor: true },
      ],
    });
    expect(can(a, "family:viewChild", { type: "learner", id: "u_kid" }, NOW)).toEqual({
      allowed: false,
      reason: "claim_not_yet_approved",
    });
  });

  it("lets an approved guardian view but not assign unless they tutor", () => {
    const base = {
      userId: "u_parent",
      grants: [
        { role: "guardian" as const, scopeType: "organization" as const, scopeId: "org_a", expiresAt: null },
      ],
    };
    const watching = actor({
      ...base,
      relationships: [
        { kind: "guardian_child", learnerUserId: "u_kid", state: "approved", canTutor: false },
      ],
    });
    expect(can(watching, "family:viewChild", { type: "learner", id: "u_kid" }, NOW).allowed).toBe(true);
    expect(can(watching, "teach:assign", { type: "learner", id: "u_kid" }, NOW)).toEqual({
      allowed: false,
      reason: "guardian_not_tutoring",
    });

    const tutoring = actor({
      ...base,
      relationships: [
        { kind: "guardian_child", learnerUserId: "u_kid", state: "approved", canTutor: true },
      ],
    });
    expect(can(tutoring, "teach:assign", { type: "learner", id: "u_kid" }, NOW).allowed).toBe(true);
  });

  it("keeps a learner inside their own scope", () => {
    const kid = actor({
      userId: "u_kid",
      grants: [{ role: "learner", scopeType: "learner", scopeId: "u_kid", expiresAt: null }],
    });
    expect(can(kid, "learn:submitAttempt", { type: "learner", id: "u_kid" }, NOW).allowed).toBe(true);
    expect(can(kid, "learn:submitAttempt", { type: "learner", id: "u_other" }, NOW)).toEqual({
      allowed: false,
      reason: "no_role_grant",
    });
  });

  it("lets a classroom-scoped grant reach that classroom's learners only", () => {
    const a = actor({
      grants: [{ role: "teacher", scopeType: "classroom", scopeId: "c1", expiresAt: null }],
      classroomLearnerIds: ["u_kid"],
      relationships: [
        { kind: "teacher_student", learnerUserId: "u_kid", state: "approved", canTutor: false },
      ],
    });
    expect(can(a, "teach:viewStudent", { type: "learner", id: "u_kid" }, NOW).allowed).toBe(true);
    expect(can(a, "teach:viewStudent", { type: "learner", id: "u_elsewhere" }, NOW).allowed).toBe(false);
  });

  it("gives no role a silent superpower — an owner still needs a grant in scope", () => {
    const a = actor({
      grants: [{ role: "owner", scopeType: "classroom", scopeId: "c1", expiresAt: null }],
    });
    expect(can(a, "admin:manageRoles", { type: "organization", id: "org_a" }, NOW).allowed).toBe(false);
  });

  it("assertCan throws NotAuthorized with the reason", () => {
    expect(() => assertCan(actor(), "teach:assign", { type: "learner", id: "u_kid" }, NOW)).toThrow(
      NotAuthorized,
    );
  });
});
