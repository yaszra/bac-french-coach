import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Session cookies are signed, versioned and short-lived.
 *
 * The cookie carries {sessionId, userId, organizationId, version, iat, exp}
 * and an HMAC-SHA256 signature. It is NOT a bearer token for authorisation:
 * every request re-reads the session row, so a revoked session dies instantly
 * and `logout everywhere` is a single version bump.
 *
 * Rotation: SESSION_SECRET signs; SESSION_SECRET_PREVIOUS still verifies. That
 * lets a secret be rotated without signing every user out.
 */
export const SESSION_COOKIE = "itqan_session";

export type SessionClaims = {
  readonly sid: string;
  readonly uid: string;
  readonly org: string;
  readonly v: number;
  readonly iat: number;
  readonly exp: number;
};

function secrets(): { signing: string; accepted: string[] } {
  const signing = process.env.SESSION_SECRET;
  if (!signing || signing.length < 32) {
    throw new Error("SESSION_SECRET must be set and at least 32 characters");
  }
  const previous = process.env.SESSION_SECRET_PREVIOUS;
  return { signing, accepted: previous ? [signing, previous] : [signing] };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function encodeSession(claims: SessionClaims): string {
  const { signing } = secrets();
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, signing)}`;
}

export type DecodeFailure =
  | "malformed"
  | "bad_signature"
  | "expired"
  | "not_yet_valid";

export function decodeSession(
  token: string,
  now: Date,
): { ok: true; claims: SessionClaims } | { ok: false; reason: DecodeFailure } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payload, signature] = parts as [string, string];

  const { accepted } = secrets();
  if (!accepted.some((secret) => safeEqual(sign(payload, secret), signature))) {
    return { ok: false, reason: "bad_signature" };
  }

  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof claims.sid !== "string" ||
    typeof claims.uid !== "string" ||
    typeof claims.org !== "string" ||
    typeof claims.v !== "number" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const seconds = Math.floor(now.getTime() / 1000);
  if (seconds >= claims.exp) return { ok: false, reason: "expired" };
  // A little tolerance for clock skew between the signer and the reader.
  if (seconds + 60 < claims.iat) return { ok: false, reason: "not_yet_valid" };

  return { ok: true, claims };
}

export const SESSION_TTL_SECONDS = 60 * 60 * 12;
/** Re-issue the cookie once a session is more than half-way through its life. */
export const SESSION_ROTATE_AFTER_SECONDS = SESSION_TTL_SECONDS / 2;

export function newSessionId(): string {
  return randomBytes(24).toString("base64url");
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}
