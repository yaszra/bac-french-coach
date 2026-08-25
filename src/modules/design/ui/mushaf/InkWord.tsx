"use client";

import { useId, type KeyboardEventHandler, type Ref } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import type { InkDepth, InkWordState } from "./types";
import styles from "./InkWord.module.css";

export type InkWordProps = {
  /**
   * The word, byte-for-byte from the content package. NEVER authored, completed
   * or corrected by this component.
   */
  readonly text: string;
  /** Server-issued memory strength. The client never decides this. */
  readonly depth: InkDepth;
  /** 1-based position of the word within its āyah. */
  readonly index: number;
  /** 1-based āyah number. */
  readonly ayah: number;
  readonly state?: InkWordState | undefined;
  /** Scaffolded review: show a depth-0 word without changing what was earned. */
  readonly revealed?: boolean | undefined;
  /** Scripture is `ar`; the catalogue may render Latin placeholders as `en`. */
  readonly lang?: "ar" | "en" | undefined;
  readonly tabIndex?: number | undefined;
  readonly disabled?: boolean | undefined;
  readonly id?: string | undefined;
  readonly onSelect?: ((word: { readonly ayah: number; readonly index: number }) => void) | undefined;
  readonly onKeyDown?: KeyboardEventHandler<HTMLButtonElement> | undefined;
  readonly ref?: Ref<HTMLButtonElement> | undefined;
};

/**
 * One word of the muṣḥaf, rendered as a real button — muṣḥaf words are
 * operable, so they are buttons, not spans with handlers.
 *
 * Ink depth expresses memory strength as the alpha of the single ink colour.
 * Depth 0 leaves the word's space blank; screen-reader users are told a word
 * is there and that it is not yet earned, so nothing is silently hidden.
 */
export function InkWord({
  text,
  depth,
  index,
  ayah,
  state = "idle",
  revealed = false,
  lang = "ar",
  tabIndex,
  disabled,
  id,
  onSelect,
  onKeyDown,
  ref,
}: InkWordProps) {
  const { t } = useSurface();
  const descriptionId = useId();
  const hidden = depth === 0 && !revealed;
  const renderedDepth: InkDepth = revealed && depth === 0 ? 5 : depth;

  return (
    <span className={styles.slot}>
      <button
        ref={ref}
        id={id}
        type="button"
        className={styles.word}
        lang={lang}
        dir={lang === "ar" ? "rtl" : "ltr"}
        data-depth={renderedDepth}
        data-earned={depth}
        data-state={state}
        data-hidden={hidden ? "true" : undefined}
        data-revealed={revealed ? "true" : undefined}
        data-ayah={ayah}
        data-index={index}
        tabIndex={tabIndex}
        disabled={disabled}
        aria-label={hidden ? t("a11y.wordInAyah", { index, ayah }) : undefined}
        aria-describedby={hidden ? descriptionId : undefined}
        onClick={onSelect ? () => onSelect({ ayah, index }) : undefined}
        onKeyDown={onKeyDown}
      >
        <span className={styles.glyph} aria-hidden={hidden ? true : undefined}>
          {text}
        </span>
      </button>
      {hidden ? (
        <span id={descriptionId} className={styles.srOnly}>
          {t("a11y.inkDepth", { depth })}
        </span>
      ) : null}
    </span>
  );
}
