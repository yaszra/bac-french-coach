# Data processing agreement — template

> This is a starting point for legal review, not legal advice. Have counsel
> adapt it before use.

**Parties.** The Controller (the school, or for family accounts the guardian)
and the Processor (the operator of this Itqān deployment).

**1. Subject matter.** The Processor provides a Qurʾān memorisation and Arabic
reading platform. Processing is limited to what that requires.

**2. Duration.** For the term of the service agreement, plus the retention
periods in §6.

**3. Nature and purpose.** Storing learner accounts and relationships; recording
learning events and deriving memory state from them; producing reports for
teachers, guardians and administrators; storing recitation audio where consent
has been given.

**4. Categories of data subject.** Learners (including children), teachers,
guardians, administrators.

**5. Categories of personal data.** Identity and contact data; learning events
and derived state; voice recordings **only where a guardian has consented**;
authentication data; security telemetry (hashed).

**6. Retention.**
- Voice recordings of a child: 90 days by default, or the shorter period the
  guardian chooses. Purged automatically.
- Learning history: for the life of the account, then erased on request through
  the audited erasure path.
- Audit log: 2 years.

**7. Security measures.** Tenant isolation enforced by database row-level
security with the runtime role holding no bypass; argon2id password hashing;
rotating HMAC session cookies with server-side revocation; MFA for staff
accounts; rate limiting on authentication, claim and join paths; a strict
content security policy; MIME allow-lists on upload; encryption in transit and
at rest; least-privilege database roles; audited privileged actions.

**8. Sub-processors.** As listed in `docs/PRIVACY.md`. The Controller is notified
before a sub-processor is added and may object.

**9. Data subject rights.** The Processor provides export and erasure through the
product. Erasure is recorded permanently in an erasure log, which the Controller
may inspect.

**10. Personal data breach.** The Processor notifies the Controller without undue
delay and within 72 hours of becoming aware, with the facts known at the time
rather than waiting for a complete picture.

**11. International transfers.** None by default; all processing occurs in the
region stated in `docs/PRIVACY.md`.

**12. Return and deletion.** On termination, the Controller may export all data.
The Processor deletes it within 30 days thereafter, except where law requires
retention.

**13. Audit.** The Controller may audit compliance once per year, or after a
breach, on reasonable notice.
