import { test, expect } from "@playwright/test";
import { surface } from "./helpers";

/**
 * Accessibility as a property of the pages, checked mechanically.
 *
 * This does not replace a pass with VoiceOver and NVDA — a screen-reader user's
 * experience is not reducible to assertions — but it catches the regressions
 * that make such a pass impossible before it starts: an unlabelled control, a
 * direction that does not flip, text below the floor, a heading order that
 * jumps.
 */
const PAGES = ["/catalogue", "/catalogue/mushaf"];

for (const pathname of PAGES) {
  test.describe(pathname, () => {
    test("every interactive element has an accessible name", async ({ page }) => {
      await page.goto(surface(pathname));
      const unnamed = await page.evaluate(() => {
        const selector = "button, a[href], input, select, textarea, [role=button], [role=switch], [role=tab]";
        const problems: string[] = [];
        for (const el of document.querySelectorAll(selector)) {
          const label =
            el.getAttribute("aria-label") ??
            el.getAttribute("title") ??
            (el as HTMLElement).innerText?.trim() ??
            "";
          const labelledBy = el.getAttribute("aria-labelledby");
          if (!label && !labelledBy) {
            problems.push(`${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`);
          }
        }
        return problems;
      });
      expect(unnamed, `elements with no accessible name on ${pathname}`).toEqual([]);
    });

    test("no text renders below the twelve-pixel floor", async ({ page }) => {
      await page.goto(surface(pathname));
      const tooSmall = await page.evaluate(() => {
        const problems: string[] = [];
        for (const el of document.querySelectorAll("*")) {
          const text = (el as HTMLElement).innerText;
          if (!text || text.trim() === "") continue;
          if (el.children.length > 0) continue; // leaf nodes only
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 12) problems.push(`${el.tagName.toLowerCase()} at ${size}px: ${text.slice(0, 30)}`);
        }
        return problems;
      });
      expect(tooSmall).toEqual([]);
    });

    test("Arabic renders right to left and is marked as Arabic", async ({ page, context }) => {
      // Direction must be right on the FIRST paint, from the server — not
      // corrected by an effect after hydration, which flips the layout under a
      // reader and leaves anyone without JavaScript in an LTR frame for good.
      await context.addCookies([
        { name: "itqan_locale", value: "ar", url: "http://localhost:3000" },
      ]);
      await page.goto(surface(pathname, { locale: "ar" }), { waitUntil: "commit" });
      /* A locator, not page.evaluate: at "commit" the response has arrived but
         the document may not be parsed yet, and reading documentElement then
         throws on null. The locator waits for the element itself, which is the
         thing being asserted about — the attribute the SERVER sent, before any
         script has run. */
      await expect(
        page.locator("html"),
        "the document must be RTL before hydration",
      ).toHaveAttribute("dir", "rtl");

      await page.waitForLoadState("networkidle");

      // Every Arabic node must declare its language, or a screen reader will
      // read it with the wrong voice — which for scripture is not a small thing.
      const undeclared = await page.evaluate(() => {
        const arabic = /[؀-ۿ]/;
        const problems: string[] = [];
        for (const el of document.querySelectorAll("*")) {
          if (el.children.length > 0) continue;
          const text = (el as HTMLElement).innerText ?? "";
          if (!arabic.test(text)) continue;
          const lang = el.closest("[lang]")?.getAttribute("lang");
          if (lang !== "ar") problems.push(text.slice(0, 24));
        }
        return problems;
      });
      expect(undeclared).toEqual([]);
    });

    test("headings do not skip levels", async ({ page }) => {
      await page.goto(surface(pathname));
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName.slice(1))),
      );
      let previous = 0;
      for (const level of levels) {
        if (previous !== 0) expect(level - previous).toBeLessThanOrEqual(1);
        previous = level;
      }
    });

    test("focus is always visible", async ({ page }) => {
      /* Asked of the stylesheet, not of the window.
       *
       * `:focus-visible` is the browser's judgement that someone is navigating
       * by keyboard, so the obvious test is to press Tab — and a keystroke
       * only reaches a page the browser considers frontmost and focused, which
       * in a worker running several pages it often is not. That made this test
       * pass alone and fail in a full run, for a reason with nothing to do
       * with focus rings.
       *
       * The property that actually matters is that a focusable control HAS a
       * focus-visible rule which paints something. That is knowable from the
       * cascade, deterministically: find the rules mentioning `:focus-visible`,
       * strip the pseudo-class, and ask whether this control matches one that
       * sets an outline or a shadow. */
      await page.goto(surface(pathname));
      const focusable = page.locator("button, a[href], [role=button]").first();
      if ((await focusable.count()) === 0) test.skip();

      const ring = await focusable.evaluate((el) => {
        const paints = (text: string) =>
          /outline(-width|-style|-color)?\s*:/.test(text) || /box-shadow\s*:/.test(text);

        /* Rules live inside @layer and @media blocks, so this has to walk the
           groups rather than read the sheet's top level — the design system's
           global ring is inside a layer, and a check that skipped it would
           report every control as ringless. */
        const styleRules: CSSStyleRule[] = [];
        const collect = (rules: CSSRuleList) => {
          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule) styleRules.push(rule);
            const grouped = (rule as CSSGroupingRule).cssRules;
            if (grouped !== undefined) collect(grouped);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            collect(sheet.cssRules);
          } catch {
            continue; // A cross-origin sheet cannot be read; none of ours are.
          }
        }

        for (const rule of styleRules) {
          if (!rule.selectorText.includes(":focus-visible")) continue;
          if (!paints(rule.style.cssText)) continue;
          for (const selector of rule.selectorText.split(",")) {
            // A bare `:focus-visible` applies to everything that can take it.
            const candidate = selector.replaceAll(":focus-visible", "").trim() || "*";
            try {
              if (el.matches(candidate)) return rule.selectorText;
            } catch {
              // A selector this browser cannot parse tells us nothing.
            }
          }
        }
        return null;
      });

      expect(ring, "a focusable control must have a focus-visible ring").not.toBeNull();
    });
  });
}

test("the muṣḥaf page keeps its paper in dark theme", async ({ page }) => {
  const read = async (theme: "light" | "dark") => {
    await page.goto(surface("/catalogue/mushaf", { theme }));
    return page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--mushaf-paper").trim(),
    );
  };
  const light = await read("light");
  const dark = await read("dark");
  expect(light).not.toBe("");
  // The binding contract, proven in a real browser rather than by reading CSS.
  expect(dark).toBe(light);
});
