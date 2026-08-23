/**
 * The Phase 1 vertical slice, end to end.
 *
 *   teacher assigns -> learner opens Today -> listens -> reconstructs
 *   -> loses cues -> recalls independently -> requests recitation
 *   -> teacher verifies/corrects -> review is scheduled
 *   -> learner returns from blank -> memory state updates
 *
 * Covers acceptance criteria 1, 2, 4, 5, 6, 8, 10, 11, 12, 15.
 */
import { describe, expect, it } from "vitest";
import {
  CommandError,
  createAssignment,
  getToday,
  openAssignment,
  recordListen,
  recordOralVerification,
  recordReviewOutcome,
  requestOralRecitation,
  submitRetrieval,
} from "../src/app/commands.js";
import {
  ACADEMY_A,
  CLASS_A,
  DAY,
  LEARNER_A,
  ORG_B,
  T0,
  learner,
  makeDeps,
  standardPolicy,
  teacher,
  releasedPassage,
  PASSAGE_A,
} from "./helpers.js";
import type { AssignmentId } from "../src/core/types.js";
import type { MemoryDatabase } from "../src/app/memory-store.js";

async function assign(db: MemoryDatabase, now = T0) {
  await db.repo.putPassage(releasedPassage());
  const created = await createAssignment(db, {
    actor: teacher(),
    now,
    learnerId: LEARNER_A,
    academyId: ACADEMY_A,
    classroomId: CLASS_A,
    targetKind: "segment",
    passageId: PASSAGE_A,
    policy: standardPolicy,
    estimatedActiveMinutes: 9,
    dueAt: now + DAY,
  });
  return { ...created, segmentId: created.segmentIds[0]! };
}

/** Drive the learner to the verification threshold. */
async function reachThreshold(
  deps: MemoryDatabase,
  assignmentId: AssignmentId,
  segmentId: string,
  now: number,
) {
  for (let i = 0; i < standardPolicy.requiredListens; i++)
    await recordListen(deps, {
      actor: learner(),
      now: now + i,
      assignmentId,
      segmentId,
    });

  await submitRetrieval(deps, {
    actor: learner(),
    now: now + 10,
    assignmentId,
    segmentId,
    scaffoldLevel: "no_answer_choices",
    startContext: "serial_start",
    correct: true,
    assistance: [],
    hesitant: false,
    idempotencyKey: "k-serial",
  });
  return submitRetrieval(deps, {
    actor: learner(),
    now: now + 20,
    assignmentId,
    segmentId,
    scaffoldLevel: "oral_blank_page",
    startContext: "boundary_probe",
    correct: true,
    assistance: [],
    hesitant: false,
    idempotencyKey: "k-boundary",
  });
}

