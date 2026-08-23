import type { ShellNavItem } from "@/modules/design/shells";
import type { LearnerDestination } from "@/modules/design/shells";

/**
 * The learner's doors, in one place.
 *
 * The shell decides how many appear — three for a child, five for everyone else
 * — so this list is simply where each one goes. Keeping it here means two screens
 * can never disagree about where "Today" is.
 *
 * `reading` has no href yet: the Qāʿidah surface is not built, and a tab that
 * navigates to a missing page is worse than a tab that plainly does nothing.
 */
export const LEARNER_NAV: readonly ShellNavItem<LearnerDestination>[] = [
  { id: "today", href: "/today" },
  { id: "quran", href: "/quran" },
  { id: "reading" },
  { id: "practice", href: "/practice" },
  { id: "me", href: "/me" },
];
