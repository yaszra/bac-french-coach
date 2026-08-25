import { formatMushafNumeral } from "./numerals";
import styles from "./AyahRosette.module.css";

export type AyahRosetteProps = {
  /** 1-based āyah number. */
  readonly ayah: number;
  /**
   * Preformatted numeral — pass the string the layout file carries when there
   * is one. Otherwise the rosette formats `ayah` in Arabic-Indic digits, which
   * is what a muṣḥaf prints whatever language the interface speaks.
   */
  readonly text?: string;
  /** Accessible name. Defaults to the numeral itself. */
  readonly label?: string;
  readonly size?: "sm" | "md";
};

/**
 * The āyah-number rosette, rendered inline between āyahs.
 *
 * Drawn, never typed: the digits come from Intl, the ring from geometry.
 * Uses --mushaf-marker, so it is identical in every theme and tier.
 */
export function AyahRosette({ ayah, text, label, size = "md" }: AyahRosetteProps) {
  const numeral = text ?? formatMushafNumeral(ayah);
  return (
    <svg
      className={styles.rosette}
      data-size={size}
      viewBox="0 0 40 40"
      role="img"
      // The numeral is Arabic-Indic whatever the interface language is, so the
      // element declares its own language rather than relying on an Arabic
      // ancestor. Outside one — a teacher's English console, the catalogue — a
      // screen reader would otherwise voice these digits in the wrong language
      // or skip them.
      lang="ar"
      aria-label={label ?? numeral}
      focusable="false"
    >
      <circle className={styles.ring} cx="20" cy="20" r="17.2" />
      <circle className={styles.innerRing} cx="20" cy="20" r="14.2" />
      <text
        className={styles.numeral}
        data-long={numeral.length > 2 ? "true" : undefined}
        x="20"
        y="20.5"
      >
        {numeral}
      </text>
    </svg>
  );
}
