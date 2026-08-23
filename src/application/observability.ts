/**
 * Observability.
 *
 * Operators need enough to answer five questions about a failure: what
 * broke, why, which tenants and learners were affected, whether evidence
 * was lost or misapplied, and whether learning was interrupted or only
 * reporting.
 *
 * They need that **without** Qurʾānic text or unnecessary student data in
 * the logs. A log line is read by more people, kept longer, and shipped
 * further than almost anything else the system produces.
 */
import { containsArabicScript } from "../content/tripwire.js";

export const OBSERVABILITY_VERSION = "athar-observability/1.0.0";

/** The journeys an operator must be able to reason about (docs/12). */
export type CriticalJourney =
  | "learner_practice"
  | "teacher_verification"
  | "parent_report"
  | "academy_onboarding";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Whether a failure stopped learning or only stopped reporting.
 *
 * The distinction decides whether someone is woken up.
 */
export type Impact = "learning_interrupted" | "reporting_degraded" | "none";

export interface LogFields {
  journey?: CriticalJourney;
  organizationId?: string;
  /** Pseudonymous identifier. Never a name, never an email. */
  learnerId?: string;
  actorUserId?: string;
  assignmentId?: string;
  /** Machine-readable outcome, not a sentence about a learner. */
  outcome?: string;
  durationMs?: number;
  impact?: Impact;
  /** Whether any acknowledged evidence was lost. Answered, not implied. */
  evidenceLost?: boolean;
  errorCode?: string;
}

export interface LogRecord extends LogFields {
  level: LogLevel;
  message: string;
  at: number;
  version: string;
}

export class UnsafeLogError extends Error {
  constructor(reason: string) {
    super(`Refusing to log: ${reason}`);
    this.name = "UnsafeLogError";
  }
}

/** Field names that would carry a person's identity into a log. */
const FORBIDDEN_FIELDS = [
  "name",
  "displayName",
  "email",
  "phone",
  "address",
  "password",
  "token",
  "cookie",
  "note",
  "text",
  "word",
  "passage",
  "correctionNote",
];

/**
 * Reject anything that must not be logged.
 *
 * Checked on the message and on every string value, because the usual way
 * sacred text reaches a log is inside an error message someone
 * interpolated a record into.
 */
export function assertLoggable(message: string, fields: LogFields): void {
  if (containsArabicScript(message))
    throw new UnsafeLogError("the message contains Arabic script");

  for (const [key, value] of Object.entries(fields)) {
    if (FORBIDDEN_FIELDS.includes(key))
      throw new UnsafeLogError(`the field "${key}" carries identifying data`);
    if (typeof value === "string" && containsArabicScript(value))
      throw new UnsafeLogError(`the field "${key}" contains Arabic script`);
  }
}

export type Sink = (record: LogRecord) => void;

/**
 * A structured logger that refuses unsafe records.
 *
 * Throwing rather than redacting is deliberate: a redacted log line hides
 * that someone tried to log something they should not have, and the second
 * time they will succeed.
 */
export function createLogger(sink: Sink, now: () => number = Date.now) {
  const log = (level: LogLevel, message: string, fields: LogFields = {}) => {
    assertLoggable(message, fields);
    sink({ ...fields, level, message, at: now(), version: OBSERVABILITY_VERSION });
  };
  return {
    debug: (m: string, f?: LogFields) => log("debug", m, f),
    info: (m: string, f?: LogFields) => log("info", m, f),
    warn: (m: string, f?: LogFields) => log("warn", m, f),
    error: (m: string, f?: LogFields) => log("error", m, f),
  };
}

export type Logger = ReturnType<typeof createLogger>;

// ---------------------------------------------------------------------------
// Service level objectives
// ---------------------------------------------------------------------------

export interface Slo {
  key: string;
  description: string;
  /** Fraction, or null where the only acceptable number is zero. */
  target: number | null;
  /** What a breach means for a person, not for a dashboard. */
  consequence: string;
}

