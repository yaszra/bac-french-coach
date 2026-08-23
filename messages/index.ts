/**
 * Message bundles, one file per product surface.
 *
 * They are split by namespace rather than kept in two large files so that work
 * on the learner, the teacher and the family app never collides on the same
 * bundle — and so a missing translation is a missing *file*, which is obvious,
 * rather than a missing key buried in a thousand lines.
 *
 * Every namespace must exist in both languages; a test proves it key for key.
 */
import enCore from "./en/core.json";
import arCore from "./ar/core.json";
import enLearner from "./en/learner.json";
import arLearner from "./ar/learner.json";
import enTeacher from "./en/teacher.json";
import arTeacher from "./ar/teacher.json";
import enFamily from "./en/family.json";
import arFamily from "./ar/family.json";
import enReading from "./en/reading.json";
import arReading from "./ar/reading.json";

export const EN = {
  ...enCore,
  ...enLearner,
  ...enTeacher,
  ...enFamily,
  ...enReading,
} as const;

export const AR = {
  ...arCore,
  ...arLearner,
  ...arTeacher,
  ...arFamily,
  ...arReading,
} as const;

export const NAMESPACE_FILES = ["core", "learner", "teacher", "family", "reading"] as const;
