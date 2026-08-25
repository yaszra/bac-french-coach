import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./helpers";
import { Client } from "pg";
import { readFileSync } from "node:fs";

/**
 * The learner's journey, end to end.
 *
 *   sign in → Today → open the one next action → complete a rebuild →
 *   see it recorded → watch the day's count change.
 *
 * ARRANGEMENT. The seed deliberately writes no memory state — progress exists
 * only as a consequence of evidence, and seeding it would be exactly the fake
 * progress the product refuses to show. So this test arranges its starting point
 * the way the product would have: it appends a real `attempt.recorded` event to
 * the append-only log (the source of truth) and writes the memory_state row that
 * the projection folds out of it. Nothing here is a shortcut past the evidence
 * rule — the attempt the test then makes goes through the real server action, is
 * graded on the server, and this test never asserts a grade.
 */

const ORG = "org_seed_madrasah";
const LEARNER = "u_seed_teen";
const EMAIL = "maryam@itqan.test";
const PASSWORD = "itqan-dev-password";
const UNIT = "b:78:1";
/** Due, but never practised: the unit whose first rung is a listen. */
const FRESH_UNIT = "b:78:2";
/** Long held and long unheard: the unit whose rung is a person's ear. */
const MAINTENANCE_UNIT = "b:78:9";

const DB =
  process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan";

/** The āyah's words, read from the content package. Never typed into this file. */
function wordsOfTargetAyah(): string[] {
  const corpus = JSON.parse(readFileSync("content/quran/quran-uthmani.json", "utf8")) as {
    sura: number;
    ayah: number;
    text: string;
  }[];
  const verse = corpus.find((row) => row.sura === 78 && row.ayah === 1);
  if (verse === undefined) throw new Error("content package is missing 78:1");
  return verse.text.split(/\s+/u).filter(Boolean);
}

