import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALES, directionOf, type Locale } from "@/modules/platform/i18n/types";
import "./globals.css";

export const metadata: Metadata = {
  title: "Itqān — إتقان",
  description:
    "A premium learning platform for Qurʾān memorization (ḥifẓ) and Arabic reading.",
  applicationName: "Itqān",
  manifest: "/manifest.webmanifest",
};

/**
 * Every route renders per request.
 *
 * This is what lets the content security policy use a nonce instead of
 * 'unsafe-inline': Next can only stamp a nonce onto its inline scripts while
 * rendering dynamically. The cost is nil here — every page in Itqān is a
 * particular learner's page, a particular teacher's inbox, a particular
 * family's evening. There is no page whose HTML is the same for two people.
 */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#faf6ee",
  width: "device-width",
  initialScale: 1,
};

export const LOCALE_COOKIE = "itqan_locale";

/**
 * The document's language and direction are decided on the SERVER.
 *
 * They were hardcoded to English and left-to-right, with surfaces flipping the
 * attributes from an effect after hydration. That is a visible bug for the half
 * of this product that is Arabic: the first paint lays the page out
 * left-to-right, and it jumps once the JavaScript arrives. It is also a
 * correctness bug for anyone with JavaScript disabled or still loading, who
 * would read Arabic in an LTR frame indefinitely.
 *
 * RTL is not a theme here. It is how the language is written.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const requested = jar.get(LOCALE_COOKIE)?.value;
  const locale: Locale = (LOCALES as readonly string[]).includes(requested ?? "")
    ? (requested as Locale)
    : DEFAULT_LOCALE;

  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body>{children}</body>
    </html>
  );
}
