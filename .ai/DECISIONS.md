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
- **D-009** · 2026-08-23 · Corpus edition. tanzil.net is unreachable from the
  build network (proxy denies CONNECT). `fetch_quran.mjs` tries Tanzil first and
  falls back to the King Fahd Glorious Qurʾān Printing Complex ʿUthmānī Ḥafṣ
  edition (v13) via a public mirror. Verified: 114 sūrahs, 6236 āyahs, all
  canonical per-sūrah counts, correct basmalah conventions at 2:1, 9:1, 27:30.
  Four independent editions were compared and NONE agree byte-for-byte (they
  differ in joining characters and pause marks), so "byte-exact" is defined
  against one named edition and recorded in SOURCE.json. Bytes are stored
  exactly as received — NFC is deliberately not applied. **Needs the user's
  confirmation**, since the spec named Tanzil specifically.
  [inferred:network-constraint]
- **D-010** · 2026-08-23 · Muṣḥaf line breaks are `not_yet_recorded`. Page
  boundaries are canonical (from Ḥafṣ metadata, verified against known
  landmarks); no reachable source carries the 15-line layout. A guessed line
  break is one a learner would memorise, so it is recorded as absent.
  [inferred:honesty-rule]
- **D-011** · 2026-08-23 · Word timings are measured or absent. No timing source
  was reachable; all seven reciters are recorded `not_yet_recorded` and the
  product plays audio without a highlight rather than interpolating one.
  [inferred:honesty-rule]
- **D-012** · 2026-08-23 · The tripwire matches on the CONSONANTAL SKELETON
  (diacritics, alef forms and joining marks stripped), so a passage retyped from
  a different edition or with vowels removed is still caught. A byte-identical
  check would have caught almost nothing. Arabic prose is permitted in declared
  interface-copy files and refused in source code. [inferred:threat-model]
- **D-013** · 2026-08-23 · Erasure is a named path through the append-only log,
  not an exception to it: a transaction must declare `app.erasure_request_id`,
  and every removed row is recorded in `erasure_log`. Found by testing — the
  append-only trigger initially made GDPR erasure impossible. TRUNCATE stays
  absolutely refused. [discovered:testing]
- **D-014** · 2026-08-23 · Two database roles. `itqan` owns the schema and holds
  BYPASSRLS for migrations and audited maintenance; `itqan_app` serves every
  request and never has it. Role attributes are provisioning
  (`prisma/provision.sql`), not schema — a migration cannot grant itself
  privileges it lacks. [discovered:testing]
- **D-015** · 2026-08-23 · Correction taxonomy splits into memory and
  articulation families. Only memory errors lapse a unit: a tajwīd slip is not
  forgetting, and treating it as such would bury a learner in reviews for
  something they know. [specified:T0 + inferred]
- **D-016** · 2026-08-23 · FSRS-4.5 with published weights, a 365-day interval
  cap and post-lapse stability capped at 0.9× prior; Itqān layers an evidence
  weight and a retrieval-strength factor per exercise on top. BKT defaults
  pInit 0.15 / pTransit 0.22 / pSlip 0.10 / pGuess 0.20. The weak-join margin
  must stay below (1 − targetRetention) or it can never fire.
  [inferred:memory-engine]
- **D-017** · 2026-08-23 · Toolchain: ESLint pinned to 9 (eslint-plugin-react is
  incompatible with ESLint 10 and crashed every lint run); vitest transforms JSX
  via `esbuild.tsconfigRaw` rather than per-directory tsconfig files.
  [discovered:testing]

- **D-018** · 2026-08-23 · Ḥifẓ exercise ladder is an *evidence* order, not a difficulty order:
  listen → recall_first → rebuild → gap_fill → next_ayah_cue → connect_chain →
  oral_recitation, with strengths 0.05 … 1.0 rising strictly along it. It deliberately
  ranks `gap_fill` above `rebuild` where the memory engine's `evidenceWeights` do the
  reverse: a rebuild happens with every word on screen, a gap fill does not. Ladder
  strengths gate exercises; the memory weights stay the scheduler's confidence dial.
  [inferred:pedagogy]
- **D-019** · 2026-08-23 · Grading applies ceilings before penalties. A rung's ceiling (listen ≤ hard,
  rebuild ≤ good), the scaffold's ceiling (full_text ≤ hard, first_letters ≤ good) and
  observation ceilings (a revealed answer ≤ hard) are applied first; hint, rescramble,
  latency and break penalties are applied last, so a penalty can never be absorbed by a
  ceiling. [inferred:evidence-rule]
