"use client";

import { useState } from "react";
import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { Button } from "@/modules/design/ui/controls";
import { Dialog, Menu, Sheet, Tooltip } from "@/modules/design/ui/overlays";
import { Family, Specimen } from "./Specimen";

/** Overlays open on interaction, so the default screenshot is the calm state. */
export function OverlaySection() {
  const { t } = useSurface();
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [drawer, setDrawer] = useState(false);

  return (
    <Family name="overlays">
      <Specimen name="Dialog">
        <Button variant="secondary" onClick={() => setDialog(true)}>
          {t("app.name")}
        </Button>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title={t("app.name")}
          description={t("app.tagline")}
          footer={
            <Button variant="primary" onClick={() => setDialog(false)}>
              {t("app.name")}
            </Button>
          }
        >
          {t("state.notYetRecorded")}
        </Dialog>
      </Specimen>

      <Specimen name="Sheet · bottom">
        <Button variant="secondary" onClick={() => setSheet(true)}>
          {t("app.name")}
        </Button>
        <Sheet open={sheet} onClose={() => setSheet(false)} title={t("app.name")}>
          {t("state.notYetRecorded")}
        </Sheet>
      </Specimen>

      <Specimen name="Sheet · inline-start">
        <Button variant="secondary" onClick={() => setDrawer(true)}>
          {t("app.name")}
        </Button>
        <Sheet
          open={drawer}
          onClose={() => setDrawer(false)}
          variant="inline-start"
          title={t("app.name")}
        >
          {t("state.notYetRecorded")}
        </Sheet>
      </Specimen>

      <Specimen name="Menu">
        <Menu
          triggerLabel={t("a11y.menu")}
          items={[
            { id: "today", label: t("nav.today"), textValue: t("nav.today") },
            { id: "quran", label: t("nav.quran"), textValue: t("nav.quran") },
            { id: "reading", label: t("nav.reading"), textValue: t("nav.reading") },
            { id: "settings", label: t("nav.settings"), disabled: true },
          ]}
        />
      </Specimen>

      <Specimen name="Tooltip">
        <Tooltip content={t("app.tagline")}>
          <Button variant="quiet">{t("app.name")}</Button>
        </Tooltip>
      </Specimen>
    </Family>
  );
}
