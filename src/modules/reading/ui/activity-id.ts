/**
 * Activity identity.
 *
 * An activity id is not a random token: it is the activity's whole description,
 * written down. `buildRecognitionActivity` is a pure function of (activityId,
 * conceptId, choiceCount) — distractors and answer placement included — so a server
 * that can parse an id can rebuild, byte for byte, the activity the learner saw.
 *
 * That is what lets the client send an observation and nothing else. It never sends
 * the answer, never sends whether it was right, and never sends the activity: it
 * sends "I chose this choice id of that activity", and the server reconstructs the
 * rest from its own arithmetic (evidence rule).
 *
 * Pure module: no I/O, no clock, no randomness.
 */

import type { Presentation } from "../domain/evidence";
import { PRESENTATIONS } from "../domain/evidence";
import { isConceptId, type ConceptId } from "../domain/concepts";

export const ACTIVITY_ID_SEPARATOR = "~";

export const ACTIVITY_FORMS = ["recognition", "production"] as const;
export type ActivityForm = (typeof ACTIVITY_FORMS)[number];

/** Short tokens, because the whole id has to fit in 120 characters. */
const FORM_TOKEN: Readonly<Record<ActivityForm, string>> = {
  recognition: "r",
  production: "p",
};
const PRESENTATION_TOKEN: Readonly<Record<Presentation, string>> = {
  ordered: "o",
  randomized: "z",
  in_person: "i",
};

export interface ActivityIdParts {
  readonly form: ActivityForm;
  readonly conceptId: ConceptId;
  readonly presentation: Presentation;
  /** The sitting this activity belongs to. Groups observations into sessions. */
  readonly sessionId: string;
  /** Position within the sitting, so two items on one concept differ. */
  readonly index: number;
}

/** A session id must survive a round trip through an activity id. */
export const SESSION_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

export function isSessionId(value: string): boolean {
  return SESSION_ID_RE.test(value);
}

export const MAX_ACTIVITY_ID_LENGTH = 120;

/**
 * Write the parts down. Returns `null` rather than an unparseable id when a part is
 * out of shape — an id that cannot be read back is an activity that cannot be graded.
 */
export function encodeActivityId(parts: ActivityIdParts): string | null {
  if (!isConceptId(parts.conceptId)) return null;
  if (!isSessionId(parts.sessionId)) return null;
  if (!Number.isInteger(parts.index) || parts.index < 0 || parts.index > 999) return null;

  const id = [
    FORM_TOKEN[parts.form],
    parts.conceptId,
    PRESENTATION_TOKEN[parts.presentation],
    parts.sessionId,
    String(parts.index),
  ].join(ACTIVITY_ID_SEPARATOR);

  return id.length > MAX_ACTIVITY_ID_LENGTH ? null : id;
}

function formOf(token: string): ActivityForm | null {
  const found = ACTIVITY_FORMS.find((form) => FORM_TOKEN[form] === token);
  return found ?? null;
}

function presentationOf(token: string): Presentation | null {
  const found = PRESENTATIONS.find((value) => PRESENTATION_TOKEN[value] === token);
  return found ?? null;
}

/** Read an id back. `null` for anything this module did not write. */
export function decodeActivityId(id: string): ActivityIdParts | null {
  if (id.length > MAX_ACTIVITY_ID_LENGTH) return null;
  const parts = id.split(ACTIVITY_ID_SEPARATOR);
  if (parts.length !== 5) return null;
  const [formToken, conceptId, presentationToken, sessionId, indexToken] = parts;
  if (
    formToken === undefined ||
    conceptId === undefined ||
    presentationToken === undefined ||
    sessionId === undefined ||
    indexToken === undefined
  ) {
    return null;
  }

  const form = formOf(formToken);
  const presentation = presentationOf(presentationToken);
  if (form === null || presentation === null) return null;
  if (!isConceptId(conceptId)) return null;
  if (!isSessionId(sessionId)) return null;
  if (!/^\d{1,3}$/.test(indexToken)) return null;

  return { form, conceptId, presentation, sessionId, index: Number(indexToken) };
}