- **D-020** · 2026-08-23 · `gradeAttempt` has three answers, two of which are not grades: `graded`,
  `requires_human` (always, for oral_recitation — the ear-gate) and
  `insufficient_evidence`. Unusable observations are never defaulted to "again". The
  evidence union has no score/grade/mastery field and its zod schemas are strict, so a
  client-asserted result is rejected at the boundary rather than ignored downstream.
  [specified:T0 evidence-rule]
- **D-021** · 2026-08-23 · `verified` is reachable only through a `human_verdict` event; a property test
  drives the machine with a seeded PRNG over random exercise outcomes, ticks and
  requests (400 runs × 40 events) and asserts it is never reached. A verdict is accepted
  from any state, including `not_started`: a teacher who sat and listened outranks the
  app's record of practice. [specified:T0 evidence-rule]
- **D-022** · 2026-08-23 · Mastery is ear-gated with four levels — not_yet_recorded / learning / held /
  maintained — and every rate carries its denominator (`Rate` from the memory engine).
  A unit with no evidence returns `not_yet_recorded`, never 0%; `summariseMastery`
  keeps unstarted units out of the confirmed denominator. [specified:T0 honesty-rule]
- **D-023** · 2026-08-23 · Word sync never interpolates: absent timings return `no_timings`, words are
  active over half-open `[startMs, endMs)`, `validateTimings` proves monotonicity,
  non-overlap and containment, and lookup is a binary search. `reciteDiff` is typed
  `advisory: true`, contains no Arabic, takes the caller's `normalize` (empty string =
  ignored token) for ḥarakah precision and waqf tolerance, and never grades.
  [specified:T0 sacred-content + evidence rules]
- **D-024** · 2026-08-23 · Session planning clamps the budget to a tier ceiling (kids 10 minutes, teen 30,
  adult 60, unknown tier 60) rather than trusting the caller's number, always names one
  first action, and returns an honest empty plan distinguishing `nothing_due` from
  `budget_too_small`. New material is the first thing withheld. [specified:T0 premium
  + honesty rules]
- **D-025** · 2026-08-23 · Ink depth is applied as the ALPHA of `--mushaf-ink` (`color-mix(in srgb, var(--mushaf-ink)
  calc(var(--ink-strength) * 100%), transparent)`), mapped from `data-depth` in CSS rather
  than an inline style, so the ink never changes hue and no component can invent a depth
  value. Depth 0 hides the glyph with `visibility: hidden` (the word's space and the line
  metrics survive) and the button's accessible name becomes `a11y.wordInAyah` +
  `a11y.inkDepth`, so a hidden word is announced as present and unearned rather than
  silently dropped. `revealed` changes what is shown, never `data-earned`.
  [specified:T0 sacred-content + honesty rules]
- **D-026** · 2026-08-23 · Muṣḥaf words are real `<button>` elements and are deliberately exempt from the
  `--tap-min` floor (WCAG 2.5.8 inline-target exception): enforcing 44px on a word would
  destroy the page. `MushafPage` therefore owns a roving tabindex — one tab stop for the
  whole page — with arrows following the PAGE's direction (right-to-left in every locale,
  so ArrowLeft advances), Home/End per line and Ctrl+Home/End per page.
  [inferred:premium-rule + WCAG-2.5.8]
- **D-027** · 2026-08-23 · The muṣḥaf contract is proven twice: `src/modules/design/tests/tokens.test.ts` parses
  `tokens/marginalia.css` and fails if any `--mushaf-*` or `--ink-depth-*` token is
  declared inside a `[data-theme]`/`[data-tier]` block, if any `var()` in the design
  system resolves to nothing, or if a `--text-*` step falls below 12px (15px under kids);
  `e2e/catalogue.spec.ts` loads the real page in a browser and asserts the sheet's
  computed background and colour are IDENTICAL in light and dark while the chrome behind
  it changes. [specified:T0 premium-rule]
- **D-028** · 2026-08-23 · Overlay focus traps take the container ELEMENT (via a state setter as `ref`), not a
  ref object: an overlay rendered through a portal attaches one commit late, and a
  ref-based trap silently never engaged. Focus is placed once, on open — the escape
  handler lives in a ref so a re-render of the page behind the dialogue cannot yank the
  cursor back to the first control. [inferred:defect-found-in-test]
- **D-029** · 2026-08-23 · `Tile` is the only component licensed to use `--ease-tile-spring`. Its pick-up state is
  carried by `aria-pressed` (never the deprecated `aria-grabbed`) and its live-region text
  is DERIVED from `picked`/`slot`/`state` rather than stored, so the announcement cannot
  fall out of step with the tile. Putting a tile down and cancelling are announced by
  `aria-pressed` alone. [inferred:react-hooks/set-state-in-effect + ARIA 1.2]
