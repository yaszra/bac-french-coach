import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Itqān — إتقان",
  description:
    "A premium learning platform for Qurʾān memorization (ḥifẓ) and Arabic reading.",
  applicationName: "Itqān",
  manifest: "/manifest.webmanifest",
};

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
