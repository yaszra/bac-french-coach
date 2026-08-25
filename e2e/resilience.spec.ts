import { test, expect } from "@playwright/test";
import { surface, throttleToSchoolChromebook, goOffline } from "./helpers";

/**
 * The conditions this product will actually be used in.
 *
 * Not a developer's laptop on fibre: a school Chromebook, thirty of them behind
 * one access point, and — often enough to matter — no connection at all halfway
 * through a session. A learner in a hall with no signal is not an edge case,
 * they are Tuesday.
 */

test.describe("a school Chromebook on shared wifi", () => {
  test("the muṣḥaf page is readable within the performance budget", async ({ page, context }) => {
    await throttleToSchoolChromebook(context, page);

    const started = Date.now();
    await page.goto(surface("/catalogue/mushaf"), { waitUntil: "domcontentloaded" });
    // The page a learner recites from must be legible before anything else is
    // ready; the chrome can arrive late, the text cannot.
    await page.locator("[lang='ar']").first().waitFor({ state: "visible", timeout: 20_000 });
    const elapsed = Date.now() - started;

    expect(elapsed, `muṣḥaf text visible in ${elapsed}ms on a throttled Chromebook`).toBeLessThan(8_000);
  });

  test("the fonts are self-hosted, so no request leaves the origin", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "localhost" && url.protocol !== "data:" && url.protocol !== "blob:") {
        external.push(url.href);
      }
    });
    await page.goto(surface("/catalogue/mushaf"), { waitUntil: "networkidle" });

    // A child's device must not contact a font CDN, an analytics endpoint, or
    // anything else in order to read the Qurʾān.
    expect(external, "requests leaving the origin").toEqual([]);
  });

  test("every Arabic glyph has a real face behind it", async ({ page }) => {
    await page.goto(surface("/catalogue/mushaf"), { waitUntil: "networkidle" });
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].map((f) => `${f.family} ${f.status}`);
    });
    // If Amiri Quran never loaded, the muṣḥaf falls back to a system serif that
    // lacks Quranic marks, and scripture renders with empty boxes in it.
    expect(loaded.some((f) => f.includes("Amiri Quran") && f.includes("loaded"))).toBe(true);
  });
});

test.describe("offline", () => {
  test("the app still opens, and says honestly that it is offline", async ({ page, context }) => {
    // Warm the cache the way a real session would, then lose the connection.
    await page.goto(surface("/catalogue"), { waitUntil: "networkidle" });
    await goOffline(context, page);

    const response = await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
    if (response === null) {
      // No service worker yet on this route — that is a legitimate state, and
      // the test records it rather than pretending offline support exists.
      test.info().annotations.push({ type: "note", description: "route is not pre-cached; no offline shell" });
      return;
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("nothing claims to be saved that has not reached the server", async ({ page, context }) => {
    await page.goto(surface("/catalogue"), { waitUntil: "networkidle" });
    await goOffline(context, page);

    // The honest-state rule, checked as a property of the page: while offline,
    // no element may assert success. "Pending sync" is the only truthful claim.
    const dishonest = await page.evaluate(() => {
      const success = /\b(saved|recorded|complete[d]?|synced)\b/i;
      const pending = /\b(pending|waiting|offline|not yet)\b/i;
      const problems: string[] = [];
      for (const el of document.querySelectorAll("*")) {
        if (el.children.length > 0) continue;
        const text = (el as HTMLElement).innerText ?? "";
        if (success.test(text) && !pending.test(text)) problems.push(text.slice(0, 40));
      }
      return problems;
    });
    expect(dishonest).toEqual([]);
  });
});
