import type { Locale } from "../../../platform/i18n/types";

/**
 * Numerals on and around the muṣḥaf page.
 *
 * Digits are DATA, never authored strings: they are produced by Intl from a
 * number, so no numeral glyph is ever typed by hand. Nothing here touches
 * scripture — the Arabic *text* of the page always arrives as a prop from the
 * content package.
 */

/** The muṣḥaf's own numbering system: Arabic-Indic, in every UI locale. */
const MUSHAF_NUMBER_LOCALE = "ar-u-nu-arab";

function formatterFor(locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { useGrouping: false });
}

/**
 * Format a number for the surface locale — Arabic-Indic digits under `ar`,
 * Western digits under `en`. Used by chrome (counters, page navigation).
 */
export function formatArabicNumber(locale: Locale, n: number): string {
  if (!Number.isFinite(n)) return "";
  return formatterFor(locale === "ar" ? MUSHAF_NUMBER_LOCALE : locale).format(n);
}

/**
 * Format a numeral that is printed ON the page — āyah rosettes, the page
 * number in the lower margin, juzʾ/ḥizb marks. The page is a muṣḥaf: its
 * numerals are Arabic-Indic whatever language the interface speaks.
 */
export function formatMushafNumeral(n: number): string {
  if (!Number.isFinite(n)) return "";
  return formatterFor(MUSHAF_NUMBER_LOCALE).format(n);
}