- **D-030** · 2026-08-23 · `PaneLayout` chooses 1/2/3 panes from the CONTAINER's inline size (700px / 1100px
  container queries), not the viewport, so the learner geometry is still correct inside a
  teacher's split view. Every pane is bounded and scrolls inside itself and each shell is
  `block-size: var(--shell-block-size, 100dvh)`: the document never scrolls during
  practice, and the catalogue can still frame a shell in a box. [specified:T0 premium-rule]
- **D-031** · 2026-08-23 · The catalogue's surface comes only from the URL (`?theme=&tier=&locale=`), stamped onto
  <html> by a client component in the catalogue layout, which also flags
  `data-surface-ready` for the visual-regression suite to wait on. Its own labels are code
  identifiers (folder and component names), never prose, because the catalogue may not add
  keys to `messages/*.json`. The representative page reads the vendored corpus and the
  madani-15 layout server-side (the layout still records `lines: "not_yet_recorded"`, so
  words are packed, not justified) and renders the honest empty state when either is
  absent — it never types Arabic. [specified:T0 sacred-content + honesty rules]

- **D-032** · 2026-08-23 · Reading (Qāʿidah) makhārij follow the classical **seventeen makhārij in
  five regions** of Ibn al-Jazarī's *al-Muqaddimah al-Jazariyyah* — the scheme taught with the
  Ḥafṣ ʿan ʿĀṣim reading this platform follows. Every letter has exactly one PRIMARY makhraj
  (`validateLattice` proves the partition): alif alone in al-jawf, wāw at ash-shafatān and yāʾ at
  wasaṭ al-lisān (their madd resonance in al-jawf is modelled by the madd concepts, not by dual
  membership). Al-khayshūm carries no primary letter — it is the makhraj of the *ghunnah*, so its
  `letterCodepoints` is empty and `rule.ghunnah` points at it. Hamzah is a 29th letter concept
  outside the 28-letter alphabet. [specified:al-Jazariyyah]
- **D-033** · 2026-08-23 · Reading concept ids use **Unicode Arabic-block character names** for the
  letter segment (`letter.beh`, `letter.theh`, `letter.hah`, `letter.heh`) rather than a
  transliteration: ASCII, stable, and collision-free where ḥāʾ/hāʾ, tāʾ/ṭāʾ and dhāl/ẓāʾ/zāy all
  collide. Display names come only from `labelKey`. [inferred:collision-free-ids]
- **D-034** · 2026-08-23 · Letter FORM concepts are emitted only for the positions a letter actually
  takes: four for connectors, `isolated`+`final` for the six non-connecting letters, `isolated`
  alone for hamzah. Emitting four for all would invent skills a learner can neither practise nor
  fail. [inferred:honesty rule]
- **D-035** · 2026-08-23 · Solo self-confirmation is modelled as its own evidence kind
  (`self_confirmed`), never as a weaker teacher verdict. With `hasTeacher: true` the in-person rung
  accepts `teacher_observed` only and a self-confirmation is counted under
  `unacceptedEvidence`; solo, it advances the rung and `LadderState` keeps
  `finalRungEvidenceKind` / `teacherVerified` / `selfConfirmed` / `verificationLabelKey` as
  separate fields so no projection can render it as verification. SmartScore excludes it (and
  `advisory_only`) from the BKT posterior: it raises `confidence` and the denominator, never the
  score. [specified:T0 evidence + honesty rules]
- **D-036** · 2026-08-23 · SmartScore is `number | null`, capped to **1..99**. `null` is the sole
  encoding of "not yet recorded" (0% is a claim); 100 would assert a certainty no finite run of
  observations buys — the same principle that keeps BKT's probabilities inside (0, 1). The score's
  own denominator travels beside it as `scoredAttempts`. [inferred:honesty rule]
- **D-037** · 2026-08-23 · The in-person ladder rung is gated by the observer's MOST RECENT verdict
  (`latestMustBeCorrect`), not by an accuracy threshold: a human's latest word is the word, in both
  directions. [inferred:evidence rule]
- **D-038** · 2026-08-23 · Talqīn assets are a discriminated union on `provenance`
  (`human` | `studio_synth_reviewed` | `library`) with no unlabelled member, and the synthesized
  variant structurally requires `reviewedByPersonId` + `reviewedAt`. `resolveTalqin` walks
  teacher → studio → library → `{kind:"not_yet_recorded"}`; there is no synthesized floor, so a
  machine voice is never a silent fallback. [specified:T0 sacred-content + honesty rules]
- **D-039** · 2026-08-23 · "No hearts, timers or streak penalties" is enforced by type, not by
  convention: `ActivityEvaluation.penalty` has type `null` and `PracticeGuarantees` is four literal
  `false`s, validated at the boundary by `practiceGuaranteesSchema`. A wrong answer returns a
  `correction` message key describing what to notice. [specified:T0 premium rule]
