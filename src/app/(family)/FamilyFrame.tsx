"use client";

import type { ReactNode } from "react";
import { ParentShell, type ParentDestination } from "@/modules/design/shells";
import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { useTutoring } from "./FamilySurface";

const BASE = [
  { id: "children" as const, href: "/children" },
  { id: "tonight" as const, href: "/tonight" },
];

const TUTOR = { id: "tutor" as const, href: "/tutor" };
const SETTINGS = { id: "settings" as const, href: "/settings" };

/** The family's destinations, phone-first, with the page's own title. */
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
  /* A guardian who tutors nobody never sees the tab. The pages behind it still
     refuse them; this only keeps the app from offering what it would refuse. */
  const items = useTutoring() ? [...BASE, TUTOR, SETTINGS] : [...BASE, SETTINGS];
  return (
    <ParentShell active={active} items={items} header={t(titleKey)}>
      {children}
    </ParentShell>
  );
}
