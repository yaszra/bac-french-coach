/**
 * The memory map.
 *
 * "Show all 604 pages… never colour a page 'complete' forever… include
 * clear legends and accessible non-colour encodings."
 */
import { describe, expect, it } from "vitest";
import {
  PAGE_GLYPH,
  TOTAL_PAGES,
  buildMemoryMap,
  type PageStatus,
  type PageTarget,
} from "../src/core/memory-map.js";
import { initialState, review } from "../src/core/scheduler.js";
import { MS_PER_DAY } from "../src/core/types.js";

const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);
const ago = (d: number) => NOW - d * MS_PER_DAY;

function target(over: Partial<PageTarget> = {}): PageTarget {
  return {
    pageNumber: 1,
    state: "verified",
    unresolvedCorrections: 0,
    connectionWeaknesses: 0,
    ...over,
  };
}

describe("the map covers the whole muṣḥaf", () => {
  it("renders every page, not only the ones touched", () => {
    const map = buildMemoryMap([target({ pageNumber: 5 })], NOW);
    expect(map.cells).toHaveLength(TOTAL_PAGES);
    expect(map.totalPages).toBe(604);
  });

  it("shows untouched pages as unstarted rather than omitting them", () => {
    const map = buildMemoryMap([target({ pageNumber: 5 })], NOW);
    expect(map.counts.unstarted).toBe(TOTAL_PAGES - 1);
    expect(map.startedPages).toBe(1);
    expect(map.cells[0]?.summary).toBe("Not started.");
  });
});

describe("no page is ever complete forever", () => {
  it("has no status meaning finished", () => {
    const statuses = Object.keys(PAGE_GLYPH) as PageStatus[];
    for (const status of statuses)
      expect(status).not.toMatch(/complete|done|finished|mastered/);
  });

  it("says durable is still reviewed, not finished", () => {
    const map = buildMemoryMap([], NOW);
    const durable = map.legend.find((l) => l.status === "durable")!;
    expect(durable.meaning).toMatch(/not finished/i);
  });

  it("shows a durable page's recall decaying as time passes", () => {
    const scheduling = review(initialState(true, ago(60)), {
      correct: true,
      hesitant: false,
      occurredAt: ago(40),
    });
    const map = buildMemoryMap(
      [target({ pageNumber: 3, state: "durable", scheduling })],
      NOW,
    );
    const cell = map.cells[2]!;
    expect(cell.status).toBe("durable");
    // Durable, and still visibly at risk. Both facts are shown.
    expect(cell.predictedRecall!).toBeLessThan(0.9);
    expect(cell.summary).toMatch(/likely to be recalled/);
  });
});

