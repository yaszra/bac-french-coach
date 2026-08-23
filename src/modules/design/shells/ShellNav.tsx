"use client";

import { useSurface } from "../theme/ThemeProvider";
import { ShellIcon, type ShellIconName } from "./icons";
import type { ShellNavItem } from "./nav";
import styles from "./nav.module.css";

export type ShellNavProps<Id extends string & ShellIconName> = {
  readonly destinations: readonly Id[];
  readonly active: Id;
  readonly items?: readonly ShellNavItem<Id>[] | undefined;
  readonly variant: "bar" | "rail" | "sidebar";
  readonly collapsed?: boolean | undefined;
};

/**
 * The navigation list every shell shares.
 *
 * A destination id is also its icon name and its message key (`nav.<id>`), so
 * a shell can never ship a label that is not translated.
 */
export function ShellNav<Id extends string & ShellIconName>({
  destinations,
  active,
  items,
  variant,
  collapsed,
}: ShellNavProps<Id>) {
  const { t } = useSurface();
  const byId = new Map((items ?? []).map((item) => [item.id, item]));

  return (
    <nav
      className={styles.nav}
      data-variant={variant}
      data-collapsed={collapsed ? "true" : undefined}
      aria-label={t("a11y.menu")}
    >
      <ul className={styles.list}>
        {destinations.map((id) => {
          const item = byId.get(id);
          const current = id === active ? "page" : undefined;
          const inner = (
            <>
              <ShellIcon name={id} />
              <span className={styles.label}>{t(`nav.${id}`)}</span>
              {item?.badge === undefined ? null : (
                <span className={styles.badge}>{item.badge}</span>
              )}
            </>
          );

          return (
            <li key={id} className={styles.item}>
              {item?.href === undefined ? (
                <button
                  type="button"
                  className={styles.link}
                  aria-current={current}
                  onClick={item?.onSelect}
                >
                  {inner}
                </button>
              ) : (
                <a className={styles.link} href={item.href} aria-current={current}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
