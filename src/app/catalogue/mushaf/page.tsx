import { Suspense } from "react";
import { MushafPage, PageFrame, formatMushafNumeral } from "@/modules/design/ui/mushaf";
import { SurfaceSwitcher } from "../SurfaceSwitcher";
import { CatalogueLink } from "../CatalogueLink";
import { MushafFallback } from "./MushafFallback";
import { loadRepresentativePage } from "./content";
import styles from "../catalogue.module.css";

/**
 * A representative muṣḥaf page, for the muṣḥaf contract.
 *
 * The visual-regression suite loads this in light and in dark and asserts that
 * the sheet's background is the SAME token in both. Nothing on this page is
 * authored here: the text arrives from the content package, and when it is not
 * present the page says so rather than inventing scripture.
 */
export default async function CatalogueMushafPage() {
  const page = await loadRepresentativePage();

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <span className={styles.brand}>Marginalia</span>
        <Suspense fallback={null}>
          <SurfaceSwitcher />
          <CatalogueLink to="/catalogue">catalogue</CatalogueLink>
        </Suspense>
      </header>

      <main className={styles.body}>
        <div data-testid="mushaf-sheet">
          <PageFrame
            page={page?.page ?? 1}
            /* The sūrah NAME comes from the content package's index when it
               lands; until then the band carries the sūrah's number only. */
            header={page === null ? undefined : <span>{formatMushafNumeral(page.surah)}</span>}
            markers={page === null ? undefined : [{ kind: "juz", number: page.juz }]}
          >
            {page === null ? <MushafFallback /> : <MushafPage lines={page.lines} />}
          </PageFrame>
        </div>
      </main>
    </div>
  );
}