describe("criterion 1 — the teacher assigns an exact passage and evidence policy", () => {
  it("creates the assignment with a first policy version", async () => {
    const deps = makeDeps();
    const { assignmentId, policyVersion } = await assign(deps);
    expect(policyVersion).toBe("v1");
    const stored = await deps.repo.getPolicyVersion(assignmentId, "v1");
    expect(stored?.policy.requiredIndependentRecalls).toBe(2);
    expect(stored?.createdByUserId).toBe("teacher-a");
  });

  it("refuses to publish against an unreleased passage", async () => {
    const deps = makeDeps();
    await deps.repo.putPassage(
      releasedPassage({
        passageId: "passage-draft",
        released: false,
        releaseBlocks: ["approval_missing", "licence_expired"],
      }),
    );
    await expect(
      createAssignment(deps, {
        actor: teacher(),
        now: T0,
        learnerId: LEARNER_A,
        academyId: ACADEMY_A,
        classroomId: CLASS_A,
        targetKind: "segment",
        passageId: "passage-draft",
        policy: standardPolicy,
        estimatedActiveMinutes: 9,
        dueAt: T0 + DAY,
      }),
    ).rejects.toThrow(/not released: approval_missing, licence_expired/);
  });

  it("cannot be told a passage is released by its caller", async () => {
    const deps = makeDeps();
    await deps.repo.putPassage(
      releasedPassage({ passageId: "passage-draft", released: false, releaseBlocks: [] }),
    );
    // There is no input field a caller could set to override stored state.
    await expect(
      createAssignment(deps, {
        actor: teacher(),
        now: T0,
        learnerId: LEARNER_A,
        academyId: ACADEMY_A,
        classroomId: CLASS_A,
        targetKind: "segment",
        passageId: "passage-draft",
        policy: standardPolicy,
        estimatedActiveMinutes: 9,
        dueAt: T0 + DAY,
      }),
    ).rejects.toThrow(/not released/);
  });

  it("hides a passage belonging to another organization", async () => {
    const deps = makeDeps();
    await deps.repo.putPassage(releasedPassage({ organizationId: ORG_B }));
    await expect(
      createAssignment(deps, {
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
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("does not let a learner create an assignment for themselves", async () => {
    const deps = makeDeps();
    await deps.repo.putPassage(releasedPassage());
    await expect(
      createAssignment(deps, {
        actor: learner(),
        now: T0,
        learnerId: LEARNER_A,
        academyId: ACADEMY_A,
        classroomId: CLASS_A,
        targetKind: "segment",
        passageId: PASSAGE_A,
        policy: { ...standardPolicy, requiredIndependentRecalls: 1 },
        estimatedActiveMinutes: 1,
        dueAt: T0 + DAY,
      }),
    ).rejects.toThrow(CommandError);
  });
});

describe("criterion 2 — Today offers one clear next action with a reason", () => {
  it("surfaces the newly assigned work", async () => {
    const deps = makeDeps();
    await assign(deps);
    const plan = await getToday(deps, {
      actor: learner(),
      now: T0,
      learnerId: LEARNER_A,
      sessionBudgetMinutes: 20,
    });
    const primary = plan.newMemory ?? plan.continueNow;
    expect(primary?.candidate.label).toBe("Al-Mulk 12-15");
    expect(primary?.reason).toMatch(/assigned/i);
  });
});

describe("criteria 4 and 5 — listens are server-counted; tiles do not create memory", () => {
  it("blocks tile reconstruction until the listen policy is met", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    await expect(submitRetrieval(deps, {
        actor: learner(),
        now: T0 + 1,
        assignmentId,
        segmentId,
        scaffoldLevel: "full_tiles",
        startContext: "serial_start",
        correct: true,
        assistance: ["tile_options_visible"],
        hesitant: false,
        idempotencyKey: "k-early",
      })).rejects.toThrow(/requires 3 listens/);
  });

  it("counts listens on the server, from reported completions only", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    let result = await recordListen(deps, {
      actor: learner(),
      now: T0 + 1,
      assignmentId,
      segmentId,
    });
    expect(result.listensCompleted).toBe(1);
    expect(result.listenPolicyMet).toBe(false);
    await recordListen(deps, { actor: learner(), now: T0 + 2, assignmentId, segmentId: "seg-1" });
    result = await recordListen(deps, {
      actor: learner(),
      now: T0 + 3,
      assignmentId,
      segmentId,
    });
    expect(result.listensCompleted).toBe(3);
    expect(result.listenPolicyMet).toBe(true);
  });

  it("records a successful tile reconstruction as scaffolded practice only", async () => {
    const deps = makeDeps();
    const { assignmentId, targetId, segmentId } = await assign(deps);
    for (let i = 0; i < 3; i++)
      await recordListen(deps, {
        actor: learner(),
        now: T0 + i,
        assignmentId,
        segmentId,
      });

    const r = await submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 10,
      assignmentId,
      segmentId,
      scaffoldLevel: "full_tiles",
      startContext: "serial_start",
      correct: true,
      assistance: ["tile_options_visible"],
      hesitant: false,
      idempotencyKey: "k-tiles",
    });

    expect(r.evidenceClass).toBe("assisted_practice");
    expect(r.progress.independentRecalls).toBe(0);
    expect(r.readyForVerification).toBe(false);
    expect((await deps.repo.getMemoryState(targetId))?.state).toBe("preparing");
  });
});

describe("criterion 6 — a hint marks the attempt assisted", () => {
  it("classifies a hinted cue-free attempt as assisted and stores that classification", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    for (let i = 0; i < 3; i++)
      await recordListen(deps, { actor: learner(), now: T0 + i, assignmentId, segmentId: "seg-1" });

    const r = await submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 10,
      assignmentId,
      segmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "random_start",
      correct: true,
      assistance: ["hint"],
      hesitant: false,
      idempotencyKey: "k-hint",
    });

    expect(r.evidenceClass).toBe("assisted_practice");
    expect(r.progress.independentRecalls).toBe(0);
    expect(r.reason).toMatch(/assistance was used/i);
    const stored = (await deps.repo.listAttempts(assignmentId))[0];
    expect(stored?.evidenceClass).toBe("assisted_practice");
  });
});

