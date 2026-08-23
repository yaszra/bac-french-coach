import { expect, test, type Page } from "@playwright/test";

/**
 * The catalogue journey.
 *
 * Twelve surfaces — light/dark × kids/teen/adult × en/ar — captured at both
 * viewports the Playwright projects define (390px mobile, 1280px desktop),
 * plus the muṣḥaf contract proven in a real browser: the page a learner
 * recites from is the SAME paper in light and in dark.
 */

const THEMES = ["light", "dark"] as const;
const TIERS = ["kids", "teen", "adult"] as const;
const LOCALES = ["en", "ar"] as const;

type Surface = {
  theme: (typeof THEMES)[number];
  tier: (typeof TIERS)[number];
  locale: (typeof LOCALES)[number];
};

const SCREENSHOT = {
  animations: "disabled",
  maxDiffPixelRatio: 0.01,
} as const;

async function open(page: Page, path: string, surface: Surface): Promise<void> {
  const query = new URLSearchParams(surface).toString();
  await page.goto(`${path}?${query}`);

  /* The catalogue stamps the surface on <html> and flags itself ready; waiting
     for that flag is what makes these screenshots deterministic. */
  await page.waitForFunction(
    (expected) => {
      const root = document.documentElement;
      return (
        root.dataset.surfaceReady === "true" &&
        root.dataset.theme === expected.theme &&
        root.dataset.tier === expected.tier &&
        root.getAttribute("lang") === expected.locale
      );
    },
    surface,
  );

  await page.evaluate(() => document.fonts?.ready);
}

for (const theme of THEMES) {
  for (const tier of TIERS) {
    for (const locale of LOCALES) {
      test(`catalogue · ${theme} · ${tier} · ${locale}`, async ({ page }) => {
        await open(page, "/catalogue", { theme, tier, locale });

        await expect(page.getByRole("heading", { name: "mushaf" })).toBeVisible();
        await expect(page).toHaveScreenshot(`catalogue-${theme}-${tier}-${locale}.png`, {
          ...SCREENSHOT,
          fullPage: true,
        });
      });
    }
  }
}

test.describe("the muṣḥaf contract", () => {
  async function readSheet(page: Page, theme: Surface["theme"]) {
    await open(page, "/catalogue/mushaf", { theme, tier: "adult", locale: "ar" });
    return page.evaluate(() => {
      const sheet = document.querySelector("[data-mushaf-sheet]");
      if (!sheet) throw new Error("the muṣḥaf sheet is not on the page");
      const sheetStyle = getComputedStyle(sheet);
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        paper: sheetStyle.backgroundColor,
        ink: sheetStyle.color,
        paperToken: rootStyle.getPropertyValue("--mushaf-paper").trim(),
        inkToken: rootStyle.getPropertyValue("--mushaf-ink").trim(),
        depth5: rootStyle.getPropertyValue("--ink-depth-5").trim(),
        chrome: getComputedStyle(document.body).backgroundColor,
      };
    });
  }

  test("the page keeps its paper and its ink in dark theme", async ({ page }) => {
    const light = await readSheet(page, "light");
    await expect(page).toHaveScreenshot("mushaf-light.png", SCREENSHOT);

    const dark = await readSheet(page, "dark");
    await expect(page).toHaveScreenshot("mushaf-dark.png", SCREENSHOT);

    /* The chrome really did change… */
    expect(dark.chrome).not.toBe(light.chrome);

    /* …and the page did not. */
    expect(dark.paper).toBe(light.paper);
    expect(dark.ink).toBe(light.ink);
    expect(dark.paperToken).toBe(light.paperToken);
    expect(dark.inkToken).toBe(light.inkToken);
    expect(dark.depth5).toBe(light.depth5);
  });

  test("the page is the same paper in every tier", async ({ page }) => {
    const adult = await readSheet(page, "light");
    await open(page, "/catalogue/mushaf", { theme: "light", tier: "kids", locale: "ar" });
    const kids = await page.evaluate(() => {
      const sheet = document.querySelector("[data-mushaf-sheet]");
      if (!sheet) throw new Error("the muṣḥaf sheet is not on the page");
      return getComputedStyle(sheet).backgroundColor;
    });
    expect(kids).toBe(adult.paper);
  });
});
