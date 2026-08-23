/**
 * Evidence-policy defaults and versioning.
 *
 * Two ideas live here:
 *
 *  1. **Defaults that are actually sensible.** The four-step wizard shows
 *     Who, What, and Review; the evidence policy is defaulted and hidden
 *     behind "Adjust evidence". A teacher should not have to reason about
 *     non-serial recall counts to set homework.
 *  2. **Editing a policy creates a version.** Verification pins the version
 *     that applied, so a policy loosened after the fact cannot retroactively
 *     make old evidence sufficient.
 */
import type { EvidencePolicy } from "./evidence.js";
import type { MemoryTargetKind } from "./types.js";

export interface PolicyDefaults {
  requiredListens: number;
  requiredIndependentRecalls: number;
  requiredNonSerialRecalls: number;
  estimatedActiveMinutes: number;
}

/**
 * Defaults by what is being assigned and how much of it.
 *
 * A connection boundary needs proportionally more non-serial evidence
 * because reciting into a join from the beginning is exactly the thing it
 * is not testing.
 */
export function defaultPolicy(
  kind: MemoryTargetKind,
  ayahCount: number,
): PolicyDefaults {
  const size = Math.max(1, ayahCount);

  switch (kind) {
    case "connection_boundary":
      return {
        requiredListens: 2,
        requiredIndependentRecalls: 2,
        // Both must be non-serial: a join proved from the start is not proved.
        requiredNonSerialRecalls: 2,
        estimatedActiveMinutes: 4,
      };
    case "similar_ayah_contrast":
      return {
        requiredListens: 2,
        requiredIndependentRecalls: 3,
        requiredNonSerialRecalls: 2,
        estimatedActiveMinutes: 6,
      };
    case "qaida_skill":
      return {
        requiredListens: 3,
        requiredIndependentRecalls: 2,
        requiredNonSerialRecalls: 0,
        estimatedActiveMinutes: 5,
      };
    default:
      return {
        // Longer passages earn one more listen, capped: "listen five times"
        // stops being instruction and starts being a chore.
        requiredListens: size <= 3 ? 3 : 4,
        requiredIndependentRecalls: size <= 3 ? 2 : 3,
        requiredNonSerialRecalls: 1,
        estimatedActiveMinutes: Math.min(20, 3 + size * 2),
      };
  }
}

export type PolicyIssue =
  | "non_serial_exceeds_total"
  | "no_independent_recall_required"
  | "listens_unreasonably_high"
  | "independent_recalls_unreasonably_high";

/**
 * Validation with a stated reason for each rule.
 *
 * The upper bounds exist because a policy nobody can satisfy is a way of
 * blocking a learner without saying so.
 */
export function validatePolicy(
  policy: Omit<EvidencePolicy, "policyVersion">,
): readonly { issue: PolicyIssue; message: string }[] {
  const issues: { issue: PolicyIssue; message: string }[] = [];

  if (policy.requiredNonSerialRecalls > policy.requiredIndependentRecalls)
    issues.push({
      issue: "non_serial_exceeds_total",
      message:
        "More non-serial recalls are required than independent recalls in total, which can never be satisfied.",
    });

  if (policy.requiredIndependentRecalls < 1)
    issues.push({
      issue: "no_independent_recall_required",
      message:
        "At least one cue-free recall is required; without it, verification would rest on scaffolded practice alone.",
    });

  if (policy.requiredListens > 10)
    issues.push({
      issue: "listens_unreasonably_high",
      message: "More than ten required listens is a chore, not instruction.",
    });

  if (policy.requiredIndependentRecalls > 10)
    issues.push({
      issue: "independent_recalls_unreasonably_high",
      message:
        "More than ten required independent recalls will not be reached in a realistic session.",
    });

  return issues;
}

/**
 * Next version label.
 *
 * Monotonic and human-readable, so a teacher reading an audit trail can
 * see the order without decoding an identifier.
 */
export function nextPolicyVersion(current: string): string {
  const match = /^v(\d+)$/.exec(current);
  if (!match) return "v2";
  return `v${Number(match[1]) + 1}`;
}

export interface PolicyChange {
  field: keyof PolicyDefaults | "dueAt";
  from: number;
  to: number;
  /** True when the change makes verification easier to reach. */
  loosens: boolean;
}

/**
 * Describe what a policy edit changed.
 *
 * `loosens` matters for the audit trail: a policy relaxed after a learner
 * struggled is a legitimate teaching decision, and also exactly the kind
 * of thing an academy should be able to see.
 */
export function diffPolicy(
  before: Omit<EvidencePolicy, "policyVersion">,
  after: Omit<EvidencePolicy, "policyVersion">,
): readonly PolicyChange[] {
  const fields: (keyof Omit<EvidencePolicy, "policyVersion">)[] = [
    "requiredListens",
    "requiredIndependentRecalls",
    "requiredNonSerialRecalls",
  ];
  const changes: PolicyChange[] = [];
  for (const field of fields) {
    if (before[field] === after[field]) continue;
    changes.push({
      field: field as keyof PolicyDefaults,
      from: before[field],
      to: after[field],
      loosens: after[field] < before[field],
    });
  }
  return changes;
}
