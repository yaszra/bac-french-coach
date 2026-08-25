"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsClient } from "./useIsClient";

/**
 * Render outside the layout, into <body>. Overlays escape their pane so they
 * are never clipped by the bounded panes the practice screens rely on.
 */
export function Portal({ children }: { readonly children: ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(children, document.body);
}
