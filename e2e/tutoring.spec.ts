import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SEED, signInAs } from "./helpers";

/**
 * The guardian who tutors.
 *
 * `canTutor` on a guardian link has always unlocked hearing a child and
 * recording a verdict — the authorisation was there from the start, with no
 * screen behind it. These check the two halves that matter: a guardian who
 * tutors can actually hear their child and record a real verdict, and a
 * guardian who does not is refused rather than quietly shown the console.
 *
 * The seed gives u_seed_parent an APPROVED, tutoring link to u_seed_kid and a
 * merely claimed one to u_seed_teen, which is exactly the pair needed here.
 */
const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const canRun = Boolean(url && process.env.SESSION_SECRET);

const ORG = SEED.organizationId;
const GUARDIAN = "u_seed_parent";
const TUTORED = SEED.kid.id;
const NOT_TUTORED = SEED.teen.id;
const REQUEST_ID = "vr_e2e_tutor";
const NOT_MINE_REQUEST_ID = "vr_e2e_tutor_not_mine";

async function withDb<T>(work: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db = new PrismaClient({ datasources: { db: { url: url as string } } });
  try {
    return await work(db);
  } finally {
    await db.$disconnect();
  }
}

test.beforeEach(async () => {
  test.skip(!canRun, "needs a seeded database and SESSION_SECRET");
  await withDb(async (db) => {
    await db.verdict.deleteMany({
      where: { verificationRequestId: { in: [REQUEST_ID, NOT_MINE_REQUEST_ID] } },
    });
    await db.verificationRequest.deleteMany({
      where: { id: { in: [REQUEST_ID, NOT_MINE_REQUEST_ID] } },
    });
    for (const [id, learnerUserId] of [
      [REQUEST_ID, TUTORED],
      [NOT_MINE_REQUEST_ID, NOT_TUTORED],
    ] as const) {
      await db.verificationRequest.create({
        data: {
          id,
          organizationId: ORG,
          learnerUserId,
          track: "hifz",
          // References only — sūrah and āyah numbers. Never Arabic.
          unitScope: { sura: 78, ayahFrom: 1, ayahTo: 3 },
          state: "pending",
          requestedAt: new Date(Date.now() - 3 * 3_600_000),
        },
      });
    }
  });
});

test.afterEach(async () => {
  if (!canRun) return;
  await withDb(async (db) => {
    await db.verdict.deleteMany({
      where: { verificationRequestId: { in: [REQUEST_ID, NOT_MINE_REQUEST_ID] } },
    });
    await db.verificationRequest.deleteMany({
      where: { id: { in: [REQUEST_ID, NOT_MINE_REQUEST_ID] } },
    });
  });
});

test.describe("a guardian who tutors", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one browser is enough here");

  test("hears the child they tutor and records a verdict under their own name", async ({
    page,
    context,
  }) => {
    await signInAs(context, GUARDIAN);

    await page.goto("/tutor");
    await expect(page.getByText("Waiting to be heard")).toBeVisible();
    await page.locator(`a[href="/tutor/${REQUEST_ID}"]`).click();
    await page.waitForURL(`**/tutor/${REQUEST_ID}`);

    /* The same console a teacher uses, with the page in front of them —
       scripture from the content package, and a correction that is a position
       rather than any text. */
    await page.locator("[data-mushaf-sheet] button").first().click();
    await page.getByRole("button", { name: "Hesitated" }).click();
    await page.getByTestId("record-verdict").click();
    await page.waitForURL((current) => !current.pathname.endsWith(REQUEST_ID));

    const recorded = await withDb((db) =>
      db.verdict.findUnique({ where: { verificationRequestId: REQUEST_ID } }),
    );
    // A real verdict, held to the same bar, and attributed to the guardian who
    // actually listened — not to the teacher who granted them tutoring.
    expect(recorded?.decidedByUserId).toBe(GUARDIAN);
    expect(recorded?.corrections).toEqual([
      { category: "hesitation", sura: 78, ayah: 1, wordIndex: 1 },
    ]);
  });

  test("cannot open a child they were never granted", async ({ page, context }) => {
    await signInAs(context, GUARDIAN);

    // The claimed-but-unapproved link is not tutoring, so this request is not
    // theirs to hear — and the page refuses rather than rendering the console.
    await page.goto(`/tutor/${NOT_MINE_REQUEST_ID}`);
    // Not-found is rendered, not merely returned: the root layout streams, so
    // the response status is 200 whatever the page decides. What matters is
    // that the console is not on the screen.
    await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
    await expect(page.getByTestId("record-verdict")).toHaveCount(0);
  });
});
