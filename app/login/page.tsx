/**
 * /login
 *
 * Deliberately minimal and deliberately incomplete: credential handling,
 * MFA enrolment, rate limiting, and account recovery are Phase 0/2 work
 * (docs/14), and a half-built auth form that looks finished is worse than
 * one that says what it is.
 */
export default function LoginPage() {
  return (
    <main>
      <h1>Sign in</h1>
      <p>
        Authentication is not yet implemented. Credential handling,
        multi-factor enrolment for staff, rate limiting, and account recovery
        are scheduled with academy operations.
      </p>
      <p>
        Session verification itself is implemented and tested — see
        <code> src/server/session.ts</code>. What is missing is the flow that
        issues one.
      </p>
    </main>
  );
}
