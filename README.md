# Itqān — إتقان

A premium learning platform for Qurʾān memorization (ḥifẓ) and Arabic reading
(the Qāʿidah), for schools, families and solo learners.

A person's relationship with the Qurʾān — from the first letter of the Qāʿidah to a
maintained ḥifẓ decades later — lived on the page they will always recite from, with a
teacher's ear as the final word, a family around them, and a memory engine underneath
that knows which āyah join they will forget next Thursday and quietly arranges tomorrow
so they don't.

Three products, one platform, one account model: **Itqān** (learner — kids / teen /
adult experiences), **Itqān Teacher**, **Itqān Family**, plus **Itqān School** and
**Itqān Studio**.

## Principles

- **Sacred content**: Qurʾān text is byte-exact Tanzil ʿUthmānī (Ḥafṣ), enforced by a
  build gate. Recitation audio only from real reciters.
- **Evidence**: learners advance only on server-validated evidence; no client decides
  mastery.
- **Honesty**: no fake progress; "not yet recorded" is a legitimate state.
- **Privacy**: guardian-consented child audio, purged by default, tenant-scoped data.
- **Premium**: calm, reverent, precise; the muṣḥaf page is never decorated.

## Development

```sh
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Quality bar: `pnpm typecheck && pnpm lint && pnpm test && pnpm gates`.

See `CLAUDE.md` for the binding operating rules and `.ai/` for project memory.
