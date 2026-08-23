import { describe, expect, it } from "vitest";

import { emptyState } from "./fsrs";
import {
  DEFAULT_UNLOCK_POLICY,
  dependentClosure,
  detectPrerequisiteCycle,
  directPrerequisites,
  neighbors,
  prerequisiteClosure,
  topologicalOrder,
  unlockStatus,
  unlocked,
  validateGraph,
  type Skill,
  type SkillEdge,
  type SkillGraph,
} from "./graph";
import type { MemoryState } from "./types";

const A = "c:letter.alif";
const B = "c:letter.baa";
const C = "c:letter.baa.fathah";
const D = "c:letter.baa.kasrah";

function skill(id: string, labelKey: string, difficultyHint = 3): Skill {
  return { id, kind: "reading_concept", labelKey, difficultyHint };
}

function edge(from: string, to: string, relation: SkillEdge["relation"] = "prerequisite"): SkillEdge {
  return { from, to, relation };
}

/** A → B → C, with D also depending on B. */
const CHAIN: SkillGraph = {
  skills: [
    skill(A, "memory.skill.letter_alif"),
    skill(B, "memory.skill.letter_baa"),
    skill(C, "memory.skill.letter_baa_fathah"),
    skill(D, "memory.skill.letter_baa_kasrah"),
  ],
  edges: [edge(A, B), edge(B, C), edge(B, D)],
};

function known(unitId: string, overrides: Partial<MemoryState> = {}): MemoryState {
  return {
    ...emptyState(unitId, "reading_concept"),
    stability: 12,
    reps: 4,
    confidence: 0.8,
    lastReviewAt: new Date("2026-02-01T00:00:00.000Z"),
    lastRetrievalType: "recognition",
    ...overrides,
  };
}

describe("topologicalOrder", () => {
  it("places every skill after its prerequisites", () => {
    const result = topologicalOrder(CHAIN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const position = (id: string): number => result.order.indexOf(id);
    expect(position(A)).toBeLessThan(position(B));
    expect(position(B)).toBeLessThan(position(C));
    expect(position(B)).toBeLessThan(position(D));
    expect(result.order).toHaveLength(4);
  });

  it("is deterministic across runs and edge orderings", () => {
    const shuffled: SkillGraph = {
      skills: [...CHAIN.skills].reverse(),
      edges: [...CHAIN.edges].reverse(),
    };
    const first = topologicalOrder(CHAIN);
    const second = topologicalOrder(shuffled);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.order).toEqual(first.order);
  });

  it("reports a cycle instead of an order", () => {
    const cyclic: SkillGraph = { skills: CHAIN.skills, edges: [...CHAIN.edges, edge(C, A)] };
    const result = topologicalOrder(cyclic);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cycle.length).toBeGreaterThan(1);
    expect(result.cycle[0]).toBe(result.cycle[result.cycle.length - 1]);
    expect(new Set(result.cycle)).toEqual(new Set([A, B, C]));
  });

  it("treats a self prerequisite as a cycle", () => {
    const selfish: SkillGraph = { skills: CHAIN.skills, edges: [edge(A, A)] };
    expect(topologicalOrder(selfish).ok).toBe(false);
    expect(detectPrerequisiteCycle(selfish)).toEqual([A, A]);
  });

  it("finds no cycle in a well-formed graph", () => {
    expect(detectPrerequisiteCycle(CHAIN)).toBeNull();
  });

  it("ignores non-prerequisite relations when ordering", () => {
    const withLookAlikes: SkillGraph = {
      skills: CHAIN.skills,
      edges: [...CHAIN.edges, edge(C, A, "mutashabih_of"), edge(D, A, "misconception_of")],
    };
    expect(topologicalOrder(withLookAlikes).ok).toBe(true);
  });
});

describe("closures", () => {
  it("returns every transitive prerequisite, sorted and self-free", () => {
    expect(prerequisiteClosure(CHAIN, C)).toEqual([B, A].sort());
    expect(prerequisiteClosure(CHAIN, A)).toEqual([]);
  });

  it("returns every transitive dependent", () => {
    expect(dependentClosure(CHAIN, A)).toEqual([B, C, D].sort());
    expect(dependentClosure(CHAIN, C)).toEqual([]);
  });

  it("terminates on a cyclic graph", () => {
    const cyclic: SkillGraph = { skills: CHAIN.skills, edges: [...CHAIN.edges, edge(C, A)] };
    expect(prerequisiteClosure(cyclic, C).length).toBeGreaterThan(0);
  });

  it("exposes direct prerequisites separately from the closure", () => {
    expect(directPrerequisites(CHAIN, C)).toEqual([B]);
    expect(prerequisiteClosure(CHAIN, C)).toContain(A);
  });
});

