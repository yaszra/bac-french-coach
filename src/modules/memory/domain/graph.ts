/**
 * The skill graph.
 *
 * Nodes are skills (one per memory unit: a transition, a body, a page position, a
 * reading concept); edges carry the four relations the curriculum needs:
 *
 * - `prerequisite`     — `from` must be learned before `to`. **Must be acyclic.**
 * - `misconception_of` — `from` is a known wrong reading of `to` (drives repair drills).
 * - `mutashabih_of`    — `from` looks/sounds like `to` (mutually similar passages).
 * - `rule_ayah`        — `from` is a reading rule illustrated by the āyah unit `to`.
 *
 * Every utility here is pure and deterministic: results are sorted by id so two runs
 * over the same graph produce identical output.
 *
 * `validateGraph` *returns* errors, it never throws — a malformed curriculum is a
 * report for the studio editor, not a crash in a learner's session.
 */

import {
  reason,
  unitKindOf,
  type MemoryState,
  type Reason,
  type UnitId,
  type UnitKind,
} from "./types";

export const SKILL_RELATIONS = [
  "prerequisite",
  "misconception_of",
  "mutashabih_of",
  "rule_ayah",
] as const;

export type SkillRelation = (typeof SKILL_RELATIONS)[number];

export interface Skill {
  readonly id: UnitId;
  readonly kind: UnitKind;
  /** i18n key — never literal user-visible text. */
  readonly labelKey: string;
  /** Author's prior on difficulty, 1 (easiest) .. 10 (hardest). */
  readonly difficultyHint: number;
}

export interface SkillEdge {
  readonly from: UnitId;
  readonly to: UnitId;
  readonly relation: SkillRelation;
}

export interface SkillGraph {
  readonly skills: readonly Skill[];
  readonly edges: readonly SkillEdge[];
}

export type GraphErrorCode =
  | "duplicate_skill"
  | "invalid_skill_id"
  | "kind_mismatch"
  | "invalid_label_key"
  | "invalid_difficulty_hint"
  | "unknown_skill"
  | "self_edge"
  | "duplicate_edge"
  | "prerequisite_cycle";

export interface GraphError {
  readonly code: GraphErrorCode;
  readonly reason: Reason;
}

/** i18n keys look like `a.b.c` — a literal sentence would fail this. */
const LABEL_KEY_RE = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/;

/** Key separator; the unit-id grammar never produces this character. */
const KEY_SEPARATOR = "|";

export type Direction = "out" | "in" | "both";

export interface UnlockPolicy {
  readonly minStabilityDays: number;
  readonly minConfidence: number;
  readonly minReps: number;
}

/**
 * A prerequisite counts as met only with real evidence behind it: two recorded
 * reviews, three days of stability and half the evidence budget. Guessing through
 * one exercise never unlocks the next skill (evidence rule).
 */
export const DEFAULT_UNLOCK_POLICY: UnlockPolicy = {
  minStabilityDays: 3,
  minConfidence: 0.5,
  minReps: 2,
};

/* ------------------------------------------------------------------ indexing */

export function stateMapOf(
  states: readonly MemoryState[] | ReadonlyMap<UnitId, MemoryState>,
): ReadonlyMap<UnitId, MemoryState> {
  if (states instanceof Map) return states;
  const map = new Map<UnitId, MemoryState>();
  for (const state of states as readonly MemoryState[]) map.set(state.unitId, state);
  return map;
}

function skillIds(graph: SkillGraph): readonly string[] {
  return [...new Set(graph.skills.map((skill) => skill.id))].sort();
}

function relationEdges(graph: SkillGraph, relation: SkillRelation): readonly SkillEdge[] {
  return graph.edges.filter((edge) => edge.relation === relation);
}

/** Deduplicated prerequisite edges between known skills, excluding self-edges. */
function prerequisitePairs(graph: SkillGraph): readonly (readonly [string, string])[] {
  const known = new Set(graph.skills.map((skill) => skill.id));
  const seen = new Set<string>();
  const pairs: (readonly [string, string])[] = [];
  for (const edge of relationEdges(graph, "prerequisite")) {
    if (!known.has(edge.from) || !known.has(edge.to)) continue;
    if (edge.from === edge.to) continue;
    const key = [edge.from, edge.to].join(KEY_SEPARATOR);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([edge.from, edge.to]);
  }
  return pairs;
}

/* ----------------------------------------------------------------- traversal */

export type TopoResult =
  | { readonly ok: true; readonly order: readonly string[] }
  | { readonly ok: false; readonly cycle: readonly string[] };

/**
 * Kahn's algorithm over `prerequisite` edges, always taking the lexicographically
 * smallest ready skill so the order is stable across runs. On failure the returned
 * `cycle` is one concrete cycle, ready to render in the studio editor.
 */