async function arrange(): Promise<void> {
  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    const lapsedAt = new Date(Date.now() - 24 * 3600 * 1000);
    const dueAt = new Date(Date.now() - 3600 * 1000);

    /* This learner's memory is this spec's fixture.
     *
     * The seeded school is shared: the teacher console's journey records a
     * verdict for this same student, which verifies units and reshuffles their
     * day. The session plan is budgeted, so a unit this spec depends on can be
     * pushed out of the stream by work another spec did — a failure that looks
     * like flake and is really two specs owning one learner. Memory state is a
     * projection, so clearing it costs nothing that the event log cannot
     * rebuild. */
    await client.query(`DELETE FROM memory_state WHERE "learnerUserId" = $1`, [LEARNER]);

    // The truth: one recorded attempt that went badly. Append-only, and keyed so
    // a re-run of this suite replays rather than piling up.
    await client.query(
      `INSERT INTO learning_event
         (id, "organizationId", "learnerUserId", type, "unitId", "idempotencyKey", payload, "occurredAt", source)
       VALUES ($1,$2,$3,'attempt.recorded',$4,$5,$6,$7,'web')
       ON CONFLICT ("organizationId", "idempotencyKey") DO NOTHING`,
      [
        "ev_e2e_learner_lapse",
        ORG,
        LEARNER,
        UNIT,
        "e2e-learner-lapse",
        JSON.stringify({ unitId: UNIT, unitKind: "ayah_body", retrievalType: "rebuild", grade: "again" }),
        lapsedAt,
      ],
    );

    // The denormalised row the console reads, and the projection the scheduler
    // reads. Both are derived; both are rebuildable from the event above.
    await client.query(
      `INSERT INTO attempt
         (id, "organizationId", "learnerUserId", "unitId", "retrievalType", grade, "occurredAt")
       VALUES ($1,$2,$3,$4,'rebuild','again',$5)
       ON CONFLICT (id) DO UPDATE SET "occurredAt" = EXCLUDED."occurredAt"`,
      ["at_e2e_learner_lapse", ORG, LEARNER, UNIT, lapsedAt],
    );

    await client.query(
      `INSERT INTO memory_state
         (id, "organizationId", "learnerUserId", "unitId", "unitKind", stability, difficulty,
          reps, lapses, "lastReviewAt", "lastRetrievalType", confidence, "dueAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'ayah_body',6,5,3,1,$5,'rebuild',0.6,$6, now())
       ON CONFLICT ("learnerUserId", "unitId") DO UPDATE
         SET stability = 6, reps = 3, lapses = 1, confidence = 0.6,
             "lastReviewAt" = EXCLUDED."lastReviewAt", "dueAt" = EXCLUDED."dueAt", "updatedAt" = now()`,
      ["ms_e2e_learner", ORG, LEARNER, UNIT, lapsedAt, dueAt],
    );

    // A second unit that is due and has never been practised, so the plan
    // offers a first rung — a listen. /practice honours ?unit only for a unit
    // the plan already contains (the URL never invents work), so a test about
    // the listen rung has to arrange the unit into the day rather than ask for
    // one that is not there.
    await client.query(
      `INSERT INTO memory_state
         (id, "organizationId", "learnerUserId", "unitId", "unitKind", stability, difficulty,
          reps, lapses, confidence, "dueAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'ayah_body',0,5,0,0,0,$5, now())
       ON CONFLICT ("learnerUserId", "unitId") DO UPDATE
         SET reps = 0, lapses = 0, stability = 0, confidence = 0,
             "lastReviewAt" = NULL, "dueAt" = EXCLUDED."dueAt", "updatedAt" = now()`,
      ["ms_e2e_learner_fresh", ORG, LEARNER, FRESH_UNIT, dueAt],
    );

    /* A passage held for a long time and not recited to anyone for longer:
       held so firmly that review has no claim on it (the review band follows
       retrievability, not only the due date), and long past the maintenance
       interval. That is what puts a unit on the last rung — the one the grader
       refuses to mark, because only a person's ear can settle it. */
    await client.query(
      `INSERT INTO memory_state
         (id, "organizationId", "learnerUserId", "unitId", "unitKind", stability, difficulty,
          reps, lapses, "lastReviewAt", "lastRetrievalType", confidence, "dueAt", "updatedAt")
       VALUES ($1,$2,$3,$4,'ayah_body',4000,4,12,0,$5,'recall_first',0.99,$6, now())
       ON CONFLICT ("learnerUserId", "unitId") DO UPDATE
         SET stability = 4000, reps = 12, lapses = 0, confidence = 0.99,
             "lastReviewAt" = EXCLUDED."lastReviewAt", "dueAt" = EXCLUDED."dueAt",
             "verifiedAt" = NULL, "updatedAt" = now()`,
      [
        "ms_e2e_learner_maintenance",
        ORG,
        LEARNER,
        MAINTENANCE_UNIT,
        new Date(Date.now() - 120 * 24 * 3600 * 1000),
        new Date(Date.now() + 30 * 24 * 3600 * 1000),
      ],
    );

    // Nobody is waiting to be heard yet: the point of the test below is that
    // asking is what puts them there.
    await client.query(
      `DELETE FROM verification_request WHERE "learnerUserId" = $1 AND track = 'hifz'`,
      [LEARNER],
    );

    // Today starts clean: attempts recorded by an earlier run would make the
    // day's count untestable.
    await client.query(
      `DELETE FROM attempt
        WHERE "learnerUserId" = $1 AND "occurredAt" >= date_trunc('day', now() at time zone 'utc')`,
      [LEARNER],
    );

    // The seeded learner is shared with the teacher console's fixtures, and a
    // pending verification outranks every other band — a teacher's ear beats any
    // model, by design. Clearing them is what makes THIS learner's day
    // deterministic; it is arrangement, not a claim about verification.
    await client.query(`DELETE FROM verification_request WHERE "learnerUserId" = $1`, [LEARNER]);
  } finally {
    await client.end();
  }
}

/**
 * The real form, used once. Sign-in is rate limited per identifier, so the
 * other journeys mint the session instead of spending an attempt on a screen
 * they are not testing.
 */
/**
 * Leave room in the day for the last rung.
 *
 * A session has a budget, and new work outranks a maintenance reading — so
 * with the seeded assignment's āyāt still unlearned, the plan withholds
 * `b:78:9` with `budget_spent`, which is the right answer to the wrong day.
 * Settling that new work is what makes today the day this test is about: a
 * learner with nothing new to learn, and one long-held passage nobody has
 * heard in months.
 */
async function settleNewWork(): Promise<void> {
  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    const settled = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const notDue = new Date(Date.now() + 20 * 24 * 3600 * 1000);
    /* The seeded assignment covers 78:1–5, bodies and the seams between them.
       Settling only part of it simply promotes the rest into the day. */
    const units = [
      ...[2, 3, 4, 5].map((ayah) => `b:78:${ayah}`),
      ...[1, 2, 3, 4].map((from) => `t:78:${from}>78:${from + 1}`),
    ];
    for (const unitId of units) {
      await client.query(
        `INSERT INTO memory_state
           (id, "organizationId", "learnerUserId", "unitId", "unitKind", stability, difficulty,
            reps, lapses, "lastReviewAt", "lastRetrievalType", confidence, "dueAt", "updatedAt")
         VALUES ($1,$2,$3,$4,$5,200,4,5,0,$6,'recall_first',0.9,$7, now())
         ON CONFLICT ("learnerUserId", "unitId") DO UPDATE
           SET stability = 200, reps = 5, confidence = 0.9,
               "lastReviewAt" = EXCLUDED."lastReviewAt", "dueAt" = EXCLUDED."dueAt",
               "updatedAt" = now()`,
        [
          `ms_e2e_settled_${unitId}`,
          ORG,
          LEARNER,
          unitId,
          unitId.startsWith("t:") ? "ayah_transition" : "ayah_body",
          settled,
          notDue,
        ],
      );
    }
  } finally {
    await client.end();
  }
}

