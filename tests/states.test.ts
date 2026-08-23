/**
 * Learning state machine — legal and illegal transitions.
 *
 * The illegal-transition tests matter most: each one corresponds to a way
 * the system could make a false claim about a child's memory.
 */
import { describe, expect, it } from "vitest";
import {
  IllegalTransitionError,
  initialContext,
  transition,
  DURABLE_MIN_DELAYED_SUCCESSES,
  DURABLE_MIN_DELAY_DAYS,
  ESTABLISH_MIN_DELAY_DAYS,
  type LearningEvent,
} from "../src/core/states.js";
import type { LearningState } from "../src/core/types.js";
import { emptyProgress } from "../src/core/evidence.js";

const policy = {
  policyVersion: "v1",
  requiredListens: 0,
  requiredIndependentRecalls: 2,
  requiredNonSerialRecalls: 1,
};

const metThreshold = {
  independentRecalls: 2,
  nonSerialIndependentRecalls: 1,
  listensCompleted: 3,
};

describe("legal transitions", () => {
  it("assigned -> preparing on first practice", () => {
    const r = transition("assigned", initialContext, { kind: "practice_started" });
    expect(r.state).toBe("preparing");
    expect(r.reason).toBeTruthy();
  });

  it("preparing -> recalled_independently below threshold", () => {
    const r = transition("preparing", initialContext, {
      kind: "independent_recall_recorded",
      correct: true,
      progress: { ...emptyProgress, independentRecalls: 1 },
      policy,
    });
    expect(r.state).toBe("recalled_independently");
  });

  it("preparing -> ready_for_verification when the threshold is met", () => {
    const r = transition("preparing", initialContext, {
      kind: "independent_recall_recorded",
      correct: true,
      progress: metThreshold,
      policy,
    });
    expect(r.state).toBe("ready_for_verification");
    expect(r.reason).toContain("v1");
  });

  it("a failed cue-free recall drops back to preparing", () => {
    const r = transition("recalled_independently", initialContext, {
      kind: "independent_recall_recorded",
      correct: false,
      progress: emptyProgress,
      policy,
    });
    expect(r.state).toBe("preparing");
  });

  it("verification with a minor slip still reaches verified", () => {
    const r = transition("ready_for_verification", initialContext, {
      kind: "verification_recorded",
      decision: "verified_minor_slip",
    });
    expect(r.state).toBe("verified");
  });

  it("practice_again returns the learner to preparing", () => {
    const r = transition("ready_for_verification", initialContext, {
      kind: "verification_recorded",
      decision: "practice_again",
    });
    expect(r.state).toBe("preparing");
  });

  it("unable_to_assess is a real outcome that leaves the obligation open", () => {
    const r = transition("ready_for_verification", initialContext, {
      kind: "verification_recorded",
      decision: "unable_to_assess",
    });
    expect(r.state).toBe("ready_for_verification");
  });

  it("verified -> established after a meaningful delay", () => {
    const r = transition("verified", initialContext, {
      kind: "delayed_recall_recorded",
      correct: true,
      hesitant: false,
      delayDays: ESTABLISH_MIN_DELAY_DAYS,
    });
    expect(r.state).toBe("established");
  });

  it("a short delay does not promote", () => {
    const r = transition("verified", initialContext, {
      kind: "delayed_recall_recorded",
      correct: true,
      hesitant: false,
      delayDays: ESTABLISH_MIN_DELAY_DAYS - 1,
    });
    expect(r.state).toBe("verified");
    expect(r.reason).toContain("short");
  });

  it("reaches durable only after repeated delayed successes across long intervals", () => {
    let state: LearningState = "verified";
    let ctx = initialContext;
    for (let i = 0; i < DURABLE_MIN_DELAYED_SUCCESSES - 1; i++) {
      const r = transition(state, ctx, {
        kind: "delayed_recall_recorded",
        correct: true,
        hesitant: false,
        delayDays: DURABLE_MIN_DELAY_DAYS,
      });
      state = r.state;
      ctx = r.context;
      expect(state).toBe("established");
    }
    const final = transition(state, ctx, {
      kind: "delayed_recall_recorded",
      correct: true,
      hesitant: false,
      delayDays: DURABLE_MIN_DELAY_DAYS,
    });
    expect(final.state).toBe("durable");
  });

  it("a failed delayed recall makes even a durable memory fragile", () => {
    const r = transition(
      "durable",
      { delayedSuccesses: 5, longestSuccessfulDelayDays: 60 },
      { kind: "delayed_recall_recorded", correct: false, hesitant: false, delayDays: 30 },
    );
    expect(r.state).toBe("fragile");
  });

  it("a recurring correction activates repair from any practised state", () => {
    const states: LearningState[] = [
      "preparing",
      "recalled_independently",
      "ready_for_verification",
      "verified",
      "established",
      "durable",
      "fragile",
    ];
    for (const s of states)
      expect(transition(s, initialContext, { kind: "correction_recurred" }).state).toBe(
        "repairing",
      );
  });

  it("repair completes into fragile — the memory must re-prove itself", () => {
    const r = transition("repairing", initialContext, { kind: "repair_completed" });
    expect(r.state).toBe("fragile");
    expect(r.reason).toContain("re-prove");
  });

  it("verification resets durability context, since past durability is not present evidence", () => {
    const r = transition(
      "ready_for_verification",
      { delayedSuccesses: 9, longestSuccessfulDelayDays: 90 },
      { kind: "verification_recorded", decision: "verified_cleanly" },
    );
    expect(r.context).toEqual(initialContext);
  });
});

describe("illegal transitions throw rather than silently promoting", () => {
  const cases: { state: LearningState; event: LearningEvent; why: string }[] = [
    {
      state: "preparing",
      event: { kind: "verification_recorded", decision: "verified_cleanly" },
      why: "a teacher cannot verify work whose threshold was never met",
    },
    {
      state: "assigned",
      event: { kind: "verification_recorded", decision: "verified_cleanly" },
      why: "no evidence exists at all",
    },
    {
      state: "verified",
      event: {
        kind: "independent_recall_recorded",
        correct: true,
        progress: metThreshold,
        policy,
      },
      why: "post-verification recall is delayed recall, a different evidence type",
    },
    {
      state: "assigned",
      event: {
        kind: "delayed_recall_recorded",
        correct: true,
        hesitant: false,
        delayDays: 10,
      },
      why: "there is no verified baseline to be delayed from",
    },
    {
      state: "preparing",
      event: { kind: "forgetting_risk_detected" },
      why: "risk is only meaningful against an established baseline",
    },
    {
      state: "verified",
      event: { kind: "repair_completed" },
      why: "no repair was active",
    },
    {
      state: "assigned",
      event: { kind: "correction_recurred" },
      why: "nothing has been practised yet",
    },
  ];

  it.each(cases)("rejects $event.kind in $state — $why", ({ state, event }) => {
    expect(() => transition(state, initialContext, event)).toThrow(
      IllegalTransitionError,
    );
  });
});

describe("determinism", () => {
  it("produces identical results for identical inputs", () => {
    const run = () =>
      transition("verified", initialContext, {
        kind: "delayed_recall_recorded",
        correct: true,
        hesitant: false,
        delayDays: 7,
      });
    expect(run()).toEqual(run());
  });

  it("stamps an engine version on every transition, so decisions are replayable", () => {
    const r = transition("assigned", initialContext, { kind: "practice_started" });
    expect(r.engineVersion).toMatch(/^athar-states\//);
  });
});
