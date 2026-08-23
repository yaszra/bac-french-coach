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
src/ui/       design tokens, bilingual catalogue, accessible components
src/server/   session signing, actor resolution, read-side queries
app/          Next.js App Router routes and server actions
src/app/      commands, repository ports, in-memory and PostgreSQL adapters
db/           PostgreSQL schema, migrations, and database-level invariants
tests/        420 tests, organized by the acceptance criteria they protect
```

### What is deliberately **not** here

- **No Qur'anic text.** The corpus is an operational input with provenance, not
  a source file. Development uses a structurally-shaped synthetic fixture whose
  tokens are opaque Latin identifiers. A CI tripwire fails the build if any
  Arabic-script character appears in `src/` outside a two-entry allowlist.
- **No sign-in flow.** Session verification is implemented and tested
  (`src/server/session.ts`), but nothing issues a session yet: credential
  handling, staff MFA enrolment, rate limiting, and account recovery are
  scheduled with academy operations in `docs/14`. `/login` says so rather
  than showing a form that does not work.
- **No audio.** The listen step records completions server-side, but there is
  no player: audio needs licensed recordings and measured alignment, which is
  a Phase 0 content-operations dependency, not code.
- **No AI anywhere near the learning loop.** See `docs/15-ai-boundary.md`.

---

## Running it

```bash
npm install
npm run verify      # typecheck, 420 tests, 18 DB invariants, build, bundle budget
npm run test:db     # 18 database invariants against real PostgreSQL
npm run test:pg     # the full journey against real PostgreSQL
npm run build       # Next.js production build
npm run budget      # learner-route JavaScript against the declared budget
npm run dev         # local server (needs DATABASE_URL and ATHAR_SESSION_SECRET)
```

Both database suites need a running PostgreSQL 14+. `test:db` creates a
scratch database (`athar_test`; override with `ATHAR_TEST_DB`). The
integration suite reads `ATHAR_TEST_DATABASE_URL` and **skips itself** when
no database is reachable, so the default `npm test` stays runnable on a
laptop without PostgreSQL.

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

**`src/core/attention.ts`** — the teacher's ordered inbox. Facts get high
confidence; inferences earn theirs from sample size, and below the minimum
sample the row is not emitted at all rather than shown as a guess.

**`src/app/pg-store.ts`** — the PostgreSQL adapter and the transaction
boundary. State and the events that justify it commit together; a rolled-back
command leaves neither behind.

**`src/ui/components/MushafPage.tsx`** — fixed Madani geometry. Every line is
rendered whether or not data covers it, and every slot reserves its measured
width whether filled or blank, so a word appearing never shifts the words
around it. Always right-to-left and always on warm paper, whatever the
interface locale and theme are doing.

**`src/ui/i18n/messages.ts`** — English and Arabic built together. The Arabic
catalogue is typed as a complete record of the English keys, so omitting a
string is a compile error rather than a silent fallback.

**`src/core/memory-map.ts`** — a map of memory, not of completion. There is
no status meaning "finished"; a page verified a year ago and not recalled
since renders differently from one recalled last week, and every cell carries
a distinct glyph so the map survives greyscale and print.

**`src/application/notifications.ts`** — previews are chosen from a fixed set
and never composed from data. A template with no interpolation cannot leak a
value, which is a stronger guarantee than sanitising one.

**`db/tests/invariants.sql`** — the rules that must hold below the application:
append-only evidence, corpus immutability, `verifier_user_id <> learner_id`,
pending claims that cannot carry capabilities, passage release that must be
attributable, and RLS tenant isolation.

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
| Content release cannot be asserted by its caller | `passage.released` is stored state, read not passed |
| A rolled-back command emits no events | `EventSink` buffered until commit |
| Teacher-facing inferences state their sample size | `attention.ts` confidence capped by observation count |
| A word appearing never moves its neighbours | every slot reserves its width blank or filled |
| Sacred text is never inverted or tinted | `.athar-mushaf` is exempt from theming, both selectors stated |
| Every drag has a keyboard equivalent | `TileTray` roving tabindex + Enter to place |
| No screen shows a bare percentage | `HonestMetric` takes count and total, never a percent |
| A half-translated screen cannot ship | Arabic catalogue typed as complete |
| A pending claim carries no capability | enforced in code and by a DB `CHECK` |
| Revocation needs no session to expire | grants read live at decision time |
| No sacred text or detail in a preview | previews are fixed templates with no interpolation |
| A page is never "complete forever" | no such status exists in the memory map |

Each row has at least one test named after it.

---

## Status

**Phase 1 vertical slice — engine, persistence, component library, and
application shell complete; sign-in and audio outstanding.**

The complete journey (assign → listen → reconstruct → lose cues → recall →
request → verify → schedule → return from blank → state updates) runs against
real PostgreSQL with row-level security active and **no admin database edits**,
which is the bar `docs/14` sets for Phase 1 being done.

`docs/13-testing-strategy.md` lists all twenty acceptance criteria from the
build brief and states plainly which are executable today (18 of 20, plus the
bundle half of a nineteenth) and which need deployed infrastructure before
they can run. Nothing here claims production readiness: Phase 0 (corpus rights,
scholar governance, brand clearance, backups and restore drills) is a
prerequisite that no amount of code satisfies.

See `docs/14-phased-backlog.md` for what comes next and why in that order.
