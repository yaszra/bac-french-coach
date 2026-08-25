import { test, expect, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encodeSession } from "../src/modules/platform/session/cookie";
import { runNightlyFamilyReports } from "../src/modules/platform/jobs/handlers/reports";
import { isLocalEvening } from "../src/modules/platform/jobs/handlers/evening";

/**
 * The family app, end to end, against the seeded school.
 *
 * These check the two promises a parent would notice if we broke them: a
 * signed-out visitor learns nothing about any child, and a claim that is still
 * waiting shows what it cannot see instead of an empty report that reads like a
 * quiet day.
 */
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const canRun = Boolean(url && process.env.SESSION_SECRET);

const ORG = "org_seed_madrasah";
const GUARDIAN = "u_seed_parent";
/** The approved link. The teen is claimed but not approved, on purpose. */
const CHILD = "u_seed_kid";

async function signIn(context: BrowserContext): Promise<void> {
  const db = new PrismaClient({ datasources: { db: { url: url as string } } });
  try {
    const sessionId = `e2e_family_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 3_600_000);
    await db.session.create({
      data: { id: sessionId, userId: GUARDIAN, organizationId: ORG, version: 1, issuedAt: new Date(), expiresAt },
    });
    await context.addCookies([
      {
        name: "itqan_session",
        value: encodeSession({
          sid: sessionId,
          uid: GUARDIAN,
          org: ORG,
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

/**
 * Tonight's report is written by a job, not by the page — so a test that wants
 * to read one has to run the job, at an hour that is actually evening for the
 * family it belongs to. Faking a ReportRun row would test the renderer against
 * a payload the product never produces.
 */
async function buildTonightReport(): Promise<void> {
  const db = new PrismaClient({ datasources: { db: { url: url as string } } });
  let timezone = "UTC";
  try {
    const profile = await db.learnerProfile.findUnique({
      where: { userId: CHILD },
      select: { timezone: true },
    });
    timezone = profile?.timezone ?? "UTC";
  } finally {
    await db.$disconnect();
  }

  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  for (let hour = 0; hour < 24; hour++) {
    const at = new Date(midnight.getTime() + hour * 3_600_000);
    if (!isLocalEvening(timezone, at)) continue;
    await runNightlyFamilyReports({ organizationId: ORG, at: at.toISOString() });
    return;
  }
  throw new Error(`no evening hour found today for ${timezone}`);
}

test.describe("the family app", () => {
  test("tells a signed-out visitor nothing about any child", async ({ page }) => {
    await page.goto("/tonight");
    // The heading, specifically: the sign-in button carries the same words.
    await expect(
      page.getByRole("heading", { name: "Sign in to see your family" }),
    ).toBeVisible();
    await expect(page.getByText("Yūsuf")).toHaveCount(0);
  });

  test("shows a waiting claim as a claim, with what it cannot see", async ({ page, context }) => {
    test.skip(!canRun, "needs a seeded database and SESSION_SECRET");
    await signIn(context);

    await page.goto("/children");
    await expect(page.getByText("Waiting for the teacher")).toBeVisible();
    await expect(page.getByText("Any recording of their voice")).toBeVisible();
    await expect(page.getByText("What they have memorised, or how they are doing")).toBeVisible();
  });

  test("never presents a home task as progress", async ({ page, context }) => {
    test.skip(!canRun, "needs a seeded database and SESSION_SECRET");
    await signIn(context);
    await buildTonightReport();

    await page.goto(`/tonight?child=${CHILD}`);
    await expect(
      page.getByText("Doing this together is not marked as progress", { exact: false }),
    ).toBeVisible();
  });
});