describe("criterion 8 — a learner cannot self-approve, by any route", () => {
  it("refuses a recitation request before the threshold is met", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    await expect(requestOralRecitation(deps, { actor: learner(), now: T0, assignmentId })).rejects.toThrow(/Evidence threshold not met/);
  });

  it("refuses a learner recording their own verification", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    await reachThreshold(deps, assignmentId, segmentId, T0);
    const { requestId } = await requestOralRecitation(deps, {
      actor: learner(),
      now: T0 + 30,
      assignmentId,
    });
    await expect(recordOralVerification(deps, {
        actor: learner(),
        now: T0 + 40,
        requestId,
        decision: "verified_cleanly",
      })).rejects.toThrow(CommandError);
    // No learner role carries the verification capability at all.
    expect(await deps.repo.listVerifications(assignmentId)).toHaveLength(0);
  });

  it("refuses even an account that is both a teacher and the learner", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    await reachThreshold(deps, assignmentId, segmentId, T0);
    const { requestId } = await requestOralRecitation(deps, {
      actor: learner(),
      now: T0 + 30,
      assignmentId,
    });
    // A teacher who is also enrolled as a learner at the same academy.
    const teacherWhoIsAlsoTheLearner = teacher({ userId: LEARNER_A });
    await expect(recordOralVerification(deps, {
        actor: teacherWhoIsAlsoTheLearner,
        now: T0 + 40,
        requestId,
        decision: "verified_cleanly",
      })).rejects.toThrow(/cannot verify their own recitation/);
  });

  it("is not fooled by a replayed submission", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    for (let i = 0; i < 3; i++)
      await recordListen(deps, { actor: learner(), now: T0 + i, assignmentId, segmentId: "seg-1" });

    const key = "k-replay";
    const first = await submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 10,
      assignmentId,
      segmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "random_start",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: key,
    });
    const replayed = await submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 11,
      assignmentId,
      segmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "random_start",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: key,
    });
    expect(replayed.attemptId).toBe(first.attemptId);
    expect(replayed.progress.independentRecalls).toBe(1);
    expect(await deps.repo.listAttempts(assignmentId)).toHaveLength(1);
  });

  it("refuses an attempt written against a segment the assignment does not own", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    for (let i = 0; i < 3; i++)
      await recordListen(deps, { actor: learner(), now: T0 + i, assignmentId, segmentId: "seg-1" });
    await expect(submitRetrieval(deps, {
        actor: learner(),
        now: T0 + 10,
        assignmentId,
        segmentId: "seg-from-another-assignment",
        scaffoldLevel: "oral_blank_page",
        startContext: "random_start",
        correct: true,
        assistance: [],
        hesitant: false,
        idempotencyKey: "k-cross-segment",
      })).rejects.toThrow(/only through its own assignment/);
  });
});

describe("criterion 15 — cross-tenant access fails as not_found", () => {
  it("hides an assignment from a teacher in another organization", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    const foreign = teacher({ userId: "teacher-b", organizationId: ORG_B });
    await expect(openAssignment(deps, { actor: foreign, now: T0, assignmentId })).rejects.toThrow(/not found/i);
  });

  it("hides a recitation request from another organization", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);
    await reachThreshold(deps, assignmentId, segmentId, T0);
    const { requestId } = await requestOralRecitation(deps, {
      actor: learner(),
      now: T0 + 30,
      assignmentId,
    });
    const foreign = teacher({ userId: "teacher-b", organizationId: ORG_B });
    await expect(recordOralVerification(deps, {
        actor: foreign,
        now: T0 + 40,
        requestId,
        decision: "verified_cleanly",
      })).rejects.toThrow(/not found/i);
  });
});

