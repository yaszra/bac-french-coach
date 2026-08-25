/**
 * Turning an engine's reason into copy the learner can read.
 *
 * The engines emit machine-readable reasons — `{ key, params }` — and never
 * literal text, which is what lets the same decision be explained to a learner,
 * a teacher and a parent in three different registers and two languages.
 *
 * This module owns the learner's register. It maps the engine's key into the
 * learner message namespace, so the copy can be written for a fourteen-year-old
 * without the teacher console's wording changing underneath it, and without two
 * surfaces fighting over the same message file.
 *
 * The mapping is deliberately explicit. A key nobody has written copy for falls
 * back to a general line rather than leaking `memory.reason.something` onto a
 * screen — the honesty rule is about the state being true, not about showing the
 * learner our identifiers.
 *
 * Pure: no I/O, no translator. The caller translates.
 */

import type { Reason } from "@/modules/memory/domain/types";
import { unitReferenceLabel } from "./passage";

/** Engine key → learner message key. Every entry is copy someone wrote on purpose. */
const REASON_KEYS: Readonly<Record<string, string>> = {
  "memory.reason.verification_overdue": "learner.why.verificationOverdue",
  "memory.reason.recent_lapse": "learner.why.recentLapse",
  "memory.reason.due_review": "learner.why.dueReview",
  "memory.reason.weak_join": "learner.why.weakJoin",
  "memory.reason.new_material": "learner.why.newMaterial",
  "memory.reason.new_material_withheld_load": "learner.why.newWithheldLoad",
  "memory.reason.new_material_withheld_tier": "learner.why.newWithheldTier",
  "memory.reason.maintenance_never_read": "learner.why.maintenanceNeverRead",
  "memory.reason.maintenance_due": "learner.why.maintenanceDue",
  "hifz.weak_join.not_yet_recorded": "learner.why.joinNotYetRecorded",
  "hifz.weak_join.retrievability_gap": "learner.why.weakJoin",
  "hifz.weak_join.stability_gap": "learner.why.weakJoin",
  "hifz.plan.nothing_due": "learner.today.nothingDue.body",
  "hifz.plan.budget_too_small": "learner.today.nothingFits.body",
  "hifz.plan.budget_spent": "learner.why.budgetSpent",
  "hifz.plan.new_capped": "learner.why.newCapped",
  "hifz.plan.unknown_action": "learner.why.unknown",
};

export const FALLBACK_REASON_KEY = "learner.why.unknown";

export function reasonMessageKey(key: string): string {
  return REASON_KEYS[key] ?? FALLBACK_REASON_KEY;
}

/**
 * Parameters ready for interpolation.
 *
 * `unitId` is replaced by its reference label — `78:1`, or `78:1 → 78:2` — so a
 * learner reads an āyah number rather than `t:78:1>78:2`. It stays a reference:
 * digits and an arrow, never scripture.
 */
export function reasonParams(reason: Reason): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(reason.params)) {
    if (name === "unitId" && typeof value === "string") {
      params[name] = unitReferenceLabel(value) ?? value;
      continue;
    }
    // Retrievabilities are 0..1 in the engine and percentages on screen; a
    // learner has never once wanted to read "0.62".
    if (typeof value === "number" && name.toLowerCase().includes("retrievability")) {
      params[name] = Math.round(value * 100);
      continue;
    }
    params[name] = value;
  }

  // The translator selects a plural form from `count`, so the one number a
  // reason is really about is mirrored there. Without it Arabic — which has six
  // forms — would be stuck on the fallback, and English would say "1 days".
  for (const name of ["daysSinceLapse", "overdueDays", "daysSinceRead"]) {
    const value = params[name];
    if (typeof value === "number") {
      params.count = value;
      break;
    }
  }
  return params;
}

export interface ReasonCopy {
  readonly key: string;
  readonly params: Record<string, string | number>;
  /** True when no copy was written for this reason and the general line is used. */
  readonly isFallback: boolean;
}

export function reasonCopy(reason: Reason): ReasonCopy {
  const key = reasonMessageKey(reason.key);
  return { key, params: reasonParams(reason), isFallback: key === FALLBACK_REASON_KEY };
}

/* --------------------------------------------------- the action's own label */

import type { RecommendedAction } from "@/modules/memory/domain/policy";
import type { HifzExercise } from "../domain/exercises";

/** What the learner is being asked to do, in their own words. */
export function actionMessageKey(action: RecommendedAction): string {
  return `learner.action.${action}`;
}

/** What the rung is called on screen. */
export function exerciseMessageKey(exercise: HifzExercise): string {
  return `learner.exercise.${exercise}.title`;
}

export function exerciseInstructionKey(exercise: HifzExercise): string {
  return `learner.exercise.${exercise}.instruction`;
}
