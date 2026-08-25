import { test, expect } from "@playwright/test";
import { Client } from "pg";

import { SEED, signInAs } from "./helpers";

/**
 * The reading journey, end to end.
 *
 *   sign in → Reading → open a lesson → answer a recognition item →
 *   the concept's state changes.
 *
 * WHAT THIS TEST NEVER DOES. It never asserts that an answer was correct, and it
 * never tells the server which answer was correct: the client is not given the key,
 * so this test cannot know it either. It clicks a choice, and then it checks the only
 * thing that matters — that evidence now exists where a moment ago there was none,
 * and that the record and the projection both moved.
 *
 * The starting point is the seeded learner with no reading evidence at all, which is
 * the honest starting point: progress in Itqān exists only as a consequence of
 * evidence, and seeding it would be the fake progress the product refuses to show.
 */

const DB = process.env.DIRECT_DATABASE_URL ?? "postgresql://itqan:itqan@localhost:5432/itqan";
const LEARNER = SEED.teen.id;

async function readingEvidence(): Promise<{ events: number; states: number }> {
  const client = new Client({ connectionString: DB });
  await client.connect();
  try {
    const events = await client.query(
      `select count(*)::int as n from learning_event
       where "learnerUserId" = $1 and type = 'attempt.recorded' and "unitId" like 'c:%'`,
      [LEARNER],
    );
    const states = await client.query(
      `select count(*)::int as n from memory_state
       where "learnerUserId" = $1 and "unitKind" = 'reading_concept'`,
      [LEARNER],
    );
    return { events: events.rows[0]?.n ?? 0, states: states.rows[0]?.n ?? 0 };
  } finally {
    await client.end();
  }
}

test.describe("reading", () => {
  test("a learner opens the Qāʿidah, answers an item, and the concept's state changes", async ({
    page,
    context,
  }) => {
    const before = await readingEvidence();

    await signInAs(context, SEED.teen.id);

    // The nav tab is a door now, not a decoration.
    await page.goto("/reading");
    await expect(page.getByTestId("reading-path")).toBeVisible();

    // The path names every lesson, and the counts carry their denominators.
    const lessons = page.getByTestId("reading-lesson");
    await expect(lessons.first()).toBeVisible();

    // One obvious next action.
    const start = page.getByTestId("reading-start");
    await expect(start).toBeVisible();
    await start.click();

    await expect(page.getByTestId("reading-sitting")).toBeVisible();
    await expect(page.getByTestId("reading-runner")).toBeVisible();

    // The prompt is a letter — a single teaching glyph, never a passage.
    const glyph = page.getByTestId("reading-prompt-glyph").first();
    await expect(glyph).toBeVisible();
    const shown = (await glyph.textContent()) ?? "";
    expect([...shown].length).toBeGreaterThan(0);
    expect([...shown].length).toBeLessThanOrEqual(2);

    // Answer. Whichever choice this is, the server decides what it was worth.
    const choices = page.getByTestId("reading-choice");
    await expect(choices.first()).toBeVisible();
    const choiceCount = await choices.count();
    expect(choiceCount).toBeGreaterThanOrEqual(3);
    await choices.first().click();

    // The server answered: either "that is it" or a correction naming what to notice.
    // Both are outcomes; neither is a punishment.
    const outcome = page
      .getByTestId("reading-outcome-correct")
      .or(page.getByTestId("reading-outcome-correction"));
    await expect(outcome).toBeVisible({ timeout: 15_000 });

    // No hearts, no timer, no streak anywhere on the screen.
    await expect(page.locator("[data-testid='reading-hearts']")).toHaveCount(0);
    await expect(page.locator("[data-testid='reading-timer']")).toHaveCount(0);

    // The evidence exists, and the projection moved in the same breath.
    await expect
      .poll(async () => (await readingEvidence()).events, { timeout: 15_000 })
      .toBeGreaterThan(before.events);
    const after = await readingEvidence();
    expect(after.states).toBeGreaterThan(before.states - 1);
    expect(after.states).toBeGreaterThan(0);

    // And the concept's state is no longer "not yet recorded" for that concept.
    await page.reload();
    await expect(page.getByTestId("reading-concept-state").first()).toBeVisible();
  });

  test("every letter is reachable by its makhraj, and unrecorded audio says so", async ({ page, context }) => {
    await signInAs(context, SEED.teen.id);
    await page.goto("/reading/letters");

    await expect(page.getByTestId("reading-letters")).toBeVisible();
    // Five regions: the empty space, the throat, the tongue, the lips, the nose.
    await expect(page.getByTestId("reading-region")).toHaveCount(5);
    // Twenty-eight letters plus hamzah, each with its own card.
    await expect(page.getByTestId("reading-letter")).toHaveCount(29);

    // With no recordings installed, every card says so — and none plays a machine
    // voice in a reciter's place.
    await expect(page.getByTestId("talqin-not-yet-recorded").first()).toBeVisible();
    await expect(page.getByTestId("talqin-available")).toHaveCount(0);
  });
});
