/**
 * /trust — the page that states our limits in public.
 *
 * Written plainly and kept honest: if a claim on this page stops being
 * true, the product has changed in a way that needs a decision, not a
 * copy edit.
 */
export default function TrustPage() {
  return (
    <main>
      <h1>Trust</h1>

      <section aria-labelledby="text">
        <h2 id="text">The Qurʾānic text</h2>
        <ul>
          <li>
            One approved, versioned ʿUthmānī corpus with recorded provenance.
            Every word and waqf mark renders exactly from that source.
          </li>
          <li>
            Layout data references corpus tokens. It never holds its own copy
            of a Qurʾānic string, so there is one place a word could be wrong
            and one place we verify.
          </li>
          <li>
            No language model generates, paraphrases, autocorrects, or
            translates Qurʾānic Arabic. There is no code path that passes the
            corpus to a model.
          </li>
          <li>
            A published corpus version is immutable. Corrections ship as a new
            version, and every passage pins the version it was authored
            against.
          </li>
          <li>
            Word highlighting appears only where timings were measured. Where
            they were not, audio plays without highlighting and says why. We
            do not estimate.
          </li>
        </ul>
      </section>

      <section aria-labelledby="authority">
        <h2 id="authority">Human authority</h2>
        <ul>
          <li>
            A qualified human verifies oral recitation. Software never
            certifies it.
          </li>
          <li>
            Speech recognition is an advisory mirror. It may help a learner
            notice a possible mismatch. It cannot certify tajwīd,
            pronunciation, makhārij, vowels, memorization, or readiness, and
            it never writes a learning state.
          </li>
          <li>
            No Qurʾān-adjacent teaching content becomes available without a
            qualified reviewer's recorded approval.
          </li>
        </ul>
      </section>

      <section aria-labelledby="evidence">
        <h2 id="evidence">Evidence</h2>
        <ul>
          <li>
            Placing word tiles correctly is scaffolded retrieval. It is not
            proof of independent recall, and it never satisfies a verification
            requirement.
          </li>
          <li>
            Any hint marks that attempt as assisted. Assisted attempts teach;
            they do not count as recall.
          </li>
          <li>
            Every rate we show carries its denominator. &ldquo;Not
            recorded&rdquo;, &ldquo;not reviewed&rdquo;, and &ldquo;not enough
            evidence yet&rdquo; are real answers we display rather than
            filling in.
          </li>
          <li>A quiet day is reported as a quiet day.</li>
        </ul>
      </section>

      <section aria-labelledby="privacy">
        <h2 id="privacy">Privacy and children</h2>
        <ul>
          <li>A pending guardian claim grants no access of any kind.</li>
          <li>
            Viewing a child and tutoring a child are separate permissions, and
            any authorized adult can revoke tutoring immediately.
          </li>
          <li>
            No Qurʾānic text, error detail, or sensitive learner data appears
            in a push, SMS, email, or messaging preview.
          </li>
          <li>Learning evidence is never overwritten, only appended to.</li>
        </ul>
      </section>

      <section aria-labelledby="naming">
        <h2 id="naming">About the name</h2>
        <p>
          ATHAR is a working name pending trademark, domain, and linguistic
          clearance. Arabic interface copy is under review by a qualified
          Arabic linguist.
        </p>
      </section>
    </main>
  );
}
