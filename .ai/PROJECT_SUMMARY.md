# Itqān — project summary

Second-generation successor to Rusūkh. New repo, name, identity, architecture.

**Thesis**: a learner's whole relationship with the Qurʾān lived on the muṣḥaf page,
teacher's ear as final word, family around them, and a per-learner memory graph
underneath that schedules tomorrow's review.

**Core object**: the Memory Graph — units are āyah transitions/bodies/page positions
(ḥifẓ) and concepts (reading); `MemoryState(learner, unit)` with FSRS-lite (ḥifẓ) and
BKT (reading); every interaction an append-only `LearningEvent`; state, meters and
reports are projections. One progress language: **ink depth**.

**Products**: learner (kids 4–8 guided-only / teens 9–15 / adults 16+), teacher
(desktop-first triage + verification), family (phone-first), school admin, studio.

**Architecture**: modular monolith, Next.js 16 App Router + TS strict + Tailwind v4;
`src/modules/<context>/{domain,repo,actions,schemas,ui}`; Postgres + Prisma + RLS +
organizationId everywhere; scoped roles + relationship grants + one `can()`; HMAC
sessions with rotation; pg-boss jobs; SSE presence; object storage + CDN for audio;
versioned read-only content package with four build gates; no LLM in the student path.

**Binding rules**: sacred-content, evidence, honesty, privacy, premium, trust boundary
— see CLAUDE.md.

**Environment caveats recorded**: tanzil.net unreachable from build container (proxy
allowlist); corpus fetched from a checksummed GitHub mirror of the Tanzil ʿUthmānī
text with provenance recorded in `content/quran/SOURCE.json`. Rusūkh reference repo
unavailable; listed ports re-implemented fresh against the same specs.
