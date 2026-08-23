/**
 * /family/tasks — home tasks.
 *
 * Home tasks are not yet implemented as a data model. Saying so is better
 * than an empty list that reads as "your child has nothing to do".
 */
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";

export default function HomeTasksPage() {
  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Home tasks</h1>
        <EmptyState heading="Home tasks are not available yet.">
          <p>
            When they arrive, each task will name who assigned it and who
            checked it — a task you tick is not a teacher&rsquo;s verification,
            and the report will never let the two be confused.
          </p>
        </EmptyState>
      </main>
    </LocaleProvider>
  );
}
