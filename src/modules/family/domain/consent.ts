/**
 * Consent for a child's voice, and what follows from it.
 *
 * Off by default. Granted by a guardian, never by a child, never by a teacher.
 * Retention is shown as a real date — "90 days" is a policy, "12 November" is
 * what a parent can actually reason about. When consent is withdrawn the
 * recordings do not linger to the end of their original window: withdrawal
 * brings the purge date forward to now.
 */

export const CONSENT_PURPOSES = [
  "voice_recording",
  "comms_email",
  "comms_whatsapp",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const DEFAULT_RETENTION_DAYS = 90;

export type ConsentRecordLike = {
  readonly purpose: string;
  readonly granted: boolean;
  readonly grantedAt: Date;
  readonly revokedAt: Date | null;
  readonly retentionDays: number;
};

export type ConsentState = "never_given" | "granted" | "withdrawn";

/** Absent record means never given — not "off because someone turned it off". */
export function consentStateOf(record: ConsentRecordLike | null): ConsentState {
  if (!record) return "never_given";
  if (record.revokedAt !== null || !record.granted) return "withdrawn";
  return "granted";
}

export function isVoiceRecordingAllowed(record: ConsentRecordLike | null): boolean {
  return consentStateOf(record) === "granted";
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

/**
 * The date on which audio recorded under this consent is purged.
 *
 * Granted: retention runs from when the recording was made.
 * Withdrawn: immediately — the withdrawal date itself.
 * Never given: there is nothing to purge, and no date to show.
 */
export function purgeDateFor(
  record: ConsentRecordLike | null,
  recordedAt: Date,
): { readonly kind: "purge_on"; readonly at: Date } | { readonly kind: "nothing_recorded" } {
  const state = consentStateOf(record);
  if (state === "never_given" || record === null) return { kind: "nothing_recorded" };
  if (state === "withdrawn") {
    return { kind: "purge_on", at: record.revokedAt ?? record.grantedAt };
  }
  return { kind: "purge_on", at: addDays(recordedAt, record.retentionDays) };
}

/** Everything past its purge date, for the nightly audio purge job. */
export function isPastRetention(purgeAfter: Date | null, now: Date): boolean {
  return purgeAfter !== null && purgeAfter.getTime() <= now.getTime();
}

export type ConsentSummary = {
  readonly purpose: ConsentPurpose;
  readonly state: ConsentState;
  readonly retentionDays: number;
  readonly nextPurgeAt: Date | null;
};

export function summarize(
  purpose: ConsentPurpose,
  record: ConsentRecordLike | null,
  now: Date,
): ConsentSummary {
  const state = consentStateOf(record);
  const retentionDays = record?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const purge = purgeDateFor(record, now);
  return {
    purpose,
    state,
    retentionDays,
    nextPurgeAt: purge.kind === "purge_on" ? purge.at : null,
  };
}
