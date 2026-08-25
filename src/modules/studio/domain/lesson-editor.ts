/**
 * Lesson editing, as overlays rather than rewrites.
 *
 * A Qāʿidah lesson that ships is a reviewed artefact. Editing it in place would
 * mean every learner mid-lesson silently switches to a different lesson, and
 * would lose the record of what they were actually taught. So an edit is an
 * OVERLAY: a patch on top of a versioned base, reviewable on its own, and
 * applied only when it is published.
 */
export type LessonOverlay = {
  readonly id: string;
  readonly lessonId: string;
  /** The base version this overlay was written against. */
  readonly baseVersion: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly authorUserId: string;
  readonly createdAt: Date;
  readonly state: "draft" | "in_review" | "published" | "withdrawn";
};

export type ApplyResult =
  | { readonly kind: "applied"; readonly lesson: Record<string, unknown>; readonly version: string }
  | { readonly kind: "stale"; readonly baseVersion: string; readonly currentVersion: string }
  | { readonly kind: "refused"; readonly reason: string };

/** Keys an overlay may never touch, because changing them changes what a
 *  learner is being taught rather than how it is presented. */
const IMMUTABLE_KEYS = ["id", "kind", "prerequisites", "order"] as const;

export function applyOverlay(
  base: Readonly<Record<string, unknown>>,
  currentVersion: string,
  overlay: LessonOverlay,
): ApplyResult {
  if (overlay.state !== "published") {
    return { kind: "refused", reason: "studio.overlay.not_published" };
  }
  // An overlay written against an older lesson may contradict a change made
  // since. It is rebased by a person, never merged silently.
  if (overlay.baseVersion !== currentVersion) {
    return { kind: "stale", baseVersion: overlay.baseVersion, currentVersion };
  }
  for (const key of IMMUTABLE_KEYS) {
    if (key in overlay.patch) {
      return { kind: "refused", reason: `studio.overlay.immutable_key.${key}` };
    }
  }

  return {
    kind: "applied",
    lesson: { ...base, ...overlay.patch },
    version: nextVersion(currentVersion),
  };
}

export function nextVersion(version: string): string {
  const [major = "0", minor = "0", patch = "0"] = version.split(".");
  return `${major}.${minor}.${Number(patch) + 1}`;
}

/**
 * What a lesson looks like to a learner who started before an overlay was
 * published: the version they started on, until they finish. Changing the
 * ground under someone mid-lesson is how a learner ends up believing they
 * misremembered something that was in fact edited.
 */
export function versionForLearner(
  startedOnVersion: string | null,
  currentVersion: string,
  completed: boolean,
): string {
  if (completed || startedOnVersion === null) return currentVersion;
  return startedOnVersion;
}
