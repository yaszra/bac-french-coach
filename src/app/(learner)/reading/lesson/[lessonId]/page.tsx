import { notFound, redirect } from "next/navigation";

import { getCaller } from "@/modules/identity/actions/session-context";
import { translator } from "@/modules/platform/i18n/translate";
import { getReadingSitting } from "@/modules/reading/actions/reading-session";
import { qaidahLesson, narrationFor, qaidahLexicon } from "@/modules/reading/repo/lesson-content";
import type { NarrationSegmentView } from "@/modules/reading/ui/Narration";

import { Sitting } from "../../Sitting";
import { sittingIdFrom } from "../../href";

/**
 * One lesson, worked through.
 *
 * The intro is animated and narrated, the practice items come from the planner, and
 * the whole thing is capped by the tier's minutes — ten for a child, and the engine
 * enforces that ceiling rather than this page trusting itself to remember it.
 *
 * Narration is English prose from the content package, spoken by a synthesized voice
 * on the client; the Arabic terms beside it come from the lexicon and are shown, never
 * synthesized. No recitation is produced anywhere on this path.
 */
export default async function ReadingLessonPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly lessonId: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);

  const { lessonId } = await params;
  const lesson = qaidahLesson(lessonId);
  if (lesson === null) notFound();

  const query = await searchParams;
  const requested = Array.isArray(query.sit) ? query.sit[0] : query.sit;
  const sessionId = sittingIdFrom(requested);

  const view = await getReadingSitting(actor.organizationId, actor.userId, {
    tier: actor.tier ?? "adult",
    conceptIds: lesson.conceptIds,
    sessionId,
  });

  const manifest = narrationFor(lesson.id);
  const narration: readonly NarrationSegmentView[] =
    manifest === null
      ? []
      : manifest.segments.map((segment) => ({
          id: segment.id,
          en: segment.en,
          // Terms are matched back to the lexicon by their Arabic form, so a term the
          // lexicon does not carry is simply not shown rather than shown unglossed.
          terms: segment.terms.flatMap((arabic) => {
            const term = termByArabic(arabic);
            return term === null ? [] : [term];
          }),
        }));

  return (
    <Sitting
      view={view}
      learnerUserId={actor.userId}
      title={t(lesson.titleKey)}
      emptyTitle={t("reading.practice.empty.title")}
      emptyBody={t("reading.practice.empty.body")}
      narration={narration}
      t={t}
    />
  );
}

/**
 * A narration manifest names its terms by their Arabic form; the lexicon is keyed by
 * id. Matching on the Arabic keeps both files readable, and a term the lexicon does
 * not carry is simply not shown rather than shown without its gloss.
 */
function termByArabic(arabic: string): NarrationSegmentView["terms"][number] | null {
  return qaidahLexicon().find((term) => term.ar === arabic) ?? null;
}
