/**
 * /admin/content — content overview.
 */
import Link from "next/link";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";

export default function ContentPage() {
  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Content</h1>
        <p>
          <Link href="/admin/content/approvals">Approvals and licences</Link>
        </p>
        <p>
          Corpus import, integrity verification, and the release gate run in
          CI. A published corpus version is immutable; corrections ship as a
          new version.
        </p>
      </main>
    </LocaleProvider>
  );
}