describe("non-colour encoding", () => {
  it("gives every status a distinct glyph", () => {
    const glyphs = Object.values(PAGE_GLYPH).filter((g) => g.trim().length > 0);
    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it("puts the glyph on every cell", () => {
    const map = buildMemoryMap([target({ pageNumber: 2, state: "fragile" })], NOW);
    expect(map.cells[1]?.glyph).toBe(PAGE_GLYPH.fragile);
  });

  it("publishes a legend covering every status it can render", () => {
    const map = buildMemoryMap([], NOW);
    const legendStatuses = new Set(map.legend.map((l) => l.status));
    for (const status of Object.keys(PAGE_GLYPH) as PageStatus[])
      expect(legendStatuses.has(status), `legend is missing ${status}`).toBe(true);
  });
});

describe("every cell explains itself in words", () => {
  it("never shows a bare number as a summary", () => {
    const scheduling = initialState(true, ago(4));
    const map = buildMemoryMap(
      [
        target({
          pageNumber: 1,
          scheduling,
          lastVerifiedAt: ago(4),
          unresolvedCorrections: 2,
          connectionWeaknesses: 1,
        }),
      ],
      NOW,
    );
    const summary = map.cells[0]!.summary;
    expect(summary).toMatch(/likely to be recalled/);
    expect(summary).toMatch(/verified 4 days ago/);
    expect(summary).toMatch(/2 unresolved corrections/);
    expect(summary).toMatch(/1 weak join/);
  });

  it("says so when there is no recall evidence rather than inventing detail", () => {
    const map = buildMemoryMap([target({ pageNumber: 1, state: "assigned" })], NOW);
    expect(map.cells[0]?.summary).toBe("No recall evidence recorded yet.");
  });

  it("uses singular and plural correctly", () => {
    const map = buildMemoryMap(
      [target({ pageNumber: 1, unresolvedCorrections: 1, connectionWeaknesses: 2 })],
      NOW,
    );
    expect(map.cells[0]?.summary).toMatch(/1 unresolved correction[,.]/);
    expect(map.cells[0]?.summary).toMatch(/2 weak joins/);
  });
});

describe("filters help a teacher find the weak places", () => {
  const targets: PageTarget[] = [
    target({ pageNumber: 1, scheduling: initialState(true, ago(1)), lastVerifiedAt: ago(1) }),
    target({ pageNumber: 2, scheduling: initialState(true, ago(45)), lastVerifiedAt: ago(45) }),
    target({ pageNumber: 3, unresolvedCorrections: 3 }),
    target({ pageNumber: 4, connectionWeaknesses: 2 }),
    target({ pageNumber: 5, state: "fragile" }),
  ];

  it("filters by predicted recall", () => {
    const map = buildMemoryMap(targets, NOW, { maxPredictedRecall: 0.5 });
    expect(map.cells.map((c) => c.pageNumber)).toEqual([2]);
  });

  it("filters by unresolved corrections", () => {
    const map = buildMemoryMap(targets, NOW, { minCorrections: 1 });
    expect(map.cells.map((c) => c.pageNumber)).toEqual([3]);
  });

  it("filters by connection weakness", () => {
    const map = buildMemoryMap(targets, NOW, { connectionWeakOnly: true });
    expect(map.cells.map((c) => c.pageNumber)).toEqual([4]);
  });

  it("filters by how long ago a page was verified", () => {
    const map = buildMemoryMap(targets, NOW, { minDaysSinceVerified: 30 });
    expect(map.cells.map((c) => c.pageNumber)).toEqual([2]);
  });

  it("filters by status", () => {
    const map = buildMemoryMap(targets, NOW, {
      statuses: new Set<PageStatus>(["fragile"]),
    });
    expect(map.cells.map((c) => c.pageNumber)).toEqual([5]);
  });

  it("keeps the counts across the whole muṣḥaf even when filtered", () => {
    const map = buildMemoryMap(targets, NOW, {
      statuses: new Set<PageStatus>(["fragile"]),
    });
    expect(map.cells).toHaveLength(1);
    // Counts describe the map, not the filtered view: a filter must not
    // make the rest of the muṣḥaf appear to vanish.
    expect(map.counts.unstarted).toBe(TOTAL_PAGES - targets.length);
    expect(map.startedPages).toBe(targets.length);
  });
});

describe("expected review load", () => {
  it("projects the coming week so a wall is visible before it is hit", () => {
    const targets = [
      target({ pageNumber: 1, scheduling: initialState(true, NOW - 2 * MS_PER_DAY) }),
      target({ pageNumber: 2, scheduling: initialState(true, NOW - 2 * MS_PER_DAY) }),
      target({ pageNumber: 3, scheduling: initialState(true, NOW) }),
    ];
    const map = buildMemoryMap(targets, NOW);
    expect(map.reviewLoadNextWeek).toHaveLength(7);
    const total = map.reviewLoadNextWeek.reduce((n, d) => n + d.due, 0);
    expect(total).toBeGreaterThan(0);
    for (const day of map.reviewLoadNextWeek) expect(day.due).toBeGreaterThanOrEqual(0);
  });

  it("reports an empty week honestly rather than omitting it", () => {
    const map = buildMemoryMap([], NOW);
    expect(map.reviewLoadNextWeek.every((d) => d.due === 0)).toBe(true);
  });
});
