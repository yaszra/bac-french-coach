# Release

## Environments

| | Staging | Production |
|---|---|---|
| Deploys from | `main` | a tag `v*` |
| Database | managed Postgres, own instance | managed Postgres, PITR on |
| Object storage | own bucket | own bucket, versioning on |
| Data | seeded fixtures only | real learners |

Staging never holds production data. A child's recitation does not travel to a
test environment to reproduce a bug; a synthetic fixture does.

## Before a release

1. `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm gates && pnpm build`
2. `pnpm e2e` — the four journeys (learner, teacher, family, admin) in English and
   Arabic, at 390px and 1280px.
3. Restore drill against last night's backup:
   `node scripts/backup_verify.mjs --dump <latest>` — this verifies not only that
   the dump restores, but that row-level security and the append-only triggers
   came back with it. A restore that loses those looks perfectly healthy and
   leaks everything.
4. Migrations reviewed by a second pair of eyes. `prisma migrate deploy` only —
   never `db push`.

## Deploying

```sh
git tag -a v0.3.0 -m "…" && git push origin v0.3.0
```

The pipeline runs migrations, deploys, then polls `/api/health` until it reports
`ok`. Health is not "the process started": it checks the database through the
runtime role, that no migration is unfinished, and that the content package is
present — because an instance serving a muṣḥaf with no text would otherwise pass.

**Auto-rollback**: if health fails for 90 seconds after a deploy, the previous
release is restored and the deploy is marked failed. Migrations are written to be
backwards-compatible for one release so a rollback does not need a down-migration:
add a column, deploy, backfill, deploy, drop in the release after.

## After a release

- Watch verify latency and lapses-per-100-reviews for a week. These are the
  learning-outcome metrics; engagement is not one of them, and a release that
  raised time-in-app while raising lapses is a regression.
- Check the dead-letter queues. A nightly report that never ran is a family that
  did not hear about their child, and it must be visible rather than silent.

## SLOs

| | Target | Why this number |
|---|---|---|
| Availability | 99.5% monthly | A class runs at a fixed hour; an outage during it cannot be made up. |
| p75 LCP, school Chromebook | ≤ 2.5s | The device the product will actually be used on. |
| p75 INP | ≤ 200ms | Tile placement must not feel laggy to a six-year-old. |
| Route JS | ≤ 180KB gzipped | Same reason. |
| Verify latency, p90 | ≤ 48h | How long a learner waits for a teacher's ear. The number that decides whether the ear-gate is a feature or an obstacle. |
| Job success rate | ≥ 99.9% | Reports are promises to families. |

## Alerts

Paging: health failing, database unreachable, error rate > 2% for 5 minutes,
dead-letter queue non-empty for an hour.

Not paging, but reviewed daily: verify latency drifting past 48h, a content gate
failing on `main`, backup drill failure.
