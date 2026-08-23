# Deploy

Remote: private repository `yaszra/bac-french-coach` (Itqān codebase).

Target topology (release phase, Chat G):
- **App**: Fly.io or Vercel — staging deploys from `main`, production from tags,
  health smoke + auto-rollback.
- **Database**: managed Postgres (Neon/Fly Postgres) with RLS; nightly backups and
  restore drills.
- **Object storage + CDN**: S3-compatible bucket (audio, models, offline packs),
  HTTP Range at the edge, content-addressed keys.
- **Jobs**: pg-boss inside the app process (dedicated worker on production).
- **Observability**: pino → log drain, OpenTelemetry traces, Sentry.

CI (`.github/workflows/ci.yml`): lint → typecheck → unit → integration (temp DB) →
content gates → build → Playwright journeys → audit.
