import type { TenantClient } from "../../platform/db/tenant";
import { ayahsOfUnit } from "../../hifz/ui/passage";

/**
 * Asking to be heard.
 *
 * The ear-gate had no entrance. `submitAttempt` answered `requires_human` for
 * an oral recitation, the screen said "your teacher will listen", and nothing
 * anywhere created a request — a `grep` for `verificationRequest.create` found
 * exactly one site, the reading gate, which creates a request and decides it in
 * the same breath. So the teacher's queue could only ever be filled by a
 * fixture, `awaitingTeacher` was always zero, and the promise on the learner's
 * screen was one the product never kept.
 *
 * This is that entrance. It records a request and nothing else: asking is not
 * evidence, and nothing about the learner's memory moves because they asked.
 */

export type OpenedRequest =
  | { readonly kind: "opened"; readonly requestId: string }
  | { readonly kind: "already_waiting"; readonly requestId: string }
  | { readonly kind: "not_a_passage" };

/** The passage a unit belongs to, as references — never Arabic. */
export function scopeOfUnit(unitId: string): { sura: number; ayahFrom: number; ayahTo: number } | null {
  const ayahs = ayahsOfUnit(unitId);
  const first = ayahs[0];
  const last = ayahs[ayahs.length - 1];
  if (first === undefined || last === undefined) return null;
  // A seam between two sūrahs is not one passage to recite, and the muṣḥaf
  // view that a teacher opens is addressed by a single sūrah.
  if (first.surah !== last.surah) return null;
  return { sura: first.surah, ayahFrom: first.ayah, ayahTo: last.ayah };
}

/**
 * Open a request, or hand back the one already waiting.
 *
 * Idempotent by (learner, scope): a learner who taps twice, or who recites the
 * same passage again the next day while the first request is still pending,
 * does not put two of themselves in the teacher's queue. Anything else would
 * make the queue a measure of impatience rather than of who is waiting.
 */
export async function openVerificationRequest(
  tx: TenantClient,
  input: {
    readonly organizationId: string;
    readonly learnerUserId: string;
    readonly unitId: string;
    readonly requestedAt?: Date;
  },
): Promise<OpenedRequest> {
  const scope = scopeOfUnit(input.unitId);
  if (scope === null) return { kind: "not_a_passage" };

  const existing = await tx.verificationRequest.findFirst({
    where: {
      learnerUserId: input.learnerUserId,
      track: "hifz",
      state: "pending",
      unitScope: { equals: scope },
    },
    select: { id: true },
  });
  if (existing) return { kind: "already_waiting", requestId: existing.id };

  const created = await tx.verificationRequest.create({
    data: {
      organizationId: input.organizationId,
      learnerUserId: input.learnerUserId,
      track: "hifz",
      // References only: a sūrah and two āyah numbers.
      unitScope: scope,
      state: "pending",
      requestedAt: input.requestedAt ?? new Date(),
    },
    select: { id: true },
  });
  return { kind: "opened", requestId: created.id };
}

/**
 * Tell the people who could actually answer.
 *
 * An approved teacher of this learner, and a guardian the teacher has trusted
 * to tutor them. A claim that is still waiting on a teacher is not one of
 * those: it is not access, so it is not notification either.
 */
export async function notifyVerifiers(
  tx: TenantClient,
  input: {
    readonly organizationId: string;
    readonly learnerUserId: string;
    readonly requestId: string;
  },
): Promise<number> {
  const links = await tx.relationship.findMany({
    where: {
      objectUserId: input.learnerUserId,
      state: "approved",
      OR: [{ kind: "teacher_student" }, { kind: "guardian_child", canTutor: true }],
    },
    select: { subjectUserId: true },
  });

  for (const link of links) {
    await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: link.subjectUserId,
        kind: "verification_requested",
        payload: { verificationRequestId: input.requestId, learnerUserId: input.learnerUserId },
        channel: "in_app",
        // The in-app notification IS the delivery; see family/domain/channels.
        deliveryState: "sent",
      },
    });
  }
  return links.length;
}