describe("neighbors", () => {
  it("walks one relation at a time, in the requested direction", () => {
    const graph: SkillGraph = {
      skills: CHAIN.skills,
      edges: [
        edge(C, D, "mutashabih_of"),
        edge(D, C, "mutashabih_of"),
        edge(A, C, "misconception_of"),
      ],
    };
    expect(neighbors(graph, C, "mutashabih_of", "out")).toEqual([D]);
    expect(neighbors(graph, C, "mutashabih_of", "in")).toEqual([D]);
    expect(neighbors(graph, C, "misconception_of", "in")).toEqual([A]);
    expect(neighbors(graph, C, "misconception_of", "out")).toEqual([]);
    expect(neighbors(graph, C, "prerequisite", "both")).toEqual([]);
  });
});

describe("unlocked", () => {
  it("opens only the roots when nothing has been recorded", () => {
    expect(unlocked(CHAIN, [])).toEqual([A]);
  });

  it("opens the next skill once its prerequisite carries evidence", () => {
    expect(unlocked(CHAIN, [known(A)])).toEqual([A, B].sort());
  });

  it("keeps a leaf locked when a deeper prerequisite is unevidenced", () => {
    const status = unlockStatus(CHAIN, C, [known(B)]);
    expect(status.unlocked).toBe(false);
    expect(status.missing).toEqual([A]);
  });

  it("requires reps, stability and confidence together (evidence rule)", () => {
    expect(unlockStatus(CHAIN, B, [known(A, { reps: 1 })]).unlocked).toBe(false);
    expect(unlockStatus(CHAIN, B, [known(A, { stability: 0.5 })]).unlocked).toBe(false);
    expect(unlockStatus(CHAIN, B, [known(A, { confidence: 0.1 })]).unlocked).toBe(false);
    expect(unlockStatus(CHAIN, B, [known(A)]).unlocked).toBe(true);
  });

  it("honours a custom unlock policy", () => {
    const strict = { ...DEFAULT_UNLOCK_POLICY, minStabilityDays: 100 };
    expect(unlockStatus(CHAIN, B, [known(A)], strict).unlocked).toBe(false);
  });
});

describe("validateGraph", () => {
  it("passes a well-formed graph", () => {
    expect(validateGraph(CHAIN)).toEqual([]);
  });

  it("reports duplicates, danglers, self-edges and cycles without throwing", () => {
    const broken: SkillGraph = {
      skills: [
        skill(A, "memory.skill.letter_alif"),
        skill(A, "memory.skill.letter_alif"),
        skill(B, "memory.skill.letter_baa"),
      ],
      edges: [
        edge(A, B),
        edge(A, B),
        edge(B, B),
        edge("c:missing.skill", A),
        edge(B, A),
      ],
    };
    const codes = validateGraph(broken).map((error) => error.code);
    expect(codes).toContain("duplicate_skill");
    expect(codes).toContain("duplicate_edge");
    expect(codes).toContain("self_edge");
    expect(codes).toContain("unknown_skill");
    expect(codes).toContain("prerequisite_cycle");
  });

  it("rejects a literal label in place of an i18n key", () => {
    const literal: SkillGraph = {
      skills: [skill(A, "Letter alif")],
      edges: [],
    };
    expect(validateGraph(literal).map((error) => error.code)).toContain("invalid_label_key");
  });

  it("rejects a malformed id and a kind that disagrees with the id", () => {
    const malformed: SkillGraph = {
      skills: [
        { id: "nonsense", kind: "ayah_body", labelKey: "memory.skill.x", difficultyHint: 3 },
        { id: "b:2:255", kind: "reading_concept", labelKey: "memory.skill.y", difficultyHint: 3 },
      ],
      edges: [],
    };
    const codes = validateGraph(malformed).map((error) => error.code);
    expect(codes).toContain("invalid_skill_id");
    expect(codes).toContain("kind_mismatch");
  });

  it("rejects an out-of-range difficulty hint", () => {
    const graph: SkillGraph = { skills: [skill(A, "memory.skill.letter_alif", 42)], edges: [] };
    expect(validateGraph(graph).map((error) => error.code)).toContain("invalid_difficulty_hint");
  });

  it("carries an i18n reason key on every error", () => {
    const graph: SkillGraph = { skills: [skill(A, "Literal", 42)], edges: [edge(A, A)] };
    const errors = validateGraph(graph);
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error.reason.key).toMatch(/^memory\.graph\.error\./);
    }
  });
});
