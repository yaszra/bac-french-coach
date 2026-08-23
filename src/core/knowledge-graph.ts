/**
 * The knowledge graph.
 *
 * Its job is one question: **when a learner fails a passage, is that a
 * memory problem, a reading problem, or a connection problem?** Without an
 * answer, a teacher's only move is "practise it again", which is the right
 * response to exactly one of the three.
 *
 * Stored relationally (docs/07). No graph database until query evidence
 * justifies one — and traversals here are shallow by design, because a
 * diagnosis a teacher cannot follow is not a diagnosis they can act on.
 */
import type { CorrectionCategory } from "./types.js";

export const GRAPH_VERSION = "athar-graph/1.0.0";

export type NodeKind =
  | "passage"
  | "ayah"
  | "connection_boundary"
  | "reading_skill"
  | "tajwid_rule"
  | "correction_pattern";

export type EdgeRelation =
  | "prerequisite"
  | "part_of"
  | "precedes"
  | "follows"
  | "connection_boundary"
  | "similar_wording"
  | "commonly_confused_with"
  | "reading_dependency"
  | "tajwid_rule_association"
  | "correction_pattern"
  | "example_of";

/**
 * Where an edge came from.
 *
 * An AI system may propose an edge; it may not create a production one.
 * `reviewedBy` is required for `ai_proposed`, and the database enforces
 * the same rule with a CHECK constraint.
 */
export type EdgeProvenance = "curriculum_team" | "teacher" | "ai_proposed";

export interface KnowledgeNode {
  nodeId: string;
  version: number;
  kind: NodeKind;
  label: string;
}

export interface KnowledgeEdge {
  edgeId: string;
  version: number;
  from: string;
  to: string;
  relation: EdgeRelation;
  provenance: EdgeProvenance;
  reviewedByUserId?: string;
}

export class UnreviewedEdgeError extends Error {
  constructor(edgeId: string) {
    super(
      `Edge ${edgeId} is AI-proposed and unreviewed; it cannot enter the production graph.`,
    );
    this.name = "UnreviewedEdgeError";
  }
}

/**
 * Admit edges into the working graph.
 *
 * Throws rather than filtering: an unreviewed AI edge reaching this point
 * is a bug in the pipeline that produced it, and silently dropping it
 * would hide that.
 */
export function admitEdges(edges: readonly KnowledgeEdge[]): readonly KnowledgeEdge[] {
  for (const edge of edges)
    if (edge.provenance === "ai_proposed" && !edge.reviewedByUserId)
      throw new UnreviewedEdgeError(edge.edgeId);
  return edges;
}

export interface Graph {
  nodes: ReadonlyMap<string, KnowledgeNode>;
  outgoing: ReadonlyMap<string, readonly KnowledgeEdge[]>;
  incoming: ReadonlyMap<string, readonly KnowledgeEdge[]>;
  version: string;
}

export function buildGraph(
  nodes: readonly KnowledgeNode[],
  edges: readonly KnowledgeEdge[],
): Graph {
  const admitted = admitEdges(edges);
  const outgoing = new Map<string, KnowledgeEdge[]>();
  const incoming = new Map<string, KnowledgeEdge[]>();

  for (const edge of admitted) {
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)!).push(edge);
    (incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)!).push(edge);
  }

  return {
    nodes: new Map(nodes.map((n) => [n.nodeId, n])),
    outgoing,
    incoming,
    version: GRAPH_VERSION,
  };
}

