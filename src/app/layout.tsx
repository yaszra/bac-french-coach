import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
