/**
 * Skeleton that preserves layout, so arriving content causes no shift.
 */
import { LoadingState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";

export default function Loading() {
  return (
    <LocaleProvider locale="en">
      <LoadingState />
    </LocaleProvider>
  );
}
