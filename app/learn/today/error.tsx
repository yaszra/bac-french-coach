"use client";

/**
 * Route error boundary. Shows a retry that does not lose the learner's
 * place, and never surfaces the underlying error text — it can contain
 * identifiers a learner should not see.
 */
import { RecoverableErrorState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <LocaleProvider locale="en">
      <RecoverableErrorState onRetry={reset} />
    </LocaleProvider>
  );
}
