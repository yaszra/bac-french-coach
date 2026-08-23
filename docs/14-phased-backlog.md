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

## Phase 1 — One production vertical slice ✅ *complete*

One academy, one teacher, one learner, a controlled content range, through the
complete journey:

```
assign → open Today → listen → reconstruct → lose cues → recall independently
      → request recitation → verify/correct → schedule review
      → return from blank → memory state updates
```

Includes bilingual/RTL, accessibility, tenant enforcement, learning events, and
automated tests **from the start**.

**Complete.** The loop runs end to end against real PostgreSQL with
row-level security active and no admin database edits — `npm run test:pg`.

*Risk that materialised:* none of the transitions were faked, but four
defects were found at the server-action boundary in review, including an
evidence policy a crafted call could set to zero. Fixed and covered by
`tests/server-actions.test.ts`. The lesson generalises: a UI check is an
affordance, and the gate has to be where the request lands.

---

## Phase 2 — Academy operations ◐ *largely built*

| | Status |
|---|---|
| Teacher Today attention inbox | ✅ built and tested |
| Learner profiles and correction history | ✅ built |
| Parent claims and governance workflows | ✅ built and tested |
| Memory map and the review scheduler | ✅ built |
| Background jobs (outbox dispatcher) | ✅ built |
| Rosters, invitations, recovery, staff MFA | ✗ **not built** — needs the sign-in flow |
| Read models, feature flags, pilot tooling | ✗ not built; queries run against the transactional tables |

*Risk that did not materialise:* dashboard sprawl. The fixed inbox order
held, and a test asserts the DOM order matches the engine's.

---

## Phase 3 — Reading foundation and family ◐ *engine built, audio blocked*

| | Status |
|---|---|
| Qāʿidah engine and audio resolution order | ✅ built and tested |
| Tutoring permissions and immediate revocation | ✅ built and tested |
| Child-friendly Today | ✅ built and tested |
| Honest family reports | ✅ built |
| Approved human audio | ✗ **blocked** — a content-operations dependency, not code |
| Home tasks | ✗ not built; `/family/tasks` says so |
| PWA resilience and offline caching | ✗ not built |

The audio blocker is the point rather than a gap: pronunciation-bearing
steps refuse to run without a qualified human recording, and there is no
synthetic member on the provenance type for anyone to reach for.

---

## Phase 4 — Adaptive intelligence ◐ *mechanisms built, calibration blocked*

| | Status |
|---|---|
| Knowledge-graph diagnostics | ✅ built and tested |
| Recommendation explanations | ✅ built |
| Experiment discipline (`shouldShip`) | ✅ built and tested |
| Calibrated stability model | ✗ **blocked** — needs real delayed-recall data |

The scheduler ships with conservative published parameters rather than
fitted ones. Fitting them to fewer than six months of real data would be
the pseudo-precision this phase was supposed to avoid, so the parameters
stay where they are and the backtest is the gate for changing them.

---

## Phase 5 — Guarded AI and institutional scale ◐ *boundary built, nothing behind it*

| | Status |
|---|---|
| AI boundary module, read-only by construction | ✅ built and tested |
| Rule-based weekly summary with citations | ✅ built |
| Model routing to an actual model | ✗ not built — deterministic rules cover the current cases |
| SSO / roster integrations | ✗ not built; correctly waiting on buyer demand |
| Warehouse and outcome research | ✗ not built |

The boundary exists before anything that needs it, which is the right
order: `src/ai` has an empty write surface and a test that greps the
directory for repository imports, transactions, and SQL.

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
| A UI check mistaken for a gate | High | Server-action boundary tests; found a real policy bypass in review |
