/**
 * Demo data — progress that is real, because it was earned.
 *
 * `seed_dev.ts` deliberately writes no memory state: progress in Itqān exists
 * only as a consequence of evidence. That is the right default, and it makes
 * every screen show its empty state, which is exactly what you want when
 * checking that the empty states are honest — and useless when you want to see
 * what the product looks like in use.
 *
 * So this script does not write progress. It writes a plausible HISTORY —
 * attempts a learner made, verdicts a teacher gave — and then runs the real
 * projection over it. The memory state that appears is genuinely derived: the
 * same code path a real learner takes, with the same scheduler, producing the
 * same due dates. Nothing here can show a state the product could not reach.
 *
 *   pnpm exec tsx scripts/seed_demo.ts [--days 45]
 */
import { PrismaClient } from "@prisma/client";
import { memoryProjection } from "../src/modules/memory/repo/memory-projection";
import { gradeAttempt, reviewEvidenceOf } from "../src/modules/hifz/domain/grading";
import { mulberry32 } from "../src/modules/memory/domain/simulate";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL or DIRECT_DATABASE_URL is required");
const db = new PrismaClient({ datasources: { db: { url } } });

const ORG = "org_seed_madrasah";
const DAYS = Number(process.argv[process.argv.indexOf("--days") + 1]) || 45;

/**
 * Three learners who are genuinely different, so the screens have something to
 * distinguish. None of them is a fabricated success story.
 */
