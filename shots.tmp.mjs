import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const OUT = "/tmp/claude-0/-home-user-bac-french-coach/f37cfec6-9214-5dd8-9628-d6b991ed21ac/scratchpad";
const db = new PrismaClient({ datasources: { db: { url: "postgresql://itqan:itqan@localhost:5432/itqan" } } });
const ID = "vr_shot_teacher";
await db.verdict.deleteMany({ where: { verificationRequestId: ID } });
await db.verificationRequest.deleteMany({ where: { id: ID } });
await db.verificationRequest.create({ data: {
  id: ID, organizationId: "org_seed_madrasah", learnerUserId: "u_seed_teen", track: "hifz",
  unitScope: { sura: 78, ayahFrom: 1, ayahTo: 5 }, state: "pending",
  requestedAt: new Date(Date.now() - 26 * 3600000),
}});
// A guardian claim and some lapses so triage has more than one kind of row.
await db.attempt.deleteMany({ where: { id: { startsWith: "at_shot_" } } });
for (let i = 0; i < 4; i++) {
  await db.attempt.create({ data: {
    id: `at_shot_${i}`, organizationId: "org_seed_madrasah", learnerUserId: "u_seed_adult",
    unitId: `b:78:${i + 1}`, retrievalType: "recall_first", grade: "again", occurredAt: new Date(Date.now() - i * 86400000),
  }});
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const theme of ["light", "dark"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/teacher/sign-in");
  await page.getByLabel("Email").fill("teacher@itqan.test");
  await page.getByLabel("Password").fill("itqan-dev-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/teacher/today");

  await page.goto(`http://localhost:3000/teacher/today?theme=${theme}`);
  await page.waitForFunction(() => document.documentElement.dataset.surfaceReady === "true");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/triage-${theme}.png`, fullPage: true });

  await page.goto(`http://localhost:3000/teacher/verify/${ID}?theme=${theme}`);
  await page.waitForFunction(() => document.documentElement.dataset.surfaceReady === "true");
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/verify-${theme}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
await db.$disconnect();
console.log("shots done");
