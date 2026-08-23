/**
 * Knowledge-graph diagnostics.
 *
 * "Diagnose whether a memorization problem is actually a reading or
 * connection problem."
 */
import { describe, expect, it } from "vitest";
import {
  UnreviewedEdgeError,
  buildGraph,
  diagnose,
  interleaveCandidates,
  orderRepairs,
  relatedNodes,
  type DiagnosisInput,
  type KnowledgeEdge,
  type KnowledgeNode,
} from "../src/core/knowledge-graph.js";

const nodes: KnowledgeNode[] = [
  { nodeId: "p1", version: 1, kind: "passage", label: "Al-Mulk 12-15" },
  { nodeId: "p2", version: 1, kind: "passage", label: "Al-Mulk 8-11" },
  { nodeId: "b1", version: 1, kind: "connection_boundary", label: "join 11 into 12" },
  { nodeId: "madd", version: 1, kind: "reading_skill", label: "madd" },
  { nodeId: "madd-arid", version: 1, kind: "reading_skill", label: "madd ʿāriḍ" },
  { nodeId: "ghunnah", version: 1, kind: "reading_skill", label: "ghunnah" },
];

const edge = (over: Partial<KnowledgeEdge> & Pick<KnowledgeEdge, "edgeId" | "from" | "to" | "relation">): KnowledgeEdge => ({
  version: 1,
  provenance: "curriculum_team",
  ...over,
});

const edges: KnowledgeEdge[] = [
  edge({ edgeId: "e1", from: "p1", to: "madd-arid", relation: "reading_dependency" }),
  edge({ edgeId: "e2", from: "p1", to: "ghunnah", relation: "reading_dependency" }),
  edge({ edgeId: "e3", from: "madd-arid", to: "madd", relation: "prerequisite" }),
  edge({ edgeId: "e4", from: "p1", to: "b1", relation: "connection_boundary" }),
  edge({ edgeId: "e5", from: "p1", to: "p2", relation: "commonly_confused_with" }),
];

const graph = buildGraph(nodes, edges);

function input(over: Partial<DiagnosisInput> = {}): DiagnosisInput {
  return {
    nodeId: "p1",
    confirmedReadingSkills: new Set(["madd", "madd-arid", "ghunnah"]),
    corrections: [],
    serialRecallSucceeds: true,
    nonSerialRecallSucceeds: true,
    independentAttempts: 6,
    ...over,
  };
}

describe("an AI-proposed edge cannot enter the graph unreviewed", () => {
  it("throws rather than silently dropping it", () => {
    expect(() =>
      buildGraph(nodes, [
        edge({
          edgeId: "ai1",
          from: "p1",
          to: "madd",
          relation: "reading_dependency",
          provenance: "ai_proposed",
        }),
      ]),
    ).toThrow(UnreviewedEdgeError);
  });

  it("admits a reviewed AI proposal", () => {
    expect(() =>
      buildGraph(nodes, [
        edge({
          edgeId: "ai1",
          from: "p1",
          to: "madd",
          relation: "reading_dependency",
          provenance: "ai_proposed",
          reviewedByUserId: "curriculum-lead",
        }),
      ]),
    ).not.toThrow();
  });

  it("names the offending edge, so the pipeline bug is findable", () => {
    try {
      buildGraph(nodes, [
        edge({
          edgeId: "ai-bad",
          from: "p1",
          to: "madd",
          relation: "prerequisite",
          provenance: "ai_proposed",
        }),
      ]);
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as Error).message).toContain("ai-bad");
    }
  });
});

describe("traversal", () => {
  it("finds nodes by relation", () => {
    expect(relatedNodes(graph, "p1", "reading_dependency").map((n) => n.nodeId)).toEqual([
      "madd-arid",
      "ghunnah",
    ]);
  });

  it("returns nothing for a relation the node does not have", () => {
    expect(relatedNodes(graph, "p1", "example_of")).toEqual([]);
  });
});

describe("insufficient evidence is a real answer", () => {
  it("refuses to diagnose from one bad day", () => {
    const result = diagnose(graph, input({ independentAttempts: 1 }));
    expect(result.kind).toBe("insufficient_evidence");
    expect(result.statement).toMatch(/not enough to say what is going wrong/);
    expect(result.repairTargets).toEqual([]);
  });
});

