# ATHAR — Qur'an Memory System

**Memory made visible.**

> ATHAR is a working creative direction, not a trademark, domain, or cleared
> linguistic choice. Every brand string lives in `src/config/brand.ts` so the
> name can change without touching product logic. The Arabic brand copy
> requires review by a qualified Arabic linguist before release.

---

## What this is

A Qur'an memorization platform whose central interaction is a faithful Madani
muṣḥaf page that **begins blank in every session**. The learner listens to a
real reciter, reconstructs an āyah from right-to-left word tiles, then loses
those cues. Words appear in their exact printed positions only when evidence
shows the learner retrieved them. Next session, the page is blank again.

**The system does not reward exposure as if it were memory.**

### The thesis

> Every meaningful interaction creates evidence. Evidence updates a transparent
> learner-memory model. That model selects the next useful interaction. Human
> verification remains authoritative wherever software evidence is insufficient.

---

## What is in this repository

This is **Phase 1**: the design specifications required before feature code,
plus a production-quality vertical slice of the parts that everything else
depends on — the pure learning engine, the sacred-content integrity pipeline,
server-side authorization, and the command layer that joins them.

```
docs/         17 specifications (strategy, journeys, IA, wireframes, tokens,
              state machine, memory model, ERD, authz, content pipeline,
              event catalog, API contract, threat model, testing, backlog,
              AI boundary, measurement)
src/config/   brand and design tokens — the single place a rename touches
src/core/     the pure learning engine: deterministic, framework-free, versioned
src/content/  corpus verification, release gate, and the Arabic-script tripwire
src/auth/     centralized authorization policy and tenant isolation
src/app/      commands, repository ports, in-memory adapter, event outbox
db/           PostgreSQL schema and database-level invariant tests
tests/        194 tests, organized by the acceptance criteria they protect
```

### What is deliberately **not** here

- **No Qur'anic text.** The corpus is an operational input with provenance, not
  a source file. Development uses a structurally-shaped synthetic fixture whose
  tokens are opaque Latin identifiers. A CI tripwire fails the build if any
  Arabic-script character appears in `src/` outside a two-entry allowlist.
- **No UI layer yet.** Wireframes, tokens, and the accessible component
  inventory are specified in `docs/03` and `docs/04`; the routes are mapped in
  `docs/02`. The engine is built first because the UI is the easy part to
  change and the evidence model is not.
- **No AI anywhere near the learning loop.** See `docs/15-ai-boundary.md`.

---

## Running it

```bash
npm install
npm run verify      # strict typecheck + 194 tests
npm run test:db     # 15 database invariants against real PostgreSQL
```

`test:db` needs a running PostgreSQL 14+ and creates a scratch database
(`athar_test` by default; override with `ATHAR_TEST_DB`).

---

## The parts worth reading first

**`src/core/evidence.ts`** — the line the whole product rests on. An attempt is
`independent_recall` only if it happened at a cue-free scaffold level *and*
used no assistance at all. One hint anywhere marks the whole attempt assisted.
There is no partial credit, because the alternative is a system that quietly
counts hinted recall as memory.

**`src/core/states.ts`** — a server-authoritative state machine. Clients submit
*events carrying evidence*; the server decides what the evidence means. Illegal
transitions throw, so a bug becomes a loud failure rather than a false claim
about a child's memory.

**`src/core/scheduler.ts`** — an FSRS-shaped scheduler chosen because its
forgetting curve is published and its output is explainable to a teacher. Three
grades, all derived from evidence; there is deliberately no self-reported
"easy". Conservative deterministic clamps matter more than curve-fitting.

**`src/content/corpus.ts`** — eighteen distinct integrity codes, each with a
mutation test that corrupts the payload in the way that check exists to catch.
A check that cannot fail is not a check.

**`src/auth/policy.ts`** — one decision function, six ordered steps, tenant gate
first. A cross-tenant identifier fails as `not_found` and never confirms the
resource exists.

**`db/tests/invariants.sql`** — the rules that must hold below the application:
append-only evidence, corpus immutability, `verifier_user_id <> learner_id`,
pending claims that cannot carry capabilities, and RLS tenant isolation.

---

## The trust contract, as code

| Promise | Where it is enforced |
|---|---|
| A button can never mark a passage learned | `src/core/states.ts` — evidence in, state out |
| Tile success is not memorization | `classifyAttempt` returns `scaffolded_practice` |
| Any hint marks the attempt assisted | assistance is checked *before* scaffold level |
| A learner cannot self-approve | policy check + `CHECK (verifier_user_id <> learner_id)` |
| The next session starts blank | `blankPage()` is the only session constructor |
| No estimated word timings | `AlignmentMethod` has no `estimated` member, in TS and in SQL |
| No sacred text in events, logs, or previews | `assertNoSacredText` on the event boundary |
| No āyah pasted into a component | repo-wide Arabic-script tripwire in CI |
| Evidence is never overwritten | append-only ports; `BEFORE UPDATE OR DELETE` triggers |
| A failed notification cannot lose evidence | transactional outbox with dead-letter and replay |
| Deferred review work is never marked complete | `TodayPlan.deferred` + `cappedNotice` |

Each row has at least one test named after it.

---

## Status

**Phase 1 vertical slice — engine complete, UI not started.**

`docs/13-testing-strategy.md` lists all twenty acceptance criteria from the
build brief and states plainly which are executable today (15 of 20) and which
need the UI layer, a licensed corpus, or deployed infrastructure before they
can run. Nothing here claims production readiness: Phase 0 (corpus rights,
scholar governance, brand clearance, backups and restore drills) is a
prerequisite that no amount of code satisfies.

See `docs/14-phased-backlog.md` for what comes next and why in that order.
