"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { resolveSurface, surfaceHref, SURFACE_KEYS, SURFACE_VALUES } from "./surface";
import styles from "./catalogue.module.css";

/**
 * Theme, tier and locale as links, not state.
 *
 * Every value is an identifier from the design system's own vocabulary
 * (light / dark, kids / teen / adult, en / ar), so the switcher carries no
 * translatable prose.
 */
export function SurfaceSwitcher() {
  const params = useSearchParams();
  const pathname = usePathname();
  const surface = resolveSurface({
    theme: params.get("theme"),
    tier: params.get("tier"),
    locale: params.get("locale"),
  });

  return (
    <>
      {SURFACE_KEYS.map((key) => (
        <div key={key} className={styles.switchGroup}>
          <span className={styles.switchLabel}>{key}</span>
          {SURFACE_VALUES[key].map((value) => (
            <Link
              key={value}
              className={styles.switch}
              href={surfaceHref(pathname, surface, { [key]: value })}
              aria-current={surface[key] === value ? "true" : undefined}
            >
              {value}
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}
