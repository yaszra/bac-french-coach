import { describe, expect, it } from "vitest";
import { GRADES } from "@/modules/memory/domain/types";
import { mulberry32 } from "@/modules/memory/domain/simulate";
import { EXERCISE_LADDER, evidenceStrength, type HifzExercise } from "./exercises";
import type { GradeResult } from "./grading";
import {
  HIFZ_UNIT_STATES,
  canRequestVerification,
  initialUnitState,
  runMachine,
  summariseVerificationEvidence,
  transition,
  type HifzEvent,
  type HifzUnitState,
} from "./stateMachine";

const at = new Date("2026-03-01T09:00:00Z");

const pass = (exercise: HifzExercise, grade: "hard" | "good" | "easy" = "good"): HifzEvent => ({
  type: "exercise_completed",
  exercise,
  result: {
    kind: "graded",
    grade,
    evidenceStrength: evidenceStrength(exercise),
    rationale: [],
  },
  at,
});

const fail = (exercise: HifzExercise): HifzEvent => ({
  type: "exercise_completed",
  exercise,
  result: { kind: "graded", grade: "again", evidenceStrength: 0, rationale: [] },
  at,
});

const verdict = (outcome: "verified" | "needs_work" | "not_heard"): HifzEvent => ({
  type: "human_verdict",
  verdict: { unitId: "b:2:255", outcome, at, verifiedBy: "user_teacher_1" },
});

describe("transition — the learning path", () => {
  it("starts with nothing recorded", () => {
    expect(initialUnitState()).toBe("not_started");
  });

  it("moves a first listen into listening", () => {
    expect(transition("not_started", pass("listen"))).toBe("listening");
  });

  it("climbs from listening to building to recalling", () => {
    const afterListen = transition("not_started", pass("listen"));
    const afterRebuild = transition(afterListen, pass("rebuild"));
    const afterCue = transition(afterRebuild, pass("next_ayah_cue"));
    expect(afterRebuild).toBe("building");
    expect(afterCue).toBe("recalling");
  });

  it("steps back down one phase on a failure, never past listening", () => {
    expect(transition("recalling", fail("next_ayah_cue"))).toBe("building");
    expect(transition("building", fail("rebuild"))).toBe("listening");
    expect(transition("listening", fail("listen"))).toBe("listening");
  });

  it("holds the phase on a hard pass", () => {
    expect(transition("building", pass("rebuild", "hard"))).toBe("building");
  });

  it("never moves on unusable observations", () => {
    const unusable: GradeResult = { kind: "insufficient_evidence", missing: ["placements"] };
    for (const state of HIFZ_UNIT_STATES) {
      expect(
        transition(state, { type: "exercise_completed", exercise: "rebuild", result: unusable, at }),
      ).toBe(state);
    }
  });
});

describe("transition — the ear-gate", () => {
  it("opens a verification request from recalling", () => {
    expect(transition("recalling", { type: "verification_requested", at })).toBe(
      "awaiting_verification",
    );
  });

  it("treats a submitted recitation as a request, never as a verification", () => {
    const submitted: HifzEvent = {
      type: "exercise_completed",
      exercise: "oral_recitation",
      result: { kind: "requires_human", reason: "hifz.grade.oral_recitation_requires_human" },
      at,
    };
    expect(transition("recalling", submitted)).toBe("awaiting_verification");
    expect(transition("not_started", submitted)).toBe("not_started");
  });

  it("reaches verified only on a human verdict", () => {
    expect(transition("awaiting_verification", verdict("verified"))).toBe("verified");
  });

  it("accepts a verdict recorded live, without a queued request", () => {
    expect(transition("recalling", verdict("verified"))).toBe("verified");
  });

  it("sends a needs-work verdict back to recalling", () => {
    expect(transition("awaiting_verification", verdict("needs_work"))).toBe("recalling");
    expect(transition("verified", verdict("needs_work"))).toBe("recalling");
  });

  it("does not move when nothing could be heard", () => {
    expect(transition("awaiting_verification", verdict("not_heard"))).toBe("awaiting_verification");
  });

  it("withdraws the request when the learner fails while queued", () => {
    expect(transition("awaiting_verification", fail("connect_chain"))).toBe("recalling");
    expect(transition("awaiting_verification", { type: "verification_withdrawn", at })).toBe(
      "recalling",
    );
  });
});

