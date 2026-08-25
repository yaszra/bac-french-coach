"use server";

import { dropFlagInput, resolveFlagInput } from "../schemas/khatma";
import { withTenant } from "../../platform/db/tenant";
import { requireCaller } from "../../identity/actions/session-context";
import { assertCan } from "../../platform/authz/can";

/**
 * Khatma flags.
 *
 * A teacher listening to a juzʾ cannot stop to write. They drop a pin and keep
 * listening; the pin survives the session, the week and the device, and it
 * stays until someone resolves it. That persistence is the whole feature —
 * an unresolved flag is a promise to come back.
 *
 * Flags are not verdicts. They change no memory state and verify nothing;
 * they are a teacher's own notes, addressed by position.
 */
export type FlagResult =
  | { readonly ok: true; readonly flagId: string }
  | { readonly ok: false; readonly error: "invalid" | "not_allowed" };

export async function dropKhatmaFlag(input: unknown): Promise<FlagResult> {
  const actor = await requireCaller();
  const parsed = dropFlagInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  try {
    assertCan(actor, "teach:flagKhatma", { type: "learner", id: parsed.data.learnerUserId });
  } catch {
    return { ok: false, error: "not_allowed" };
  }

  const flagId = await withTenant(actor.organizationId, async (tx) => {
    const flag = await tx.khatmaFlag.create({
      data: {
        organizationId: actor.organizationId,
        learnerUserId: parsed.data.learnerUserId,
        // Reference only: {sura, ayah, wordIndex}. No text, ever.
        position: parsed.data.position,
        category: parsed.data.category,
        note: parsed.data.note ?? null,
        createdBy: actor.userId,
      },
      select: { id: true },
    });
    return flag.id;
  });

  return { ok: true, flagId };
}

export type ResolveResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: "invalid" | "not_allowed" | "not_found" };

export async function resolveKhatmaFlag(input: unknown): Promise<ResolveResult> {
  const actor = await requireCaller();
  const parsed = resolveFlagInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  return withTenant(actor.organizationId, async (tx) => {
    const flag = await tx.khatmaFlag.findUnique({
      where: { id: parsed.data.flagId },
      select: { id: true, learnerUserId: true, resolvedAt: true },
    });
    if (!flag) return { ok: false, error: "not_found" } as const;
    try {
      assertCan(actor, "teach:flagKhatma", { type: "learner", id: flag.learnerUserId });
    } catch {
      return { ok: false, error: "not_allowed" } as const;
    }
    // Resolving twice is not an error; the flag is already where it should be.
    if (flag.resolvedAt === null) {
      await tx.khatmaFlag.update({ where: { id: flag.id }, data: { resolvedAt: new Date() } });
    }
    return { ok: true } as const;
  });
}
