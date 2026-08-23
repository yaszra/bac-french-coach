/**
 * The server-action boundary.
 *
 * A server action is a public endpoint. Everything reaching one is
 * untrusted — including data that came from a component in this
 * repository, because a crafted call never renders the component.
 *
 * These tests read the action sources rather than invoking them, because
 * invoking a Next server action needs a running server; the properties
 * they check are structural and hold at the source level.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validatePolicy } from "../src/core/assignment-policy.js";

const teacherActions = readFileSync("app/teach/actions.ts", "utf8");
const learnerActions = readFileSync("app/actions.ts", "utf8");
const ALL = `${teacherActions}\n${learnerActions}`;

describe("no action redirects to a client-supplied path", () => {
  it("never interpolates a caller's route into redirect()", () => {
    // `redirect(row.action.route)` was an open redirect: the row came
    // straight from the client.
    expect(ALL).not.toMatch(/redirect\(\s*\w+\.action\.route\s*\)/);
    expect(ALL).not.toMatch(/redirect\(\s*(?:route|url|path|next|to)\s*\)/);
  });

  it("rebuilds the attention route server-side from a fixed set", () => {
    expect(teacherActions).toContain("openAttentionRow");
    expect(teacherActions).toMatch(/case "awaiting_verification":/);
    expect(teacherActions).toMatch(/redirect\(`\/teach\/verify\/\$\{targetId\}`\)/);
  });

  it("validates every identifier before it reaches a path", () => {
    for (const source of [teacherActions, learnerActions])
      expect(source).toMatch(/UUID\s*=\s*\/\^\[0-9a-f\]\{8\}/);
    expect(learnerActions).toMatch(/if \(!UUID\.test\(assignmentId\)\)/);
  });
});

describe("the evidence policy is gated on the server, not in the wizard", () => {
  it("calls validatePolicy before creating any assignment", () => {
    const body = teacherActions.slice(teacherActions.indexOf("export async function assignWork"));
    const validateAt = body.indexOf("validatePolicy(");
    const createAt = body.indexOf("createAssignment(");
    expect(validateAt).toBeGreaterThan(-1);
    // Validation must come first, or the first learner is already assigned.
    expect(validateAt).toBeLessThan(createAt);
  });

  it("rejects the policy the wizard's own button would have blocked", () => {
    // The same function the UI uses, applied where a crafted call lands.
    const issues = validatePolicy({
      requiredListens: 0,
      requiredIndependentRecalls: 0,
      requiredNonSerialRecalls: 0,
    });
    expect(issues.map((i) => i.issue)).toContain("no_independent_recall_required");
  });

  it("clamps values a caller could set absurdly", () => {
    expect(teacherActions).toMatch(/Math\.min\(365, Math\.max\(1, Math\.round\(draft\.dueInDays\)\)\)/);
    expect(teacherActions).toMatch(/Math\.min\(\s*120,/);
  });
});

describe("an assignment is filed against the learner's real enrollment", () => {
  it("looks the enrollment up rather than taking the actor's first role", () => {
    // A teacher of two classrooms would otherwise file against the wrong
    // one, and the classroom decides who may later verify the work.
    expect(teacherActions).toMatch(/FROM enrollment e/);
    expect(teacherActions).toMatch(/WHERE e\.learner_id = \$1 AND e\.organization_id = \$2/);
    expect(teacherActions).not.toMatch(/roles\.flatMap\(\(r\) => r\.classroomIds \?\? \[\]\)\[0\]/);
  });

  it("skips a learner with no enrollment rather than guessing", () => {
    expect(teacherActions).toMatch(/if \(!enrollment\) continue;/);
  });
});

describe("every action resolves the actor from the session", () => {
  const actions = [
    "listenCompleted",
    "submitAttempt",
    "askForVerification",
    "recordVerification",
    "assignWork",
  ];

  it.each(actions)("%s calls requireActor", (name) => {
    const source = ALL.slice(ALL.indexOf(`export async function ${name}`));
    const body = source.slice(0, source.indexOf("\n}\n"));
    expect(body, `${name} does not resolve the actor`).toContain("requireActor");
  });

  it("never accepts an actor, user id, or organization as a parameter", () => {
    // The tenant comes from the session. A parameter would be a way to
    // become someone else.
    expect(ALL).not.toMatch(/function \w+\([^)]*\bactor:/);
    expect(ALL).not.toMatch(/function \w+\([^)]*\borganizationId:/);
    expect(ALL).not.toMatch(/function \w+\([^)]*\buserId:/);
  });

  it("never accepts an evidence class or a learning state from a caller", () => {
    // The client reports what happened; the server decides what it means.
    expect(ALL).not.toMatch(/evidenceClass\s*[:,]/);
    expect(ALL).not.toMatch(/\bstate:\s*["']verified["']/);
  });
});

describe("every SQL value is parameterised", () => {
  const sqlFiles = [
    "src/application/pg-store.ts",
    "src/server/queries.ts",
    "src/server/session.ts",
  ];

  /**
   * Interpolations that appear inside a template literal containing SQL.
   *
   * Scoped this way rather than over the whole file, because error
   * messages and identifier building use template literals too, and a
   * check that flags those is a check people learn to ignore.
   */
  function sqlInterpolations(source: string): string[] {
    const literals = source.match(/`[^`]*`/gs) ?? [];
    return literals
      .filter((literal) => /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/i.test(literal))
      .flatMap((literal) => [...literal.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]!.trim()));
  }

  it.each(sqlFiles)("%s interpolates no value into a query", (file) => {
    // One interpolation is legitimate and is structural, not a value: a
    // private SQL fragment composed at class level.
    const allowed = new Set(["this.assignmentSelect"]);
    const suspicious = sqlInterpolations(readFileSync(file, "utf8")).filter(
      (expr) => !allowed.has(expr),
    );
    expect(suspicious, `${file} interpolates values into SQL`).toEqual([]);
  });

  it("catches an interpolated value if one is ever introduced", () => {
    // Proves the check can fail, rather than passing because it looks in
    // the wrong place.
    const bad = 'await pool.query(`SELECT * FROM app_user WHERE id = ${userId}`);';
    expect(sqlInterpolations(bad)).toEqual(["userId"]);
  });

  it("ignores template literals that are not SQL", () => {
    const message = 'throw new Error(`Unsafe role identifier: ${name}`);';
    expect(sqlInterpolations(message)).toEqual([]);
  });

  it("validates the role identifier PostgreSQL cannot parameterise", () => {
    const source = readFileSync("src/application/pg-store.ts", "utf8");
    expect(source).toMatch(/function quoteIdent/);
    expect(source).toMatch(/Unsafe role identifier/);
  });

  it("sets the tenant through set_config, not through string building", () => {
    const source = readFileSync("src/application/pg-store.ts", "utf8");
    // `SET athar.org_id = '<value>'` would be string-built; set_config
    // takes a parameter.
    expect(source).toContain("set_config('athar.org_id', $1, true)");
  });
});
