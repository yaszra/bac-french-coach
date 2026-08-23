/**
 * Notification payload construction.
 *
 * One rule, enforced rather than remembered: **no Qurʾānic text, no error
 * detail, and no sensitive learner data in a push, SMS, email, or
 * messaging preview.**
 *
 * A preview appears on a lock screen, in a notification shade, and in an
 * email list — places the recipient does not control and other people can
 * see. So the preview says only that something happened; the substance is
 * resolved in-app, after authentication.
 */
import { containsArabicScript } from "../content/tripwire.js";
import type { CorrectionCategory, EpochMs } from "../core/types.js";

export type NotificationChannel = "push" | "email" | "sms" | "in_app";

export type NotificationKind =
  | "recitation_verified"
  | "correction_added"
  | "review_due"
  | "assignment_created"
  | "guardian_claim_decided"
  | "teacher_has_recitations_waiting";

export interface NotificationDraft {
  kind: NotificationKind;
  channel: NotificationChannel;
  recipientUserId: string;
  organizationId: string;
  occurredAt: EpochMs;
  /** Opaque reference the app resolves after authentication. */
  payloadRef: string;
}

export interface Notification extends NotificationDraft {
  /** Safe on a lock screen. Carries no content, no names, no detail. */
  previewText: string;
}

export class UnsafePreviewError extends Error {
  constructor(reason: string) {
    super(`Refusing to build a notification preview: ${reason}`);
    this.name = "UnsafePreviewError";
  }
}

/**
 * Previews are chosen from a fixed set, never composed from data.
 *
 * A template with no interpolation cannot leak a value, which is a
 * stronger guarantee than sanitising one.
 */
const PREVIEWS: Record<NotificationKind, string> = {
  recitation_verified: "Your teacher has responded to your recitation.",
  correction_added: "Your teacher left a note on your recitation.",
  review_due: "A review is ready.",
  assignment_created: "New work has been assigned.",
  guardian_claim_decided: "There is an update on your request.",
  teacher_has_recitations_waiting: "Recitations are waiting for you.",
};

/**
 * Channels where the preview is visible outside the app. `in_app` is the
 * one place a fuller message is safe, because the reader is authenticated
 * and looking at their own screen.
 */
const EXTERNAL_CHANNELS: ReadonlySet<NotificationChannel> = new Set([
  "push",
  "email",
  "sms",
]);

export function isExternalChannel(channel: NotificationChannel): boolean {
  return EXTERNAL_CHANNELS.has(channel);
}

/**
 * Values that must never reach a preview, checked as a belt to the
 * templates' braces. If a future change starts interpolating, this fails.
 */
export function assertPreviewSafe(preview: string): void {
  if (containsArabicScript(preview))
    throw new UnsafePreviewError("it contains Arabic script");
  if (/\{|\}|\$\{/.test(preview))
    throw new UnsafePreviewError("it contains an uninterpolated placeholder");
  // Correction categories name what a child got wrong. That is between the
  // learner and their teacher, not something for a lock screen.
  const categories: CorrectionCategory[] = [
    "word_substitution",
    "omission",
    "insertion",
    "order",
    "join",
    "similar_ayah",
    "vowel",
    "letter",
    "makhraj",
    "madd",
    "ghunnah",
    "waqf_ibtida",
    "teacher_note",
  ];
  for (const category of categories)
    if (preview.toLowerCase().includes(category.replace(/_/g, " ")))
      throw new UnsafePreviewError(`it names the correction "${category}"`);
  if (/\b\d+\s*(of|\/)\s*\d+\b/.test(preview))
    throw new UnsafePreviewError("it contains a score or a ratio");
}

export function buildNotification(draft: NotificationDraft): Notification {
  const previewText = PREVIEWS[draft.kind];
  // In-app messages could carry more, but there is no reason for the
  // preview itself to differ, and one code path is one thing to audit.
  assertPreviewSafe(previewText);
  return { ...draft, previewText };
}

/**
 * The surface an authenticated reader sees, once they open the app.
 *
 * This may name the passage — a reference, never the text — and the
 * teacher's decision, because at this point we know who is reading.
 */
export interface ResolvedNotification {
  title: string;
  body: string;
}

export function resolveInApp(
  kind: NotificationKind,
  context: { passageLabel?: string; teacherName?: string; decision?: string },
): ResolvedNotification {
  switch (kind) {
    case "recitation_verified":
      return {
        title: "Teacher response",
        body: [
          context.passageLabel ? `${context.passageLabel}: ` : "",
          context.decision ?? "reviewed",
          context.teacherName ? ` — ${context.teacherName}` : "",
        ].join(""),
      };
    case "correction_added":
      return {
        title: "A correction to repair",
        body: context.passageLabel
          ? `Open ${context.passageLabel} to see what your teacher noted.`
          : "Open your session to see what your teacher noted.",
      };
    case "review_due":
      return {
        title: "Review ready",
        body: context.passageLabel
          ? `${context.passageLabel} is due for review.`
          : "A review is due.",
      };
    case "assignment_created":
      return {
        title: "New work",
        body: context.passageLabel
          ? `${context.passageLabel} has been assigned.`
          : "New work has been assigned.",
      };
    case "guardian_claim_decided":
      return {
        title: "Request update",
        body: "Your relationship request has been decided. Open Permissions to see the result.",
      };
    case "teacher_has_recitations_waiting":
      return {
        title: "Recitations waiting",
        body: "Open Today to hear the recitations waiting for you.",
      };
  }
}
