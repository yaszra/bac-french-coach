/**
 * /how-it-works — the loop, explained honestly.
 */
export default function HowItWorksPage() {
  return (
    <main>
      <h1>How it works</h1>

      <ol>
        <li>
          <h2>The page begins blank</h2>
          <p>
            Every session starts with an empty muṣḥaf page — including a
            session where the page filled completely yesterday.
          </p>
        </li>
        <li>
          <h2>Listen to a real reciter</h2>
          <p>
            Word highlighting appears only where timings were measured. Where
            they were not, the audio plays without it and says why.
          </p>
        </li>
        <li>
          <h2>Reconstruct from word tiles</h2>
          <p>
            Placing tiles correctly fills the page. It is useful practice, and
            it is <strong>not</strong> evidence of memorization — the system
            records it as practice, and it never satisfies a teacher&rsquo;s
            verification requirement.
          </p>
        </li>
        <li>
          <h2>Lose the cues</h2>
          <p>
            Support is removed step by step: fewer tiles, then gaps, then first
            letters, then nothing. Each change is announced. Taking a hint
            records that attempt as assisted.
          </p>
        </li>
        <li>
          <h2>Prove independent recall</h2>
          <p>
            Cue-free retrieval, including from a random start and across the
            joins into neighbouring passages. Reciting from the beginning is
            the easiest possible test, so it is not the only one.
          </p>
        </li>
        <li>
          <h2>A human verifies</h2>
          <p>
            A qualified teacher hears the recitation and decides. Speech
            recognition may point at an uncertain moment; it never certifies.
          </p>
        </li>
        <li>
          <h2>Review returns from blank</h2>
          <p>
            A clean recall after a delay lengthens the interval. A miss
            shortens it and starts a repair. Nothing is ever marked finished.
          </p>
        </li>
      </ol>
    </main>
  );
}
