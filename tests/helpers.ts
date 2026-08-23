/**
 * Test world builder.
 *
 * Builds one academy, one teacher, one learner, one guardian — the Phase 1
 * slice — so acceptance tests read as journeys rather than as fixtures.
 */
import type { Actor, Enrollment, GuardianRelationship } from "../src/auth/policy.js";
import { InMemoryRepository, MemoryDatabase } from "../src/application/memory-store.js";
import { Outbox } from "../src/application/events.js";
import { useDeterministicIds } from "../src/application/ids.js";
import type { PassageRecord } from "../src/application/repository.js";
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

/**
 * Returns the `MemoryDatabase` itself: it satisfies the `Database` port that
 * commands take, and exposes `.repo` and `.outbox` for assertions. Tests
 * therefore read as `await command(deps, ...)` and `await deps.repo.get(...)`.
 */
export function makeDeps(seed: {
  guardianRelationships?: GuardianRelationship[];
  enrollments?: Enrollment[];
} = {}): MemoryDatabase {
  useDeterministicIds();
  const repo = new InMemoryRepository({
    enrollments: seed.enrollments ?? enrollmentsA,
    ...(seed.guardianRelationships
      ? { guardianRelationships: seed.guardianRelationships }
      : {}),
  });
  return new MemoryDatabase(repo, new Outbox());
}

export const PASSAGE_A = "passage-a";

/**
 * A released curriculum passage. `released: true` here stands in for the
 * content pipeline having approved it — see src/content/corpus.ts for the
 * gate that actually sets it.
 */
export function releasedPassage(over: Partial<PassageRecord> = {}): PassageRecord {
  return {
    passageId: PASSAGE_A,
    organizationId: ORG_A,
    corpusVersionId: "corpus-1",
    label: "Al-Mulk 12-15",
    startAyahId: "ayah-12",
    endAyahId: "ayah-15",
    segmentCount: 1,
    released: true,
    releaseBlocks: [],
    ...over,
  };
}

/** Standard evidence policy used across acceptance tests. */
export const standardPolicy = {
  requiredListens: 3,
  requiredIndependentRecalls: 2,
  requiredNonSerialRecalls: 1,
};
