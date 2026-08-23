/**
 * Server-authoritative learning state machine.
 *
 * No client event may set a state directly. Callers submit *events with
 * evidence*; the machine decides the resulting state. Illegal transitions
 * throw, so a bug cannot silently promote a learner.
 */
import type { LearningState, VerificationDecision, EpochMs } from "./types.js";
import type { EvidencePolicy, EvidenceProgress } from "./evidence.js";
import { meetsVerificationThreshold } from "./evidence.js";
import { MS_PER_DAY } from "./types.js";

export const ENGINE_VERSION = "athar-states/1.0.0";

/** Events the state machine accepts. All carry evidence, never verdicts. */
export type LearningEvent =
  | { kind: "practice_started" }
  | {
      kind: "independent_recall_recorded";
      correct: boolean;
      progress: EvidenceProgress;
      policy: EvidencePolicy;
    }
  | { kind: "verification_recorded"; decision: VerificationDecision }
  | {
      kind: "delayed_recall_recorded";
      correct: boolean;
      hesitant: boolean;
      /** Days since the last successful recall or verification. */
      delayDays: number;
    }
  | { kind: "correction_recurred" }
  | { kind: "repair_completed" }
  | { kind: "forgetting_risk_detected" };

/** Delay (days) after verification that counts as "meaningful". */
export const ESTABLISH_MIN_DELAY_DAYS = 3;
/** Delayed successes at increasing intervals needed for "durable". */
export const DURABLE_MIN_DELAYED_SUCCESSES = 3;
export const DURABLE_MIN_DELAY_DAYS = 14;

export interface StateContext {
  /** Count of successful delayed recalls since verification. */
  delayedSuccesses: number;
  /** Longest successful delay in days since verification. */
  longestSuccessfulDelayDays: number;
}

export const initialContext: StateContext = {
  delayedSuccesses: 0,
  longestSuccessfulDelayDays: 0,
};

export class IllegalTransitionError extends Error {
  constructor(state: LearningState, event: LearningEvent["kind"]) {
    super(`Illegal transition: event "${event}" in state "${state}"`);
    this.name = "IllegalTransitionError";
  }
}

export interface TransitionResult {
  state: LearningState;
  context: StateContext;
  /** Human-readable reason, suitable for audit and teacher display. */
  reason: string;
  engineVersion: typeof ENGINE_VERSION;
}

/**
 * The single entry point. Deterministic: same (state, context, event) in,
 * same result out.
 */
export function transition(
  state: LearningState,
  context: StateContext,
  event: LearningEvent,
): TransitionResult {
  const ok = (
    next: LearningState,
    reason: string,
    ctx: StateContext = context,
  ): TransitionResult => ({
    state: next,
    context: ctx,
    reason,
    engineVersion: ENGINE_VERSION,
  });

  switch (event.kind) {
    case "practice_started": {
      if (state === "assigned") return ok("preparing", "First practice opened.");
      // Practicing in any other state changes nothing by itself.
      return ok(state, "Practice continues; state unchanged.");
    }

    case "independent_recall_recorded": {
      if (state === "verified" || state === "established" || state === "durable")
        throw new IllegalTransitionError(state, event.kind);
      if (!event.correct) {
        if (state === "recalled_independently" || state === "ready_for_verification")
          return ok("preparing", "Cue-free recall failed; back to preparation.");
        return ok(state, "Recall failed; evidence recorded.");
      }
      if (meetsVerificationThreshold(event.progress, event.policy))
        return ok(
          "ready_for_verification",
          `Evidence threshold met under policy ${event.policy.policyVersion}.`,
        );
      return ok(
        "recalled_independently",
        "Cue-free recall succeeded; more evidence still required.",
      );
    }

    case "verification_recorded": {
      if (state !== "ready_for_verification")
        throw new IllegalTransitionError(state, event.kind);
      switch (event.decision) {
        case "verified_cleanly":
        case "verified_minor_slip":
          return ok(
            "verified",
            `Authorized human verification: ${event.decision}.`,
            initialContext,
          );
        case "practice_again":
          return ok("preparing", "Verifier requested more practice.");
        case "unable_to_assess":
          return ok(
            "ready_for_verification",
            "Verifier unable to assess; awaiting another verification.",
          );
      }
      break;
    }

    case "delayed_recall_recorded": {
      if (
        state !== "verified" &&
        state !== "established" &&
        state !== "durable" &&
        state !== "fragile"
      )
        throw new IllegalTransitionError(state, event.kind);
      if (!event.correct)
        return ok(
          "fragile",
          "Delayed recall failed; memory flagged fragile.",
          context,
        );
      const ctx: StateContext = {
        delayedSuccesses: context.delayedSuccesses + 1,
        longestSuccessfulDelayDays: Math.max(
          context.longestSuccessfulDelayDays,
          event.delayDays,
        ),
      };
      if (
        ctx.delayedSuccesses >= DURABLE_MIN_DELAYED_SUCCESSES &&
        ctx.longestSuccessfulDelayDays >= DURABLE_MIN_DELAY_DAYS
      )
        return ok(
          "durable",
          `${ctx.delayedSuccesses} delayed recalls succeeded, longest ${ctx.longestSuccessfulDelayDays}d.`,
          ctx,
        );
      if (state === "durable")
        return ok("durable", "Delayed recall succeeded; durability maintained.", ctx);
      if (event.delayDays >= ESTABLISH_MIN_DELAY_DAYS)
        return ok(
          "established",
          `Independent recall succeeded after ${event.delayDays}d delay.`,
          ctx,
        );
      return ok(
        state === "fragile" ? "verified" : state,
        "Recall succeeded but delay was short; no promotion.",
        ctx,
      );
    }

    case "correction_recurred": {
      if (state === "assigned") throw new IllegalTransitionError(state, event.kind);
      return ok(
        "repairing",
        "A correction recurred; targeted repair sequence activated.",
      );
    }

    case "forgetting_risk_detected": {
      if (
        state !== "verified" &&
        state !== "established" &&
        state !== "durable"
      )
        throw new IllegalTransitionError(state, event.kind);
      return ok("fragile", "Predicted recall probability dropped below policy floor.");
    }

    case "repair_completed": {
      if (state !== "repairing") throw new IllegalTransitionError(state, event.kind);
      return ok(
        "fragile",
        "Repair complete; memory must re-prove itself with delayed recall.",
        context,
      );
    }
  }
}

/**
 * Elapsed-days helper so callers never do their own date math against
 * the machine's thresholds.
 */
export function daysBetween(earlier: EpochMs, later: EpochMs): number {
  return Math.max(0, (later - earlier) / MS_PER_DAY);
}
