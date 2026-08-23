/**
 * /learn/reading — the Qāʿidah path.
 *
 * Reading progress is kept separate from ḥifẓ, so "strong at memorizing,
 * weak at reading" stays a visible diagnosis rather than being averaged
 * into one number.
 */
import { EmptyState } from "../../../src/ui/components/RouteStates.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { QAIDA_STAGES } from "../../../src/core/qaida.js";

export default function ReadingPage() {
  return (
    <LocaleProvider locale="en">
      <main>
        <h1>Reading</h1>
        <p>
          Each reading skill moves through the same steps, and the last one is
          cleared by a qualified human in person — software does not certify a
          makhraj.
        </p>
        <ol>
          {QAIDA_STAGES.map((stage) => (
            <li key={stage}>{stage.replace(/_/g, " ")}</li>
          ))}
        </ol>
        <EmptyState heading="No reading lessons are available yet.">
          <p>
            Pronunciation-bearing steps need recordings from a qualified human.
            Until one exists for a skill, the lesson says{" "}
            <em>Recording not yet available</em> rather than substituting a
            synthesised voice.
          </p>
        </EmptyState>
      </main>
    </LocaleProvider>
  );
}
