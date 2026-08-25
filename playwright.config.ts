import { defineConfig, devices } from "@playwright/test";

/**
 * Which Chromium to drive.
 *
 * CI installs the build Playwright expects and finds it unaided. Some
 * development images ship a Chromium at a fixed path whose revision does not
 * match, and there Playwright refuses to launch at all — which meant these
 * specs were written but never once executed. CHROMIUM_PATH lets such an image
 * point at what it has, so a spec can be run before it is trusted.
 */
function browser() {
  return process.env.CHROMIUM_PATH
    ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
    : {};
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, ...browser() } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, ...browser() } },
  ],
});
