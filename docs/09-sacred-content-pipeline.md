# 09 — Sacred-content release pipeline

Implemented in `src/content/`. This is the part of the system that must never
be "mostly right".

## Principles

1. **One approved, versioned ʿUthmānī corpus** with immutable identifiers and
   recorded provenance.
2. **Layout data references verified corpus tokens.** It never contains Arabic
   strings of its own.
3. **No LLM ever touches Qurʾānic Arabic** — not to generate, paraphrase,
   autocorrect, translate, or "improve" it.
4. **No estimated word timings, ever.** If measured alignment is unavailable,
   word highlighting is disabled and the UI says why.
5. **Every waqf mark and every word renders exactly from approved source data.**
6. **Nothing Qurʾān-adjacent goes live without a qualified human approval**
   recorded against source, licence, territory, and expiry.

## This repository ships no Qurʾānic text

Deliberately. The corpus is an *operational input with provenance*, not a source
file. `src/content/corpus.ts` refuses to load a corpus that is not accompanied
by a manifest with:

- `corpusVersionId` and `edition`
- `sha256` of the corpus payload
- declared `surahCount`, `ayahCount`, `wordCount`, `pageCount`
- `source` (publisher, edition, printing)
- `licence` — holder, terms, territory, expiry
- `approval` — reviewer identity, credential, decision, timestamp
- `alignment` — measured method, or explicitly absent

Development uses a **structurally-shaped synthetic fixture containing opaque
token identifiers and no Arabic characters at all**, so the engine is fully
testable without embedding scripture in a test file.

## Verification gates (all run in CI)

| Gate | What it catches |
|---|---|
| `sha256` checksum | Any byte-level drift in the corpus payload |
| Corpus counts | A truncated or double-imported corpus |
| Referential integrity | A `layout_token` pointing at a word that does not exist; a page with missing lines |
| **Fixture tripwire** | Any Arabic-script character appearing anywhere in `src/` outside the approved corpus directory — i.e. someone pasting an āyah into a component or a test |
| Snapshot tests | Page geometry changing without an intentional corpus version bump |
| Mutation tests | An integrity check that would not actually fail if the data were corrupted |
| Immutability trigger | Any `UPDATE`/`DELETE` against a published corpus version |
| Alignment honesty | An `alignment_asset` whose method is not a measured method |
| Release query | A published assignment referencing an unapproved or expired source |

The tripwire is the one that matters most in practice. It is the difference
between a rule in a document and a rule the build enforces.

## Release registry

Every content item carries: source, version, approver identity and credential,
approval timestamp, licence terms, territorial rights, and expiry. An expired
licence removes the content from release **automatically** — expiry is checked
at release time, not by a human remembering.

## Audio resolution order

For pronunciation-bearing material:

```
teacher recording
  → academy-approved studio recording
    → licensed approved library
      → "Recording not yet available"
```

Synthetic articulation is never substituted. There is no voice-cloning path in
the product.

## Corpus version lifecycle

```
draft ──(integrity gates pass)──▶ candidate ──(qualified human approval)──▶ published
                                                                            │
                                                                     (immutable)
                                                                            │
                                                          superseded_by ▶ next version
```

A published version is frozen. Corrections ship as a new version, and every
passage pins the corpus version it was authored against, so a version bump can
never silently change what a learner was assigned.
