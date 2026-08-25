"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TeacherShell, type TeacherDestination } from "../../design/shells";
import { Badge } from "../../design/ui/display";
import { useSurface } from "../../design/theme/ThemeProvider";

/**
 * The console frame: the design system's TeacherShell, wired to real routes.
 *
 * The shell knows about layout and nothing else, so the counts beside the
 * destinations are supplied here, already computed by the server. Nothing in
 * this file decides what a number means.
 */
export type TeacherConsoleShellProps = {
  readonly className: string | null;
  readonly learnerCount: number;
  readonly waitingCount: number;
  readonly children: ReactNode;
};

const HREF: Readonly<Record<TeacherDestination, string>> = {
  triage: "/teacher/today",
  students: "/teacher/students",
  assign: "/teacher/assign",
  verify: "/teacher/verify",
  khatma: "/teacher/khatma",
  notifications: "/teacher/notifications",
};

/**
 * Which entry is lit is derived from the URL rather than passed down, so a
 * layout never has to be told where it is and the highlight is correct on the
 * server's first render — no flicker into place after hydration.
 */
function destinationFor(pathname: string): TeacherDestination {
  const match = (Object.keys(HREF) as TeacherDestination[]).find(
    (id) => id !== "triage" && pathname.startsWith(HREF[id]),
  );
  if (pathname.startsWith("/teacher/reading-gate")) return "notifications";
  return match ?? "triage";
}

export function TeacherConsoleShell({
  className,
  learnerCount,
  waitingCount,
  children,
}: TeacherConsoleShellProps) {
  const { t } = useSurface();
  const active = destinationFor(usePathname() ?? "");

  const items = (Object.keys(HREF) as TeacherDestination[]).map((id) => ({
    id,
    href: HREF[id],
    badge:
      id === "verify" && waitingCount > 0 ? (
        <Badge tone="accent">{waitingCount}</Badge>
      ) : undefined,
  }));

  return (
    <TeacherShell
      active={active}
      items={items}
      activeClass={
        className === null
          ? t("teacher.console.noClassroom")
          : t("teacher.console.classLabel", { name: className, count: learnerCount })
      }
    >
      {children}
    </TeacherShell>
  );
}