export function topologicalOrder(graph: SkillGraph): TopoResult {
  const ids = skillIds(graph);
  const selfLoop = relationEdges(graph, "prerequisite").find((edge) => edge.from === edge.to);
  if (selfLoop !== undefined) return { ok: false, cycle: [selfLoop.from, selfLoop.from] };

  const successors = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const [from, to] of prerequisitePairs(graph)) {
    successors.get(from)?.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }

  const ready = ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const next = ready.shift();
    if (next === undefined) break;
    order.push(next);
    for (const successor of (successors.get(next) ?? []).slice().sort()) {
      const remaining = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, remaining);
      if (remaining === 0) {
        ready.push(successor);
        ready.sort();
      }
    }
  }

  if (order.length === ids.length) return { ok: true, order };
  const visited = new Set(order);
  const remaining = ids.filter((id) => !visited.has(id));
  return { ok: false, cycle: findCycle(remaining, successors) };
}

/** One cycle among `nodes`, as a path whose first and last element are equal. */
function findCycle(
  nodes: readonly string[],
  successors: ReadonlyMap<string, string[]>,
): readonly string[] {
  const inScope = new Set(nodes);
  const marks = new Map<string, "open" | "closed">();
  const stack: string[] = [];

  const walk = (node: string): readonly string[] | null => {
    marks.set(node, "open");
    stack.push(node);
    for (const successor of (successors.get(node) ?? []).slice().sort()) {
      if (!inScope.has(successor)) continue;
      const mark = marks.get(successor);
      if (mark === "open") {
        const start = stack.indexOf(successor);
        return [...stack.slice(start >= 0 ? start : 0), successor];
      }
      if (mark === undefined) {
        const found = walk(successor);
        if (found !== null) return found;
      }
    }
    marks.set(node, "closed");
    stack.pop();
    return null;
  };

  for (const node of [...nodes].sort()) {
    if (marks.get(node) === undefined) {
      const found = walk(node);
      if (found !== null) return found;
    }
  }
  return [];
}

/** One prerequisite cycle, or `null` when the prerequisite relation is acyclic. */
export function detectPrerequisiteCycle(graph: SkillGraph): readonly string[] | null {
  const result = topologicalOrder(graph);
  return result.ok ? null : result.cycle;
}

/** Skills adjacent to `skillId` under one relation, sorted. */
export function neighbors(
  graph: SkillGraph,
  skillId: UnitId,
  relation: SkillRelation,
  direction: Direction = "out",
): readonly string[] {
  const found = new Set<string>();
  for (const edge of relationEdges(graph, relation)) {
    if ((direction === "out" || direction === "both") && edge.from === skillId) found.add(edge.to);
    if ((direction === "in" || direction === "both") && edge.to === skillId) found.add(edge.from);
  }
  found.delete(skillId);
  return [...found].sort();
}

/** Direct prerequisites of a skill, sorted. */
export function directPrerequisites(graph: SkillGraph, skillId: UnitId): readonly string[] {
  return neighbors(graph, skillId, "prerequisite", "in");
}

function incomingPrerequisites(graph: SkillGraph): ReadonlyMap<string, string[]> {
  const incoming = new Map<string, string[]>();
  for (const [from, to] of prerequisitePairs(graph)) {
    const list = incoming.get(to);
    if (list === undefined) incoming.set(to, [from]);
    else list.push(from);
  }
  return incoming;
}

function outgoingPrerequisites(graph: SkillGraph): ReadonlyMap<string, string[]> {
  const outgoing = new Map<string, string[]>();
  for (const [from, to] of prerequisitePairs(graph)) {
    const list = outgoing.get(from);
    if (list === undefined) outgoing.set(from, [to]);
    else list.push(to);
  }
  return outgoing;
}

