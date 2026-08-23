"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { resolveSurface, surfaceHref } from "./surface";
import styles from "./catalogue.module.css";

/** A link between catalogue pages that keeps the current surface in the URL. */
export function CatalogueLink({
  to,
  children,
}: {
  readonly to: string;
  readonly children: ReactNode;
}) {
  const params = useSearchParams();
  const surface = resolveSurface({
    theme: params.get("theme"),
    tier: params.get("tier"),
    locale: params.get("locale"),
  });
  return (
    <Link className={styles.switch} href={surfaceHref(to, surface, {})}>
      {children}
    </Link>
  );
}
