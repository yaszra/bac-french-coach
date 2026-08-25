import { createHash } from "node:crypto";
import type { ScopeType } from "@prisma/client";

/**
 * Feature flags with four modes: off, on, a stable percentage, and explicit
 * scoping to an organisation, school, classroom or learner.
 *
 * Percentage rollout hashes (key, subject) so a learner's answer never flips
 * between requests — a learner must not see an exercise appear and vanish.
 * Experiments are assigned BY CLASS, not by learner, so a teacher's room is
 * consistent and outcomes are comparable.
 */
export type FlagMode = "off" | "on" | "percentage" | "scoped";

export type FlagDefinition = {
  readonly key: string;
  readonly mode: FlagMode;
  readonly percentage: number;
};

export type FlagAssignment = {
  readonly scopeType: ScopeType;
  readonly scopeId: string;
  readonly enabled: boolean;
};

export type FlagSubject = {
  readonly organizationId: string;
  readonly schoolId?: string;
  readonly classroomId?: string;
  readonly learnerUserId?: string;
};

function bucketOf(key: string, subject: string): number {
  const digest = createHash("sha256").update(`${key}:${subject}`).digest();
  // First four bytes as a fraction of the full range.
  return digest.readUInt32BE(0) / 0xffffffff;
}

/** Most specific assignment wins: learner → classroom → school → organisation. */
const SPECIFICITY: readonly ScopeType[] = ["learner", "classroom", "school", "organization"];

export function evaluateFlag(
  definition: FlagDefinition,
  assignments: readonly FlagAssignment[],
  subject: FlagSubject,
): boolean {
  const idFor = (scope: ScopeType): string | undefined => {
    switch (scope) {
      case "learner":
        return subject.learnerUserId;
      case "classroom":
        return subject.classroomId;
      case "school":
        return subject.schoolId;
      case "organization":
        return subject.organizationId;
    }
  };

  for (const scope of SPECIFICITY) {
    const id = idFor(scope);
    if (!id) continue;
    const match = assignments.find((a) => a.scopeType === scope && a.scopeId === id);
    if (match) return match.enabled;
  }

  switch (definition.mode) {
    case "on":
      return true;
    case "off":
      return false;
    case "scoped":
      // No assignment matched, so the flag is not on for this subject.
      return false;
    case "percentage": {
      // Classroom first: an experiment belongs to a room, not to a child.
      const unit = subject.classroomId ?? subject.learnerUserId ?? subject.organizationId;
      return bucketOf(definition.key, unit) * 100 < definition.percentage;
    }
  }
}
