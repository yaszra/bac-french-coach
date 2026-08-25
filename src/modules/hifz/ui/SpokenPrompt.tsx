"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { IconButton } from "@/modules/design/ui/controls";
import { policyFor } from "@/modules/design/theme/tier";

/**
 * A prompt read aloud, for children who cannot yet read it.
 *
 * SACRED-CONTENT RULE — the reason this component takes a KEY and not a string:
 * speech synthesis must never touch Qurʾānic text. Recitation is a human reciter
 * or nothing at all. By accepting only a message key, this component can
 * *structurally* speak nothing but interface copy from the learner bundle; there
 * is no parameter through which scripture could be passed in, even by mistake.
 *
 * It also never speaks on its own. A page that starts talking when it loads is
 * startling for a child, is blocked by every browser's autoplay policy anyway,
 * and takes control away from the adult sitting next to them. It speaks when the
 * button is pressed, and not before.
 */
export function SpokenPrompt({
  messageKey,
  params,
  label,
}: {
  readonly messageKey: string;
  readonly params?: Readonly<Record<string, string | number>> | undefined;
  /** Accessible name for the button itself. A key, like everything else. */
  readonly label: string;
}) {
  const { t, locale, tier } = useSurface();
  // Read on the client only: the server has no speechSynthesis, and rendering a
  // button on the server that the device cannot honour would be a lie in HTML.
  const available = useSyncExternalStore(
    subscribeNever,
    () => "speechSynthesis" in window,
    () => false,
  );

  const speak = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(t(messageKey, params));
    // The child's own interface language, never a recitation voice.
    utterance.lang = locale === "ar" ? "ar" : "en";
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [t, messageKey, params, locale]);

  // Only the guided tier gets spoken prompts, and only where the device can
  // actually speak. A button that does nothing is worse than no button.
  if (!policyFor(tier).spokenPrompts || !available) return null;

  return (
    <IconButton label={t(label)} onClick={speak} variant="quiet" icon={<SpeakerGlyph />} />
  );
}

/** Availability never changes within a page's life, so there is nothing to watch. */
function subscribeNever(): () => void {
  return () => {};
}

function SpeakerGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <path
        d="M4 9.5h3.2L11.5 6v12L7.2 14.5H4Z"
        fill="currentColor"
      />
      <path
        d="M15 9.2a4 4 0 0 1 0 5.6M17.6 6.6a7.6 7.6 0 0 1 0 10.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
