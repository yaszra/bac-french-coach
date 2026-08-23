/**
 * Per-request actor resolution for routes.
 *
 * Every non-public route calls `requireActor` before rendering anything.
 * Returning a discriminated result rather than throwing lets each route
 * render its own designed permission-denied state instead of a stack trace.
 */
import { cookies } from "next/headers";
import type { Actor } from "../auth/policy.js";
import { getPool } from "./db.js";
import { SESSION_COOKIE, resolveActor, verifySession } from "./session.js";

export type ActorResult =
  | { ok: true; actor: Actor }
  | { ok: false; reason: "unauthenticated" | "unknown_user" };

export async function requireActor(now = Date.now()): Promise<ActorResult> {
  const store = await cookies();
  const payload = verifySession(store.get(SESSION_COOKIE)?.value, now);
  if (!payload) return { ok: false, reason: "unauthenticated" };

  const actor = await resolveActor(getPool(), payload);
  // A session for a deleted user is not an error to explain; it is simply
  // not a session.
  if (!actor) return { ok: false, reason: "unknown_user" };
  return { ok: true, actor };
}