const LEARNERS = [
  { id: "u_seed_kid", label: "steady", skill: 0.78, sessionsPerWeek: 5, sura: 78, ayahs: [1, 2, 3, 4, 5] },
  { id: "u_seed_teen", label: "fast forgetter", skill: 0.55, sessionsPerWeek: 3, sura: 78, ayahs: [1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "u_seed_adult", label: "returning", skill: 0.86, sessionsPerWeek: 6, sura: 2, ayahs: [255, 256, 257] },
] as const;

const EXERCISES = ["listen", "recall_first", "rebuild", "gap_fill", "next_ayah_cue"] as const;

function evidenceFor(
  exercise: (typeof EXERCISES)[number],
  success: boolean,
  random: () => number,
  cueRef: string,
) {
  const wordCount = 6 + Math.floor(random() * 6);
  switch (exercise) {
    case "listen":
      return { exercise, playedMs: 12_000, ayahDurationMs: 12_000, replays: success ? 0 : 2 };
    case "recall_first":
      return {
        exercise,
        producedWordCount: success ? wordCount : Math.floor(wordCount * 0.4),
        expectedWordCount: wordCount,
        revealedAfterMs: success ? null : 4_000,
        hintsUsed: success ? 0 : 2,
      };
    case "rebuild":
      return {
        exercise,
        placements: Array.from({ length: wordCount }, (_, index) => ({
          index,
          correct: success || index < wordCount / 2,
        })),
        rescrambles: success ? 0 : wordCount,
        elapsedMs: success ? 9_000 : 45_000,
      };
    case "gap_fill":
      return {
        exercise,
        gaps: Array.from({ length: 3 }, (_, wordIndex) => ({
          wordIndex,
          correct: success,
          attempts: success ? 1 : 3,
        })),
      };
    case "next_ayah_cue":
      return {
        exercise,
        // A reference, not a number: the schema refuses free text and refuses
        // integers, which is why every cue attempt here was silently skipped
        // until this was fixed. The grader was right; the seed was wrong.
        cueAyah: cueRef,
        producedFirstWords: success,
        latencyMs: success ? 1_400 : 9_000,
        hintsUsed: success ? 0 : 1,
      };
  }
}

async function main(): Promise<void> {
  const random = mulberry32(20260823);
  const now = new Date();
  let events = 0;
  let verdicts = 0;

  for (const learner of LEARNERS) {
    const profile = await db.learnerProfile.findUnique({ where: { userId: learner.id } });
    if (!profile) {
      console.log(`[demo] ${learner.id} is not seeded — run scripts/seed_dev.ts first`);
      continue;
    }

    for (let dayOffset = DAYS; dayOffset >= 0; dayOffset--) {
      // Nobody practises every day, and pretending otherwise makes every streak
      // and every report look unlike a real learner's.
      if (random() > learner.sessionsPerWeek / 7) continue;

      const at = new Date(now.getTime() - dayOffset * 24 * 3_600_000 + 18 * 3_600_000);

      for (const [position, ayah] of learner.ayahs.entries()) {
        const exercise = EXERCISES[Math.floor(random() * EXERCISES.length)]!;

        /* Which unit an exercise is evidence ABOUT.
         *
         * A next-āyah cue does not test the āyah, it tests the seam between two
         * of them — and the seam is where ḥifẓ actually fails. Recording it
         * against the body would hide exactly the thing the memory graph exists
         * to find, and would leave the teacher's weak-join list permanently
         * empty while the learner kept stumbling at the same join. */
        const next = learner.ayahs[position + 1];
        const testsTheSeam = exercise === "next_ayah_cue" && next !== undefined;
        const unitId = testsTheSeam
          ? `t:${learner.sura}:${ayah}>${learner.sura}:${next}`
          : `b:${learner.sura}:${ayah}`;
        const unitKind = testsTheSeam ? "ayah_transition" : "ayah_body";
        // Later āyahs are newer, so they are held less well — which is what a
        // learner's page actually looks like.
        const familiarity = 1 - position / (learner.ayahs.length + 2);
        // A seam is harder than either āyah it joins. Without this the demo
        // would show joins stronger than the passages they connect, which is
        // the opposite of how ḥifẓ behaves.
        const difficulty = testsTheSeam ? 0.65 : 1;
        const success = random() < learner.skill * familiarity * difficulty;

        const graded = gradeAttempt(
          evidenceFor(exercise, success, random, `${learner.sura}:${ayah}`) as never,
          {},
        );
        if (graded.kind !== "graded") continue;
        const review = reviewEvidenceOf(exercise, graded, at);
        if (!review) continue;

        const key = `demo:${learner.id}:${unitId}:${dayOffset}:${exercise}`;
        const created = await db.learningEvent
          .create({
            data: {
              organizationId: ORG,
              learnerUserId: learner.id,
              type: "attempt.recorded",
              unitId,
              idempotencyKey: key,
              payload: { unitId, unitKind, retrievalType: review.retrievalType, grade: review.grade },
              occurredAt: at,
              source: "web",
            },
          })
          .catch(() => null);
        if (!created) continue;
        events++;

        await memoryProjection.apply(
          {
            id: created.id,
            organizationId: ORG,
            learnerUserId: learner.id,
            type: "attempt.recorded",
            unitId,
            payload: created.payload,
            occurredAt: at,
            recordedAt: created.recordedAt,
          },
          { db } as never,
        );
      }

      // A teacher listens roughly once a week. Only these verify anything.
      if (random() < 0.15) {
        const heard = learner.ayahs.slice(0, 2).map((ayah) => `b:${learner.sura}:${ayah}`);
        const key = `demo:verdict:${learner.id}:${dayOffset}`;
        const created = await db.learningEvent
          .create({
            data: {
              organizationId: ORG,
              learnerUserId: learner.id,
              type: "verdict.given",
              idempotencyKey: key,
              payload: {
                verdict: random() < 0.75 ? "passed" : "needs_work",
                unitIds: heard,
                corrections: [],
                decidedByUserId: "u_seed_teacher",
              },
              occurredAt: at,
              source: "teacher_console",
            },
          })
          .catch(() => null);
        if (!created) continue;
        verdicts++;

        await memoryProjection.apply(
          {
            id: created.id,
            organizationId: ORG,
            learnerUserId: learner.id,
            type: "verdict.given",
            unitId: null,
            payload: created.payload,
            occurredAt: at,
            recordedAt: created.recordedAt,
          },
          { db } as never,
        );
      }
    }

    // One learner is left waiting for an ear, because a teacher's inbox with
    // nothing in it teaches nothing about the teacher's console.
    await db.verificationRequest
      .create({
        data: {
          id: `demo_verification_${learner.id}`,
          organizationId: ORG,
          learnerUserId: learner.id,
          track: "hifz",
          unitScope: { sura: learner.sura, ayahFrom: learner.ayahs[0], ayahTo: learner.ayahs.at(-1) },
          requestedAt: new Date(now.getTime() - 2 * 24 * 3_600_000),
          state: "pending",
        },
      })
      .catch(() => null);
  }

  const states = await db.memoryState.count({ where: { organizationId: ORG } });
  const verified = await db.memoryState.count({ where: { organizationId: ORG, verifiedAt: { not: null } } });

  console.log(
    `[demo] ${events} attempts and ${verdicts} verdicts over ${DAYS} days → ` +
      `${states} memory states, ${verified} of them verified by a teacher`,
  );
  console.log("[demo] every one of those states was derived by the real projection from real events");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
