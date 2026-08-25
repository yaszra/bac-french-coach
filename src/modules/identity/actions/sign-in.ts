"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signInInput, codeSignInInput } from "../schemas/auth";
import { verifyPassword, hashPassword, needsRehash } from "../../platform/session/password";
import { rateLimit } from "../../platform/ratelimit/limiter";
import { withoutTenantForMaintenance, withTenant } from "../../platform/db/tenant";
import { startSession, endSession, getCaller } from "./session-context";
import { logger } from "../../platform/observability/logger";
import { revokeSession } from "../repo/session-repo";

/**
 * Sign-in has to look up a user before it knows their organisation, so the
 * lookup runs on the maintenance connection and is deliberately narrow: it
 * returns an id, an organisation and a hash, nothing else. Everything after
 * that point is tenant-scoped like the rest of the application.
 */
export type SignInResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: "invalid_credentials" | "rate_limited" | "locked"; readonly retryAfterMs?: number };

const GENERIC_FAILURE = { ok: false as const, error: "invalid_credentials" as const };

export async function signIn(formData: FormData): Promise<SignInResult> {
  const parsed = signInInput.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  // A malformed submission and a wrong password are indistinguishable from
  // outside: neither tells an attacker whether an account exists.
  if (!parsed.success) return GENERIC_FAILURE;

  const headerBag = await headers();
  const ip = headerBag.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const byIp = await rateLimit("auth:signin", ip);
  const byEmail = await rateLimit("auth:signin", parsed.data.email.toLowerCase());
  if (!byIp.allowed || !byEmail.allowed) {
    return {
      ok: false,
      error: "rate_limited",
      retryAfterMs: Math.max(byIp.retryAfterMs, byEmail.retryAfterMs),
    };
  }

  const account = await withoutTenantForMaintenance("auth:lookup", (db) =>
    db.user.findFirst({
      where: { email: parsed.data.email.toLowerCase(), disabledAt: null },
      select: {
        id: true,
        organizationId: true,
        credential: { select: { passwordHash: true, lockedUntil: true, failedAttempts: true } },
      },
    }),
  );

  if (!account?.credential) {
    // Spend comparable time so a missing account is not faster than a wrong password.
    await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000", parsed.data.password);
    return GENERIC_FAILURE;
  }

  const now = new Date();
  if (account.credential.lockedUntil && account.credential.lockedUntil > now) {
    return { ok: false, error: "locked" };
  }

  const valid = await verifyPassword(account.credential.passwordHash, parsed.data.password);
  if (!valid) {
    await recordFailure(account.organizationId, account.id, account.credential.failedAttempts + 1, now);
    return GENERIC_FAILURE;
  }

  await withTenant(account.organizationId, async (tx) => {
    const data: { failedAttempts: number; lockedUntil: null; passwordHash?: string } = {
      failedAttempts: 0,
      lockedUntil: null,
    };
    // Silently upgrade a hash made with older settings.
    if (needsRehash(account.credential!.passwordHash)) {
      data.passwordHash = await hashPassword(parsed.data.password);
    }
    await tx.credential.update({ where: { userId: account.id }, data });
    await tx.auditLog.create({
      data: {
        organizationId: account.organizationId,
        actorUserId: account.id,
        action: "auth.signed_in",
        resourceType: "user",
        resourceId: account.id,
      },
    });
  });

  await startSession({
    userId: account.id,
    organizationId: account.organizationId,
    ...describeClient(headerBag.get("user-agent"), ip),
  });
  logger.info({ userId: account.id }, "signed in");
  return { ok: true };
}

async function recordFailure(
  organizationId: string,
  userId: string,
  failedAttempts: number,
  now: Date,
): Promise<void> {
  // Ten wrong attempts buys a fifteen-minute pause. Long enough to stop a
  // script, short enough that a tired teacher is not locked out of their evening.
  const lockedUntil = failedAttempts >= 10 ? new Date(now.getTime() + 15 * 60_000) : null;
  await withTenant(organizationId, (tx) =>
    tx.credential.update({ where: { userId }, data: { failedAttempts, lockedUntil } }),
  );
}

/** Children sign in with a code an adult reads to them. No email, no typing. */
export async function signInWithCode(formData: FormData): Promise<SignInResult> {
  const parsed = codeSignInInput.safeParse({ code: formData.get("code") });
  if (!parsed.success) return GENERIC_FAILURE;

  const headerBag = await headers();
  const ip = headerBag.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limited = await rateLimit("auth:signin", `code:${ip}`);
  if (!limited.allowed) return { ok: false, error: "rate_limited", retryAfterMs: limited.retryAfterMs };

  const account = await withoutTenantForMaintenance("auth:code_lookup", (db) =>
    db.user.findFirst({
      where: { handle: parsed.data.code.toLowerCase(), disabledAt: null, learnerProfile: { isNot: null } },
      select: { id: true, organizationId: true },
    }),
  );
  if (!account) return GENERIC_FAILURE;

  await startSession({
    userId: account.id,
    organizationId: account.organizationId,
    ...describeClient(headerBag.get("user-agent"), ip),
  });
  return { ok: true };
}

/** Only include a fingerprint when there is one to include. */
function describeClient(userAgent: string | null, ip: string): { userAgent?: string; ip?: string } {
  return { ...(userAgent ? { userAgent } : {}), ...(ip !== "unknown" ? { ip } : {}) };
}

export async function signOut(): Promise<void> {
  const caller = await getCaller();
  if (caller.kind === "authenticated") {
    await revokeSession(caller.actor.organizationId, caller.actor.sessionId);
  }
  await endSession();
  redirect("/sign-in");
}
