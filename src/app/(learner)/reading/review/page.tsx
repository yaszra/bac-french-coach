import { redirect } from "next/navigation";

import { getCaller } from "@/modules/identity/actions/session-context";
import { translator } from "@/modules/platform/i18n/translate";
import {
  dueConceptIds,
  getReadingPath,
  getReadingSitting,
} from "@/modules/reading/actions/reading-session";

import { Sitting } from "../Sitting";
import { sittingIdFrom } from "../href";

/**
 * Review.
 *
 * Reading concepts come round on the same scheduler as ḥifẓ: every recorded activity
 * is folded into memory state in the transaction that recorded it, so a concept's due
 * date moves the moment the evidence exists. This page asks which concepts have come
 * round and hands exactly those to the planner.
 *
 * Nothing due is a legitimate answer and it is the one given — never a padded queue.
 */
export default async function ReadingReviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);
  const tier = actor.tier ?? "adult";

  const query = await searchParams;
  const requested = Array.isArray(query.sit) ? query.sit[0] : query.sit;
  const sessionId = sittingIdFrom(requested);

  const path = await getReadingPath(actor.organizationId, actor.userId, tier);
  const due = dueConceptIds(path);

  const view = await getReadingSitting(actor.organizationId, actor.userId, {
    tier,
    conceptIds: due,
    sessionId,
    now: path.now,
  });

  return (
    <Sitting
      view={view}
      learnerUserId={actor.userId}
      title={t("reading.review.title")}
      emptyTitle={t("reading.review.none.title")}
      emptyBody={t("reading.review.none.body")}
      narration={[]}
      t={t}
    />
  );
}
