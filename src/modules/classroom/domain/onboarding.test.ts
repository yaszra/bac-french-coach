import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, onboardingProgress, type OnboardingFacts } from "./onboarding";

const nothing: OnboardingFacts = {
  hasAccount: false,
  hasTeacherGrant: false,
  classroomCount: 0,
  enrolledLearners: 0,
  assignmentCount: 0,
};

const facts = (overrides: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  ...nothing,
  ...overrides,
});

const stateOf = (progress: ReturnType<typeof onboardingProgress>, id: string) =>
  progress.steps.find((step) => step.id === id)!.state;

describe("the onboarding checklist", () => {
  it("shows every step from the very beginning", () => {
    expect(onboardingProgress(nothing).steps.map((step) => step.id)).toEqual([...ONBOARDING_STEPS]);
  });

  it("counts nothing done when nothing has happened", () => {
    const progress = onboardingProgress(nothing);
    expect(progress.done).toBe(0);
    expect(progress.total).toBe(5);
    expect(progress.complete).toBe(false);
  });

  it("marks the first unfinished step as the current one", () => {
    expect(onboardingProgress(nothing).nextStep).toBe("account_created");
    expect(stateOf(onboardingProgress(nothing), "account_created")).toBe("current");
  });

  it("blocks the steps that cannot yet be started", () => {
    expect(stateOf(onboardingProgress(nothing), "classroom_created")).toBe("blocked");
  });

  it("says a teacher is WAITING for approval, not that they should act", () => {
    const progress = onboardingProgress(facts({ hasAccount: true }));
    expect(stateOf(progress, "teacher_approved")).toBe("waiting");
  });

  it("advances as each real fact arrives", () => {
    const progress = onboardingProgress(facts({ hasAccount: true, hasTeacherGrant: true }));
    expect(progress.done).toBe(2);
    expect(progress.nextStep).toBe("classroom_created");
    expect(stateOf(progress, "classroom_created")).toBe("current");
  });

  it("carries the count behind a step, so a tick is never the whole story", () => {
    const progress = onboardingProgress(
      facts({ hasAccount: true, hasTeacherGrant: true, classroomCount: 2, enrolledLearners: 7 }),
    );
    expect(progress.steps.find((step) => step.id === "classroom_created")!.count).toBe(2);
    expect(progress.steps.find((step) => step.id === "code_shared")!.count).toBe(7);
  });

  it("has no count to show for a step that is not a quantity", () => {
    expect(onboardingProgress(nothing).steps[0]!.count).toBeNull();
  });

  it("treats an enrolled learner as proof the code was shared", () => {
    const progress = onboardingProgress(
      facts({ hasAccount: true, hasTeacherGrant: true, classroomCount: 1, enrolledLearners: 1 }),
    );
    expect(stateOf(progress, "code_shared")).toBe("done");
    expect(progress.nextStep).toBe("first_assignment");
  });

  it("completes only when every step is genuinely done", () => {
    const progress = onboardingProgress({
      hasAccount: true,
      hasTeacherGrant: true,
      classroomCount: 1,
      enrolledLearners: 3,
      assignmentCount: 1,
    });
    expect(progress.complete).toBe(true);
    expect(progress.done).toBe(5);
    expect(progress.nextStep).toBeNull();
  });

  it("still marks a later step done when an earlier one is not, without lying about the count", () => {
    // Facts are facts: a class exists even though approval has not landed.
    const progress = onboardingProgress(facts({ hasAccount: true, classroomCount: 1 }));
    expect(stateOf(progress, "classroom_created")).toBe("done");
    expect(progress.done).toBe(2);
    expect(progress.complete).toBe(false);
    expect(progress.nextStep).toBe("teacher_approved");
  });

  it("reports a fraction, never a percentage", () => {
    const progress = onboardingProgress(facts({ hasAccount: true }));
    expect(Object.keys(progress)).not.toContain("percent");
    expect(`${progress.done} of ${progress.total}`).toBe("1 of 5");
  });
});
