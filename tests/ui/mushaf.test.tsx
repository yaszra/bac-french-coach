/**
 * @vitest-environment jsdom
 *
 * Muṣḥaf page geometry — acceptance criterion 3.
 *
 * "The page geometry matches the approved Madani layout and remains
 * invariant across English/Arabic and light/dark modes."
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MushafPage, type RenderableLine } from "../../src/ui/components/MushafPage.js";
import { LocaleProvider } from "../../src/ui/i18n/context.js";
import { linesOnPage, mushafGeometry } from "../../src/ui/tokens.js";
import type { Locale } from "../../src/ui/i18n/messages.js";

/**
 * Synthetic layout. Opaque Latin tokens, exactly as everywhere else in
 * this repository — no Qur'anic text enters a test file.
 */
function layout(lineCount = 3, perLine = 4): RenderableLine[] {
  return Array.from({ length: lineCount }, (_, l) => ({
    lineNumber: l + 1,
    tokens: Array.from({ length: perLine }, (_, w) => ({
      tokenId: `lt-${l + 1}-${w + 1}`,
      positionInLine: w + 1,
      text: `SYN-${l + 1}-${w + 1}`,
      widthUnits: 6 + w,
    })),
  }));
}

function renderPage(
  locale: Locale,
  theme: "light" | "dark",
  revealed: string[] = [],
  pageNumber = 3,
) {
  document.documentElement.setAttribute("data-theme", theme);
  return render(
    <LocaleProvider locale={locale}>
      <MushafPage
        pageNumber={pageNumber}
        lines={layout()}
        revealedTokenIds={revealed}
        label="Test page"
      />
    </LocaleProvider>,
  );
}

/** Structural fingerprint: line count, and each slot's line/position/width. */
function geometryOf(container: HTMLElement): string {
  const lines = [...container.querySelectorAll(".athar-mushaf__line")];
  return lines
    .map((line) => {
      const slots = [...line.querySelectorAll(".athar-mushaf__slot")];
      return `${line.getAttribute("data-line")}:[${slots
        .map(
          (s) =>
            `${s.getAttribute("data-position")}@${(s as HTMLElement).style.flexBasis}`,
        )
        .join(",")}]`;
    })
    .join("|");
}

describe("criterion 3 — page geometry is invariant", () => {
  it("renders the full Madani line count even when data covers fewer lines", () => {
    const { container } = renderPage("en", "light");
    expect(container.querySelectorAll(".athar-mushaf__line")).toHaveLength(
      mushafGeometry.linesPerPage,
    );
  });

  it("honours the opening pages' documented line-count exception", () => {
    const { container } = renderPage("en", "light", [], 1);
    expect(container.querySelectorAll(".athar-mushaf__line")).toHaveLength(
      linesOnPage(1),
    );
    expect(linesOnPage(1)).not.toBe(mushafGeometry.linesPerPage);
  });

  it("is identical in English and Arabic", () => {
    const en = renderPage("en", "light");
    const enGeometry = geometryOf(en.container);
    en.unmount();

    const ar = renderPage("ar", "light");
    expect(geometryOf(ar.container)).toBe(enGeometry);
  });

  it("is identical in light and dark modes", () => {
    const light = renderPage("en", "light");
    const lightGeometry = geometryOf(light.container);
    light.unmount();

    const dark = renderPage("en", "dark");
    expect(geometryOf(dark.container)).toBe(lightGeometry);
  });

  it("does not move when words are revealed", () => {
    const blank = renderPage("en", "light", []);
    const blankGeometry = geometryOf(blank.container);
    blank.unmount();

    const partial = renderPage("en", "light", ["lt-1-1", "lt-2-3"]);
    const partialGeometry = geometryOf(partial.container);
    partial.unmount();

    const full = renderPage("en", "light", [
      ...layout().flatMap((l) => l.tokens.map((t) => t.tokenId)),
    ]);

    // A word appearing must never shift the words around it.
    expect(partialGeometry).toBe(blankGeometry);
    expect(geometryOf(full.container)).toBe(blankGeometry);
  });

  it("keeps every slot reserving its measured width while blank", () => {
    const { container } = renderPage("en", "light", []);
    const slots = [...container.querySelectorAll(".athar-mushaf__slot")];
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots)
      expect((slot as HTMLElement).style.flexBasis).toMatch(/^\d+ch$/);
  });
});

describe("the muṣḥaf is always right-to-left, whatever the interface is", () => {
  it("stays rtl inside a left-to-right interface", () => {
    const { container } = renderPage("en", "light");
    expect(container.querySelector(".athar-mushaf")).toHaveAttribute("dir", "rtl");
  });

  it("stays rtl inside a right-to-left interface", () => {
    const { container } = renderPage("ar", "light");
    expect(container.querySelector(".athar-mushaf")).toHaveAttribute("dir", "rtl");
  });
});

describe("the page begins blank and fills only from evidence", () => {
  it("shows no words when nothing has been recalled", () => {
    const { container } = renderPage("en", "light", []);
    expect(container.querySelectorAll(".athar-mushaf__word")).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-revealed="false"]').length,
    ).toBeGreaterThan(0);
  });

  it("shows exactly the words that were recalled, and no others", () => {
    const { container } = renderPage("en", "light", ["lt-1-2", "lt-3-1"]);
    const words = [...container.querySelectorAll(".athar-mushaf__word")].map(
      (w) => w.textContent,
    );
    expect(words).toEqual(["SYN-1-2", "SYN-3-1"]);
  });

  it("hides blank slots from assistive technology", () => {
    const { container } = renderPage("en", "light", []);
    for (const blank of container.querySelectorAll(".athar-mushaf__blank"))
      expect(blank).toHaveAttribute("aria-hidden", "true");
  });

  it("announces progress as a count rather than reading the text aloud", () => {
    renderPage("en", "light", ["lt-1-1"]);
    const live = screen.getByText("1 / 12");
    expect(live).toHaveAttribute("aria-live", "polite");
  });
});

describe("the page is a labelled landmark", () => {
  it("exposes an accessible name", () => {
    renderPage("en", "light");
    expect(screen.getByRole("region", { name: "Test page" })).toBeInTheDocument();
  });
});
