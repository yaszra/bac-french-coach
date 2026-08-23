# Decisions

Format: D-nnn · date · decision · provenance.

- **D-001** · 2026-08-23 · Name and identity: Itqān (إتقان), products Itqān / Teacher /
  Family / School / Studio; design language "Marginalia". [specified:T0]
- **D-002** · 2026-08-23 · Modular monolith: Next.js 16 App Router, TS strict, Postgres
  + Prisma + RLS, object storage + CDN, pg-boss queue, append-only LearningEvent →
  projections. [specified:T0]
- **D-003** · 2026-08-23 · One MemoryState at āyah-transition/concept grain; FSRS-lite
  for ḥifẓ (shadow-validated), BKT for reading; mastery ear-gated. [specified:T0]
- **D-004** · 2026-08-23 · PWA-first, Capacitor shells later; no React Native/Flutter.
  [specified:T0]
- **D-005** · 2026-08-23 · Ink-depth is the single progress language; kids see it as a
  lantern. No XP on home screens. [specified:T0]
- **D-006** · 2026-08-23 · AI policy: no LLM in the student path; on-device ASR is an
  advisory mirror that never writes memory; later grounded teacher copilot with
  citations. [specified:T0]
- **D-007** · 2026-08-23 · Build environment adaptation: ~/.ai-engineering-os and the
  Rusūkh repo are absent from the remote container; .ai/ memory maintained by hand,
  Rusūkh ports re-implemented from spec. tanzil.net blocked by network policy →
  corpus fetch prefers tanzil.net, falls back to a GitHub mirror, records SHA-256
  provenance in content/quran/SOURCE.json; the byte-exact gate still runs against the
  vendored text. [inferred:env-constraint]
- **D-008** · 2026-08-23 · Toolchain pins: pnpm, Node 22, TypeScript 5.9 (not 7.x, for
  Next 16 compatibility), Prisma 6 (stable migration engine). [inferred:stability]
