"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { SurfaceProvider } from "@/modules/design/theme/ThemeProvider";
import { ToastRegion } from "@/modules/design/ui/feedback";
import { resolveSurface } from "./surface";

/**
 * Stamps the surface on the document and provides it to every component.
 *
 * The tokens live on `:root[data-theme]` / `:root[data-tier]`, so the switch
 * has to reach the <html> element itself. `data-surface-ready` is the signal
 * the visual-regression suite waits for before it takes a picture.
 */
export function CatalogueSurfaceRoot({ children }: { readonly children: ReactNode }) {
  const params = useSearchParams();
  const surface = resolveSurface({
    theme: params.get("theme"),
    tier: params.get("tier"),
    locale: params.get("locale"),
  });

  useEffect(() => {
    const root = document.documentElement;
    const previous = {
      theme: root.getAttribute("data-theme"),
      tier: root.getAttribute("data-tier"),
      lang: root.getAttribute("lang"),
      dir: root.getAttribute("dir"),
    };

    root.setAttribute("data-theme", surface.theme);
    root.setAttribute("data-tier", surface.tier);
    root.setAttribute("lang", surface.locale);
    root.setAttribute("dir", surface.dir);
    root.setAttribute("data-surface-ready", "true");

    return () => {
      root.removeAttribute("data-surface-ready");
      for (const [name, value] of Object.entries(previous)) {
        const attribute = name === "theme" || name === "tier" ? `data-${name}` : name;
        if (value === null) root.removeAttribute(attribute);
        else root.setAttribute(attribute, value);
      }
    };
  }, [surface.theme, surface.tier, surface.locale, surface.dir]);

  return (
    <SurfaceProvider theme={surface.theme} tier={surface.tier} locale={surface.locale}>
      <ToastRegion>{children}</ToastRegion>
    </SurfaceProvider>
  );
}
