/**
 * /privacy
 *
 * Describes what the software actually does. Where a control is not yet
 * built, this page says so rather than describing an intention as a fact.
 */
export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy</h1>

      <section aria-labelledby="what-we-store">
        <h2 id="what-we-store">What we store, and why</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Why it exists</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Name, email, role</td>
              <td>Access control</td>
              <td>Life of the account, then 30 days</td>
            </tr>
            <tr>
              <td>Guardian claims, grants, consent</td>
              <td>Lawful access to a child&rsquo;s data</td>
              <td>Life of the relationship, plus the audit period</td>
            </tr>
            <tr>
              <td>Attempts, verifications, corrections</td>
              <td>The product&rsquo;s core function</td>
              <td>Academy policy; seven years by default</td>
            </tr>
            <tr>
              <td>Route timings and errors</td>
              <td>Keeping the service working</td>
              <td>90 days</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="children">
        <h2 id="children">Children</h2>
        <ul>
          <li>A pending guardian claim grants no access of any kind.</li>
          <li>
            Seeing a child and tutoring a child are separate permissions. Any
            authorized adult can withdraw tutoring immediately.
          </li>
          <li>
            No Qurʾānic text, error detail, or sensitive learner data appears in
            a push, SMS, email, or messaging preview.
          </li>
          <li>Children are never ranked against one another.</li>
        </ul>
      </section>

      <section aria-labelledby="rights">
        <h2 id="rights">Your rights</h2>
        <p>
          Export and deletion are workflows an administrator decides, with the
          decision and its reason recorded. Deletion is a request rather than an
          immediate erasure because learning evidence may be under a retention
          obligation the academy owes to someone other than the requester.
        </p>
      </section>

      <section aria-labelledby="not-yet">
        <h2 id="not-yet">Not yet in place</h2>
        <p>
          Sign-in, staff multi-factor enrolment, and account recovery are not
          implemented. This service is not ready to hold real learner data.
        </p>
      </section>
    </main>
  );
}
