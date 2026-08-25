import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { LearnerShell } from "@/modules/design/shells";
import { LinkButton } from "@/modules/design/ui/controls";
import { EmptyState } from "@/modules/design/ui/display";
import { MushafPage, PageFrame } from "@/modules/design/ui/mushaf";
import { translator } from "@/modules/platform/i18n/translate";
import { getPage } from "@/modules/content/domain/loader";
import { segmentWords } from "@/modules/hifz/ui/words";
import { learnerSnapshot } from "@/modules/hifz/repo/learner-repo";
import { inkDepthOf, wordDepthFor, isQuranView, type QuranView } from "@/modules/hifz/ui/ink-depth";
import { buildPageModel, type AyahWords } from "@/modules/hifz/ui/page-model";
import { LEARNER_NAV } from "../../nav";
import styles from "../quran.module.css";

/**
 * One muṣḥaf page, drawn in the ink this learner has earned.
 *
 * Two views, one tap apart:
 *
 *   **memory** — every word at the depth its āyah's memory state supports. A
 *   word at depth 0 keeps its space and is announced as present-and-unearned;
 *   it is never silently dropped.
 *
 *   **read** — full ink, always. Reading is not testing: someone opening the
 *   muṣḥaf to read gets the whole page whatever their memory says, and nothing
 *   they do here is recorded as evidence.
 *
 * The page itself is undecorated, untinted and unanimated, per the muṣḥaf rules.
 */
export default async function QuranPagePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly page: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);

  const { page: rawPage } = await params;
  const query = await searchParams;
  const requestedView = Array.isArray(query.view) ? query.view[0] : query.view;
  const view: QuranView = isQuranView(requestedView) ? requestedView : "memory";

  const pageNumber = Number.parseInt(rawPage, 10);
  const content = Number.isInteger(pageNumber) ? getPage(pageNumber) : null;

  const shell = (children: React.ReactNode) => (
    <LearnerShell active="quran" items={LEARNER_NAV}>
      {children}
    </LearnerShell>
  );

  if (content === null) {
    return shell(
      <EmptyState
        variant="not-yet-recorded"
        title={t("learner.quran.notYetRecorded.title")}
        description={t("learner.quran.notYetRecorded.body")}
        action={
          <LinkButton href="/quran" variant="secondary">
            {t("learner.quran.title")}
          </LinkButton>
        }
      />,
    );
  }

  const now = new Date();
  const snapshot = await learnerSnapshot(actor.organizationId, actor.userId, now);
  const byUnit = new Map(snapshot.states.map((state) => [state.unitId, state]));

  const ayahs: readonly AyahWords[] = content.ayahs.map((verse) => {
    const memoryDepth = inkDepthOf(byUnit.get(`b:${verse.sura}:${verse.ayah}`), now);
    return {
      ayah: verse.ayah,
      words: segmentWords(verse.text),
      depth: wordDepthFor(view, memoryDepth),
    };
  });

  const model = buildPageModel({ ayahs });
  const other: QuranView = view === "read" ? "memory" : "read";

  return shell(
    <div className={styles.reader}>
      <div className={styles.readerBar}>
        <div>
          <p className={styles.notice}>
            {t(view === "read" ? "learner.quran.readNotice" : "learner.quran.memoryNotice")}
          </p>
        </div>
        <div className={styles.readerViews}>
          <LinkButton
            href={`/quran/${pageNumber}${other === "read" ? "?view=read" : ""}`}
            variant="secondary"
            size="sm"
            data-testid="quran-toggle-view"
          >
            {t(other === "read" ? "learner.quran.readView" : "learner.quran.memoryView")}
          </LinkButton>
        </div>
      </div>

      <div className={styles.sheet}>
        <PageFrame page={content.page} dense>
          <MushafPage lines={model.lines} />
        </PageFrame>
      </div>
    </div>,
  );
}
