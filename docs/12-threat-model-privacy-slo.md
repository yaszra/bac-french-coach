# 12 — Threat model, privacy map, backup plan, SLOs

## Threat model (STRIDE, scoped to what actually matters here)

| Threat | Scenario | Control |
|---|---|---|
| **Spoofing** | Learner replays a teacher's verification request | Verification requires verifier role + relationship; decision endpoint rejects the learner as actor regardless of payload |
| **Tampering** | Client posts `evidenceClass: "independent_recall"` | Client never supplies classification; server computes it from reported facts |
| **Tampering** | Direct parameter mutation to self-approve | Ownership checked against stored assignment, never request body |
| **Tampering** | Corpus byte drift or an āyah edited in a component | sha256 + counts + referential integrity + Arabic-script tripwire in CI; DB immutability trigger |
| **Repudiation** | "I never approved that content" | Approval rows carry reviewer identity, credential, timestamp; audit written in the same transaction |
| **Information disclosure** | Cross-tenant ID probing | Tenant gate before resource load; cross-tenant returns `not_found`-shaped |
| **Information disclosure** | Qurʾānic text or error detail in a push preview | Notification payload builder strips content; previews carry a neutral string only |
| **Information disclosure** | Pending guardian claim confirms a child exists | Pending claim renders an identical empty state either way |
| **Elevation of privilege** | Revoked tutor still holds a session | Grants evaluated at decision time against current state; never cached in session or token |
| **Elevation of privilege** | Account recovery escalation | Recovery cannot change role; forces session revocation |
| **DoS** | Assignment-burst or export abuse | Rate limits, queue backpressure, per-tenant budgets |
| **Supply chain** | Malicious dependency reaching content code | Dependency + container scanning; content module has a minimal dependency surface |
| **AI boundary breach** | Model asked to "fix" an āyah | No code path passes corpus text to a model; boundary enforced by module ownership and tested |

## Privacy map

Data minimization is a **per-field** discipline. Each field records its
operational, learning, safety, or legal purpose, or it does not exist.

| Category | Examples | Purpose | Retention |
|---|---|---|---|
| Identity | name, email, role | Access control | Life of account + 30 days |
| Guardianship | claim, grant, consent | Lawful access to a child's data | Life of relationship + audit period |
| Learning evidence | attempts, verifications, corrections | The product's core function | Academy policy, default 7 years |
| Correction content | what a child got wrong | Teaching | 7 years, **access-controlled, never in analytics** |
| Telemetry | route timings, errors | Reliability | 90 days |
| Device context | coarse type, connection class | Performance triage | 90 days, no fingerprinting |
| Audio recordings | asynchronous recitation | Verification | Shortest period the academy's policy permits; explicit consent required |

### Child-safety rules

- A pending guardian claim grants **no** access of any kind.
- Viewing a child and tutoring a child are **separate** capabilities.
- Tutoring permission is immediately revocable by any authorized adult or
  academy administrator.
- **No Qurʾānic text, error detail, or sensitive learner data in push, SMS,
  email, or messaging previews.**
- Children are never ranked publicly by speed, error count, or volume.

### Rights as workflows, not tickets

Consent, guardian claim, revocation, deletion, export, retention, and
auditability are product surfaces under `/admin/governance` and
`/family/permissions` — each auditable, each testable.

## Backup and recovery

- PostgreSQL backed up **off-box** with point-in-time recovery.
- **RPO ≤ 5 minutes. RTO ≤ 60 minutes** for core learner and verification flows.
- Restore drills run on a schedule, with recorded evidence of success.
- A restored backup must pass **integrity and evidence-reconciliation checks**:
  corpus checksums verify, and no acknowledged learning evidence is missing.
- A volume attached to one application machine is explicitly **not** a
  disaster-recovery plan.

## SLOs

| SLO | Target |
|---|---|
| Core learner + verification availability | 99.9 % monthly |
| Successful persisted evidence commands (excl. valid user error) | 99.95 % |
| Queued learning-state updates visible | 99 % within 60 s |
| Accepted cross-tenant data access | **zero** |
| Silent loss of acknowledged learning evidence | **zero** |

## Performance budgets (enforced in CI and monitoring, not aspirational)

Measured on a representative low-cost Android device and throttled network:

| Budget | Target |
|---|---|
| LCP | ≤ 2.5 s @ p75 |
| INP | ≤ 200 ms @ p75 |
| CLS | ≤ 0.1 |
| Learner-route initial JS | < 200 KB compressed (excl. route-lazy media libs) |
| Local interaction feedback | < 100 ms |
| Visible progress for server actions | < 1 s |
| p95 core API read latency | < 400 ms under normal regional load |

## Critical journeys and what operators must be able to answer

1. Learner signs in → Today → practices → submits evidence → receives next state
2. Teacher assigns → observes → verifies → records a correction
3. Parent receives an honest report → manages a permission
4. Admin onboards an academy → releases approved content

For each: *What broke? Why? Which tenants and learners were affected? Was
evidence lost, delayed, duplicated, or misapplied? Did the failure interrupt
learning, or only reporting?*

Structured logs carry **no Qurʾānic text and no unnecessary student data**.
