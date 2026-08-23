"use client";

import type { ReactNode } from "react";
import { ParentShell, type ParentDestination } from "@/modules/design/shells";
import { useSurface } from "@/modules/design/theme/ThemeProvider";

const ITEMS = [
  { id: "children" as const, href: "/children" },
  { id: "tonight" as const, href: "/tonight" },
  { id: "settings" as const, href: "/settings" },
];

/** The family's three destinations, phone-first, with the page's own title. */
export function FamilyFrame({
  active,
  titleKey,
  children,
}: {
  readonly active: ParentDestination;
  readonly titleKey: string;
  readonly children: ReactNode;
}) {
  const { t } = useSurface();
  return (
    <ParentShell active={active} items={ITEMS} header={t(titleKey)}>
      {children}
    </ParentShell>
  );
}
