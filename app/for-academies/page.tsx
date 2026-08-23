/**
 * /for-academies — the buyer-facing page.
 */
import Link from "next/link";

export default function ForAcademiesPage() {
  return (
    <main>
      <h1>For academies</h1>

      <p>
        Your scarcest resource is a qualified teacher&rsquo;s ear. ATHAR is
        built to spend it well.
      </p>

      <section aria-labelledby="what-you-get">
        <h2 id="what-you-get">What a teacher gets</h2>
        <ul>
          <li>
            An ordered attention inbox instead of a dashboard: recitations
            waiting, then repeated corrections, then work not started.
          </li>
          <li>
            Every row shows its evidence and how well supported it is. There is
            no black-box &ldquo;at-risk&rdquo; label.
          </li>
          <li>
            A verification workspace built for speed — four decisions on keys
            one to four, prior corrections before any telemetry, and no score
            that could lean on your judgement.
          </li>
        </ul>
      </section>

      <section aria-labelledby="what-we-measure">
        <h2 id="what-we-measure">What we hold ourselves to</h2>
        <p>
          Our own headline measure is the proportion of scheduled passages
          recalled independently after a real delay, weighted by learner effort
          and teacher time. We report teacher minutes per verified learner
          because it is your actual currency.
        </p>
        <p>
          We do not ship a change because engagement rose. An experiment that
          raised engagement and lowered delayed recall is a failed experiment.
        </p>
      </section>

      <p>
        <Link href="/trust">What we will not do, and why</Link>
      </p>
    </main>
  );
}
