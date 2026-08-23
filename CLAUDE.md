# Itqān — repo guide for AI engineering

Itqān (إتقان — "mastery with precision") is a premium learning platform for Qurʾān
memorization (ḥifẓ) and Arabic reading (Qāʿidah). Modular monolith: Next.js 16 App
Router, TypeScript strict, Tailwind v4 tokens, Prisma + Postgres (RLS), pg-boss,
append-only LearningEvent projections.

## Operating rules (binding)

On every task: read `.ai/STATE.json`, then `.ai/PROJECT_SUMMARY.md`. Record every
decision in `.ai/DECISIONS.md` with provenance. Finish tasks with a completion report
(IMPLEMENTED / VERIFIED / NOT VERIFIED / RISKS / FOLLOW-UP).

### Sacred-content rule (never violate)
Qurʾān text is never generated, paraphrased, reconstructed, transliterated-as-recitation,
or typed by hand. Every Arabic scripture string traces byte-for-byte to the Tanzil
ʿUthmānī (Ḥafṣ) corpus (`content/quran/`); `scripts/verify_content.mjs` proves it and
fails the build otherwise. Muṣḥaf layout files carry references, never Arabic text.
Recitation audio comes only from real reciters. AI never produces Arabic outside the
corpus. Qāʿidah references scripture, never retypes it.

### Evidence rule
A learner advances only on server-validated evidence. No client ever decides mastery.
Games, tasks and practice never write memory state.

### Honesty rule
No fake completion; every rate carries its denominator; "not yet recorded" is a
legitimate state.

### Privacy rule
Children's voice audio only after guardian consent, purged by default (90 days),
exportable, erasable; everything tenant-scoped; no third-party analytics SDKs.

### Premium rule
Calm, reverent, precise. The muṣḥaf page is never decorated, tinted, or animated.
One obvious next action per screen. No sub-12px text. No raw HTML controls outside
`src/modules/design/`.

## Layout

- `src/modules/<context>/{domain,repo,actions,schemas,ui}` — contexts: identity,
  content, hifz, reading, assessment, memory, classroom, family, studio, analytics,
  design (Marginalia design system), platform (session, authz, jobs, storage, events).
- Pure engines (`domain/`) never import the DB. Zod at every boundary. String enums.
- `content/` is a versioned, read-only runtime package guarded by build gates.
- `scripts/` — content fetch/build/verify gates.

## Commands

`pnpm typecheck` · `pnpm lint` · `pnpm test` (unit) · `pnpm test:integration`
(temp Postgres DB) · `pnpm gates` (content gates) · `pnpm e2e` · `pnpm build`.
Prisma migrations are committed; never `db push` in prod.
