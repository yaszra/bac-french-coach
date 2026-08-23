import type { Actor, ActorGrant, ActorRelationship } from "../../platform/authz/can";
import type { Tier } from "../../design/theme/tier";

/**
 * The resolved caller. Assembled once per request from the session, then passed
 * down; no module re-reads authority for itself, and nothing downstream can
 * widen it.
 */
export type ResolvedActor = Actor & {
  readonly displayName: string;
  readonly locale: "en" | "ar";
  /** Present only when the caller is a learner. Tier is server-side, always. */
  readonly tier: Tier | null;
  readonly sessionId: string;
};

export type AnonymousActor = { readonly kind: "anonymous" };
export type AuthenticatedActor = { readonly kind: "authenticated"; readonly actor: ResolvedActor };
export type CallerContext = AnonymousActor | AuthenticatedActor;

export function isAuthenticated(caller: CallerContext): caller is AuthenticatedActor {
  return caller.kind === "authenticated";
}

export function buildActor(input: {
  userId: string;
  organizationId: string;
  displayName: string;
  locale: string;
  sessionId: string;
  tier: Tier | null;
  grants: readonly ActorGrant[];
  relationships: readonly ActorRelationship[];
  classroomLearnerIds: readonly string[];
}): ResolvedActor {
  return {
    userId: input.userId,
    organizationId: input.organizationId,
    displayName: input.displayName,
    locale: input.locale === "ar" ? "ar" : "en",
    sessionId: input.sessionId,
    tier: input.tier,
    grants: input.grants,
    relationships: input.relationships,
    classroomLearnerIds: input.classroomLearnerIds,
  };
}
