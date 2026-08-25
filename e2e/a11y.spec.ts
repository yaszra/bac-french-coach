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
      const direction = await page.evaluate(() => document.documentElement.getAttribute("dir"));
      expect(direction, "the document must be RTL before hydration").toBe("rtl");

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
      await page.goto(surface(pathname));
      const focusable = page.locator("button, a[href], [role=button]").first();
      if ((await focusable.count()) === 0) test.skip();
      await focusable.focus();
      const outline = await focusable.evaluate((el) => {
        const style = getComputedStyle(el);
        return { width: style.outlineWidth, style: style.outlineStyle, shadow: style.boxShadow };
      });
      const visible = outline.style !== "none" || outline.shadow !== "none";
      expect(visible, "a focused control must be visibly focused").toBe(true);
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
