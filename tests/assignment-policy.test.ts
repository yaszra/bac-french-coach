/**
 * Evidence-policy defaults, validation, and versioning — acceptance
 * criteria 1 and 10.
 */
import { describe, expect, it } from "vitest";
import {
  defaultPolicy,
  diffPolicy,
  nextPolicyVersion,
  validatePolicy,
} from "../src/core/assignment-policy.js";
import { editAssignmentPolicy, CommandError } from "../src/application/commands.js";
import { createAssignment } from "../src/application/commands.js";
import {
  ACADEMY_A,
  CLASS_A,
  DAY,
  LEARNER_A,
  PASSAGE_A,
  T0,
  learner,
  makeDeps,
  releasedPassage,
  standardPolicy,
  teacher,
} from "./helpers.js";

describe("defaults are sensible without being asked about", () => {
  it("scales listens and recalls with passage length, and caps them", () => {
    const short = defaultPolicy("segment", 2);
    const long = defaultPolicy("segment", 12);
    expect(long.requiredListens).toBeGreaterThan(short.requiredListens);
    expect(long.requiredListens).toBeLessThanOrEqual(5);
    expect(long.estimatedActiveMinutes).toBeLessThanOrEqual(20);
  });

  it("requires every recall of a join to be non-serial", () => {
    const join = defaultPolicy("connection_boundary", 1);
    // Reciting into a join from the beginning is not testing the join.
    expect(join.requiredNonSerialRecalls).toBe(join.requiredIndependentRecalls);
  });

  it("asks for more evidence on similar āyāt than on a plain passage", () => {
    expect(
      defaultPolicy("similar_ayah_contrast", 2).requiredIndependentRecalls,
    ).toBeGreaterThan(defaultPolicy("segment", 2).requiredIndependentRecalls);
  });

  it("always produces a policy that validates", () => {
    const kinds = [
      "segment",
      "ayah",
      "connection_boundary",
      "similar_ayah_contrast",
      "qaida_skill",
    ] as const;
    for (const kind of kinds)
      for (const size of [1, 3, 8, 20])
        expect(validatePolicy(defaultPolicy(kind, size)), `${kind}/${size}`).toEqual([]);
  });
});

describe("validation refuses policies that cannot be satisfied", () => {
  it("rejects requiring more non-serial recalls than recalls", () => {
    const issues = validatePolicy({
      requiredListens: 3,
      requiredIndependentRecalls: 2,
      requiredNonSerialRecalls: 5,
    });
    expect(issues.map((i) => i.issue)).toContain("non_serial_exceeds_total");
  });

  it("rejects a policy with no cue-free recall at all", () => {
    const issues = validatePolicy({
      requiredListens: 3,
      requiredIndependentRecalls: 0,
      requiredNonSerialRecalls: 0,
    });
    expect(issues.map((i) => i.issue)).toContain("no_independent_recall_required");
    expect(issues[0]?.message).toMatch(/scaffolded practice alone/);
  });

  it("rejects a policy nobody could finish, which blocks a learner without saying so", () => {
    const issues = validatePolicy({
      requiredListens: 40,
      requiredIndependentRecalls: 40,
      requiredNonSerialRecalls: 1,
    });
    expect(issues.map((i) => i.issue)).toEqual([
      "listens_unreasonably_high",
      "independent_recalls_unreasonably_high",
    ]);
  });
});

describe("version labels", () => {
  it("increments monotonically and stays readable", () => {
    expect(nextPolicyVersion("v1")).toBe("v2");
    expect(nextPolicyVersion("v9")).toBe("v10");
  });

  it("falls back safely on an unexpected label", () => {
    expect(nextPolicyVersion("legacy")).toBe("v2");
  });
});

