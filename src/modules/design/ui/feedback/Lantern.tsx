"use client";

import { useId } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import type { InkDepth } from "../mushaf/types";
import styles from "./Lantern.module.css";

export type LanternProps = {
  /** Server-issued memory strength — the same 0–5 ladder as the ink. */
  readonly depth: InkDepth;
  readonly size?: "sm" | "md" | "lg" | undefined;
  /** Accessible name. Defaults to `a11y.inkDepth`. */
  readonly label?: string | undefined;
};

/** Glass fills from the base as strength grows: progress readable without text. */
const LIGHT_LEVEL: Readonly<Record<InkDepth, number>> = {
  0: 0,
  1: 0.22,
  2: 0.4,
  3: 0.58,
  4: 0.76,
  5: 1,
};

const GLASS_TOP = 13;
const GLASS_BOTTOM = 33;

/**
 * The lantern a child reads instead of a number: its light is the ink depth.
 *
 * Two cues, never one — the light's alpha AND how far the glass has filled —
 * so strength survives greyscale, low vision and no text at all. Nothing
 * flickers, nothing bounces; under reduced motion even the fade is off.
 */
export function Lantern({ depth, size = "md", label }: LanternProps) {
  const { t } = useSurface();
  const clipId = useId();
  const level = LIGHT_LEVEL[depth];
  const height = (GLASS_BOTTOM - GLASS_TOP) * level;

  return (
    <svg
      className={styles.lantern}
      data-depth={depth}
      data-size={size}
      viewBox="0 0 32 44"
      role="img"
      aria-label={label ?? t("a11y.inkDepth", { depth })}
      focusable="false"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="8" y={GLASS_TOP} width="16" height={GLASS_BOTTOM - GLASS_TOP} rx="3" />
        </clipPath>
      </defs>

      {/* the light, held inside the glass */}
      {height > 0 ? (
        <rect
          className={styles.light}
          x="8"
          y={GLASS_BOTTOM - height}
          width="16"
          height={height}
          clipPath={`url(#${clipId})`}
        />
      ) : null}

      {/* handle, cap, glass, base — plain geometry, no ornament */}
      <path className={styles.housing} d="M12 7a4 4 0 0 1 8 0" />
      <path className={styles.housing} d="M9.5 10.5h13l-1.5 2.5h-10Z" />
      <rect className={styles.glass} x="8" y={GLASS_TOP} width="16" height={GLASS_BOTTOM - GLASS_TOP} rx="3" />
      <path className={styles.housing} d="M9.5 34.5h13l1.5 2.5h-16Z" />
    </svg>
  );
}
