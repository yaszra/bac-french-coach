/**
 * A guardian's claim on a child.
 *
 * Entering a learner's code does not make someone that child's guardian. It
 * makes a CLAIM: a request that a teacher approves. The one exception is a
 * learner with no teacher at all, where there is nobody to ask — the claim is
 * approved on the spot, and the product says which of the two happened rather
 * than showing the same reassuring sentence either way.
 *
 * Pure logic. It never reads a child's data, because a claim never may.
 */

export type ClaimOutcome =
  | {
      readonly state: "approved";
      readonly approvedBy: "no_teacher_to_ask";
      readonly messageKey: "family.claim.approvedImmediately";
    }
  | {
      readonly state: "claimed";
      readonly approvedBy: null;
      readonly messageKey: "family.claim.waitingForTeacher";
    };

export type ClaimSubject = {
  /** Does this learner already have an approved teacher relationship? */
  readonly hasApprovedTeacher: boolean;
};

export function decideClaim(subject: ClaimSubject): ClaimOutcome {
  return subject.hasApprovedTeacher
    ? { state: "claimed", approvedBy: null, messageKey: "family.claim.waitingForTeacher" }
    : { state: "approved", approvedBy: "no_teacher_to_ask", messageKey: "family.claim.approvedImmediately" };
}

/**
 * What a pending claim can and cannot see, stated as message keys so the UI
 * can only ever show the truth. `can()` refuses the same reads at the server;
 * this list exists so the screen does not imply otherwise.
 */
export const PENDING_CLAIM_VISIBILITY = {
  visible: [
    "family.claim.visible.childName",
    "family.claim.visible.classroomName",
    "family.claim.visible.requestState",
  ],
  hidden: [
    "family.claim.hidden.progress",
    "family.claim.hidden.recordings",
    "family.claim.hidden.teacherNotes",
    "family.claim.hidden.reports",
  ],
} as const;

export type LearnerCodeResult =
  | { readonly ok: true; readonly code: string }
  | { readonly ok: false; readonly reasonKey: "family.link.error.tooShort" | "family.link.error.badCharacters" };

const CODE_SHAPE = /^[A-Z0-9]{6,12}$/;

/**
 * Codes are read off paper and typed by a tired adult: spaces, dashes and case
 * are forgiven, anything else is refused loudly rather than silently mangled.
 */
export function normalizeLearnerCode(raw: string): LearnerCodeResult {
  const stripped = raw.trim().replace(/[\s-]+/g, "").toUpperCase();
  if (stripped.length < 6) return { ok: false, reasonKey: "family.link.error.tooShort" };
  if (!CODE_SHAPE.test(stripped)) return { ok: false, reasonKey: "family.link.error.badCharacters" };
  return { ok: true, code: stripped };
}

/**
 * A guardian who tutors is still a guardian. Reports name who approved a
 * recitation, and a guardian is never rendered as a teacher.
 */
export type ApproverRole = "teacher" | "guardian_tutor";

export function approverLabelKey(role: ApproverRole): string {
  return role === "teacher" ? "family.approver.teacher" : "family.approver.guardianTutor";
}
