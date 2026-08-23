import { describe, expect, it } from "vitest";

import type { ConceptObservation, EvidenceKind, Presentation } from "./evidence";
import {
  DEFAULT_LADDER_REQUIREMENTS,
  LADDER_RUNGS,
  VERIFICATION_LABEL_KEYS,
  acceptedEvidenceFor,
  canAdvance,
  explainRung,
  ladderState,
  nextRung,
  rungsBelow,
} from "./masteryLadder";

const CONCEPT = "letter.sad";
const DAY = 86_400_000;
const START = new Date("2026-03-01T09:00:00.000Z");

interface ObsOptions {
  readonly evidenceKind?: EvidenceKind;
  readonly session?: number;
  readonly index?: number;
}

function on(
  presentation: Presentation,
  correct: boolean,
  options: ObsOptions = {},
): ConceptObservation {
  const session = options.session ?? 1;
  const index = options.index ?? 0;
  return {
    conceptId: CONCEPT,
    correct,
    at: new Date(START.getTime() + (session - 1) * DAY + index * 60_000),
    activityKind: presentation === "in_person" ? "production" : "recognition",
    evidenceKind: options.evidenceKind ?? "machine_checked",
    presentation,
    sessionId: `s${session}`,
  };
}

function run(
  presentation: Presentation,
  count: number,
  session: number,
  options: ObsOptions = {},
): ConceptObservation[] {
  return Array.from({ length: count }, (_unused, index) =>
    on(presentation, true, { ...options, session, index }),
  );
}

/** Enough evidence to have earned both machine rungs. */
function machineRungsEarned(): ConceptObservation[] {
  return [
    ...run("ordered", 6, 1),
    ...run("randomized", 4, 2),
    ...run("randomized", 4, 3),
  ];
}

const SOLO = { hasTeacher: false } as const;
const WITH_TEACHER = { hasTeacher: true } as const;

describe("the ladder's shape", () => {
  it("runs ordered → randomized → in_person", () => {
    expect(LADDER_RUNGS).toEqual(["ordered", "randomized", "in_person"]);
    expect(nextRung("ordered")).toBe("randomized");
    expect(nextRung("randomized")).toBe("in_person");
    expect(nextRung("in_person")).toBeNull();
    expect(rungsBelow("in_person")).toEqual(["ordered", "randomized"]);
    expect(rungsBelow("ordered")).toEqual([]);
  });

  it("explains each rung with message keys, never literal text", () => {
    for (const rung of LADDER_RUNGS) {
      const explanation = explainRung(rung);
      expect(explanation.titleKey).toBe(`reading.ladder.rung.${rung}.title`);
      expect(explanation.bodyKey).toMatch(/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/);
      expect(explanation.evidenceKey).toMatch(/^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/);
    }
    expect(explainRung("randomized").nextRung).toBe("in_person");
  });

  it("accepts a self-confirmation on the top rung only when there is no teacher", () => {
    const requirement = DEFAULT_LADDER_REQUIREMENTS.in_person;
    expect(acceptedEvidenceFor(requirement, true)).toEqual(["teacher_observed"]);
    expect(acceptedEvidenceFor(requirement, false)).toContain("self_confirmed");
    expect(acceptedEvidenceFor(DEFAULT_LADDER_REQUIREMENTS.ordered, false)).not.toContain(
      "self_confirmed",
    );
  });
});

describe("ladderState with nothing recorded", () => {
  it("reports no rung reached and no verification, without inventing a zero", () => {
    const state = ladderState(CONCEPT, [], SOLO);
    expect(state.rung).toBeNull();
    expect(state.workingOn).toBe("ordered");
    expect(state.complete).toBe(false);
    expect(state.teacherVerified).toBe(false);
    expect(state.selfConfirmed).toBe(false);
    expect(state.finalRungEvidenceKind).toBeNull();
    expect(state.verificationLabelKey).toBe(VERIFICATION_LABEL_KEYS.none);
    expect(state.rungs.ordered.accuracy).toEqual({ numerator: 0, denominator: 0, rate: null });
  });
});