export function relatedNodes(
  graph: Graph,
  nodeId: string,
  relation: EdgeRelation,
): readonly KnowledgeNode[] {
  return (graph.outgoing.get(nodeId) ?? [])
    .filter((e) => e.relation === relation)
    .map((e) => graph.nodes.get(e.to))
    .filter((n): n is KnowledgeNode => n !== undefined);
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

export type ProblemKind =
  | "memory"
  | "reading"
  | "connection"
  | "similarity_interference"
  | "insufficient_evidence";

export interface DiagnosisInput {
  /** The passage node the learner is struggling with. */
  nodeId: string;
  /** Reading skills confirmed for this learner. */
  confirmedReadingSkills: ReadonlySet<string>;
  /** Correction categories seen on this passage, most recent first. */
  corrections: readonly CorrectionCategory[];
  /** Independent recall succeeded when starting from the beginning. */
  serialRecallSucceeds: boolean;
  /** Independent recall succeeded from a random start or a join. */
  nonSerialRecallSucceeds: boolean;
  /** Total independent attempts on this passage. */
  independentAttempts: number;
}

export interface Diagnosis {
  kind: ProblemKind;
  /** Plain-language statement a teacher can act on. */
  statement: string;
  /** What to work on first. Empty when the diagnosis is "insufficient". */
  repairTargets: readonly KnowledgeNode[];
  confidence: "low" | "medium" | "high";
}

/** Corrections that point at reading rather than at memory. */
const READING_CORRECTIONS: ReadonlySet<CorrectionCategory> = new Set([
  "vowel",
  "letter",
  "makhraj",
  "madd",
  "ghunnah",
]);

/** Corrections that point at a boundary between passages. */
const CONNECTION_CORRECTIONS: ReadonlySet<CorrectionCategory> = new Set([
  "join",
  "order",
]);

const MIN_ATTEMPTS_TO_DIAGNOSE = 3;

/**
 * Diagnose a struggling passage.
 *
 * Checks in order of what a teacher can most usefully fix: an unmet
 * reading prerequisite makes memorization harder in a way no amount of
 * repetition addresses, so it is looked for first.
 */
export function diagnose(graph: Graph, input: DiagnosisInput): Diagnosis {
  // Below the minimum sample we say so, rather than guessing from one bad
  // day. "Insufficient evidence" is a designed answer, not a failure.
  if (input.independentAttempts < MIN_ATTEMPTS_TO_DIAGNOSE)
    return {
      kind: "insufficient_evidence",
      statement: `Only ${input.independentAttempts} independent ${
        input.independentAttempts === 1 ? "attempt" : "attempts"
      } so far — not enough to say what is going wrong.`,
      repairTargets: [],
      confidence: "low",
    };

  // 1. Reading prerequisites, which repetition cannot fix.
  const prerequisites = relatedNodes(graph, input.nodeId, "reading_dependency");
  const unmet = prerequisites.filter(
    (n) => !input.confirmedReadingSkills.has(n.nodeId),
  );
  const readingCorrections = input.corrections.filter((c) =>
    READING_CORRECTIONS.has(c),
  );
  if (unmet.length > 0 && readingCorrections.length > 0)
    return {
      kind: "reading",
      statement: `This looks like a reading difficulty: ${unmet
        .map((n) => n.label)
        .join(", ")} ${unmet.length === 1 ? "is" : "are"} not yet confirmed, and the corrections here are ${[
        ...new Set(readingCorrections),
      ].join(", ")}.`,
      repairTargets: unmet,
      confidence: readingCorrections.length >= 2 ? "high" : "medium",
    };

  // 2. Connections: recall works from the start but not from a join.
  const connectionCorrections = input.corrections.filter((c) =>
    CONNECTION_CORRECTIONS.has(c),
  );
  if (
    (input.serialRecallSucceeds && !input.nonSerialRecallSucceeds) ||
    connectionCorrections.length > 0
  ) {
    const boundaries = relatedNodes(graph, input.nodeId, "connection_boundary");
    return {
      kind: "connection",
      statement: input.serialRecallSucceeds
        ? "Recall works from the beginning but not from a join — this is a connection problem, not a memory one."
        : "The corrections here are about joins and order rather than the words themselves.",
      repairTargets: boundaries,
      confidence: connectionCorrections.length >= 2 ? "high" : "medium",
    };
  }

  // 3. Similarity interference with a confusable passage.
  const confusable = relatedNodes(graph, input.nodeId, "commonly_confused_with");
  if (confusable.length > 0 && input.corrections.includes("similar_ayah"))
    return {
      kind: "similarity_interference",
      statement: `This passage is being confused with ${confusable
        .map((n) => n.label)
        .join(", ")}. Practising them apart will not help; they need contrasting.`,
      repairTargets: confusable,
      confidence: "medium",
    };

  // 4. Nothing else explains it: it is memory, and repetition is the answer.
  return {
    kind: "memory",
    statement:
      "Reading prerequisites and joins look sound, so this is a memory problem — more spaced retrieval should help.",
    repairTargets: [],
    confidence: input.independentAttempts >= 6 ? "high" : "medium",
  };
}

/**
 * Order prerequisite repairs.
 *
 * Deepest first: a skill that other unmet skills depend on is worth
 * teaching before the ones that need it. Cycles are tolerated rather than
 * thrown on — a curriculum graph with a cycle is a data problem to
 * surface, not a reason to fail a teacher's screen.
 */
export function orderRepairs(
  graph: Graph,
  targets: readonly KnowledgeNode[],
): readonly KnowledgeNode[] {
  const depthOf = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return 0;
    seen.add(nodeId);
    const prerequisites = (graph.outgoing.get(nodeId) ?? []).filter(
      (e) => e.relation === "prerequisite",
    );
    if (prerequisites.length === 0) return 0;
    return (
      1 + Math.max(...prerequisites.map((e) => depthOf(e.to, new Set(seen))))
    );
  };

  return [...targets].sort(
    (a, b) =>
      depthOf(b.nodeId, new Set()) - depthOf(a.nodeId, new Set()) ||
      a.nodeId.localeCompare(b.nodeId),
  );
}

/**
 * Passages worth interleaving with this one.
 *
 * Only after the original is understood well enough for comparison to be
 * productive — interleaving too early teaches confusion rather than
 * discrimination.
 */
export function interleaveCandidates(
  graph: Graph,
  nodeId: string,
  opts: { originalIsSecure: boolean },
): readonly KnowledgeNode[] {
  if (!opts.originalIsSecure) return [];
  return [
    ...relatedNodes(graph, nodeId, "similar_wording"),
    ...relatedNodes(graph, nodeId, "commonly_confused_with"),
  ];
}
