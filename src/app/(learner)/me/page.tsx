import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { signOut } from "@/modules/identity/actions/sign-in";
import { LearnerShell } from "@/modules/design/shells";
import { Button } from "@/modules/design/ui/controls";
import { Badge } from "@/modules/design/ui/display";
import { policyFor } from "@/modules/design/theme/tier";
import { translator } from "@/modules/platform/i18n/translate";
import { countHeldUnits } from "@/modules/memory/repo/memory-state-repo";
import { SyncBanner } from "../SyncBanner";
import { LEARNER_NAV } from "../nav";
import styles from "../today/today.module.css";

/**
 * The learner's own corner.
 *
 * Children never reach this screen — the kids surface has three doors and no
 * settings, by tier policy — so it carries a sign-out and one honest number:
 * how much is held, out of how much is recorded. Never a percentage on its own.
 */
export default async function MePage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);
  const policy = policyFor(actor.tier ?? "adult");
  if (!policy.allowsSettings) redirect("/today");

  const held = await countHeldUnits(actor.organizationId, actor.userId);

  return (
    <LearnerShell active="me" items={LEARNER_NAV}>
      <div className={styles.page}>
        <div className={styles.inner}>
          <header>
            <p className={styles.eyebrow}>{t("app.name")}</p>
            <h1 className={styles.greeting}>{actor.displayName}</h1>
          </header>

          <SyncBanner />

          <div className={styles.panel}>
            <p className={styles.panelTitle}>{t("progress.held")}</p>
            <div className={styles.row}>
              {held.total === 0 ? (
                <Badge tone="neutral">{t("state.notYetRecorded")}</Badge>
              ) : (
                <span data-testid="me-held">
                  {t("progress.ofReviewed", { done: held.held, total: held.total })}
                </span>
              )}
            </div>
          </div>

          <form action={signOut}>
            <Button type="submit" variant="quiet">
              {t("learner.signIn.title")}
            </Button>
          </form>
        </div>
      </div>
    </LearnerShell>
  );
}
