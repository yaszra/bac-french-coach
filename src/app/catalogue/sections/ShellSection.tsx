"use client";

import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { Button } from "@/modules/design/ui/controls";
import { Badge } from "@/modules/design/ui/display";
import { MushafPage, PageFrame } from "@/modules/design/ui/mushaf";
import { Tile } from "@/modules/design/ui/feedback";
import { LearnerShell, PaneLayout, ParentShell, TeacherShell } from "@/modules/design/shells";
import { Family, Specimen } from "./Specimen";
import styles from "../catalogue.module.css";

/**
 * Shells are 100dvh by design, so the catalogue frames each one in a fixed
 * box through --shell-block-size rather than letting it swallow the page.
 */
export function ShellSection() {
  const { t, locale } = useSurface();

  const filler = <div className={styles.previewFill}>{t("state.notYetRecorded")}</div>;

  return (
    <Family name="shells">
      <Specimen name="LearnerShell · PaneLayout" wide column>
        <div className={styles.shellPreview}>
          <LearnerShell
            active="quran"
            items={[
              { id: "today", badge: <Badge tone="accent">{t("nav.today")}</Badge> },
              { id: "quran" },
              { id: "reading" },
              { id: "practice" },
              { id: "me" },
            ]}
          >
            <PaneLayout
              page={
                <PageFrame page={1} dense header={<span>{t("state.notYetRecorded")}</span>}>
                  <MushafPage lines={[]} />
                </PageFrame>
              }
              exercise={
                <div className={styles.stage}>
                  <Tile text={t("nav.today")} lang={locale} slot={1} ayah={1} />
                  <Tile text={t("nav.quran")} lang={locale} slot={2} ayah={1} />
                  <Tile text={t("nav.reading")} lang={locale} slot={3} ayah={1} />
                </div>
              }
              context={filler}
              actionRow={<Button variant="primary">{t("app.name")}</Button>}
            />
          </LearnerShell>
        </div>
      </Specimen>

      <Specimen name="TeacherShell" wide column>
        <div className={styles.shellPreview}>
          <TeacherShell active="triage" activeClass={t("app.name")}>
            {filler}
          </TeacherShell>
        </div>
      </Specimen>

      <Specimen name="ParentShell" wide column>
        <div className={styles.shellPreview}>
          <ParentShell active="tonight" header={t("app.name")}>
            {filler}
          </ParentShell>
        </div>
      </Specimen>
    </Family>
  );
}
