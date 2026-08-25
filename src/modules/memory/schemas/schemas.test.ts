import { describe, expect, it } from "vitest";

import { DEFAULT_BKT_PARAMS, initialBktState, type BktParams } from "../domain/bkt";
import { DEFAULT_CHUNKING_CONFIG, type ChunkingConfig } from "../domain/chunking";
import { DEFAULT_SCHEDULING_POLICY, applyReview, initialState } from "../domain/fsrs";
import {
  DEFAULT_UNLOCK_POLICY,
  type Skill,
  type SkillEdge,
  type SkillGraph,
  type UnlockPolicy,
} from "../domain/graph";
import {
  DEFAULT_MUTASHABIHAT_CONFIG,
  type MutashabihatConfig,
} from "../domain/mutashabihat";
import { DEFAULT_TIER_POLICIES, planSession, type Recommendation, type TierPolicy } from "../domain/policy";
import { DEFAULT_SCAFFOLD_CONFIG, type ScaffoldConfig } from "../domain/scaffold";
import type { MemoryState, ReviewOutcome, SchedulingPolicy } from "../domain/types";
import {
  bktParamsSchema,
  chunkAttemptSchema,
  chunkingConfigSchema,
  memoryStateSchema,
  mutashabihatConfigSchema,
  rateSchema,
  reasonSchema,
  recommendationSchema,
  reviewOutcomeSchema,
  scaffoldConfigSchema,
  schedulingPolicySchema,
  skillEdgeSchema,
  skillGraphSchema,
  skillSchema,
  tierPolicySchema,
  unitIdSchema,
  unlockPolicySchema,
  validBktParamsSchema,
  bktStateSchema,
} from "./index";

const NOW = new Date("2026-06-01T09:00:00.000Z");

describe("unit ids", () => {
  it("accepts the documented grammar and rejects anything else", () => {
    for (const id of ["b:2:255", "t:2:255>2:256", "p:604:3", "c:letter.baa.fathah"]) {
      expect(unitIdSchema.safeParse(id).success).toBe(true);
    }
    for (const id of ["", "b:2", "b:0:1", "letter", "b:2:255 "]) {
      expect(unitIdSchema.safeParse(id).success).toBe(false);
    }
  });

  it("reports an i18n key, not a sentence, when a unit id is malformed", () => {
    const result = unitIdSchema.safeParse("not-a-unit");
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe("memory.schema.error.invalid_unit_id");
  });
});

describe("memory state", () => {
  it("parses a state produced by the engine into the domain type", () => {
    const state = initialState("b:2:255", "ayah_body", "good", NOW);
    const parsed: MemoryState = memoryStateSchema.parse(state);
    expect(parsed).toEqual(state);
  });

  it("rejects impossible states", () => {
    const state = initialState("b:2:255", "ayah_body", "good", NOW);
    expect(memoryStateSchema.safeParse({ ...state, unitId: "nope" }).success).toBe(false);
    expect(memoryStateSchema.safeParse({ ...state, confidence: 1.5 }).success).toBe(false);
    expect(memoryStateSchema.safeParse({ ...state, stability: 0 }).success).toBe(false);
    expect(memoryStateSchema.safeParse({ ...state, reps: -1 }).success).toBe(false);
  });

  it("accepts the honest zero state", () => {
    const fresh: MemoryState = {
      unitId: "c:letter.baa.fathah",
      kind: "reading_concept",
      stability: 0.01,
      difficulty: 5,
      reps: 0,
      lapses: 0,
      lastReviewAt: null,
      lastRetrievalType: null,
      confidence: 0,
    };
    expect(memoryStateSchema.safeParse(fresh).success).toBe(true);
  });

  it("parses a full review outcome", () => {
    const outcome = applyReview(initialState("b:2:255", "ayah_body", "good", NOW), {
      grade: "again",
      retrievalType: "oral_recitation",
      at: new Date("2026-06-10T09:00:00.000Z"),
    });
    const parsed: ReviewOutcome = reviewOutcomeSchema.parse(outcome);
    expect(parsed.lapsed).toBe(true);
  });

  it("keeps BKT mastery strictly inside (0,1)", () => {
    const state = initialBktState("c:letter.baa.fathah");
    expect(bktStateSchema.safeParse(state).success).toBe(true);
    expect(bktStateSchema.safeParse({ ...state, pKnown: 0 }).success).toBe(false);
    expect(bktStateSchema.safeParse({ ...state, pKnown: 1 }).success).toBe(false);
  });
});

describe("graph", () => {
  it("accepts a well-formed skill and rejects a literal label", () => {
    const skill: Skill = {
      id: "c:letter.baa",
      kind: "reading_concept",
      labelKey: "memory.skill.letter_baa",
      difficultyHint: 3,
    };
    const parsed: Skill = skillSchema.parse(skill);
    expect(parsed.labelKey).toBe("memory.skill.letter_baa");
    expect(skillSchema.safeParse({ ...skill, labelKey: "Letter baa" }).success).toBe(false);
    expect(skillSchema.safeParse({ ...skill, difficultyHint: 11 }).success).toBe(false);
  });

  it("parses edges and whole graphs", () => {
    const edge: SkillEdge = { from: "c:letter.baa", to: "c:letter.baa.fathah", relation: "prerequisite" };
    const parsedEdge: SkillEdge = skillEdgeSchema.parse(edge);
    expect(parsedEdge.relation).toBe("prerequisite");
    const graph: SkillGraph = {
      skills: [
        { id: "c:letter.baa", kind: "reading_concept", labelKey: "memory.skill.b", difficultyHint: 2 },
        {
          id: "c:letter.baa.fathah",
          kind: "reading_concept",
          labelKey: "memory.skill.b_fathah",
          difficultyHint: 3,
        },
      ],
      edges: [edge],
    };
    const parsedGraph: SkillGraph = skillGraphSchema.parse(graph);
    expect(parsedGraph.skills).toHaveLength(2);
    expect(skillGraphSchema.safeParse({ ...graph, edges: [{ ...edge, relation: "sibling" }] }).success).toBe(
      false,
    );
  });

  it("parses the default unlock policy", () => {
    const parsed: UnlockPolicy = unlockPolicySchema.parse(DEFAULT_UNLOCK_POLICY);
    expect(parsed).toEqual(DEFAULT_UNLOCK_POLICY);
  });
});

