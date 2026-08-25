import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import {
  SESSION_COOKIE,
  SESSION_ROTATE_AFTER_SECONDS,
  SESSION_TTL_SECONDS,
  cookieOptions,
  decodeSession,
  encodeSession,
  newSessionId,
} from "../../platform/session/cookie";
import { loadActorForSession } from "../repo/session-repo";
import type { CallerContext } from "../domain/actor";
import { withTenant } from "../../platform/db/tenant";
import { logger } from "../../platform/observability/logger";

/**
 * Resolve who is calling. Every route and every server action starts here.
 *
 * The cookie is decoded, then the session is re-read from the database, so a
 * revoked session or a version bump takes effect on the very next request. A
 * session past half its life is rotated in place: a new id, a fresh cookie, the
 * old row revoked. A stolen cookie therefore has a short useful life.
 */
export async function getCaller(now: Date = new Date()): Promise<CallerContext> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return { kind: "anonymous" };

  const decoded = decodeSession(raw, now);
  if (!decoded.ok) {
    logger.debug({ reason: decoded.reason }, "session cookie rejected");
    return { kind: "anonymous" };
  }

  const { claims } = decoded;
  const lookup = await loadActorForSession(claims.org, claims.sid, claims.v, now);
  if (!lookup.ok) {
    logger.debug({ reason: lookup.reason }, "session not usable");
    return { kind: "anonymous" };
  }

  const ageSeconds = (now.getTime() - lookup.issuedAt.getTime()) / 1000;
  if (ageSeconds > SESSION_ROTATE_AFTER_SECONDS) {
    await rotateSession(claims.org, claims.sid, claims.uid, claims.v, now);
  }

  return { kind: "authenticated", actor: lookup.actor };
}

async function rotateSession(
  organizationId: string,
  currentSessionId: string,
  userId: string,
  version: number,
  now: Date,
): Promise<void> {
  const nextId = newSessionId();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  await withTenant(organizationId, async (tx) => {
    await tx.session.create({
      data: { id: nextId, userId, organizationId, version, issuedAt: now, expiresAt },
    });
    await tx.session.update({
      where: { id: currentSessionId },
      data: { revokedAt: now, rotatedAt: now },
    });
  });

  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    encodeSession({
      sid: nextId,
      uid: userId,
      org: organizationId,
      v: version,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    }),
    cookieOptions(expiresAt),
  );
}

export async function startSession(
  input: {
    readonly userId: string;
    readonly organizationId: string;
    readonly userAgent?: string;
    readonly ip?: string;
  },
  now: Date = new Date(),
): Promise<void> {
  const sessionId = newSessionId();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  const version = 1;

  await withTenant(input.organizationId, (tx) =>
    tx.session.create({
      data: {
        id: sessionId,
        userId: input.userId,
        organizationId: input.organizationId,
        version,
        issuedAt: now,
        expiresAt,
        // Fingerprints are hashed: useful for spotting theft, useless as data.
        userAgentHash: input.userAgent ? hash(input.userAgent) : null,
        ipHash: input.ip ? hash(input.ip) : null,
      },
    }),
  );

  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    encodeSession({
      sid: sessionId,
      uid: input.userId,
      org: input.organizationId,
      v: version,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(expiresAt.getTime() / 1000),
    }),
    cookieOptions(expiresAt),
  );
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** For routes that must have a caller. Throws rather than rendering half a page. */
export async function requireCaller(now?: Date) {
  const caller = await getCaller(now);
  if (caller.kind !== "authenticated") throw new Error("authentication required");
  return caller.actor;
}