export const SLOS: readonly Slo[] = [
  {
    key: "core_availability",
    description: "Core learner and verification flows available",
    target: 0.999,
    consequence: "A learner cannot practise; a teacher cannot verify.",
  },
  {
    key: "evidence_commit_success",
    description: "Evidence commands that persist, excluding valid user error",
    target: 0.9995,
    consequence: "A learner did the work and the system did not record it.",
  },
  {
    key: "learning_state_visible_60s",
    description: "Queued learning-state updates visible within 60 seconds",
    target: 0.99,
    consequence: "A teacher sees a stale queue and verifies the wrong learner next.",
  },
  {
    key: "cross_tenant_access",
    description: "Accepted cross-tenant data access",
    // Zero. A percentage target here would mean some amount is acceptable.
    target: null,
    consequence: "One academy saw another academy's children.",
  },
  {
    key: "silent_evidence_loss",
    description: "Acknowledged learning evidence lost without an alert",
    target: null,
    consequence: "The system claimed to record something and did not.",
  },
];

export interface SloMeasurement {
  key: string;
  /** Successes over eligible attempts, or an absolute count for zero-targets. */
  numerator: number;
  denominator: number;
}

export interface SloStatus {
  slo: Slo;
  value: number | undefined;
  met: boolean | undefined;
  statement: string;
}

/**
 * Evaluate an SLO honestly.
 *
 * With no eligible events the answer is "not measured", never "100%": an
 * SLO that reports perfection from an empty window is worse than no SLO.
 */
export function evaluateSlo(slo: Slo, measurement: SloMeasurement): SloStatus {
  if (slo.target === null) {
    const met = measurement.numerator === 0;
    return {
      slo,
      value: measurement.numerator,
      met,
      statement: met
        ? `${slo.description}: none, as required.`
        : `${slo.description}: ${measurement.numerator} occurred. ${slo.consequence}`,
    };
  }

  if (measurement.denominator === 0)
    return {
      slo,
      value: undefined,
      met: undefined,
      statement: `${slo.description}: not measured in this window.`,
    };

  const value = measurement.numerator / measurement.denominator;
  const met = value >= slo.target;
  return {
    slo,
    value,
    met,
    statement: `${slo.description}: ${measurement.numerator} of ${measurement.denominator}${
      met ? "" : ` — below the ${(slo.target * 100).toFixed(2)}% target. ${slo.consequence}`
    }`,
  };
}

// ---------------------------------------------------------------------------
// Journey instrumentation
// ---------------------------------------------------------------------------

export interface JourneySpan {
  journey: CriticalJourney;
  step: string;
  startedAt: number;
}

/**
 * Instrument a step of a critical journey.
 *
 * On failure it records the impact and whether evidence was lost, because
 * those are the two facts that decide whether anyone is woken up — and
 * they have to be recorded at the point of failure, where they are known.
 */
export async function instrument<T>(
  logger: Logger,
  span: JourneySpan,
  fields: LogFields,
  work: () => Promise<T>,
  onError?: (error: unknown) => { impact: Impact; evidenceLost: boolean; code: string },
): Promise<T> {
  const started = span.startedAt;
  try {
    const result = await work();
    logger.info(`${span.journey}.${span.step}`, {
      ...fields,
      journey: span.journey,
      outcome: "ok",
      durationMs: Date.now() - started,
      impact: "none",
      evidenceLost: false,
    });
    return result;
  } catch (error) {
    const classified = onError?.(error) ?? {
      impact: "learning_interrupted" as const,
      evidenceLost: false,
      code: "unclassified",
    };
    logger.error(`${span.journey}.${span.step}`, {
      ...fields,
      journey: span.journey,
      outcome: "failed",
      durationMs: Date.now() - started,
      impact: classified.impact,
      evidenceLost: classified.evidenceLost,
      errorCode: classified.code,
    });
    throw error;
  }
}