async function signInThroughTheForm(page: Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByTestId("sign-in-email").fill(EMAIL);
  await page.getByTestId("sign-in-password").fill(PASSWORD);
  await page.getByTestId("sign-in-submit").click();
  await page.waitForURL("**/today");
}

test.describe("the learner's day", () => {
  test.beforeEach(async () => {
    await arrange();
  });

  test("Today names one action, and the day's count follows the evidence", async ({ page }) => {
    await signInThroughTheForm(page);

    // One obvious next action, with the reason the scheduler actually had.
    const card = page.getByLabel(/next action|عمل اليوم/i);
    await expect(card).toBeVisible();
    await expect(page.getByTestId("today-start")).toBeVisible();

    // The day's count carries its denominator from the very first render: the
    // screen never shows a bare number, and never a rate without one.
    await expect(page.getByTestId("today-due")).toContainText(/0 of \d+ done today/i);

    await page.getByTestId("today-start").click();
    await page.waitForURL("**/practice**");

    // The repair drill puts every word in front of the learner: a rebuild.
    const tray = page.getByTestId("rebuild-tray");
    await expect(tray).toBeVisible();

    const words = wordsOfTargetAyah();
    for (const word of words) {
      await tray.getByText(word, { exact: true }).first().click();
    }

    await page.getByTestId("rebuild-submit").click();

    // Recorded — by the server. The screen reports it; it did not decide it.
    await expect(page.getByTestId("practice-recorded")).toBeVisible({ timeout: 15_000 });

    // Back on Today, the day's count has moved, and it carries its denominator.
    await page.goto("/today");
    await expect(page.getByTestId("today-due")).toContainText(/1 of \d+ done today/i);
  });

  test("the muṣḥaf offers a full-ink read, one tap from the memory view", async ({ page, context }) => {
    await signInAs(context, LEARNER);
    await page.goto("/quran");
    await expect(page.getByTestId("quran-pages")).toBeVisible();

    await page.goto("/quran/582");
    await expect(page.getByText(/Memory view|وضع الذاكرة/i)).toBeVisible();
    await page.getByTestId("quran-toggle-view").click();
    await expect(page.getByText(/Reading view|وضع القراءة/i)).toBeVisible();
  });

  test("asking to be heard actually puts the learner in a teacher's queue", async ({
    page,
    context,
  }) => {
    await settleNewWork();
    await signInAs(context, LEARNER);

    /* The screen has always said "your teacher will listen". Nothing in the
       product created a verification request, so for every learner that was a
       promise it could not keep: the teacher's queue could only be filled by a
       fixture. This is the journey that makes it true. */
    await page.goto(`/practice?unit=${MAINTENANCE_UNIT}`);
    const send = page.getByTestId("oral-send");
    await expect(send).toBeVisible();
    await send.click();

    await expect(page.getByTestId("practice-requires-human")).toBeVisible();
    await expect(page.getByTestId("practice-asked")).toContainText("in their list");

    const client = new Client({ connectionString: DB });
    await client.connect();
    try {
      const waiting = await client.query(
        `SELECT "unitScope" FROM verification_request
          WHERE "learnerUserId" = $1 AND track = 'hifz' AND state = 'pending'`,
        [LEARNER],
      );
      expect(waiting.rowCount, "a learner who asked is waiting to be heard").toBe(1);
      expect(waiting.rows[0].unitScope).toEqual({ sura: 78, ayahFrom: 9, ayahTo: 9 });
    } finally {
      await client.end();
    }
  });

  test("an unrecorded recitation is said plainly, never faked", async ({ page, context }) => {
    await signInAs(context, LEARNER);
    // A brand-new unit's first rung is a listen, and no reciter's audio is in
    // the package: the screen has to say so rather than show a dead player.
    await page.goto(`/practice?unit=${FRESH_UNIT}`);
    await expect(page.getByTestId("listen-no-audio")).toBeVisible();
  });
});
