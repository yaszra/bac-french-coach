/**
 * /teach/curriculum
 */
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";

export default function Page() {
  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Curriculum</h1>
        <EmptyState heading="Not available yet.">
          <p>Scheduled with academy operations.</p>
        </EmptyState>
      </main>
    </LocaleProvider>
  );
}
