# 00 — Product strategy and non-goals

## One-page strategy

**ATHAR is a Qurʾān academy operating system whose core asset is evidence of
independent recall after delay.**

Most memorization software rewards *exposure*: a learner sees a passage, taps
through it, and a bar fills. ATHAR refuses that trade. Its central screen is a
faithful Madani muṣḥaf page that **begins blank in every session**. Words appear
in their exact printed positions only when the learner has demonstrably
retrieved them. The page is a readout of memory, not a reading surface.

### The thesis

> Every meaningful interaction creates evidence. Evidence updates a transparent
> learner-memory model. That model selects the next useful interaction. Human
> verification remains authoritative wherever software evidence is insufficient.

### Primary customer

Online and hybrid Qurʾān academies (5–200 learners), where a small number of
qualified teachers must allocate scarce listening time across many learners.
The buyer's pain is **teacher minutes**, not content.

Family workspace and solo learning reuse the same engine but are secondary
deployment shapes in the first release.

### The wedge

A teacher's ear is the bottleneck. ATHAR's first measurable promise is:
*the same teacher verifies more learners per hour, and the passages they verify
survive longer.* Everything else is downstream of that.

### What we sell

| Layer | What it is | Why it is defensible |
|---|---|---|
| Evidence ledger | Append-only record of independent vs. assisted retrieval | Cannot be back-filled by a competitor; accrues per learner-year |
| Memory map | Per-learner state across pages, joins, and intervals | Requires the ledger to exist first |
| Correction ontology | Structured taxonomy of what actually goes wrong orally | Requires teacher labour at scale to build |
| Teacher attention engine | Ordered inbox grounded in that evidence | Saves the buyer's scarcest resource |
| Knowledge graph | Versioned prerequisite / similarity / join edges | Turns "you forgot" into "you forgot *because*" |

### Three-year outcome we are betting on

We can show, with pre-registered delayed-recall measurement, that ATHAR raises
**durable recall per teacher minute** against a matched non-ATHAR cohort.
If we cannot show that, the product has failed regardless of revenue.

---

## Explicit non-goals

These are decisions, not omissions. Revisiting one requires a written argument
against the four tests (Learning / Trust / Usability / Engineering).

### Not building, first release

- **A general learner-facing chatbot.** No AI system talks to a child about the
  Qurʾān without a qualified human in the loop.
- **Automatic tajwīd or pronunciation certification.** Speech recognition is an
  advisory mirror only. It never certifies.
- **Voice cloning / a Voice Lab.** Pronunciation-bearing audio comes from
  qualified humans or it says "Recording not yet available."
- **A generic school LMS.** No gradebooks, timetables, attendance registers,
  fee collection, or district reporting.
- **Native iOS/Android apps.** A PWA that survives a weak connection on a cheap
  Android device serves the actual population better and sooner.
- **Microservices, a service mesh, an API gateway, a graph database.** A modular
  monolith on one PostgreSQL cluster is the correct first architecture.
- **Multiple muṣḥaf editions.** One approved Madani layout, done exactly.
- **A content marketplace or public developer platform.**
- **Billing, procurement workflows, SSO/roster integrations** — until a named
  buyer's contract depends on them.
- **Neural adaptive models (DKT and relatives).** We start with a transparent,
  backtestable scheduler whose reasons a teacher can read.
- **Real-time infrastructure** where polling or server-sent events meet the
  actual requirement.

### Never building

- Anything that generates, paraphrases, autocorrects, or translates Qurʾānic
  Arabic with a language model.
- Estimated word timings presented as measured.
- Public leaderboards ranking children by recitation speed, error count, or
  memorization volume.
- Coins, loot boxes, energy timers, hearts that block study, or streak-loss
  threats.
- Confetti or celebration animation over sacred text.
- A path by which a learner or parent self-approves teacher-assigned work.

### Deliberately deferred behind permissions, not navigation

Listening-span training, similar-āyah challenges, class accuracy games,
whole-muṣḥaf reading, audio studio tooling, data-quality queues, and
experimental AI tools. All live in a Practice Lab or an admin surface. None may
write memorization state.

---

## The four tests

Every feature proposal must pass all four. A proposal that passes three is
rejected or redesigned.

1. **Learning** — Does it improve durable, independent recall?
2. **Trust** — Does it preserve the Qurʾānic text, human teaching authority,
   privacy, and honest evidence?
3. **Usability** — Does it reduce cognitive load and make the next action obvious?
4. **Engineering** — Can it be built, tested, operated, and scaled without
   unnecessary complexity?

## The final product test

> Does this help a learner retrieve the Qurʾān more independently after a
> meaningful delay, help a teacher make a better decision in less time, or
> protect the trustworthiness of the system?

If no: remove, hide, or defer.
