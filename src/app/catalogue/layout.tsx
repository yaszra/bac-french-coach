import { Suspense, type ReactNode } from "react";
import { CatalogueSurfaceRoot } from "./CatalogueSurfaceRoot";

export const metadata = { title: "Marginalia catalogue" };

/**
 * The catalogue layout owns the surface: it reads theme / tier / locale from
 * the URL, stamps data-theme, data-tier, lang and dir on <html>, and wraps
 * everything in <SurfaceProvider>. Pages below stay server components.
 */
export default function CatalogueLayout({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <CatalogueSurfaceRoot>{children}</CatalogueSurfaceRoot>
    </Suspense>
  );
}
