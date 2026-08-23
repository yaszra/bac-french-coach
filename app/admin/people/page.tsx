/**
 * /admin/people
 *
 * Scheduled with academy operations (docs/14, Phase 2). Stated plainly
 * rather than shown as an empty table that reads as "you have none".
 */
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";

export default function Page() {
  return (
    <LocaleProvider locale="en">
      <main>
        <h1>People</h1>
        <EmptyState heading="Not available yet.">
          <p>
            This surface is scheduled with academy operations. Governance and
            the audit log are available now.
          </p>
        </EmptyState>
      </main>
    </LocaleProvider>
  );
}