function closureFrom(adjacency: ReadonlyMap<string, string[]>, startId: string): readonly string[] {
  const seen = new Set<string>();
  const queue: string[] = [...(adjacency.get(startId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current === startId || seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

/**
 * Every transitive prerequisite of `skillId`, sorted, excluding the skill itself.
 * Cycle-safe: a malformed graph yields a finite answer rather than a hang.
 */
export function prerequisiteClosure(graph: SkillGraph, skillId: UnitId): readonly string[] {
  return closureFrom(incomingPrerequisites(graph), skillId);
}

/** Every skill that transitively depends on `skillId`, sorted. */
export function dependentClosure(graph: SkillGraph, skillId: UnitId): readonly string[] {
  return closureFrom(outgoingPrerequisites(graph), skillId);
}

/* ----------------------------------------------------------------- unlocking */

export interface UnlockStatus {
  readonly skillId: UnitId;
  readonly unlocked: boolean;
  /** Prerequisites that are not yet evidenced, sorted — the "why not" for teachers. */
  readonly missing: readonly string[];
}

/** True when a prerequisite's state carries enough evidence to count as met. */
export function meetsUnlockBar(
  state: MemoryState | undefined,
  policy: UnlockPolicy = DEFAULT_UNLOCK_POLICY,
): boolean {
  if (state === undefined) return false;
  return (
    state.reps >= policy.minReps &&
    state.stability >= policy.minStabilityDays &&
    state.confidence >= policy.minConfidence
  );
}

/**
 * Gating for one skill. Every *transitive* prerequisite must be evidenced — meeting
 * a middle prerequisite alone does not open the door.
 */
export function unlockStatus(
  graph: SkillGraph,
  skillId: UnitId,
  states: readonly MemoryState[] | ReadonlyMap<UnitId, MemoryState>,
  policy: UnlockPolicy = DEFAULT_UNLOCK_POLICY,
): UnlockStatus {
  const map = stateMapOf(states);
  const missing = prerequisiteClosure(graph, skillId).filter(
    (prerequisiteId) => !meetsUnlockBar(map.get(prerequisiteId), policy),
  );
  return { skillId, unlocked: missing.length === 0, missing };
}

/** Ids of every skill whose prerequisites are met, sorted. */
export function unlocked(
  graph: SkillGraph,
  states: readonly MemoryState[] | ReadonlyMap<UnitId, MemoryState>,
  policy: UnlockPolicy = DEFAULT_UNLOCK_POLICY,
): readonly string[] {
  const map = stateMapOf(states);
  return skillIds(graph).filter((id) => unlockStatus(graph, id, map, policy).unlocked);
}

/* ---------------------------------------------------------------- validation */

/** Report every structural problem with a graph. Never throws. */
export function validateGraph(graph: SkillGraph): readonly GraphError[] {
  const errors: GraphError[] = [];
  const seenIds = new Set<string>();

  for (const skill of graph.skills) {
    if (seenIds.has(skill.id)) {
      errors.push({
        code: "duplicate_skill",
        reason: reason("memory.graph.error.duplicate_skill", { skillId: skill.id }),
      });
    }
    seenIds.add(skill.id);

    const parsedKind = unitKindOf(skill.id);
    if (parsedKind === null) {
      errors.push({
        code: "invalid_skill_id",
        reason: reason("memory.graph.error.invalid_skill_id", { skillId: skill.id }),
      });
    } else if (parsedKind !== skill.kind) {
      errors.push({
        code: "kind_mismatch",
        reason: reason("memory.graph.error.kind_mismatch", {
          skillId: skill.id,
          declared: skill.kind,
          actual: parsedKind,
        }),
      });
    }

    if (!LABEL_KEY_RE.test(skill.labelKey)) {
      errors.push({
        code: "invalid_label_key",
        reason: reason("memory.graph.error.invalid_label_key", {
          skillId: skill.id,
          labelKey: skill.labelKey,
        }),
      });
    }

    if (
      !Number.isFinite(skill.difficultyHint) ||
      skill.difficultyHint < 1 ||
      skill.difficultyHint > 10
    ) {
      errors.push({
        code: "invalid_difficulty_hint",
        reason: reason("memory.graph.error.invalid_difficulty_hint", {
          skillId: skill.id,
          difficultyHint: skill.difficultyHint,
        }),
      });
    }
  }

  const seenEdges = new Set<string>();
  for (const edge of graph.edges) {
    const endpoints = [
      ["from", edge.from],
      ["to", edge.to],
    ] as const;
    for (const [role, id] of endpoints) {
      if (!seenIds.has(id)) {
        errors.push({
          code: "unknown_skill",
          reason: reason("memory.graph.error.unknown_skill", {
            skillId: id,
            role,
            relation: edge.relation,
          }),
        });
      }
    }
    if (edge.from === edge.to) {
      errors.push({
        code: "self_edge",
        reason: reason("memory.graph.error.self_edge", {
          skillId: edge.from,
          relation: edge.relation,
        }),
      });
    }
    const key = [edge.relation, edge.from, edge.to].join(KEY_SEPARATOR);
    if (seenEdges.has(key)) {
      errors.push({
        code: "duplicate_edge",
        reason: reason("memory.graph.error.duplicate_edge", {
          from: edge.from,
          to: edge.to,
          relation: edge.relation,
        }),
      });
    }
    seenEdges.add(key);
  }

  const cycle = detectPrerequisiteCycle(graph);
  if (cycle !== null && cycle.length > 0) {
    errors.push({
      code: "prerequisite_cycle",
      reason: reason("memory.graph.error.prerequisite_cycle", { path: cycle.join(" > ") }),
    });
  }

  return errors;
}