describe("a diff says whether an edit loosened the requirement", () => {
  it("marks a reduction as loosening", () => {
    const changes = diffPolicy(
      { requiredListens: 3, requiredIndependentRecalls: 3, requiredNonSerialRecalls: 1 },
      { requiredListens: 3, requiredIndependentRecalls: 2, requiredNonSerialRecalls: 1 },
    );
    expect(changes).toEqual([
      {
        field: "requiredIndependentRecalls",
        from: 3,
        to: 2,
        loosens: true,
      },
    ]);
  });

  it("marks an increase as not loosening", () => {
    const [change] = diffPolicy(
      { requiredListens: 3, requiredIndependentRecalls: 2, requiredNonSerialRecalls: 1 },
      { requiredListens: 5, requiredIndependentRecalls: 2, requiredNonSerialRecalls: 1 },
    );
    expect(change?.loosens).toBe(false);
  });

  it("reports nothing when nothing changed", () => {
    const policy = {
      requiredListens: 3,
      requiredIndependentRecalls: 2,
      requiredNonSerialRecalls: 1,
    };
    expect(diffPolicy(policy, policy)).toEqual([]);
  });
});

describe("editing a policy creates a version rather than mutating one", () => {
  async function assigned() {
    const deps = makeDeps();
    await deps.repo.putPassage(releasedPassage());
    const created = await createAssignment(deps, {
      actor: teacher(),
      now: T0,
      learnerId: LEARNER_A,
      academyId: ACADEMY_A,
      classroomId: CLASS_A,
      targetKind: "segment",
      passageId: PASSAGE_A,
      policy: standardPolicy,
      estimatedActiveMinutes: 9,
      dueAt: T0 + DAY,
    });
    return { deps, ...created };
  }

  it("keeps the old version readable after the edit", async () => {
    const { deps, assignmentId } = await assigned();
    const result = await editAssignmentPolicy(deps, {
      actor: teacher(),
      now: T0 + 100,
      assignmentId,
      policy: { ...standardPolicy, requiredIndependentRecalls: 4 },
    });

    expect(result.policyVersion).toBe("v2");
    expect(result.supersedes).toBe("v1");
    // The superseded version still resolves exactly as it did.
    const original = await deps.repo.getPolicyVersion(assignmentId, "v1");
    expect(original?.policy.requiredIndependentRecalls).toBe(2);
    const updated = await deps.repo.getPolicyVersion(assignmentId, "v2");
    expect(updated?.policy.requiredIndependentRecalls).toBe(4);
    expect(updated?.supersedes).toBe("v1");
  });

  it("records whether the change loosened the requirement", async () => {
    const { deps, assignmentId } = await assigned();
    const result = await editAssignmentPolicy(deps, {
      actor: teacher(),
      now: T0 + 100,
      assignmentId,
      policy: { ...standardPolicy, requiredIndependentRecalls: 1, requiredNonSerialRecalls: 0 },
    });
    expect(result.changes.every((c) => c.loosens)).toBe(true);
  });

  it("refuses an invalid policy", async () => {
    const { deps, assignmentId } = await assigned();
    await expect(
      editAssignmentPolicy(deps, {
        actor: teacher(),
        now: T0 + 100,
        assignmentId,
        policy: { ...standardPolicy, requiredIndependentRecalls: 0 },
      }),
    ).rejects.toThrow(/cue-free recall is required/);
  });

  it("refuses a no-op edit rather than creating an empty version", async () => {
    const { deps, assignmentId } = await assigned();
    await expect(
      editAssignmentPolicy(deps, {
        actor: teacher(),
        now: T0 + 100,
        assignmentId,
        policy: standardPolicy,
      }),
    ).rejects.toThrow(CommandError);
  });

  it("does not let a learner edit the policy set for them", async () => {
    const { deps, assignmentId } = await assigned();
    await expect(
      editAssignmentPolicy(deps, {
        actor: learner(),
        now: T0 + 100,
        assignmentId,
        policy: { ...standardPolicy, requiredIndependentRecalls: 1 },
      }),
    ).rejects.toThrow(CommandError);
  });

  it("points the memory state at the version its evidence is measured against", async () => {
    const { deps, assignmentId, targetId } = await assigned();
    await editAssignmentPolicy(deps, {
      actor: teacher(),
      now: T0 + 100,
      assignmentId,
      policy: { ...standardPolicy, requiredListens: 5 },
    });
    expect((await deps.repo.getMemoryState(targetId))?.policyVersion).toBe("v2");
  });
});