describe("the machine rungs", () => {
  it("earns the ordered rung after enough correct answers, and moves the work on", () => {
    const state = ladderState(CONCEPT, run("ordered", 6, 1), SOLO);
    expect(state.rungs.ordered.met).toBe(true);
    expect(state.rung).toBe("ordered");
    expect(state.workingOn).toBe("randomized");
    expect(state.rungs.ordered.accuracy).toEqual({ numerator: 6, denominator: 6, rate: 1 });
  });

  it("does not earn a rung on one sitting when the rung asks for more", () => {
    const evidence = [...run("ordered", 6, 1), ...run("randomized", 8, 1)];
    const state = ladderState(CONCEPT, evidence, SOLO);
    expect(state.rungs.randomized.correct).toBe(8);
    expect(state.rungs.randomized.sessions).toBe(1);
    expect(state.rungs.randomized.met).toBe(false);
    expect(canAdvance("randomized", evidence, SOLO).missing.map((item) => item.key)).toContain(
      "reading.ladder.missing.sessions",
    );
  });

  it("does not count answers below the rung's accuracy floor", () => {
    const shaky = [
      ...run("ordered", 6, 1),
      ...Array.from({ length: 6 }, (_unused, index) =>
        on("ordered", false, { session: 1, index: 10 + index }),
      ),
    ];
    const state = ladderState(CONCEPT, shaky, SOLO);
    expect(state.rungs.ordered.correct).toBe(6);
    expect(state.rungs.ordered.accuracy.rate).toBeCloseTo(0.5, 10);
    expect(state.rungs.ordered.met).toBe(false);
  });

  it("keeps a higher rung locked until the one below it is earned", () => {
    const skipping = run("randomized", 12, 1).concat(run("randomized", 4, 2));
    const state = ladderState(CONCEPT, skipping, SOLO);
    expect(state.rungs.randomized.met).toBe(true);
    expect(state.rungs.ordered.met).toBe(false);
    expect(state.rung).toBeNull();
    expect(state.workingOn).toBe("ordered");
  });
});

