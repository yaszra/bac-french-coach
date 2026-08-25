"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { Button } from "@/modules/design/ui/controls";

import styles from "./reading.module.css";

export interface NarrationTerm {
  readonly id: string;
  /** The Arabic term, from `content/qaidah/lexicon.json`. A term, never a passage. */
  readonly ar: string;
  readonly translit: string;
  readonly gloss: string;
}

export interface NarrationSegmentView {
  readonly id: string;
  /** English prose from the lesson's narration manifest. */
  readonly en: string;
  readonly terms: readonly NarrationTerm[];
}

/**
 * The lesson's explanation, read aloud.
 *
 * SACRED-CONTENT RULE — what this component speaks, and what it never speaks.
 * It speaks the English prose authored in `content/qaidah/narration/*.json`:
 * explanation, in the interface language, about how a letter is made. It does not
 * speak Arabic. The Arabic terms are *shown*, drawn from the lexicon, so a learner
 * reads `مَخْرَج` while hearing the English sentence that explains it — and no
 * synthesized voice ever produces recitation, because recitation is a human reciter
 * or it is nothing.
 *
 * It also never starts on its own. A page that begins talking when it loads startles a
 * child, is blocked by browser autoplay policy anyway, and takes the moment away from
 * whichever adult is sitting beside them.
 */
export function Narration({ segments }: { readonly segments: readonly NarrationSegmentView[] }) {
  const { t, locale } = useSurface();
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Read on the client only: the server has no speechSynthesis, and a button
  // rendered on the server that the device cannot honour would be a lie in HTML.
  const available = useSyncExternalStore(
    subscribeNever,
    () => "speechSynthesis" in window,
    () => false,
  );

  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback(
    (segment: NarrationSegmentView) => {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(segment.en);
      // The explanation is English prose. It is never given an Arabic voice, because
      // it is never Arabic.
      utterance.lang = "en";
      utterance.rate = 0.92;
      utterance.onend = () => setSpeakingId(null);
      utterance.onerror = () => setSpeakingId(null);
      setSpeakingId(segment.id);
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  const stop = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, []);

  if (segments.length === 0) {
    return <p className={styles.note}>{t("reading.intro.noNarration")}</p>;
  }

  return (
    <div className={styles.panel} data-testid="reading-narration">
      <p className={styles.panelTitle}>{t("reading.intro.heading")}</p>
      <ul className={styles.segments}>
        {segments.map((segment) => (
          <li key={segment.id} className={styles.segment} data-speaking={speakingId === segment.id}>
            <span lang="en">{segment.en}</span>
            {segment.terms.length === 0 ? null : (
              <ul className={styles.terms}>
                {segment.terms.map((term) => (
                  <li key={term.id} className={styles.term}>
                    <span className={styles.termArabic} lang="ar" dir="rtl">
                      {term.ar}
                    </span>
                    <span>{locale === "ar" ? term.translit : term.gloss}</span>
                  </li>
                ))}
              </ul>
            )}
            {available ? (
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => (speakingId === segment.id ? stop() : speak(segment))}
                >
                  {t(speakingId === segment.id ? "reading.intro.stop" : "reading.intro.narrate")}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className={styles.quiet}>{t("reading.intro.voiceNote")}</p>
    </div>
  );
}

/** Availability never changes within a page's life, so there is nothing to watch. */
function subscribeNever(): () => void {
  return () => {};
}
