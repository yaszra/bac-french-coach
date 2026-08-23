import type { ReactNode } from "react";
import { formatMushafNumeral } from "./numerals";
import styles from "./PageFrame.module.css";

export type MarginMarker = {
  readonly kind: "juz" | "hizb";
  /** 1-based juzʾ (1–30) or ḥizb (1–60) number. */
  readonly number: number;
  /**
   * Accessible name for the mark. Marks with no label are decorative and
   * hidden from assistive technology — the information is never only here.
   */
  readonly label?: string | undefined;
};

export type PageFrameProps = {
  /** Muṣḥaf page number, printed in the lower margin. */
  readonly page: number;
  /** Preformatted page numeral when the layout file carries one. */
  readonly pageLabel?: string | undefined;
  /**
   * The sūrah-header band's content — a node passed in by the caller (the
   * sūrah name comes from the content package; this frame never writes it).
   */
  readonly header?: ReactNode;
  readonly markers?: readonly MarginMarker[] | undefined;
  /** Tighter margins for the phone. Never changes the size of the scripture. */
  readonly dense?: boolean | undefined;
  readonly children: ReactNode;
};

function MarkerGlyph({ kind }: { readonly kind: MarginMarker["kind"] }) {
  return (
    <svg className={styles.markerGlyph} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        className={kind === "juz" ? styles.markerFill : styles.markerOutline}
        d="M8 1.6 14.4 8 8 14.4 1.6 8Z"
      />
    </svg>
  );
}

/**
 * The muṣḥaf page frame.
 *
 * It supplies the paper, the ruled margins, the header band, the marginal
 * marks and the page number — and nothing else. It is never tinted, inverted,
 * decorated or animated: in dark theme the chrome around it becomes slate and
 * the sheet keeps --mushaf-paper and --mushaf-ink.
 */
export function PageFrame({
  page,
  pageLabel,
  header,
  markers,
  dense,
  children,
}: PageFrameProps) {
  return (
    <section className={styles.frame}>
      <div
        className={styles.sheet}
        data-mushaf-sheet="true"
        data-dense={dense ? "true" : undefined}
        dir="rtl"
      >
        {header === undefined ? null : <div className={styles.headerBand}>{header}</div>}

        <div className={styles.body}>
          {markers && markers.length > 0 ? (
            <div className={styles.margin}>
              {markers.map((marker) => (
                <div
                  key={`${marker.kind}-${marker.number}`}
                  className={styles.marker}
                  role={marker.label === undefined ? undefined : "img"}
                  aria-label={marker.label}
                  aria-hidden={marker.label === undefined ? true : undefined}
                >
                  <MarkerGlyph kind={marker.kind} />
                  <span className={styles.markerNumeral}>
                    {formatMushafNumeral(marker.number)}
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {children}
        </div>

        <div className={styles.footer}>
          <span className={styles.pageNumber}>{pageLabel ?? formatMushafNumeral(page)}</span>
        </div>
      </div>
    </section>
  );
}
