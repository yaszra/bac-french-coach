/**
 * What "tonight's review" means to a service worker.
 *
 * Before a learner loses signal, the things they will need are already on the
 * device: the pages they will see, the words on them, the measured timings, and
 * the audio for the reciter they actually listen to. A teacher can trigger the
 * same for a whole class while the school wifi is still good.
 */
export type PrecachePlan = {
  readonly learnerUserId: string;
  readonly generatedAt: string;
  readonly pages: readonly number[];
  readonly units: readonly string[];
  readonly audioKeys: readonly string[];
  readonly lessonIds: readonly string[];
  readonly estimatedBytes: number;
};

export const CACHE_NAMES = {
  shell: "itqan-shell-v1",
  content: "itqan-content-v1",
  audio: "itqan-audio-v1",
} as const;

/** A budget, because a school Chromebook is not a developer's laptop. */
export const PRECACHE_BUDGET_BYTES = 60 * 1024 * 1024;

export function planFits(plan: PrecachePlan): { fits: boolean; overBy: number } {
  const overBy = Math.max(0, plan.estimatedBytes - PRECACHE_BUDGET_BYTES);
  return { fits: overBy === 0, overBy };
}

/**
 * Trim a plan to the budget by dropping audio first (the exercise still works
 * without it, and the learner is told), then the least urgent pages. Never trim
 * the units themselves: a learner offline with no due list has nothing to do.
 */
export function trimToBudget(plan: PrecachePlan, bytesPerAudio: number, bytesPerPage: number): PrecachePlan {
  let audioKeys = [...plan.audioKeys];
  let pages = [...plan.pages];
  let estimate = plan.estimatedBytes;

  while (estimate > PRECACHE_BUDGET_BYTES && audioKeys.length > 0) {
    audioKeys.pop();
    estimate -= bytesPerAudio;
  }
  while (estimate > PRECACHE_BUDGET_BYTES && pages.length > 1) {
    pages.pop();
    estimate -= bytesPerPage;
  }
  return { ...plan, audioKeys, pages, estimatedBytes: Math.max(0, estimate) };
}
