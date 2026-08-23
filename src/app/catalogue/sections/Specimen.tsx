import type { ReactNode } from "react";
import styles from "../catalogue.module.css";

/**
 * Catalogue scaffolding. Headings are code identifiers — folder names and
 * component names — which is why they are not translated: they are not prose.
 */
export function Family({ name, children }: { readonly name: string; readonly children: ReactNode }) {
  return (
    <section className={styles.family} id={name}>
      <h2 className={styles.familyName}>{name}</h2>
      <div className={styles.specimens}>{children}</div>
    </section>
  );
}

export function Specimen({
  name,
  wide,
  column,
  children,
}: {
  readonly name: string;
  readonly wide?: boolean | undefined;
  readonly column?: boolean | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className={`${styles.specimen} ${wide === true ? styles.specimenWide : ""}`}>
      <h3 className={styles.specimenName}>{name}</h3>
      <div className={`${styles.stage} ${column === true ? styles.stageColumn : ""}`}>
        {children}
      </div>
    </div>
  );
}

export function Note({ children }: { readonly children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
