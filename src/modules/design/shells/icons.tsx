import styles from "./icons.module.css";

/**
 * Navigation glyphs: plain geometry, one stroke weight, currentColor.
 *
 * No mascots, no characters, no scripture. An icon is never the only label —
 * every destination carries its translated name beside it.
 */
export type ShellIconName =
  | "today"
  | "quran"
  | "reading"
  | "practice"
  | "me"
  | "triage"
  | "students"
  | "assign"
  | "verify"
  | "reports"
  | "tools"
  | "children"
  | "tonight"
  | "settings";

const PATHS: Readonly<Record<ShellIconName, readonly string[]>> = {
  today: ["M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M18 6l-1.8 1.8M7.8 16.2 6 18", "M12 7.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Z"],
  quran: ["M12 6.6C10.4 5.3 8.4 4.8 5.5 5v13c2.9-.2 4.9.3 6.5 1.6 1.6-1.3 3.6-1.8 6.5-1.6V5c-2.9-.2-4.9.3-6.5 1.6Z", "M12 6.6v13"],
  reading: ["M5 7h14M5 12h10M5 17h6"],
  practice: ["M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z"],
  me: ["M12 4.5a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z", "M5 20a7 7 0 0 1 14 0"],
  triage: ["M4.5 6.5h15M4.5 12h15M4.5 17.5h9", "M20 16.5v4"],
  students: ["M9 5a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 9 5Z", "M3 19.5a6 6 0 0 1 12 0", "M16 7.2a2.6 2.6 0 1 1 0 5.2M17 14.5a5.4 5.4 0 0 1 4 5"],
  assign: ["M8 4.5h8v3H8z", "M16 6h3v13.5H5V6h3", "M8.5 12h7M8.5 16h4"],
  verify: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z", "m8.2 12.2 2.6 2.6 5-5.4"],
  reports: ["M4.5 19.5h15", "M7.5 16.5V11M12 16.5V6.5M16.5 16.5v-7"],
  tools: ["M4.5 9h15v10.5h-15z", "M9 9V5.5h6V9"],
  children: ["M9 5a3.2 3.2 0 1 0 0 6.4A3.2 3.2 0 0 0 9 5Z", "M3 19.5a6 6 0 0 1 12 0", "M17.5 9.5a2.2 2.2 0 1 1 0 4.4M18 16a4.6 4.6 0 0 1 3 4"],
  tonight: ["M20 14.6A8.2 8.2 0 0 1 9.4 4 8.2 8.2 0 1 0 20 14.6Z"],
  settings: ["M4.5 8.5h8M16.5 8.5h3M4.5 15.5h3M11.5 15.5h8", "M14.5 6.4a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z", "M9.5 13.4a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z"],
};

export function ShellIcon({ name }: { readonly name: ShellIconName }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