describe("transition — after verification", () => {
  it("lapses a verified unit when the scheduler records a lapse", () => {
    expect(transition("verified", { type: "scheduler_tick", at, due: true, lapsed: true })).toBe(
      "lapsed",
    );
  });

  it("moves a verified unit into maintenance when it falls due", () => {
    expect(transition("verified", { type: "scheduler_tick", at, due: true, lapsed: false })).toBe(
      "maintaining",
    );
  });

  it("does not lapse something that was never held", () => {
    expect(
      transition("not_started", { type: "scheduler_tick", at, due: true, lapsed: true }),
    ).toBe("not_started");
  });

  it("repairs a lapse back onto the ladder but not back into verified", () => {
    expect(transition("lapsed", pass("connect_chain"))).toBe("recalling");
    expect(transition("lapsed", pass("rebuild"))).toBe("building");
    expect(transition("lapsed", fail("rebuild"))).toBe("lapsed");
  });

  it("drops a maintained unit to lapsed on a failure", () => {
    expect(transition("maintaining", fail("recall_first"))).toBe("lapsed");
  });
});

describe("no machine evidence can ever verify a unit", () => {
  it("never reaches verified over random exercise outcomes, ticks and requests", () => {
    const rand = mulberry32(424242);
    for (let run = 0; run < 400; run += 1) {
      let state: HifzUnitState = initialUnitState();
      const history: HifzEvent[] = [];
      for (let step = 0; step < 40; step += 1) {
        const roll = rand();
        let event: HifzEvent;
        if (roll < 0.7) {
          const exercise =
            EXERCISE_LADDER[Math.floor(rand() * EXERCISE_LADDER.length)] ?? "listen";
          const kindRoll = rand();
          const result: GradeResult =
            kindRoll < 0.75
              ? {
                  kind: "graded",
                  grade: GRADES[Math.floor(rand() * GRADES.length)] ?? "good",
                  evidenceStrength: rand(),
                  rationale: [],
                }
              : kindRoll < 0.9
                ? { kind: "requires_human", reason: "hifz.grade.oral_recitation_requires_human" }
                : { kind: "insufficient_evidence", missing: ["placements"] };
          event = { type: "exercise_completed", exercise, result, at };
        } else if (roll < 0.8) {
          event = { type: "verification_requested", at };
        } else if (roll < 0.85) {
          event = { type: "verification_withdrawn", at };
        } else {
          event = { type: "scheduler_tick", at, due: rand() < 0.5, lapsed: rand() < 0.3 };
        }
        history.push(event);
        state = transition(state, event);
        expect(state).not.toBe("verified");
      }
      // ... and the same history, replayed as a fold, agrees.
      expect(runMachine(initialUnitState(), history)).not.toBe("verified");
    }
  });

  it("reaches verified the moment a person says so", () => {
    const history: readonly HifzEvent[] = [
      pass("listen"),
      pass("rebuild"),
      pass("next_ayah_cue"),
      { type: "verification_requested", at },
      verdict("verified"),
    ];
    expect(runMachine(initialUnitState(), history)).toBe("verified");
  });
});

describe("canRequestVerification", () => {
  const twoPasses: readonly HifzEvent[] = [pass("next_ayah_cue"), pass("connect_chain")];

  it("allows a request once the machine has seen enough", () => {
    const eligibility = canRequestVerification("recalling", twoPasses);
    expect(eligibility.allowed).toBe(true);
    expect(eligibility.evidence.passes).toBe(2);
    expect(eligibility.evidence.strongestExercise).toBe("connect_chain");
  });

  it("refuses with reasons when the evidence is thin", () => {
    const eligibility = canRequestVerification("recalling", [pass("listen")]);
    expect(eligibility.allowed).toBe(false);
    if (eligibility.allowed) return;
    expect(eligibility.missing).toContain("hifz.verification.passes");
    expect(eligibility.missing).toContain("hifz.verification.evidence_strength");
  });

  it("refuses from a state with nothing to verify", () => {
    const eligibility = canRequestVerification("not_started", twoPasses);
    expect(eligibility.allowed).toBe(false);
    if (eligibility.allowed) return;
    expect(eligibility.missing).toContain("hifz.verification.state");
  });

  it("refuses a second request while one is already queued", () => {
    const eligibility = canRequestVerification("awaiting_verification", twoPasses);
    expect(eligibility.allowed).toBe(false);
    if (eligibility.allowed) return;
    expect(eligibility.missing).toContain("hifz.verification.already_awaiting");
  });

  it("counts attempts as well as passes, so the denominator is visible", () => {
    const summary = summariseVerificationEvidence([
      pass("next_ayah_cue"),
      fail("connect_chain"),
      pass("connect_chain"),
    ]);
    expect(summary).toMatchObject({ passes: 2, attempts: 3, strongestExercise: "connect_chain" });
  });
});
