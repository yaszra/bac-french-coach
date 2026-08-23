/**
 * Test world builder.
 *
 * Builds one academy, one teacher, one learner, one guardian — the Phase 1
 * slice — so acceptance tests read as journeys rather than as fixtures.
 */
import type { Actor, Enrollment, GuardianRelationship } from "../src/auth/policy.js";
import { InMemoryRepository } from "../src/app/memory-store.js";
import { Outbox, resetEventSequence } from "../src/app/events.js";
import { resetIdSequence, type Deps } from "../src/app/commands.js";
import type { LearnerId } from "../src/core/types.js";

export const ORG_A = "org-a";
export const ORG_B = "org-b";
export const ACADEMY_A = "academy-a";
export const CLASS_A = "class-a";

export const LEARNER_A = "learner-a" as LearnerId;
export const LEARNER_B = "learner-b" as LearnerId;

export const T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
export const DAY = 86_400_000;

export function teacher(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "teacher-a",
    organizationId: ORG_A,
    roles: [{ role: "teacher", academyId: ACADEMY_A, classroomIds: [CLASS_A] }],
    sessionValid: true,
    mfaSatisfied: true,
    ...overrides,
  };
}

export function learner(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: LEARNER_A,
    organizationId: ORG_A,
    roles: [{ role: "learner" }],
    sessionValid: true,
    mfaSatisfied: false,
    ...overrides,
  };
}

export function guardian(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "guardian-a",
    organizationId: ORG_A,
    roles: [{ role: "guardian" }],
    sessionValid: true,
    mfaSatisfied: false,
    ...overrides,
  };
}

export function tutoringGuardian(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "tutor-a",
    organizationId: ORG_A,
    roles: [{ role: "tutoring_guardian" }],
    sessionValid: true,
    mfaSatisfied: false,
    ...overrides,
  };
}

export const enrollmentsA: Enrollment[] = [
  { learnerId: LEARNER_A, classroomId: CLASS_A, academyId: ACADEMY_A },
];

export function approvedGuardianship(
  guardianUserId: string,
  childUserId: string,
  opts: Partial<GuardianRelationship> = {},
): GuardianRelationship {
  return {
    guardianUserId,
    childUserId,
    status: "approved",
    canViewChild: true,
    canTutorAndApprove: false,
    revokedAt: null,
    expiresAt: null,
    ...opts,
  };
}

export function pendingGuardianship(
  guardianUserId: string,
  childUserId: string,
): GuardianRelationship {
  return {
    guardianUserId,
    childUserId,
    status: "pending",
    canViewChild: false,
    canTutorAndApprove: false,
    revokedAt: null,
    expiresAt: null,
  };
}

export function makeDeps(seed: {
  guardianRelationships?: GuardianRelationship[];
  enrollments?: Enrollment[];
} = {}): Deps {
  resetIdSequence();
  resetEventSequence();
  return {
    repo: new InMemoryRepository({
      enrollments: seed.enrollments ?? enrollmentsA,
      ...(seed.guardianRelationships
        ? { guardianRelationships: seed.guardianRelationships }
        : {}),
    }),
    outbox: new Outbox(),
  };
}

/** Standard evidence policy used across acceptance tests. */
export const standardPolicy = {
  requiredListens: 3,
  requiredIndependentRecalls: 2,
  requiredNonSerialRecalls: 1,
};
