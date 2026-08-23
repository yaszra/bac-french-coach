import { z } from "zod";
import {
  ASSIGNMENT_TRACKS,
  MAX_AYAH,
  MAX_PAGE,
  MAX_SURA,
  containsArabicScript,
} from "../domain/assignment-scope";

/**
 * The boundary between a teacher's browser and the database.
 *
 * Two things are checked here that nothing downstream re-checks: that every
 * reference is an integer inside the muṣḥaf, and that NO Arabic character
 * reaches the payload. The second is a `superRefine` rather than a regex on one
 * field, because the check has to hold for the whole object — including keys.
 */
export const ayahRangeScope = z.strictObject({
  kind: z.literal("ayah_range"),
  sura: z.number().int().min(1).max(MAX_SURA),
  ayahFrom: z.number().int().min(1).max(MAX_AYAH),
  ayahTo: z.number().int().min(1).max(MAX_AYAH),
});

export const pageScope = z.strictObject({
  kind: z.literal("pages"),
  pageFrom: z.number().int().min(1).max(MAX_PAGE),
  pageTo: z.number().int().min(1).max(MAX_PAGE),
});

export const lessonScope = z.strictObject({
  kind: z.literal("lesson"),
  // An id from the content package. Ids are ASCII by construction.
  lessonId: z.string().min(1).max(64).regex(/^[a-z0-9._-]+$/i),
});

export const scopeItem = z.discriminatedUnion("kind", [ayahRangeScope, pageScope, lessonScope]);

export const lockedSettings = z.strictObject({
  exercises: z.array(z.string().max(40)).min(1).max(10),
  reciterId: z.string().max(40),
  repetitions: z.number().int().min(1).max(20),
  scaffold: z.enum(["full", "fading", "none"]),
  requiresVerification: z.boolean(),
});

export const createAssignmentInput = z
  .strictObject({
    classroomId: z.string().min(1),
    learnerUserIds: z.array(z.string().min(1)).min(1).max(200),
    track: z.enum(ASSIGNMENT_TRACKS),
    scope: z.array(scopeItem).min(1).max(50),
    settings: lockedSettings,
    dueAt: z.coerce.date().nullable(),
  })
  .superRefine((value, ctx) => {
    // The sacred-content rule, enforced at the edge rather than trusted.
    if (containsArabicScript(value.scope) || containsArabicScript(value.settings)) {
      ctx.addIssue({
        code: "custom",
        message: "assignment payloads carry references only, never text",
        path: ["scope"],
      });
    }
  });

export type CreateAssignmentInput = z.infer<typeof createAssignmentInput>;
