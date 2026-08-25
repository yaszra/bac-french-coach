import { z } from "zod";

/**
 * The in-person Qāʿidah rung.
 *
 * `evidenceKind` is a literal, not a default, so a confirmation cannot be
 * recorded without saying how it was obtained. A report that groups verdicts
 * can therefore never present "the teacher sat with them and listened" as if
 * it were an app exercise, and cannot present an app exercise as this.
 */
export const READING_EVIDENCE_KIND = "in_person_confirmation" as const;

export const readingGateInput = z.strictObject({
  learnerUserId: z.string().min(1),
  lessonId: z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/i),
  evidenceKind: z.literal(READING_EVIDENCE_KIND),
  note: z.string().max(500).optional(),
});

export type ReadingGateInput = z.infer<typeof readingGateInput>;
