/**
 * The AI boundary.
 *
 * A bounded module with no write access to evidence and no read access to
 * the corpus. Both are enforced by construction rather than by convention:
 * the interfaces below are the *only* things this module can touch, and
 * neither exposes a way to write learner state or to reach Qur'anic text.
 *
 * What an AI output must always do (docs/15): distinguish evidence from
 * inference, cite what it used, show uncertainty, and stay editable.
 */
import type { EpochMs } from "../core/types.js";

export const AI_BOUNDARY_VERSION = "athar-ai-boundary/1.0.0";

/**
 * Read-only view of the records an assistant may see.
 *
 * Note what is absent: no word text, no layout tokens, no corpus version
 * contents. Passages appear as references only.
 */
export interface EvidenceView {
  learnerId: string;
  organizationId: string;
  /** Display reference such as "Al-Mulk 12-15". Never Qur'anic text. */
  passageLabel: string;
  state: string;
  independentRecalls: number;
  assistedAttempts: number;
  corrections: readonly { category: string; resolved: boolean; addedAt: EpochMs }[];
  lastVerifiedAt: EpochMs | null;
  lastVerificationDecision: string | null;
}

/** A claim an assistant makes, tagged with what kind of claim it is. */
export type ClaimKind = "evidence" | "inference";

export interface Claim {
  kind: ClaimKind;
  text: string;
  /** Record identifiers this claim rests on. An empty list is invalid. */
  citations: readonly string[];
  /** Required on inferences; meaningless on evidence. */
  confidence?: "low" | "medium" | "high";
}

export interface AssistantDraft {
  /** Always addressed to an adult. There is no learner-facing assistant. */
  audience: "teacher" | "administrator" | "curriculum_team";
  title: string;
  claims: readonly Claim[];
  /** Every draft is editable and reviewable before it reaches anyone. */
  status: "draft";
}

export type BoundaryViolation =
  | "uncited_claim"
  | "inference_without_confidence"
  | "evidence_with_confidence"
  | "certifies_recitation"
  | "generates_sacred_text"
  | "learner_audience"
  | "modifies_state";

export class BoundaryError extends Error {
  constructor(
    readonly violation: BoundaryViolation,
    message: string,
  ) {
    super(message);
    this.name = "BoundaryError";
  }
}

/** Phrases that would amount to certifying recitation or memorization. */
const CERTIFYING_PATTERNS: readonly RegExp[] = [
  /\bis\s+(now\s+)?(correct|verified|certified|approved)\b/i,
  /\bhas\s+(mastered|memoriz|memoris)/i,
  /\btajw[iī]d\s+is\s+(correct|good|sound)\b/i,
  /\bpronunciation\s+is\s+(correct|accurate)\b/i,
  /\bready\s+to\s+(move\s+on|progress)\s+without\b/i,
  /\bpasses?\b.*\bwithout\s+(a\s+)?teacher\b/i,
];

/** Phrases claiming to have produced or altered scripture. */
const SACRED_TEXT_PATTERNS: readonly RegExp[] = [
  /\bthe (correct|proper) wording is\b/i,
  /\bshould read\b/i,
  /\bthe verse says\b/i,
  /\bcorrected text\b/i,
];

/**
 * Validate a draft before it can be shown to anyone.
 *
 * Throws on the first violation, because a draft that breaks one of these
 * rules should not be partially salvaged and shown.
 */
export function validateDraft(draft: AssistantDraft): void {
  // There is no learner-facing assistant in this product.
  if ((draft.audience as string) === "learner")
    throw new BoundaryError(
      "learner_audience",
      "There is no learner-facing assistant; drafts address an adult.",
    );

  for (const claim of draft.claims) {
    if (claim.citations.length === 0)
      throw new BoundaryError(
        "uncited_claim",
        `Uncited claim: "${claim.text}". Every claim names the records it rests on.`,
      );

    if (claim.kind === "inference" && claim.confidence === undefined)
      throw new BoundaryError(
        "inference_without_confidence",
        `Inference without stated confidence: "${claim.text}".`,
      );

    // Confidence on an observed fact blurs the very distinction this
    // module exists to keep.
    if (claim.kind === "evidence" && claim.confidence !== undefined)
      throw new BoundaryError(
        "evidence_with_confidence",
        `Evidence carries no confidence rating: "${claim.text}".`,
      );

    for (const pattern of CERTIFYING_PATTERNS)
      if (pattern.test(claim.text))
        throw new BoundaryError(
          "certifies_recitation",
          `A draft may not certify recitation: "${claim.text}".`,
        );

    for (const pattern of SACRED_TEXT_PATTERNS)
      if (pattern.test(claim.text))
        throw new BoundaryError(
          "generates_sacred_text",
          `A draft may not state what the text should be: "${claim.text}".`,
        );
  }
}

/**
 * Summarize a learner's week for their teacher.
 *
 * Deterministic and rule-based: this is the "deterministic rules first"
 * tier of the model router, and most weekly summaries never need more.
 * Every sentence is tagged and cited.
 */
export function draftWeeklySummary(
  views: readonly EvidenceView[],
  audience: AssistantDraft["audience"] = "teacher",
): AssistantDraft {
  const claims: Claim[] = [];

  for (const view of views) {
    claims.push({
      kind: "evidence",
      text: `${view.passageLabel}: ${view.independentRecalls} independent recalls and ${view.assistedAttempts} assisted attempts recorded.`,
      citations: [`memory_state:${view.learnerId}:${view.passageLabel}`],
    });

    const unresolved = view.corrections.filter((c) => !c.resolved);
    if (unresolved.length > 0) {
      const categories = [...new Set(unresolved.map((c) => c.category))];
      claims.push({
        kind: "evidence",
        text: `${unresolved.length} unresolved ${unresolved.length === 1 ? "correction" : "corrections"} (${categories.join(", ")}).`,
        citations: unresolved.map((c) => `correction:${c.category}:${c.addedAt}`),
      });
    }

    // The one inference, tagged as such, with confidence from sample size.
    const recurring = view.corrections.filter(
      (c) => !c.resolved && view.corrections.filter((o) => o.category === c.category).length > 1,
    );
    if (recurring.length > 0)
      claims.push({
        kind: "inference",
        text: `This may be a reading difficulty rather than a memorization one, given the repeated correction type.`,
        citations: recurring.map((c) => `correction:${c.category}:${c.addedAt}`),
        confidence: recurring.length >= 3 ? "medium" : "low",
      });
  }

  const draft: AssistantDraft = {
    audience,
    title: "Weekly summary",
    claims,
    status: "draft",
  };
  validateDraft(draft);
  return draft;
}

/**
 * The capability surface of this module, stated as a value so a test can
 * assert it and a reviewer can read it.
 */
export const AI_CAPABILITIES = {
  canRead: ["evidence_view", "approved_curriculum_metadata"],
  canWrite: [] as readonly string[],
  cannot: [
    "read_corpus_text",
    "write_memory_state",
    "write_oral_verification",
    "write_attempt",
    "create_knowledge_edge",
    "certify_recitation",
    "address_learners",
  ],
} as const;
