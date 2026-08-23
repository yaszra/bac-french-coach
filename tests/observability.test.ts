/**
 * Observability — docs/12.
 *
 * Operators get enough to diagnose a failure, and nothing that would put a
 * child's data or Qurʾānic text into a log line.
 */
import { describe, expect, it, vi } from "vitest";
import {
  SLOS,
  UnsafeLogError,
  assertLoggable,
  createLogger,
  evaluateSlo,
  instrument,
  type LogRecord,
} from "../src/application/observability.js";

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

function capture() {
  const records: LogRecord[] = [];
  return { records, logger: createLogger((r) => records.push(r), () => NOW) };
}

describe("a log line can never carry sacred text", () => {
  it("rejects Arabic script in the message", () => {
    expect(() => assertLoggable("failed on ب", {})).toThrow(UnsafeLogError);
  });

  it("rejects Arabic script in any field", () => {
    expect(() => assertLoggable("failed", { outcome: "ب" })).toThrow(
      /contains Arabic script/,
    );
  });

  it("throws rather than redacting", () => {
    // A redacted line hides that someone tried, and next time they succeed.
    const { logger } = capture();
    expect(() => logger.error("bad", { outcome: "ب" })).toThrow(UnsafeLogError);
  });
});

describe("a log line can never carry a person", () => {
  const forbidden = ["name", "displayName", "email", "phone", "note", "text", "word"];

  it.each(forbidden)("rejects the field %s", (field) => {
    expect(() =>
      assertLoggable("ok", { [field]: "value" } as never),
    ).toThrow(/carries identifying data/);
  });

  it("accepts pseudonymous identifiers, which is what diagnosis needs", () => {
    const { logger, records } = capture();
    logger.info("learner_practice.submit", {
      organizationId: "org-1",
      learnerId: "learner-1",
      assignmentId: "asg-1",
      outcome: "ok",
    });
    expect(records[0]?.learnerId).toBe("learner-1");
  });
});

describe("a failure records what an operator has to know", () => {
  it("records impact and evidence loss at the point of failure", async () => {
    const { logger, records } = capture();
    await expect(
      instrument(
        logger,
        { journey: "learner_practice", step: "submit", startedAt: NOW },
        { organizationId: "org-1", learnerId: "l1" },
        async () => {
          throw new Error("database unavailable");
        },
        () => ({ impact: "learning_interrupted", evidenceLost: false, code: "db_down" }),
      ),
    ).rejects.toThrow("database unavailable");

    const record = records[0]!;
    expect(record.level).toBe("error");
    expect(record.journey).toBe("learner_practice");
    expect(record.impact).toBe("learning_interrupted");
    expect(record.evidenceLost).toBe(false);
    expect(record.errorCode).toBe("db_down");
    expect(record.organizationId).toBe("org-1");
  });

  it("distinguishes reporting degradation from interrupted learning", async () => {
    const { logger, records } = capture();
    await expect(
      instrument(
        logger,
        { journey: "parent_report", step: "render", startedAt: NOW },
        {},
        async () => {
          throw new Error("read model stale");
        },
        () => ({ impact: "reporting_degraded", evidenceLost: false, code: "stale" }),
      ),
    ).rejects.toThrow();
    // The distinction decides whether anyone is woken up.
    expect(records[0]?.impact).toBe("reporting_degraded");
  });

  it("assumes the worst when a failure is unclassified", async () => {
    const { logger, records } = capture();
    await expect(
      instrument(
        logger,
        { journey: "teacher_verification", step: "record", startedAt: NOW },
        {},
        async () => {
          throw new Error("unexpected");
        },
      ),
    ).rejects.toThrow();
    expect(records[0]?.impact).toBe("learning_interrupted");
    expect(records[0]?.errorCode).toBe("unclassified");
  });

  it("records a success without ceremony", async () => {
    const { logger, records } = capture();
    const result = await instrument(
      logger,
      { journey: "learner_practice", step: "submit", startedAt: NOW },
      { learnerId: "l1" },
      async () => "done",
    );
    expect(result).toBe("done");
    expect(records[0]?.outcome).toBe("ok");
    expect(records[0]?.impact).toBe("none");
  });

  it("re-throws, so instrumentation never swallows a failure", async () => {
    const { logger } = capture();
    const work = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(
      instrument(logger, { journey: "learner_practice", step: "s", startedAt: NOW }, {}, work),
    ).rejects.toThrow("boom");
  });
});

describe("service level objectives", () => {
  it("states a human consequence for every objective", () => {
    for (const slo of SLOS) {
      expect(slo.consequence.length, slo.key).toBeGreaterThan(20);
      // A consequence written about a dashboard is not a consequence.
      expect(slo.consequence).not.toMatch(/dashboard|metric|graph/i);
    }
  });

  it("allows no percentage target for cross-tenant access", () => {
    const slo = SLOS.find((s) => s.key === "cross_tenant_access")!;
    // A percentage here would mean some amount is acceptable.
    expect(slo.target).toBeNull();
  });

  it("allows no percentage target for silent evidence loss", () => {
    expect(SLOS.find((s) => s.key === "silent_evidence_loss")?.target).toBeNull();
  });

  it("reports 'not measured' rather than 100% for an empty window", () => {
    const slo = SLOS.find((s) => s.key === "core_availability")!;
    const status = evaluateSlo(slo, { key: slo.key, numerator: 0, denominator: 0 });
    expect(status.value).toBeUndefined();
    expect(status.met).toBeUndefined();
    expect(status.statement).toMatch(/not measured/);
  });

  it("fails a zero-target objective on a single occurrence", () => {
    const slo = SLOS.find((s) => s.key === "cross_tenant_access")!;
    const status = evaluateSlo(slo, { key: slo.key, numerator: 1, denominator: 0 });
    expect(status.met).toBe(false);
    expect(status.statement).toMatch(/One academy saw another academy's children/);
  });

  it("names the consequence when a rate objective is missed", () => {
    const slo = SLOS.find((s) => s.key === "evidence_commit_success")!;
    const status = evaluateSlo(slo, { key: slo.key, numerator: 90, denominator: 100 });
    expect(status.met).toBe(false);
    expect(status.statement).toMatch(/did the work and the system did not record it/);
  });

  it("passes a met objective without editorialising", () => {
    const slo = SLOS.find((s) => s.key === "core_availability")!;
    const status = evaluateSlo(slo, { key: slo.key, numerator: 1000, denominator: 1000 });
    expect(status.met).toBe(true);
    expect(status.statement).toBe(
      "Core learner and verification flows available: 1000 of 1000",
    );
  });
});
