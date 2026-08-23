/**
 * The AI boundary — docs/15.
 *
 * These tests exist because "the model must not certify recitation" is
 * worthless as a policy document. Each one is a way an assistant could
 * overstep, made into a build failure.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AI_CAPABILITIES,
  BoundaryError,
  draftWeeklySummary,
  validateDraft,
  type AssistantDraft,
  type EvidenceView,
} from "../src/ai/boundary.js";
import { containsArabicScript } from "../src/content/tripwire.js";

const T0 = Date.UTC(2026, 7, 1);

function view(over: Partial<EvidenceView> = {}): EvidenceView {
  return {
    learnerId: "l1",
    organizationId: "org-a",
    passageLabel: "Al-Mulk 12-15",
    state: "verified",
    independentRecalls: 4,
    assistedAttempts: 9,
    corrections: [],
    lastVerifiedAt: T0,
    lastVerificationDecision: "verified_minor_slip",
    ...over,
  };
}

const draft = (over: Partial<AssistantDraft> = {}): AssistantDraft => ({
  audience: "teacher",
  title: "Weekly summary",
  claims: [],
  status: "draft",
  ...over,
});

describe("every claim cites what it rests on", () => {
  it("rejects an uncited claim", () => {
    expect(() =>
      validateDraft(
        draft({
          claims: [{ kind: "evidence", text: "Amina is doing well.", citations: [] }],
        }),
      ),
    ).toThrow(/Uncited claim/);
  });

  it("accepts a cited claim", () => {
    expect(() =>
      validateDraft(
        draft({
          claims: [
            {
              kind: "evidence",
              text: "4 independent recalls recorded.",
              citations: ["memory_state:l1"],
            },
          ],
        }),
      ),
    ).not.toThrow();
  });
});

describe("evidence and inference stay distinguishable", () => {
  it("requires an inference to state its confidence", () => {
    expect(() =>
      validateDraft(
        draft({
          claims: [
            {
              kind: "inference",
              text: "This may be a reading difficulty.",
              citations: ["correction:madd:1"],
            },
          ],
        }),
      ),
    ).toThrow(/without stated confidence/);
  });

  it("refuses a confidence rating on an observed fact", () => {
    // Confidence on evidence blurs the distinction the module exists for.
    expect(() =>
      validateDraft(
        draft({
          claims: [
            {
              kind: "evidence",
              text: "4 independent recalls recorded.",
              citations: ["memory_state:l1"],
              confidence: "high",
            },
          ],
        }),
      ),
    ).toThrow(/carries no confidence rating/);
  });
});

describe("an assistant never certifies", () => {
  const certifying = [
    "Amina's recitation is now correct.",
    "She has mastered Al-Mulk.",
    "Her tajwīd is correct.",
    "Pronunciation is accurate.",
    "She passes without a teacher.",
  ];

  it.each(certifying)("rejects: %s", (text) => {
    expect(() =>
      validateDraft(
        draft({
          claims: [{ kind: "evidence", text, citations: ["memory_state:l1"] }],
        }),
      ),
    ).toThrow(BoundaryError);
  });

  it("names the violation so a reviewer knows which rule fired", () => {
    try {
      validateDraft(
        draft({
          claims: [
            {
              kind: "evidence",
              text: "Her recitation is verified.",
              citations: ["x"],
            },
          ],
        }),
      );
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as BoundaryError).violation).toBe("certifies_recitation");
    }
  });
});

describe("an assistant never says what the text should be", () => {
  const generating = [
    "The correct wording is different here.",
    "It should read otherwise.",
    "The verse says something else.",
    "See the corrected text below.",
  ];

  it.each(generating)("rejects: %s", (text) => {
    expect(() =>
      validateDraft(
        draft({ claims: [{ kind: "evidence", text, citations: ["x"] }] }),
      ),
    ).toThrow(/may not state what the text should be/);
  });
});

describe("there is no learner-facing assistant", () => {
  it("refuses a draft addressed to a learner", () => {
    expect(() =>
      validateDraft(draft({ audience: "learner" as never })),
    ).toThrow(/no learner-facing assistant/);
  });

  it("addresses only adults", () => {
    for (const audience of ["teacher", "administrator", "curriculum_team"] as const)
      expect(() => validateDraft(draft({ audience }))).not.toThrow();
  });
});

describe("the weekly summary is deterministic and safe", () => {
  it("tags every sentence and cites it", () => {
    const summary = draftWeeklySummary([
      view({
        corrections: [
          { category: "join", resolved: false, addedAt: T0 },
          { category: "join", resolved: false, addedAt: T0 + 1 },
        ],
      }),
    ]);
    expect(summary.claims.length).toBeGreaterThan(0);
    for (const claim of summary.claims) {
      expect(claim.citations.length).toBeGreaterThan(0);
      if (claim.kind === "inference") expect(claim.confidence).toBeTruthy();
    }
  });

  it("stays a draft, so a human reviews before anyone reads it", () => {
    expect(draftWeeklySummary([view()]).status).toBe("draft");
  });

  it("produces the same output for the same input", () => {
    const views = [view()];
    expect(draftWeeklySummary(views)).toEqual(draftWeeklySummary(views));
  });

  it("carries no Qur'anic text — a label is a reference, not the text", () => {
    const summary = draftWeeklySummary([view()]);
    for (const claim of summary.claims)
      expect(containsArabicScript(claim.text)).toBe(false);
  });

  it("raises confidence with the number of recurrences, and never past medium", () => {
    const withMany = draftWeeklySummary([
      view({
        corrections: Array.from({ length: 4 }, (_, i) => ({
          category: "madd",
          resolved: false,
          addedAt: T0 + i,
        })),
      }),
    ]);
    const inference = withMany.claims.find((c) => c.kind === "inference");
    // Even with a clear pattern, a rule-based inference does not claim
    // high confidence about why a child is struggling.
    expect(inference?.confidence).toBe("medium");
  });

  it("says nothing at all when there is nothing to say", () => {
    const summary = draftWeeklySummary([]);
    expect(summary.claims).toEqual([]);
  });
});

describe("the module has no write access, by construction", () => {
  it("declares an empty write surface", () => {
    expect(AI_CAPABILITIES.canWrite).toEqual([]);
  });

  it("imports nothing that could write learner state or read the corpus", () => {
    const source = readFileSync("src/ai/boundary.ts", "utf8");
    const forbidden = [
      "commands.js",
      "pg-store.js",
      "memory-store.js",
      "repository.js",
      "corpus.js",
      "fixtures",
    ];
    for (const module of forbidden)
      expect(source, `boundary.ts imports ${module}`).not.toMatch(
        new RegExp(`from\\s+["'][^"']*${module.replace(".", "\\.")}`),
      );
  });

  it("keeps the whole ai directory free of write paths", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (entry.endsWith(".ts")) out.push(full);
      }
      return out;
    };
    for (const file of walk("src/ai")) {
      const source = readFileSync(file, "utf8");
      // No repository port, no transaction, no direct SQL.
      expect(source, `${file} references a repository`).not.toMatch(
        /\bRepository\b|\bdb\.transaction\b|\bINSERT INTO\b|\bUPDATE\s+\w+\s+SET\b/,
      );
    }
  });
});
