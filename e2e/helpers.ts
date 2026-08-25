import type { Page, BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encodeSession } from "../src/modules/platform/session/cookie";

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

/**
 * Sign in without going through the form.
 *
 * The sign-in form is rate limited, deliberately and per identifier — which is
 * a feature of the product and a trap for a suite in which every spec signs the
 * same person in. Run the whole suite and the later specs are told "too many
 * tries" and fail for a reason that has nothing to do with what they test.
 *
 * So a journey whose subject is NOT sign-in mints the session it would have
 * been given: a real Session row and the real cookie encoding, so authorisation
 * is exercised exactly as in production. The form itself stays covered by the
 * specs that are actually about signing in.
 */
export async function signInAs(
  context: BrowserContext,
  userId: string,
  organizationId: string = SEED.organizationId,
): Promise<void> {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL or DIRECT_DATABASE_URL is required to mint a session");
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const sessionId = `e2e_${userId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const expiresAt = new Date(Date.now() + 3_600_000);
    await db.session.create({
      data: { id: sessionId, userId, organizationId, version: 1, issuedAt: new Date(), expiresAt },
    });
    await context.addCookies([
      {
        name: "itqan_session",
        value: encodeSession({
          sid: sessionId,
          uid: userId,
          org: organizationId,
          v: 1,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(expiresAt.getTime() / 1000),
        }),
        domain: "localhost",
        path: "/",
      },
    ]);
  } finally {
    await db.$disconnect();
  }
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