describe("the in-person rung is a human judgement", () => {
  it("cannot be reached without the rungs below it, however many verdicts arrive", () => {
    const onlyTeacher = [on("in_person", true, { evidenceKind: "teacher_observed" })];
    const decision = canAdvance("in_person", onlyTeacher, WITH_TEACHER);
    expect(decision.allowed).toBe(false);
    expect(decision.missing.map((item) => item.key)).toContain(
      "reading.ladder.missing.previous_rung",
    );
    expect(ladderState(CONCEPT, onlyTeacher, WITH_TEACHER).complete).toBe(false);
  });

  it("is closed by a teacher's verdict when a teacher is present", () => {
    const evidence = [
      ...machineRungsEarned(),
      on("in_person", true, { evidenceKind: "teacher_observed", session: 4 }),
    ];
    const state = ladderState(CONCEPT, evidence, WITH_TEACHER);
    expect(state.complete).toBe(true);
    expect(state.rung).toBe("in_person");
    expect(state.teacherVerified).toBe(true);
    expect(state.selfConfirmed).toBe(false);
    expect(state.finalRungEvidenceKind).toBe("teacher_observed");
    expect(state.verificationLabelKey).toBe(VERIFICATION_LABEL_KEYS.teacher);
    expect(canAdvance("in_person", evidence, WITH_TEACHER).allowed).toBe(true);
  });

  it("is NOT closed by self-confirmation when a teacher is present", () => {
    const evidence = [
      ...machineRungsEarned(),
      on("in_person", true, { evidenceKind: "self_confirmed", session: 4 }),
    ];
    const state = ladderState(CONCEPT, evidence, WITH_TEACHER);
    expect(state.complete).toBe(false);
    expect(state.teacherVerified).toBe(false);
    expect(state.selfConfirmed).toBe(false);
    expect(state.finalRungEvidenceKind).toBeNull();
    expect(state.verificationLabelKey).toBe(VERIFICATION_LABEL_KEYS.none);
    // The attestation is not discarded — it is counted, and named as unaccepted here.
    expect(state.rungs.in_person.unacceptedEvidence["self_confirmed"]).toBe(1);

    const decision = canAdvance("in_person", evidence, WITH_TEACHER);
    expect(decision.allowed).toBe(false);
    expect(decision.missing.map((item) => item.key)).toContain(
      "reading.ladder.missing.teacher_verdict_required",
    );
  });

  it("IS closed by a solo learner's self-confirmation — and labelled as such", () => {
    const evidence = [
      ...machineRungsEarned(),
      on("in_person", true, { evidenceKind: "self_confirmed", session: 4 }),
    ];
    const state = ladderState(CONCEPT, evidence, SOLO);
    expect(state.complete).toBe(true);
    expect(state.rung).toBe("in_person");
    expect(state.selfConfirmed).toBe(true);
    expect(state.teacherVerified).toBe(false);
    expect(state.finalRungEvidenceKind).toBe("self_confirmed");
    expect(state.verificationLabelKey).toBe(VERIFICATION_LABEL_KEYS.self);
    expect(state.verificationLabelKey).not.toBe(VERIFICATION_LABEL_KEYS.teacher);
    expect(state.reason.key).toBe("reading.ladder.reason.complete_self_confirmed");

    const decision = canAdvance("in_person", evidence, SOLO);
    expect(decision.allowed).toBe(true);
    expect(decision.evidenceKind).toBe("self_confirmed");
    expect(decision.reason.key).toBe("reading.ladder.reason.advanced_on_self_confirmation");
  });

  it("lets a teacher's verdict supersede an earlier self-confirmation", () => {
    const evidence = [
      ...machineRungsEarned(),
      on("in_person", true, { evidenceKind: "self_confirmed", session: 4 }),
      on("in_person", true, { evidenceKind: "teacher_observed", session: 5 }),
    ];
    const state = ladderState(CONCEPT, evidence, SOLO);
    expect(state.finalRungEvidenceKind).toBe("teacher_observed");
    expect(state.teacherVerified).toBe(true);
    expect(state.selfConfirmed).toBe(false);
  });

  it("stands on a teacher's most recent word, not their most flattering one", () => {
    const evidence = [
      ...machineRungsEarned(),
      on("in_person", true, { evidenceKind: "teacher_observed", session: 4 }),
      on("in_person", false, { evidenceKind: "teacher_observed", session: 5 }),
    ];
    const state = ladderState(CONCEPT, evidence, WITH_TEACHER);
    expect(state.rungs.in_person.latestObservationCorrect).toBe(false);
    expect(state.complete).toBe(false);
    expect(canAdvance("in_person", evidence, WITH_TEACHER).missing.map((item) => item.key)).toContain(
      "reading.ladder.missing.latest_observation_was_not_yet",
    );
  });

  it("never counts an advisory listener toward any rung", () => {
    const evidence = [
      ...machineRungsEarned(),
      on("in_person", true, { evidenceKind: "advisory_only", session: 4 }),
    ];
    for (const options of [SOLO, WITH_TEACHER]) {
      const state = ladderState(CONCEPT, evidence, options);
      expect(state.complete).toBe(false);
      expect(state.rungs.in_person.unacceptedEvidence["advisory_only"]).toBe(1);
    }
  });
});

describe("canAdvance reports every blocker with its numbers", () => {
  it("names the shortfall in correct answers and sittings", () => {
    const decision = canAdvance("ordered", run("ordered", 2, 1), SOLO);
    expect(decision.allowed).toBe(false);
    expect(decision.nextRung).toBeNull();
    const missing = decision.missing.map((item) => item.key);
    expect(missing).toContain("reading.ladder.missing.correct_answers");
    const shortfall = decision.missing.find(
      (item) => item.key === "reading.ladder.missing.correct_answers",
    );
    expect(shortfall?.params["correct"]).toBe(2);
    expect(shortfall?.params["requiredCorrect"]).toBe(6);
  });

  it("returns the next rung once the current one is earned", () => {
    const decision = canAdvance("ordered", run("ordered", 6, 1), SOLO);
    expect(decision.allowed).toBe(true);
    expect(decision.nextRung).toBe("randomized");
    expect(decision.missing).toEqual([]);
    expect(decision.evidenceKind).toBe("machine_checked");
  });
});