describe("the full journey", () => {
  it("runs assign -> listen -> reconstruct -> recall -> verify -> review, with no admin edits", async () => {
    const deps = makeDeps();
    const { assignmentId, targetId, segmentId } = await assign(deps);

    // --- open: the page is blank -------------------------------------
    const opened = await openAssignment(deps, { actor: learner(), now: T0, assignmentId });
    expect(opened.page.revealedTokenIds).toEqual([]);
    expect(opened.state).toBe("preparing");
    expect(opened.requiredListens).toBe(3);

    // --- listen ------------------------------------------------------
    for (let i = 0; i < 3; i++)
      await recordListen(deps, { actor: learner(), now: T0 + i, assignmentId, segmentId: "seg-1" });

    // --- reconstruct with tiles: fills the page, proves nothing -------
    const tiles = await submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 5,
      assignmentId,
      segmentId,
      scaffoldLevel: "full_tiles",
      startContext: "serial_start",
      correct: true,
      assistance: ["tile_options_visible"],
      hesitant: false,
      idempotencyKey: "j-tiles",
    });
    expect(tiles.progress.independentRecalls).toBe(0);

    // --- lose cues, recall independently ------------------------------
    const afterFirst = await submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 10,
      assignmentId,
      segmentId,
      scaffoldLevel: "no_answer_choices",
      startContext: "serial_start",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "j-serial",
    });
    expect(afterFirst.state).toBe("recalled_independently");
    expect(afterFirst.readyForVerification).toBe(false);

    const afterSecond = await submitRetrieval(deps, {
      actor: learner(),
      now: T0 + 20,
      assignmentId,
      segmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "boundary_probe",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "j-boundary",
    });
    expect(afterSecond.state).toBe("ready_for_verification");

    // --- request and verify ------------------------------------------
    const { requestId } = await requestOralRecitation(deps, {
      actor: learner(),
      now: T0 + 30,
      assignmentId,
    });
    const verification = await recordOralVerification(deps, {
      actor: teacher(),
      now: T0 + 40,
      requestId,
      decision: "verified_minor_slip",
      corrections: [{ category: "join", note: "hesitates into the next ayah" }],
    });
    expect(verification.state).toBe("verified");
    expect(verification.nextReviewAt).toBeGreaterThan(T0 + 40);

    // criterion 10 — verification pins the exact assignment and policy
    const stored = (await deps.repo.listVerifications(assignmentId))[0];
    expect(stored?.policyVersion).toBe("v1");
    expect(stored?.corpusVersionId).toBe("corpus-1");
    expect(stored?.verifierUserId).toBe("teacher-a");
    expect(stored?.evidenceAttemptIds).toHaveLength(2);

    // criterion 11 — the next session begins from a blank page
    const reopened = await openAssignment(deps, {
      actor: learner(),
      now: T0 + 50,
      assignmentId,
    });
    expect(reopened.page.revealedTokenIds).toEqual([]);
    expect(reopened.state).toBe("verified");

    // --- criterion 12 — delayed clean recall updates stability --------
    const before = (await deps.repo.getMemoryState(targetId))?.scheduling;
    const review = await recordReviewOutcome(deps, {
      actor: learner(),
      now: T0 + 6 * DAY,
      assignmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "random_start",
      correct: true,
      assistance: [],
      hesitant: false,
      idempotencyKey: "j-review-1",
    });
    expect(review.state).toBe("established");
    expect(review.rescheduled).toBe(true);
    expect(review.stabilityDays!).toBeGreaterThan(before!.stabilityDays);
    expect(review.reason).toContain("Stability");
  });

  it("records an assisted review as practice and does not move the schedule", async () => {
    const deps = makeDeps();
    const { assignmentId, targetId, segmentId } = await assign(deps);
    await reachThreshold(deps, assignmentId, segmentId, T0);
    const { requestId } = await requestOralRecitation(deps, {
      actor: learner(),
      now: T0 + 30,
      assignmentId,
    });
    await recordOralVerification(deps, {
      actor: teacher(),
      now: T0 + 40,
      requestId,
      decision: "verified_cleanly",
    });

    const before = (await deps.repo.getMemoryState(targetId))?.scheduling;
    const result = await recordReviewOutcome(deps, {
      actor: learner(),
      now: T0 + 6 * DAY,
      assignmentId,
      scaffoldLevel: "oral_blank_page",
      startContext: "random_start",
      correct: true,
      assistance: ["hint"],
      hesitant: false,
      idempotencyKey: "j-review-assisted",
    });

    expect(result.rescheduled).toBe(false);
    expect(result.reason).toMatch(/does not change the review schedule/);
    const after = (await deps.repo.getMemoryState(targetId))?.scheduling;
    expect(after?.nextReviewAt).toBe(before?.nextReviewAt);
    // The attempt is still recorded as evidence, just not as recall.
    expect(
      (await deps.repo.listAttempts(assignmentId)).some((a) => a.evidenceClass === "assisted_practice"),
    ).toBe(true);
  });

  it("drops a target into repair when a correction recurs", async () => {
    const deps = makeDeps();
    const { assignmentId, segmentId } = await assign(deps);

    // First cycle: verified with a join correction.
    await reachThreshold(deps, assignmentId, segmentId, T0);
    const r1 = await requestOralRecitation(deps, { actor: learner(), now: T0 + 30, assignmentId });
    await recordOralVerification(deps, {
      actor: teacher(),
      now: T0 + 40,
      requestId: r1.requestId,
      decision: "verified_minor_slip",
      corrections: [{ category: "join" }],
    });

    // A later verification repeats the same open correction.
    const assignment = (await deps.repo.getAssignment(assignmentId))!;
    const state = (await deps.repo.getMemoryState(assignment.targetId))!;
    await deps.repo.saveMemoryState({ ...state, state: "ready_for_verification" });
    await deps.repo.createRecitationRequest({
      requestId: "req-2",
      assignmentId,
      learnerId: LEARNER_A,
      organizationId: state.organizationId,
      requestedAt: T0 + 50,
      policyVersion: "v1",
      evidenceSnapshot: state.progress,
      status: "pending",
    });

    const second = await recordOralVerification(deps, {
      actor: teacher(),
      now: T0 + 60,
      requestId: "req-2",
      decision: "verified_minor_slip",
      corrections: [{ category: "join" }],
    });

    expect(second.recurringCorrections).toContain("join");
    expect(second.state).toBe("repairing");
  });
});
