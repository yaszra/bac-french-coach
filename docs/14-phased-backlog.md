# 14 — Phased backlog, dependencies, risks, definition of done

## Definition of done (every item)

1. Passes the four tests (Learning / Trust / Usability / Engineering).
2. Server-side authorization with tenant scoping, plus a permission-matrix test.
3. Learning-relevant behaviour is in the pure engine, versioned and unit-tested.
4. Loading, empty, stale, permission-denied, offline, and error states designed.
5. Keyboard, screen-reader, RTL, reduced-motion, and 200 % zoom verified.
6. Events emitted through the outbox with idempotency; catalogued.
7. No Qurʾānic text in components, logs, events, or notification previews.
8. Observability: the operator can answer the five critical-journey questions.
9. Docs updated in the same PR.

---

## Phase 0 — Trust foundation

*Nothing learner-facing ships before this.*

- Clear the working brand (trademark, domain, Arabic linguistic review)
- Secure approved corpus, audio, timing, and translation **rights**
- Establish scholar / content governance and the reviewer roster
- Threat model, privacy map, consent model, permission matrix
- Immutable corpus import + release gates (checksum, counts, integrity, tripwire)
- PostgreSQL, off-box backups, restore drills, CI/CD, observability, audit log

**Risks** — licensing is the long pole and is *not* an engineering task; scholar
review capacity is scarce; brand clearance can force a rename (mitigated by
`src/config/brand.ts`).

---

## Phase 1 — One production vertical slice ← *this repository*

One academy, one teacher, one learner, a controlled content range, through the
complete journey:

```
assign → open Today → listen → reconstruct → lose cues → recall independently
      → request recitation → verify/correct → schedule review
      → return from blank → memory state updates
```

Includes bilingual/RTL, accessibility, tenant enforcement, learning events, and
automated tests **from the start**.

**Not complete until the loop runs end to end with no admin database edits.**

*Depends on:* Phase 0 corpus gates, audit log, CI.
*Risks:* the temptation to fake a transition to make a demo flow.

---

## Phase 2 — Academy operations

- Teacher Today attention inbox
- Rosters, classes, invitations, recovery, staff MFA
- Learner profiles and correction history
- Reports and parent claims
- Background jobs, read models, feature flags, pilot tooling
- Memory map and the transparent review scheduler in production

*Depends on:* Phase 1 evidence ledger; read-model infrastructure.
*Risks:* dashboard sprawl — mitigated by the fixed inbox order in `03`.

---

## Phase 3 — Reading foundation and family

- Qāʿidah path with **approved human audio** (resolution order enforced)
- Tutoring-parent permissions and immediate revocation
- Child-friendly Today
- Home tasks and honest family reports
- PWA resilience; carefully scoped offline curriculum caching

*Depends on:* recorded human audio (a content-operations dependency, not code).
*Risks:* offline answer capture — deferred until conflict rules, signed content
manifests, device security, and safe sync are designed.

---

## Phase 4 — Adaptive intelligence

- Calibrated stability model (backtested against real delayed-recall data)
- Knowledge-graph diagnostics: is this a memory, reading, or connection problem?
- Similar-āyah and connection remediation
- Recommendation explanations
- Controlled experiments on delayed-recall outcomes

*Depends on:* ≥ 6 months of Phase 1–2 evidence at sufficient n.
*Risks:* calibrating on too little data and shipping pseudo-precision.

---

## Phase 5 — Guarded AI and institutional scale

- Teacher copilot with citations and human review
- SSO / roster integrations **driven by buyer demand**
- Warehouse and governed outcome research
- Regional infrastructure and advanced tenancy **only when usage justifies it**

*Risks:* AI scope creep toward a learner chatbot. The boundary in `docs/15` is
the control.

---

## Sequencing constraints

```
Phase 0 ──▶ Phase 1 ──▶ Phase 2 ──┬─▶ Phase 3
                                  └─▶ Phase 4 ──▶ Phase 5
```

Phase 4 needs Phase 2's data volume. Phase 3 is parallelizable with Phase 4 but
competes for the same content-operations capacity.

## Standing risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Content licensing blocks launch | High | Phase 0 gate; no engineering workaround exists |
| Scholar review becomes the bottleneck | High | Reviewer roster and SLAs agreed in Phase 0 |
| Scheduler mis-calibrated for this domain | Medium | Conservative clamps; backtesting before any parameter change |
| Speech recognition over-claimed by sales | High | Advisory-only enforced in code, copy, and contract |
| Teacher adoption fails (inbox ignored) | High | Measure teacher minutes per verified learner from day one |
| Feature growth before the loop is excellent | Medium | §21 defer list; freeze until retention measures are good |
