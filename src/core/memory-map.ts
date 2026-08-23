/**
 * The memory map.
 *
 * A map of *memory*, not of completion. Two rules follow from that:
 *
 *  1. No page is ever coloured "complete forever". A page the learner
 *     verified a year ago and has not recalled since is not the same as
 *     one they recalled last week, and the map must not say it is.
 *  2. Every cell carries a non-colour encoding, so the map is readable in
 *     greyscale, in print, and by someone with a colour-vision difference.
 */
import type { EpochMs, LearningState } from "./types.js";
import { MS_PER_DAY } from "./types.js";
import { predictRecall, type SchedulingState } from "./scheduler.js";

/** The Madani muṣḥaf. */
export const TOTAL_PAGES = 604;

/**
 * What a page cell can say. `unstarted` is the honest default — the map
 * shows what is known, and most of it is not yet known.
 */
export type PageStatus =
  | "unstarted"
  | "assigned"
  | "preparing"
  | "verified"
  | "established"
  | "durable"
  | "fragile"
  | "repairing";

/** Non-colour encoding. Distinct glyphs, readable in greyscale. */
export const PAGE_GLYPH: Record<PageStatus, string> = {
  unstarted: " ",
  assigned: "·",
  preparing: "◔",
  verified: "●",
  established: "◆",
  durable: "◆◆",
  fragile: "△",
  repairing: "⟳",
};

export interface PageTarget {
  pageNumber: number;
  state: LearningState;
  scheduling?: SchedulingState;
  /** Unresolved corrections anywhere on the page. */
  unresolvedCorrections: number;
  /** Weak connection boundaries touching this page. */
  connectionWeaknesses: number;
  lastVerifiedAt?: EpochMs;
}

export interface PageCell {
  pageNumber: number;
  status: PageStatus;
  glyph: string;
  /** Plain-language summary. Always present; never a bare number. */
  summary: string;
  /** Predicted recall, 0..1, or undefined when there is no baseline. */
  predictedRecall?: number;
  daysSinceVerified?: number;
  unresolvedCorrections: number;
  connectionWeaknesses: number;
}

export interface MemoryMapFilters {
  /** Only pages whose predicted recall is at or below this. */
  maxPredictedRecall?: number;
  /** Only pages with at least this many unresolved corrections. */
  minCorrections?: number;
  /** Only pages with a weak connection boundary. */
  connectionWeakOnly?: boolean;
  /** Only pages verified longer ago than this. */
  minDaysSinceVerified?: number;
  statuses?: ReadonlySet<PageStatus>;
}

export interface MemoryMap {
  cells: readonly PageCell[];
  counts: Readonly<Record<PageStatus, number>>;
  /** Pages the learner has some relationship with, of TOTAL_PAGES. */
  startedPages: number;
  totalPages: number;
  /** Expected review load over the next seven days, per day. */
  reviewLoadNextWeek: readonly { dayOffset: number; due: number }[];
  legend: readonly { status: PageStatus; glyph: string; meaning: string }[];
}

function statusFor(state: LearningState): PageStatus {
  switch (state) {
    case "assigned":
      return "assigned";
    case "preparing":
    case "recalled_independently":
    case "ready_for_verification":
      return "preparing";
    case "verified":
      return "verified";
    case "established":
      return "established";
    case "durable":
      return "durable";
    case "fragile":
      return "fragile";
    case "repairing":
      return "repairing";
  }
}

const LEGEND: readonly { status: PageStatus; glyph: string; meaning: string }[] = [
  { status: "unstarted", glyph: PAGE_GLYPH.unstarted, meaning: "Not started" },
  { status: "assigned", glyph: PAGE_GLYPH.assigned, meaning: "Assigned, no evidence yet" },
  { status: "preparing", glyph: PAGE_GLYPH.preparing, meaning: "Practising" },
  { status: "verified", glyph: PAGE_GLYPH.verified, meaning: "A teacher has verified it" },
  {
    status: "established",
    glyph: PAGE_GLYPH.established,
    meaning: "Recalled again after a delay",
  },
  {
    status: "durable",
    glyph: PAGE_GLYPH.durable,
    meaning: "Recalled after several longer delays — not finished, still reviewed",
  },
  { status: "fragile", glyph: PAGE_GLYPH.fragile, meaning: "Needs strengthening" },
  { status: "repairing", glyph: PAGE_GLYPH.repairing, meaning: "Being repaired" },
];

