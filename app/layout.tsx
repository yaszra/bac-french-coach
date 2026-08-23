/**
 * Root layout.
 *
 * The token stylesheet is inlined rather than fetched: it is small, it is
 * needed before first paint, and a flash of unstyled muṣḥaf is exactly the
 * kind of thing this product should not do.
 */
import type { ReactNode } from "react";
import { tokenStylesheet } from "../src/ui/tokens.js";
import { brand } from "../src/config/brand.js";
import "./globals.css";

export const metadata = {
  title: `${brand.name} — ${brand.descriptor}`,
  description: brand.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: tokenStylesheet() }} />
      </head>
      <body>
        {/* Keyboard users reach the content without traversing navigation. */}
        <a className="athar-skip-link" href="#athar-main">
          Skip to content
        </a>
        <div id="athar-main">{children}</div>
      </body>
    </html>
  );
}
