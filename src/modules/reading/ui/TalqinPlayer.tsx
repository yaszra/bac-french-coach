"use client";

import { useCallback, useRef } from "react";

import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { Button } from "@/modules/design/ui/controls";
import { Badge } from "@/modules/design/ui/display";

import styles from "./reading.module.css";

export type TalqinView =
  | {
      readonly kind: "resolved";
      readonly src: string;
      readonly provenanceLabelKey: string;
      readonly isMachineVoice: boolean;
    }
  | { readonly kind: "not_yet_recorded"; readonly reasonKey: string };

/**
 * The model pronunciation, or the honest absence of one.
 *
 * Two rules, both visible in the markup below:
 *
 * 1. **Audio always wears its label.** A resolved recording is rendered beside a badge
 *    naming where it came from — a person, the reciters' library, or studio audio a
 *    named person reviewed. There is no unlabelled branch to fall into.
 * 2. **Nothing stands in for a reciter.** When nothing is recorded, this says so and
 *    offers the next step: ask a teacher to record it. It does not synthesize a
 *    letter, and it does not quietly play something else.
 */
export function TalqinPlayer({
  talqin,
  compact = false,
}: {
  readonly talqin: TalqinView;
  /** A single line, for a grid of letters rather than a lesson pane. */
  readonly compact?: boolean | undefined;
}) {
  const { t } = useSurface();
  const audio = useRef<HTMLAudioElement | null>(null);

  const play = useCallback(() => {
    void audio.current?.play();
  }, []);

  if (talqin.kind === "not_yet_recorded" && compact) {
    return (
      <span className={styles.quiet} data-testid="talqin-not-yet-recorded">
        {t("reading.talqin.notYetRecorded.title")}
      </span>
    );
  }

  if (talqin.kind === "not_yet_recorded") {
    return (
      <div className={styles.panel} data-testid="talqin-not-yet-recorded">
        <p className={styles.panelTitle}>{t("reading.talqin.heading")}</p>
        <p className={styles.note}>{t("reading.talqin.notYetRecorded.body")}</p>
        <p className={styles.quiet}>{t("reading.talqin.notYetRecorded.title")}</p>
      </div>
    );
  }

  if (compact) {
    return (
      <span className={styles.row} data-testid="talqin-available">
        <Button variant="quiet" size="sm" onClick={play}>
          {t("reading.talqin.play")}
        </Button>
        <Badge tone={talqin.isMachineVoice ? "caution" : "neutral"}>{t(talqin.provenanceLabelKey)}</Badge>
        <audio ref={audio} src={talqin.src} preload="none" />
      </span>
    );
  }

  return (
    <div className={styles.panel} data-testid="talqin-available">
      <p className={styles.panelTitle}>{t("reading.talqin.heading")}</p>
      <div className={styles.row}>
        <Button variant="secondary" size="sm" onClick={play}>
          {t("reading.talqin.play")}
        </Button>
        <Badge tone={talqin.isMachineVoice ? "caution" : "neutral"}>
          {t(talqin.provenanceLabelKey)}
        </Badge>
      </div>
      <audio ref={audio} src={talqin.src} preload="none" />
    </div>
  );
}