function summarize(cell: Omit<PageCell, "summary">): string {
  if (cell.status === "unstarted") return "Not started.";

  const parts: string[] = [];
  if (cell.predictedRecall !== undefined)
    parts.push(`About ${Math.round(cell.predictedRecall * 100)}% likely to be recalled now`);
  if (cell.daysSinceVerified !== undefined)
    parts.push(
      `verified ${Math.round(cell.daysSinceVerified)} ${
        Math.round(cell.daysSinceVerified) === 1 ? "day" : "days"
      } ago`,
    );
  if (cell.unresolvedCorrections > 0)
    parts.push(
      `${cell.unresolvedCorrections} unresolved ${
        cell.unresolvedCorrections === 1 ? "correction" : "corrections"
      }`,
    );
  if (cell.connectionWeaknesses > 0)
    parts.push(
      `${cell.connectionWeaknesses} weak ${
        cell.connectionWeaknesses === 1 ? "join" : "joins"
      }`,
    );

  // With no evidence beyond the state, say so rather than inventing detail.
  if (parts.length === 0) return "No recall evidence recorded yet.";
  return `${parts.join(", ")}.`;
}

/**
 * Build the map.
 *
 * Pages with no target are included as `unstarted`: a map of 604 pages
 * that only shows the twelve a learner has touched hides the shape of the
 * task.
 */
export function buildMemoryMap(
  targets: readonly PageTarget[],
  now: EpochMs,
  filters: MemoryMapFilters = {},
  totalPages: number = TOTAL_PAGES,
): MemoryMap {
  const byPage = new Map(targets.map((t) => [t.pageNumber, t]));
  const cells: PageCell[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
    const target = byPage.get(pageNumber);
    if (!target) {
      cells.push({
        pageNumber,
        status: "unstarted",
        glyph: PAGE_GLYPH.unstarted,
        summary: "Not started.",
        unresolvedCorrections: 0,
        connectionWeaknesses: 0,
      });
      continue;
    }

    const status = statusFor(target.state);
    const base: Omit<PageCell, "summary"> = {
      pageNumber,
      status,
      glyph: PAGE_GLYPH[status],
      unresolvedCorrections: target.unresolvedCorrections,
      connectionWeaknesses: target.connectionWeaknesses,
      ...(target.scheduling
        ? { predictedRecall: predictRecall(target.scheduling, now) }
        : {}),
      ...(target.lastVerifiedAt !== undefined
        ? { daysSinceVerified: (now - target.lastVerifiedAt) / MS_PER_DAY }
        : {}),
    };
    cells.push({ ...base, summary: summarize(base) });
  }

  const filtered = cells.filter((cell) => {
    if (filters.statuses && !filters.statuses.has(cell.status)) return false;
    if (
      filters.maxPredictedRecall !== undefined &&
      (cell.predictedRecall === undefined ||
        cell.predictedRecall > filters.maxPredictedRecall)
    )
      return false;
    if (
      filters.minCorrections !== undefined &&
      cell.unresolvedCorrections < filters.minCorrections
    )
      return false;
    if (filters.connectionWeakOnly && cell.connectionWeaknesses === 0) return false;
    if (
      filters.minDaysSinceVerified !== undefined &&
      (cell.daysSinceVerified === undefined ||
        cell.daysSinceVerified < filters.minDaysSinceVerified)
    )
      return false;
    return true;
  });

  const counts = Object.fromEntries(
    (Object.keys(PAGE_GLYPH) as PageStatus[]).map((s) => [
      s,
      cells.filter((c) => c.status === s).length,
    ]),
  ) as Record<PageStatus, number>;

  // Expected review load, so a learner can see a wall coming before they
  // hit it.
  const reviewLoadNextWeek = Array.from({ length: 7 }, (_, dayOffset) => {
    const dayStart = now + dayOffset * MS_PER_DAY;
    const dayEnd = dayStart + MS_PER_DAY;
    const due = targets.filter(
      (t) =>
        t.scheduling !== undefined &&
        t.scheduling.nextReviewAt >= dayStart &&
        t.scheduling.nextReviewAt < dayEnd,
    ).length;
    return { dayOffset, due };
  });

  return {
    cells: filtered,
    counts,
    startedPages: totalPages - counts.unstarted,
    totalPages,
    reviewLoadNextWeek,
    legend: LEGEND,
  };
}
