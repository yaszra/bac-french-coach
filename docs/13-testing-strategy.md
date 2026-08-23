# 13 — Testing strategy and acceptance tests

## Pyramid

| Layer | Covers |
|---|---|
| Unit | State machine, scheduler, scoring, policy, authorization, content invariants |
| Property-based | Learning transitions and sacred-content gates over generated inputs |
| Mutation | Proves an integrity check would actually fail if the data were wrong |
| Integration | PostgreSQL + RLS + queues + object storage + idempotent workers |
| Contract | Versioned REST surface |
| Component | Accessibility of every component (keyboard, SR name, RTL, reduced motion) |
| End-to-end | Learner, teacher, parent, admin critical journeys |
| Isolation | Tenant + permission matrix, cross-tenant probes per resource type |
| Load | Assignment bursts, review scheduling, class dashboards, verification queues, notification dispatch, event ingestion |
| Recovery | Restore tests and disaster-recovery drills |

## Educational-algorithm tests (the ones that protect the promise)

These are not ordinary unit tests; each corresponds to a way the product could
lie about a child's memory.

1. Assisted attempts **never** count as independent recall — at any scaffold level.
2. A wrong answer resets only the intended evidence streak.
3. Delayed clean recall increases stability **monotonically and logically**.
4. Hesitant recall does not inflate intervals aggressively.
5. Repeated corrections trigger repair.
6. Random-start evidence is never conflated with serial-start evidence.
7. Adaptive difficulty does not oscillate.
8. Overdue queues are capped humanely **without marking work complete**.
9. Recommendations respect teacher priorities and prerequisites.
10. Algorithm version changes are reproducible and backtestable.

## Acceptance tests — §25 core criteria

| # | Criterion | Test |
|---|---|---|
| 1 | Teacher assigns exact passage + policy without exposing answer keys or mutable learner settings | `acceptance.test.ts` |
| 2 | Learner sees one clear next action on Today | `recommend.test.ts` |
| 3 | Page geometry matches approved layout, invariant across EN/AR and light/dark | `ui/mushaf.test.tsx` |
| 4 | Required listens persisted server-side | `acceptance.test.ts` |
| 5 | Tile success fills the page but creates no independent-recall or mastery evidence | `evidence.test.ts` |
| 6 | Any hint marks the attempt assisted | `evidence.test.ts` (+ property test) |
| 7 | Cue-free recall and connection checks are distinct evidence types | `evidence.test.ts` |
| 8 | Learner cannot self-approve via UI, API, replay, or parameter mutation | `acceptance.test.ts`, `policy.test.ts` |
| 9 | Only an authorized verifier records the oral decision | `policy.test.ts` |
| 10 | Verification pins exact assignment and policy version | `acceptance.test.ts` |
| 11 | Next review begins from a blank page | `acceptance.test.ts` |
| 12 | Delayed clean recall changes stability and timing logically and reproducibly | `scheduler.test.ts` |
| 13 | Teacher Today prioritizes actionable evidence | `attention.test.ts` |
| 14 | Pending guardian sees nothing; tutoring revocable immediately | `policy.test.ts` |
| 15 | Cross-tenant access fails in policy, DB, API, and E2E | `policy.test.ts` (+ integration) |
| 16 | Failed notification or AI service cannot lose or roll back evidence | `outbox.test.ts` |
| 17 | Restored backup passes integrity and reconciliation | *specified; DR drill runbook* |
| 18 | Arabic/RTL, keyboard, SR labels, reduced motion, 200 % zoom pass critical journey | `ui/accessibility.test.tsx` |
| 19 | Declared performance budgets met on representative hardware | `scripts/bundle-budget.mjs` (bundle half); field metrics pending |
| 20 | No Qurʾānic string, timing, audio, or asset reaches production without source, licence, approval | `content.test.ts` (tripwire + release gate) |

### What runs today, and what does not

**Executable now** (`npm test`, 570 tests): criteria 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
11, 12, 13, 14, 15, 16, 18, 20.

**Executable now against real PostgreSQL** — the full Phase 1 journey
(`npm run test:pg`, 18 tests) plus schema invariants (`npm run test:db`, 18
assertions):
the database half of criteria 8, 10, 15, 20 — append-only evidence, corpus
immutability, the self-verification constraint, the pending-claim constraint,
the segment/assignment composite key, RLS tenant isolation, and the absence of
an `estimated` alignment method.

**Partly executable** — criterion 19. The bundle half is enforced:
`npm run budget` fails the build if a learner route's initial JavaScript
exceeds 200 KB gzipped. Current measurements are recorded below. LCP, INP,
and CLS need a deployed client on representative hardware and remain
outstanding.

Measured at the time of writing, gzipped, excluding `nomodule` polyfills
(a modern browser downloads and parses none of that chunk):

| Route | Route chunks | Initial JS |
|---|---:|---:|
| `/learn/today` | 14.0 KB | 141.7 KB |
| `/learn/session/[assignmentId]` | 7.0 KB | 134.7 KB |
| `/teach/verify/[requestId]` | 5.4 KB | 133.1 KB |
| shared shell | — | 127.7 KB |

The shared React and Next runtime is 127.7 KB of that, so roughly 58 KB of
the learner budget remains for everything the loop still has to grow.

**Specified but not yet executable** — criterion 17. Criterion 17 needs deployed infrastructure and a restore drill.
Criterion 18's contrast half is verified numerically against the tokens
(`tokens.test.ts`) because jsdom has no layout engine; the rest — keyboard
operation, screen-reader names, RTL, reduced motion, and non-colour
encoding — runs under axe in both locales. They are written
down so they cannot be quietly forgotten, and they are the acceptance gate for
the phases that build those pieces.

## CI/CD

Format · lint · strict typecheck · tests · **content gates** · accessibility
checks · dependency scanning · migration validation · bundle budgets · preview
deploy.

Delivery uses expand/contract migrations, feature flags, tenant pilots,
percentage rollouts, monitoring, and rapid rollback.
