# Privacy register

Itqān is used by children. The register below is written on the assumption that
every entry may one day have to be explained to their parents.

## What is collected, and why

| Data | Lawful basis | Retention | Who can see it |
|---|---|---|---|
| Name, tier, locale | Contract with the school or family | Life of the account | The learner, their teacher, their approved guardians |
| Learning events (attempts, verdicts, reviews) | Contract | Life of the account; exportable and erasable | As above |
| Memory state | Derived from events | Rebuildable; erased with the events | As above |
| Voice recordings of a child | **Explicit guardian consent**, off by default | **90 days**, then purged automatically | The learner's teacher and approved guardians only |
| Email, password hash | Contract | Life of the account | Nobody; the hash is argon2id and never leaves the credential table |
| Session fingerprints (user-agent, IP) | Legitimate interest — account security | Hashed at write, truncated to 32 chars | Security review only |
| Audit log of privileged actions | Legal obligation | 2 years | School admins, support |

There is **no third-party analytics SDK** in the product. Not a reduced one, not
a consent-gated one. A child's reading of the Qurʾān is not an event stream for
someone else's dashboard.

## Consent

Voice recording is off until a guardian turns it on, per child. The consent
record carries who granted it, when, and the retention chosen. Withdrawing it
stops new recordings and purges existing ones on the next purge run.

## Export

A subject or their guardian may request an export. It runs as a job, writes a
single archive to object storage, and is delivered by a signed, expiring link.
The request's state is shown honestly — received, running, completed, failed —
and a failure says so rather than showing a spinner forever.

## Erasure

Learning history is append-only, which is deliberate: it is what makes progress
honest and rebuildable. Erasure is therefore not an exception to that but a
**named path through it**. A transaction must declare which DataRequest
authorises it (`SET LOCAL app.erasure_request_id`), and every removed row is
recorded in `erasure_log` — so an erasure is itself a permanent, auditable fact.
`TRUNCATE` remains absolutely refused: erasure is per-subject, never wholesale.

The application role cannot erase at all. Only an audited maintenance job can.

## Tenancy

Every tenant-owned row carries `organizationId` and is protected by
`FORCE ROW LEVEL SECURITY`. The runtime database role has no `BYPASSRLS`, so a
query issued without tenant context returns nothing — a bug produces an empty
page, never another school's children.

## Sub-processors

| Processor | Purpose | Region |
|---|---|---|
| Application host | Serving the product | EU |
| Managed Postgres | Primary datastore | EU |
| Object storage + CDN | Audio, models, offline packs | EU |

Fonts are self-hosted. No request leaves the region to render a page.

## Data protection contacts

Controller: the school or, for family accounts, the guardian.
Processor: the operator of this deployment. A DPA template is at
`docs/DPA-TEMPLATE.md`.
