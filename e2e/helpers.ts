import type { Page, BrowserContext } from "@playwright/test";

/**
 * Shared journey helpers.
 *
 * The seeded organisation (scripts/seed_dev.ts) is the fixture every journey
 * runs against: one school, one teacher, one guardian, three learners across
 * the three tiers, and deliberately NO memory state — progress in Itqān exists
 * only as a consequence of evidence, so a journey that needs progress has to
 * produce it.
 */
export const SEED = {
  organizationId: "org_seed_madrasah",
  password: "itqan-dev-password",
  teacher: { email: "teacher@itqan.test", name: "Ustādh Karīm" },
  guardian: { email: "parent@itqan.test", name: "Fāṭimah" },
  admin: { email: "admin@itqan.test" },
  teen: { email: "maryam@itqan.test", id: "u_seed_teen" },
  adult: { email: "adult@itqan.test", id: "u_seed_adult" },
  kid: { id: "u_seed_kid", handle: "kid" },
  classroom: { id: "c_seed_hifz", joinCode: "NUR2026" },
} as const;

export async function signIn(page: Page, email: string, password = SEED.password): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in|continue/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 15_000 });
}

/** Render in a chosen surface without clicking through settings. */
export function surface(pathname: string, options: { theme?: "light" | "dark"; tier?: "kids" | "teen" | "adult"; locale?: "en" | "ar" } = {}): string {
  const params = new URLSearchParams();
  if (options.theme) params.set("theme", options.theme);
  if (options.tier) params.set("tier", options.tier);
  if (options.locale) params.set("locale", options.locale);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * A school Chromebook on shared wifi — the device and the network this product
 * has to work on, not the one it is built on.
 */
export async function throttleToSchoolChromebook(context: BrowserContext, page: Page): Promise<void> {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    // Fast 3G: roughly a full classroom sharing one access point.
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  });
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
}

export async function goOffline(context: BrowserContext, page: Page): Promise<void> {
  const session = await context.newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: true,
    downloadThroughput: 0,
    uploadThroughput: 0,
    latency: 0,
  });
}