describe("policy", () => {
  it("parses a live recommendation and insists on a reason", () => {
    const plan = planSession({
      now: NOW,
      tier: "adult",
      states: [],
      newCandidates: [{ unitId: "b:2:255", kind: "ayah_body", order: 0 }],
    });
    const first = plan.recommendations[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    const parsed: Recommendation = recommendationSchema.parse(first);
    expect(parsed.reason.key).toMatch(/^memory\./);
    expect(recommendationSchema.safeParse({ ...first, reason: undefined }).success).toBe(false);
    expect(
      recommendationSchema.safeParse({
        ...first,
        reason: { key: "Because it is due today", params: {} },
      }).success,
    ).toBe(false);
  });

  it("parses every tier default", () => {
    for (const tier of ["kids", "teen", "adult"] as const) {
      const parsed: TierPolicy = tierPolicySchema.parse(DEFAULT_TIER_POLICIES[tier]);
      expect(parsed.sessionBudgetMinutes).toBeGreaterThan(0);
      expect(Object.keys(parsed.actionMinutes)).toHaveLength(6);
    }
  });

  it("requires a minute estimate for every action", () => {
    const missing = {
      ...DEFAULT_TIER_POLICIES.adult,
      actionMinutes: { review: 1 },
    };
    expect(tierPolicySchema.safeParse(missing).success).toBe(false);
  });
});

describe("configuration", () => {
  it("accepts the engine's own defaults", () => {
    const scheduling: SchedulingPolicy = schedulingPolicySchema.parse(DEFAULT_SCHEDULING_POLICY);
    expect(scheduling.weights).toHaveLength(17);
    const chunking: ChunkingConfig = chunkingConfigSchema.parse(DEFAULT_CHUNKING_CONFIG);
    expect(chunking.minTotalAttempts).toBeGreaterThan(0);
    const scaffold: ScaffoldConfig = scaffoldConfigSchema.parse(DEFAULT_SCAFFOLD_CONFIG);
    expect(scaffold.thresholds).toHaveLength(3);
    const mutashabihat: MutashabihatConfig = mutashabihatConfigSchema.parse(
      DEFAULT_MUTASHABIHAT_CONFIG,
    );
    expect(mutashabihat.n).toBe(4);
    const bkt: BktParams = bktParamsSchema.parse(DEFAULT_BKT_PARAMS);
    expect(bkt.pInit).toBeGreaterThan(0);
  });

  it("rejects a forgetting curve that does not forget", () => {
    expect(
      schedulingPolicySchema.safeParse({ ...DEFAULT_SCHEDULING_POLICY, decay: 0.5 }).success,
    ).toBe(false);
    expect(
      schedulingPolicySchema.safeParse({ ...DEFAULT_SCHEDULING_POLICY, targetRetention: 1 }).success,
    ).toBe(false);
  });

  it("requires an evidence weight for every retrieval type", () => {
    const partial = {
      ...DEFAULT_SCHEDULING_POLICY,
      evidenceWeights: { listen: 0.1 },
    };
    expect(schedulingPolicySchema.safeParse(partial).success).toBe(false);
  });

  it("rejects a degenerate BKT model", () => {
    expect(validBktParamsSchema.safeParse(DEFAULT_BKT_PARAMS).success).toBe(true);
    expect(
      validBktParamsSchema.safeParse({ pInit: 0.2, pTransit: 0.2, pSlip: 0.6, pGuess: 0.5 }).success,
    ).toBe(false);
  });

  it("validates chunk attempts at the boundary", () => {
    expect(
      chunkAttemptSchema.safeParse({ chunkSize: 3, success: true, secondsToComplete: 90, at: NOW })
        .success,
    ).toBe(true);
    expect(
      chunkAttemptSchema.safeParse({ chunkSize: 0, success: true, secondsToComplete: 90, at: NOW })
        .success,
    ).toBe(false);
  });
});

describe("shared shapes", () => {
  it("requires reasons to be i18n keys with parameters", () => {
    expect(reasonSchema.safeParse({ key: "memory.reason.due_review", params: { unitId: "b:2:1" } }).success).toBe(
      true,
    );
    expect(reasonSchema.safeParse({ key: "Due today", params: {} }).success).toBe(false);
    expect(reasonSchema.safeParse({ key: "memory.reason.x", params: { flag: true } }).success).toBe(
      false,
    );
  });

  it("allows a rate of null — 'not yet recorded' is a legitimate state", () => {
    expect(rateSchema.safeParse({ numerator: 0, denominator: 0, rate: null }).success).toBe(true);
    expect(rateSchema.safeParse({ numerator: 3, denominator: 4, rate: 0.75 }).success).toBe(true);
    expect(rateSchema.safeParse({ numerator: 3, denominator: 4, rate: 1.5 }).success).toBe(false);
  });
});
