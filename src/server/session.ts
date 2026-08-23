/**
 * Session resolution.
 *
 * The actor — including the organization every tenant check is made
 * against — is derived from a signed session cookie and the database,
 * never from a request parameter, header, or body. This is the single
 * place that decision is made, so there is one thing to audit.
 */
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import type { Actor, Role, RoleAssignment } from "../auth/policy.js";

/** Rotated per deployment; absent in development, which fails closed. */
function signingKey(): Buffer {
  const secret = process.env["ATHAR_SESSION_SECRET"];
  if (!secret || secret.length < 32)
    throw new Error(
      "ATHAR_SESSION_SECRET must be set to at least 32 characters. " +
        "Sessions fail closed rather than falling back to a default key.",
    );
  return Buffer.from(secret, "utf8");
}

export interface SessionPayload {
  userId: string;
  /** Epoch ms. Sessions expire; a cookie is not a permanent grant. */
  expiresAt: number;
  /** Set when the user completed a second factor in this session. */
  mfaSatisfied: boolean;
}

export const SESSION_COOKIE = "athar_session";

/** Cookie attributes. Written here so no route can weaken them. */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
} as const;

export function signSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/**
 * Verify and decode. Returns undefined for anything that is not a valid,
 * unexpired session — a tampered cookie is treated exactly like no cookie.
 */
export function verifySession(token: string | undefined, now: number): SessionPayload | undefined {
  if (!token) return undefined;
  const [body, mac] = token.split(".");
  if (!body || !mac) return undefined;

  const expected = createHmac("sha256", signingKey()).update(body).digest("base64url");
  const given = Buffer.from(mac, "utf8");
  const want = Buffer.from(expected, "utf8");
  // Constant-time comparison, and length-checked first because
  // timingSafeEqual throws on a mismatch.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return undefined;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.userId !== "string" || typeof payload.expiresAt !== "number")
      return undefined;
    if (payload.expiresAt <= now) return undefined;
    return payload;
  } catch {
    return undefined;
  }
}

/** A fresh, unguessable token for invitations and password resets. */
export function oneTimeToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Load the actor for a verified session.
 *
 * Roles are read live on every request rather than baked into the cookie:
 * a revoked role must stop working immediately, not at the next login.
 */
export async function resolveActor(
  pool: Pool,
  payload: SessionPayload,
): Promise<Actor | undefined> {
  const { rows: users } = await pool.query(
    `SELECT id, organization_id FROM app_user WHERE id = $1 AND deleted_at IS NULL`,
    [payload.userId],
  );
  const user = users[0];
  if (!user) return undefined;

  const { rows: roleRows } = await pool.query(
    `SELECT r.role, r.academy_id,
            array_remove(array_agg(c.classroom_id), NULL) AS classroom_ids
       FROM role_assignment r
       LEFT JOIN role_assignment c
              ON c.user_id = r.user_id AND c.role = r.role
             AND c.academy_id IS NOT DISTINCT FROM r.academy_id
             AND c.revoked_at IS NULL
      WHERE r.user_id = $1 AND r.revoked_at IS NULL
      GROUP BY r.role, r.academy_id`,
    [payload.userId],
  );

  const roles: RoleAssignment[] = roleRows.map((row) => {
    const assignment: RoleAssignment = { role: row["role"] as Role };
    if (row["academy_id"]) assignment.academyId = row["academy_id"] as string;
    const classrooms = (row["classroom_ids"] as string[] | null) ?? [];
    if (classrooms.length > 0) assignment.classroomIds = classrooms;
    return assignment;
  });

  return {
    userId: user["id"] as string,
    organizationId: user["organization_id"] as string,
    roles,
    sessionValid: true,
    mfaSatisfied: payload.mfaSatisfied,
  };
}
