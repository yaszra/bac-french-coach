import { runAllProjections } from "../../events/projection";
import { logger } from "../../observability/logger";

// Importing the projection for its registration side effect. Without this line
// the registry is empty at runtime and the sweep has nothing to run — which is
// exactly how the scheduler came to be frozen while every test passed.
import "../../../memory/repo/memory-projection";

/**
 * The catch-up sweep.
 *
 * Attempts and verdicts already advance memory state inline, in the same
 * transaction that records them, so a learner never waits on this. It exists
 * for the cases the inline path cannot cover:
 *
 *   · events written by a path that had no request context (a backfill, an
 *     import, a job),
 *   · a deploy that changed the scheduler, where every projection is dropped
 *     and rebuilt from history,
 *   · and the plain possibility that the inline call was missed somewhere.
 *
 * Because both paths run the identical fold, a sweep over already-projected
 * events is not harmful — it recomputes the same answer from the same history.
 * The checkpoint stops it doing so needlessly.
 */
export async function advanceProjections(data: { readonly rebuild?: boolean } = {}): Promise<void> {
  const results = await runAllProjections(data.rebuild ? { rebuild: true } : {});
  const applied = results.reduce((sum, result) => sum + result.applied, 0);

  if (applied > 0) {
    logger.info({ applied, projections: results.map((r) => r.projection) }, "projection sweep advanced");
  }
}

/**
 * Rebuild everything from the event stream.
 *
 * Safe by construction: memory state is derived, never authoritative, and the
 * append-only log it derives from cannot have been edited. This is the whole
 * reason the design pays the cost of event sourcing — changing the scheduler is
 * a rebuild, not a migration with no way back.
 */
export async function rebuildProjections(): Promise<void> {
  logger.warn("rebuilding every projection from the event stream");
  await advanceProjections({ rebuild: true });
}
