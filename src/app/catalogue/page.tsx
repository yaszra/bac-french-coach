import { Suspense } from "react";
import { SurfaceSwitcher } from "./SurfaceSwitcher";
import { MushafSection } from "./sections/MushafSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { OverlaySection } from "./sections/OverlaySection";
import { ShellSection } from "./sections/ShellSection";
import { CatalogueLink } from "./CatalogueLink";
import styles from "./catalogue.module.css";

/**
 * The Marginalia catalogue.
 *
 * Every component in every state, grouped by family, with theme / tier /
 * locale switched through the URL so screenshots are deterministic.
 */
export default function CataloguePage() {
  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.brand}>Marginalia</span>
        <Suspense fallback={null}>
          <SurfaceSwitcher />
          <CatalogueLink to="/catalogue/mushaf">mushaf</CatalogueLink>
        </Suspense>
      </header>

      <main className={styles.body}>
        <MushafSection />
        <FeedbackSection />
        <OverlaySection />
        <ShellSection />
      </main>
    </div>
  );
}
