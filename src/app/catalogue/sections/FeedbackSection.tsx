"use client";

import { useState } from "react";
import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { Button } from "@/modules/design/ui/controls";
import { INK_DEPTHS } from "@/modules/design/ui/mushaf";
import { Lantern, Tile, Toast, useToasts, type ToastTone } from "@/modules/design/ui/feedback";
import { Family, Specimen } from "./Specimen";

const TONES: readonly ToastTone[] = ["neutral", "success", "caution", "danger"];

/**
 * The feedback family.
 *
 * Tile text is Arabic in the product — here it is a translated interface word,
 * because this file may not author scripture. The tiles below demonstrate the
 * chrome and the keyboard flow, nothing more.
 */
export function FeedbackSection() {
  const { t } = useSurface();
  const toasts = useToasts();
  const [picked, setPicked] = useState(false);

  return (
    <Family name="feedback">
      <Specimen name="Lantern · depth 0–5">
        {INK_DEPTHS.map((depth) => (
          <Lantern key={depth} depth={depth} />
        ))}
      </Specimen>

      <Specimen name="Lantern · size">
        <Lantern depth={3} size="sm" />
        <Lantern depth={3} size="md" />
        <Lantern depth={3} size="lg" />
      </Specimen>

      <Specimen name="Tile · state">
        <Tile text={t("nav.today")} lang="en" slot={1} ayah={1} />
        <Tile text={t("nav.quran")} lang="en" slot={2} ayah={1} state="placed" />
        <Tile text={t("nav.reading")} lang="en" slot={3} ayah={1} state="wrong" />
        <Tile text={t("nav.practice")} lang="en" slot={4} ayah={1} state="disabled" />
      </Specimen>

      <Specimen name="Tile · picked">
        <Tile
          text={t("nav.me")}
          lang="en"
          slot={1}
          ayah={2}
          picked={picked}
          onPickUp={() => setPicked(true)}
          onPlace={() => setPicked(false)}
          onCancel={() => setPicked(false)}
          onSelect={() => setPicked((current) => !current)}
        />
      </Specimen>

      <Specimen name="Toast · tone" column>
        {TONES.map((tone) => (
          <Toast
            key={tone}
            id={`specimen-${tone}`}
            messageKey="state.pendingSync"
            tone={tone}
            durationMs={0}
            onDismiss={() => undefined}
          />
        ))}
      </Specimen>

      <Specimen name="ToastRegion · push">
        <Button
          variant="secondary"
          onClick={() => toasts.push({ messageKey: "state.offline", tone: "caution" })}
        >
          {t("state.offline")}
        </Button>
      </Specimen>
    </Family>
  );
}
