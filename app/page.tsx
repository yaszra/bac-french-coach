/**
 * Marketing home.
 *
 * States the product's actual claim rather than a softer one: the page
 * begins blank every time, and the software does not certify recitation.
 * A learner's family should be able to read this and know what they are
 * getting before they sign anything.
 */
import Link from "next/link";
import { brand } from "../src/config/brand.js";

export default function HomePage() {
  return (
    <main>
      <h1>
        {brand.name} — {brand.descriptor}
      </h1>
      <p>{brand.tagline}</p>

      <section aria-labelledby="what-it-is">
        <h2 id="what-it-is">What it is</h2>
        <p>
          A faithful Madani muṣḥaf page that begins blank. The learner listens
          to a real reciter, reconstructs an āyah from word tiles, then loses
          those cues. Words appear in their exact printed positions only when
          evidence shows the learner retrieved them.
        </p>
        <p>
          In the next session the page begins blank again. Exposure is not
          rewarded as if it were memory.
        </p>
      </section>

      <section aria-labelledby="what-it-does-not">
        <h2 id="what-it-does-not">What it does not do</h2>
        <ul>
          <li>It does not certify recitation, tajwīd, or pronunciation.</li>
          <li>It does not let a learner or a parent approve teacher-set work.</li>
          <li>It does not generate, alter, or translate Qurʾānic Arabic.</li>
          <li>It does not estimate word timings and present them as measured.</li>
          <li>It does not rank children publicly.</li>
        </ul>
        <p>
          <Link href="/trust">How we handle the text, your data, and our claims</Link>
        </p>
      </section>
    </main>
  );
}