describe("reading problems are found first, because repetition cannot fix them", () => {
  it("names the unconfirmed prerequisite and the corrections that point at it", () => {
    const result = diagnose(
      graph,
      input({
        confirmedReadingSkills: new Set(["madd"]),
        corrections: ["madd", "ghunnah"],
      }),
    );
    expect(result.kind).toBe("reading");
    expect(result.statement).toContain("madd ʿāriḍ");
    expect(result.repairTargets.map((n) => n.nodeId)).toContain("madd-arid");
    expect(result.confidence).toBe("high");
  });

  it("does not call it a reading problem when the prerequisites are confirmed", () => {
    const result = diagnose(graph, input({ corrections: ["madd"] }));
    expect(result.kind).not.toBe("reading");
  });

  it("does not call it a reading problem on a single unrelated correction", () => {
    const result = diagnose(
      graph,
      input({
        confirmedReadingSkills: new Set(["madd"]),
        corrections: ["word_substitution"],
      }),
    );
    expect(result.kind).not.toBe("reading");
  });
});

describe("connection problems are distinguished from memory problems", () => {
  it("recognises recall that works from the start but not from a join", () => {
    const result = diagnose(
      graph,
      input({ serialRecallSucceeds: true, nonSerialRecallSucceeds: false }),
    );
    expect(result.kind).toBe("connection");
    expect(result.statement).toMatch(/not a memory one/);
    expect(result.repairTargets.map((n) => n.nodeId)).toEqual(["b1"]);
  });

  it("recognises join and order corrections", () => {
    const result = diagnose(graph, input({ corrections: ["join", "order"] }));
    expect(result.kind).toBe("connection");
    expect(result.confidence).toBe("high");
  });
});

describe("similarity interference", () => {
  it("names the passage being confused with this one", () => {
    const result = diagnose(graph, input({ corrections: ["similar_ayah"] }));
    expect(result.kind).toBe("similarity_interference");
    expect(result.statement).toContain("Al-Mulk 8-11");
    expect(result.statement).toMatch(/need contrasting/);
  });
});

describe("memory is the diagnosis of exclusion", () => {
  it("is reached only when reading and joins look sound", () => {
    const result = diagnose(graph, input({ corrections: ["word_substitution"] }));
    expect(result.kind).toBe("memory");
    expect(result.statement).toMatch(/more spaced retrieval/);
  });

  it("gains confidence with more attempts", () => {
    expect(diagnose(graph, input({ independentAttempts: 4 })).confidence).toBe(
      "medium",
    );
    expect(diagnose(graph, input({ independentAttempts: 8 })).confidence).toBe("high");
  });
});

describe("repairs are ordered deepest-first", () => {
  it("teaches a skill others depend on before the ones that need it", () => {
    const targets = [
      graph.nodes.get("madd")!,
      graph.nodes.get("madd-arid")!,
    ];
    // madd-arid depends on madd, so madd-arid is deeper and comes first.
    expect(orderRepairs(graph, targets).map((n) => n.nodeId)).toEqual([
      "madd-arid",
      "madd",
    ]);
  });

  it("survives a cycle in the curriculum graph rather than throwing", () => {
    const cyclic = buildGraph(nodes, [
      edge({ edgeId: "c1", from: "madd", to: "madd-arid", relation: "prerequisite" }),
      edge({ edgeId: "c2", from: "madd-arid", to: "madd", relation: "prerequisite" }),
    ]);
    // A cycle is a data problem to surface, not a reason to break a
    // teacher's screen.
    expect(() =>
      orderRepairs(cyclic, [nodes[3]!, nodes[4]!]),
    ).not.toThrow();
  });

  it("is deterministic for equal depths", () => {
    const targets = [graph.nodes.get("ghunnah")!, graph.nodes.get("madd")!];
    expect(orderRepairs(graph, targets).map((n) => n.nodeId)).toEqual([
      "ghunnah",
      "madd",
    ]);
  });
});

describe("interleaving waits until comparison is productive", () => {
  it("offers nothing while the original is still insecure", () => {
    expect(
      interleaveCandidates(graph, "p1", { originalIsSecure: false }),
    ).toEqual([]);
  });

  it("offers the confusable passage once the original is secure", () => {
    expect(
      interleaveCandidates(graph, "p1", { originalIsSecure: true }).map(
        (n) => n.nodeId,
      ),
    ).toEqual(["p2"]);
  });
});
