/**
 * Itqān Studio — the review pipeline for everything the product will speak.
 *
 * Studio is deliberately separated from student data: the people who review a
 * recitation take have no business seeing which child struggled with it. The
 * module reads content and audio, and nothing else.
 *
 * The rule this file exists to enforce: **approved is never re-asked**. A
 * reviewer's decision is durable. Re-queueing an approved asset wastes the one
 * resource the pipeline actually has — human attention — and quietly invites a
 * second reviewer to overturn a first without knowing they did.
 */
export type Provenance = "human" | "studio_synth" | "library";
export type ReviewDecision = "approved" | "rejected" | "needs_changes";

/** Why a take was rejected. Reasons are keys; the note is for the human. */
export const REJECTION_REASONS = [
  "audio.clipped",
  "audio.background_noise",
  "audio.wrong_segment",
  "audio.truncated",
  "recitation.tajwid_error",
  "recitation.wrong_riwayah",
  "recitation.pace_unsuitable",
  "narration.mispronounced_term",
  "narration.script_mismatch",
  "provenance.unverified",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type ReviewableAsset = {
  readonly id: string;
  readonly kind: "recitation" | "talqin" | "narration";
  readonly provenance: Provenance;
  readonly objectKey: string;
  readonly sha256: string;
  readonly durationMs: number | null;
  readonly reciterId?: string;
  readonly narratorId?: string;
  readonly license?: string;
  readonly approval: "pending" | "approved" | "rejected";
  readonly reviewedBy?: string;
  readonly reviewedAt?: Date;
};

export type ReviewSubmission = {
  readonly assetId: string;
  readonly decision: ReviewDecision;
  readonly reasons: readonly RejectionReason[];
  readonly note?: string;
  readonly reviewerUserId: string;
  readonly at: Date;
};

export type ReviewOutcome =
  | { readonly kind: "recorded"; readonly approval: "approved" | "rejected" | "pending"; readonly reasons: readonly string[] }
  | { readonly kind: "refused"; readonly reason: "already_approved" | "rejection_needs_a_reason" | "synthesis_needs_a_reviewer" };

/**
 * Decide what a review submission means, before anything is written.
 *
 * Three refusals, each protecting something real:
 *   already_approved            — a reviewer's decision is durable.
 *   rejection_needs_a_reason    — "no" without a reason cannot be acted on by
 *                                 whoever has to produce the next take.
 *   synthesis_needs_a_reviewer  — synthesized audio is only usable BECAUSE a
 *                                 person approved it; an unattributed approval
 *                                 would make the label meaningless.
 */
export function reviewAsset(asset: ReviewableAsset, submission: ReviewSubmission): ReviewOutcome {
  if (asset.approval === "approved") {
    return { kind: "refused", reason: "already_approved" };
  }
  if (submission.decision !== "approved" && submission.reasons.length === 0) {
    return { kind: "refused", reason: "rejection_needs_a_reason" };
  }
  if (
    asset.provenance === "studio_synth" &&
    submission.decision === "approved" &&
    !submission.reviewerUserId
  ) {
    return { kind: "refused", reason: "synthesis_needs_a_reviewer" };
  }

  const approval =
    submission.decision === "approved" ? "approved" : submission.decision === "rejected" ? "rejected" : "pending";

  return {
    kind: "recorded",
    approval,
    reasons: submission.reasons.map((reason) => `studio.rejection.${reason}`),
  };
}

/**
 * What a reviewer sees next. Ordered so the queue drains in a way that keeps
 * the product honest rather than merely busy:
 *   1. anything BLOCKING a lesson that is otherwise ready to ship,
 *   2. synthesized audio (it cannot ship at all until a person hears it),
 *   3. the oldest pending take.
 * Approved assets never appear.
 */
export type QueueItem = ReviewableAsset & {
  readonly blocksLessonId?: string;
  readonly queuedAt: Date;
};

export function reviewQueue(items: readonly QueueItem[]): readonly QueueItem[] {
  return [...items]
    .filter((item) => item.approval !== "approved")
    .sort((a, b) => {
      const blocking = Number(Boolean(b.blocksLessonId)) - Number(Boolean(a.blocksLessonId));
      if (blocking !== 0) return blocking;
      const synth = Number(b.provenance === "studio_synth") - Number(a.provenance === "studio_synth");
      if (synth !== 0) return synth;
      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });
}

/**
 * Whether an asset may be served to a learner.
 *
 * The one place this question is answered, so there is no second opinion:
 * synthesis ships only once approved, human and library audio ship once
 * approved, and nothing ships pending. There is no path that returns true for
 * an unlabelled or unreviewed asset.
 */
export function mayBeServed(asset: ReviewableAsset): { servable: boolean; reasonKey: string } {
  if (asset.approval !== "approved") {
    return { servable: false, reasonKey: "studio.not_yet_approved" };
  }
  if (asset.provenance === "studio_synth" && !asset.reviewedBy) {
    return { servable: false, reasonKey: "studio.synthesis_without_reviewer" };
  }
  if (asset.provenance === "human" && !asset.reciterId && !asset.narratorId) {
    return { servable: false, reasonKey: "studio.human_audio_without_attribution" };
  }
  if (asset.provenance === "library" && !asset.license) {
    return { servable: false, reasonKey: "studio.library_audio_without_licence" };
  }
  return { servable: true, reasonKey: "studio.approved" };
}
