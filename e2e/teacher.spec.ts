import { existsSync } from "node:fs";
import { expect, test, type BrowserContext } from "@playwright/test";
import { signInAs } from "./helpers";
import { PrismaClient } from "@prisma/client";

/**
 * The teacher's evening, end to end.
 *
 * Sign in → the inbox says who needs you → open the person who asked to be
 * heard → mark one correction at a position → record the verdict → the inbox
 * is one shorter.
 *
 * The fixture below writes a pending verification request directly, because a
 * learner asking to be heard belongs to the learner app and this suite must
 * not depend on it. It writes a REQUEST and nothing else: no memory state, no
 * verdict, no mastery — those may only ever exist as consequences of evidence,
 * and seeding them would be the fake progress the product refuses to show.
 */
const ORG_ID = "org_seed_madrasah";
const TEACHER = { email: "teacher@itqan.test", password: "itqan-dev-password" };
const TEACHER_ID = "u_seed_teacher";
const LEARNER_ID = "u_seed_teen";
const REQUEST_ID = "vr_e2e_teacher";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * Some build images ship a Chromium that does not match the revision Playwright
 * would download. When one is present, point at it rather than failing on a
 * missing browser — the config itself stays untouched.
 */
const VENDORED_CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
if (existsSync(VENDORED_CHROMIUM)) {
  test.use({ launchOptions: { executablePath: VENDORED_CHROMIUM } });
}

async function withDb<T>(work: (db: PrismaClient) => Promise<T>): Promise<T> {
  const db =
    url === undefined
      ? new PrismaClient()
      : new PrismaClient({ datasources: { db: { url } } });
  try {
    return await work(db);
  } finally {
    await db.$disconnect();
  }
}

test.beforeEach(async () => {
  await withDb(async (db) => {
    await db.verdict.deleteMany({ where: { verificationRequestId: REQUEST_ID } });
    await db.verificationRequest.deleteMany({ where: { id: REQUEST_ID } });
    await db.verificationRequest.create({
      data: {
        id: REQUEST_ID,
        organizationId: ORG_ID,
        learnerUserId: LEARNER_ID,
        track: "hifz",
        // References only — sūrah and āyah numbers. Never Arabic.
        unitScope: { sura: 78, ayahFrom: 1, ayahTo: 5 },
        state: "pending",
        requestedAt: new Date(Date.now() - 5 * 3_600_000),
      },
    });
  });
});

test.afterEach(async () => {
  await withDb(async (db) => {
    await db.verdict.deleteMany({ where: { verificationRequestId: REQUEST_ID } });
    await db.verificationRequest.deleteMany({ where: { id: REQUEST_ID } });
  });
});

/**
 * The console's subject is triage and verdicts, not the login form — and the
 * form is rate limited per identifier, so a suite that signs the same teacher
 * in for every test eventually fails on "too many tries" instead of on
 * anything it meant to check. The session is minted the way the server would
 * have issued it.
 */
async function signIn(context: BrowserContext): Promise<void> {
  await signInAs(context, TEACHER_ID);
}

test.describe("the teacher console", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "one browser is enough here");

  test("triage → verify → the inbox shrinks", async ({ page, context }) => {
    await signIn(context);
    await page.goto("/teacher/today");

    /* The inbox names the person and the reason, and the reason is the one
       thing only a teacher can answer: someone is waiting to be heard.

       Other people may legitimately be waiting too — this database is shared
       with the learner app's own fixtures — so the assertions are about THIS
       student and about the queue shrinking by one, never about the console
       being otherwise empty. */
    await expect(page.getByRole("heading", { name: "Who needs you today" })).toBeVisible();
    const inbox = page.getByLabel("triage");
    const maryam = inbox.locator("li", { hasText: "Maryam" });
    await expect(maryam).toContainText("Asked to be heard");

    await page.goto("/teacher/verify");
    // Address the row by its request, not by the student's name: this database
    // is shared, and the same person may legitimately be waiting twice.
    await page.locator(`a[href="/teacher/verify/${REQUEST_ID}"]`).click();
    await page.waitForURL(`**/teacher/verify/${REQUEST_ID}`);

    /* A correction marks a POSITION: choose the word, then say what happened
       there. Marking a category before choosing a word is refused. */
    await expect(page.getByText("No position chosen yet")).toBeVisible();
    await page.getByRole("button", { name: "Hesitated" }).click();
    await expect(page.getByText("Choose a word on the page first")).toBeVisible();

    await page.locator('[data-mushaf-sheet] button').first().click();
    await page.getByRole("button", { name: "Hesitated" }).click();
    await expect(page.getByText(/Sūrah 78, āyah 1, word 1/).first()).toBeVisible();

    /* "Record and next" keeps the teacher in rhythm: it goes to whoever is
       next, or back to the queue when nobody is. Either way it leaves this
       request behind. */
    await page.getByTestId("record-verdict").click();
    await page.waitForURL((current) => !current.pathname.endsWith(REQUEST_ID));

    await page.goto("/teacher/verify");

    /* The queue is one shorter: this request is no longer waiting on anyone. */
    await expect(page.locator(`a[href="/teacher/verify/${REQUEST_ID}"]`)).toHaveCount(0);

    await page.goto("/teacher/today");
    await expect(
      page.getByLabel("triage").locator("li", { hasText: "Maryam" }),
    ).not.toContainText("Asked to be heard");

    /* And the verdict itself is on the record, once, with the correction that
       was marked — a position, and no text. */
    const recorded = await withDb((db) =>
      db.verdict.findUnique({ where: { verificationRequestId: REQUEST_ID } }),
    );
    expect(recorded?.verdict).toBe("passed");
    expect(recorded?.corrections).toEqual([
      { category: "hesitation", sura: 78, ayah: 1, wordIndex: 1 },
    ]);

    /* And the student's Memory tab now shows the passage they were actually
       heard on. It used to show 78:1–20 for everyone, whatever had been
       verified, while the comment above it claimed otherwise. */
    await page.goto(`/teacher/students/${LEARNER_ID}`);
    await page.getByRole("tab", { name: "Memory" }).click();
    // Five āyahs — 78:1–5, the scope of the request just verified — and not
    // the twenty this page used to show every student regardless.
    const panel = page.getByRole("tabpanel", { name: "Memory" });
    await expect(panel.getByRole("img")).toHaveCount(5);
  });

  test("a verdict is recorded once, and the record says so", async ({ page, context }) => {
    await signIn(context);
    await page.goto(`/teacher/verify/${REQUEST_ID}`);
    await expect(page.getByText("A verdict is your word, recorded once.")).toBeVisible();
  });

  test("the assign wizard carries references, never text", async ({ page, context }) => {
    await signIn(context);
    await page.goto("/teacher/assign");
    await expect(page.getByRole("heading", { name: "New assignment" })).toBeVisible();
    await expect(page.getByText("Which students")).toBeVisible();
    // Nobody chosen yet: the wizard will not advance.
    await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();
  });
});
