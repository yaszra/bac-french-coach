/**
 * @vitest-environment jsdom
 *
 * The memory map surface.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { LocaleProvider } from "../../src/ui/i18n/context.js";
import { MemoryMap } from "../../src/ui/components/MemoryMap.js";
import { buildMemoryMap, type PageTarget } from "../../src/core/memory-map.js";
import { initialState } from "../../src/core/scheduler.js";
import { MS_PER_DAY } from "../../src/core/types.js";

const NOW = Date.UTC(2026, 5, 1, 9, 0, 0);
const ago = (d: number) => NOW - d * MS_PER_DAY;

const targets: PageTarget[] = [
  {
    pageNumber: 1,
    state: "durable",
    scheduling: initialState(true, ago(2)),
    unresolvedCorrections: 0,
    connectionWeaknesses: 0,
    lastVerifiedAt: ago(30),
  },
  {
    pageNumber: 2,
    state: "fragile",
    unresolvedCorrections: 2,
    connectionWeaknesses: 1,
  },
];

// A small map keeps the DOM readable; the engine test covers all 604.
const map = buildMemoryMap(targets, NOW, {}, 12);

const renderMap = () =>
  render(
    <LocaleProvider locale="en">
      <MemoryMap map={map} />
    </LocaleProvider>,
  );

describe("the map is readable without colour", () => {
  it("renders a legend covering every status", () => {
    renderMap();
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getAllByRole("listitem")).toHaveLength(map.legend.length);
  });

  it("gives every cell an accessible name carrying its summary", () => {
    const { container } = renderMap();
    const cells = [...container.querySelectorAll(".athar-map__page")];
    expect(cells).toHaveLength(12);
    for (const cell of cells)
      expect(cell.getAttribute("aria-label")).toMatch(/^Page \d+\. /);
  });

  it("marks the decorative glyph and number as hidden, since the label carries them", () => {
    const { container } = renderMap();
    for (const glyph of container.querySelectorAll(".athar-map__glyph"))
      expect(glyph).toHaveAttribute("aria-hidden", "true");
  });
});

describe("the map is honest", () => {
  it("shows coverage with its denominator", () => {
    renderMap();
    expect(screen.getByText("2 of 12")).toBeInTheDocument();
  });

  it("says a page is not started rather than leaving it blank", () => {
    renderMap();
    expect(
      screen.getByRole("button", { name: "Page 3. Not started." }),
    ).toBeInTheDocument();
  });

  it("reports an empty review week rather than hiding the section", () => {
    renderMap();
    expect(screen.getAllByText(/nothing due/).length).toBeGreaterThan(0);
  });

  it("never claims a page is complete", () => {
    const { container } = renderMap();
    // Checked on the cell labels, which are what a reader actually gets
    // for a page. The legend deliberately uses the word "finished" — in
    // the phrase "not finished" — so a bare substring check would flag
    // the very copy that makes the point.
    for (const cell of container.querySelectorAll(".athar-map__page"))
      expect(cell.getAttribute("aria-label")).not.toMatch(
        /\b(complete|finished|mastered|done)\b/i,
      );

    const legendText = screen
      .getByRole("list", { name: "Legend" })
      .textContent ?? "";
    // Any mention of finishing must be a denial of it.
    for (const match of legendText.matchAll(/\b(complete|finished|mastered)\b/gi)) {
      const before = legendText.slice(Math.max(0, match.index - 6), match.index);
      expect(before, `"${match[0]}" is not negated`).toMatch(/not\s$/i);
    }
  });
});

describe("accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = renderMap();
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
