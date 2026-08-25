import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { LearnerShell } from "@/modules/design/shells";
import { EmptyState } from "@/modules/design/ui/display";
import { translator } from "@/modules/platform/i18n/translate";
import { pageOf } from "@/modules/content/domain/loader";
import { learnerSnapshot } from "@/modules/hifz/repo/learner-repo";
import { ayahsOfUnit } from "@/modules/hifz/ui/passage";
import { passageInkDepth } from "@/modules/hifz/ui/ink-depth";
import { Lantern } from "@/modules/design/ui/feedback";
import { LEARNER_NAV } from "../nav";
import styles from "./quran.module.css";

/**
 * The learner's own pages.
 *
 * A page appears here because something on it was assigned or practised — this
 * is not a muṣḥaf browser, it is the part of the muṣḥaf that is theirs. Each card
 * shows the page's ink depth, taken from its WEAKEST recorded unit: a page that
 * read "held" on the strength of its first āyah would be a lie about the rest.
 */
export default async function QuranIndexPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);
  const params = await searchParams;
  const view = (Array.isArray(params.view) ? params.view[0] : params.view) === "read" ? "read" : "memory";

  const now = new Date();
  const snapshot = await learnerSnapshot(actor.organizationId, actor.userId, now);
  const byUnit = new Map(snapshot.states.map((state) => [state.unitId, state]));

  // Every unit the learner has met — assigned or recorded — grouped by page.
  const pages = new Map<number, string[]>();
  const unitIds = new Set<string>([
    ...snapshot.scopeUnits.map((unit) => unit.unitId),
    ...snapshot.states.map((state) => state.unitId),
  ]);
  for (const unitId of unitIds) {
    for (const ref of ayahsOfUnit(unitId)) {
      const page = pageOf(ref.surah, ref.ayah);
      if (page === null) continue;
      const existing = pages.get(page) ?? [];
      existing.push(`b:${ref.surah}:${ref.ayah}`);
      pages.set(page, existing);
    }
  }

  const ordered = [...pages.entries()].sort((left, right) => left[0] - right[0]);

  return (
    <LearnerShell active="quran" items={LEARNER_NAV}>
      <div className={styles.page}>
        <div className={styles.inner}>
          <h1 className={styles.title}>{t("learner.quran.title")}</h1>
          <p className={styles.subtitle}>{t("learner.quran.subtitle")}</p>

          {ordered.length === 0 ? (
            <EmptyState
              variant="empty"
              title={t("learner.quran.empty.title")}
              description={t("learner.quran.empty.body")}
              data-testid="quran-empty"
            />
          ) : (
            <div className={styles.grid} data-testid="quran-pages">
              {ordered.map(([page, units]) => (
                <a
                  key={page}
                  className={styles.card}
                  href={`/quran/${page}${view === "read" ? "?view=read" : ""}`}
                  aria-label={t("learner.quran.openPage", { page })}
                >
                  <span className={styles.cardPage}>{t("learner.quran.page", { page })}</span>
                  <Lantern
                    depth={passageInkDepth(
                      [...new Set(units)].map((unitId) => byUnit.get(unitId)),
                      now,
                    )}
                    size="sm"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </LearnerShell>
  );
}
