# 06 — Evidence taxonomy and memory model

Implemented in `src/core/evidence.ts` and `src/core/scheduler.ts`.

## The central distinction

| Class | Produced by | Counts toward |
|---|---|---|
| `scaffolded_practice` | Any attempt where answer options are visible (tile reconstruction, gap fill with choices) | Preparation only |
| `assisted_practice` | Any attempt where **any** assistance occurred | Preparation only |
| `independent_recall` | Cue-free level (`no_answer_choices`, `oral_blank_page`) **and** zero assistance | Verification thresholds, scheduling |

`classifyAttempt()` checks assistance **first**. One hint anywhere in an attempt
marks the whole attempt assisted, even at a cue-free scaffold level. There is no
partial credit — the alternative is a system that quietly counts hinted recall
as memory.

### Assistance kinds

`hint` · `revealed_anchor` · `replayed_word` · `answer_exposed` ·
`tile_options_visible`

## Scaffold ladder

```
full_tiles → fewer_tiles_with_anchors → gap_fill → first_letter_cue
           → no_answer_choices → oral_blank_page
                └──── cue-free zone ────┘
```

**Scaffold level is independent of memory state.** A learner can be perfectly
accurate with strong cues and still have weak independent recall. The UI shows
both, never one as a proxy for the other.

## Start context

`serial_start` · `random_start` · `boundary_probe`

Tracked separately by construction, never merged. Reciting from the beginning
is the easiest possible probe; a policy that accepted only serial evidence would
certify learners who cannot start anywhere else.

## Evidence policy (per assignment, versioned)

```ts
{ policyVersion, requiredListens, requiredIndependentRecalls, requiredNonSerialRecalls }
```

`meetsVerificationThreshold()` requires **all three** to be satisfied. Changing
a policy after assignment creates a new `AssignmentPolicyVersion` row and an
audit entry; the engine only ever sees one resolved policy.

## Memory dimensions

One vanity score is refused. A target carries:

sequence memory · oral recall · connection strength · cue independence ·
fluency · visual/page-location memory · correction recurrence ·
delayed-retention stability · reading foundation (where relevant)

Learners see one simple summary; teachers and advanced adult learners can open
the detail.

## Scheduler — transparent, not neural

We start with an FSRS-shaped model because its forgetting curve is published,
its parameters are few, and its outputs are explainable to a teacher. We do
**not** start with deep knowledge tracing.

### Retrievability

```
R(t) = (1 + F · t/S) ^ C     where F = 19/81, C = −0.5
```

At the default 90 % retention target this has the useful property that the next
interval equals stability, which makes the model legible: *"stability 6 days"
means "we expect ~90 % recall in 6 days."*

### Interval

```
I = (S / F) · (r^(1/C) − 1)
```

### Stability update (three grades, derived from evidence — never self-reported)

| Grade | Derived from |
|---|---|
| `again` | incorrect independent recall |
| `hard` | correct but `hesitant` |
| `good` | correct and clean |

There is deliberately **no `easy` grade**. Self-reported ease is the most
gameable input in spaced-repetition systems, and children game it.

Success multiplies stability by a factor that grows with the *spacing effect*
(how overdue the item was relative to its stability) and shrinks with
difficulty and hesitancy. Failure applies a lapse contraction.

### Deterministic policy clamps

Guardrails matter more than curve-fitting:

- interval ≥ 1 day, ≤ 180 days (first release)
- stability growth ≤ 3× per review (prevents runaway intervals from one lucky recall)
- lapse floor prevents stability collapsing to zero
- difficulty ∈ [1, 10] with mean reversion toward 5

`docs/13-testing-strategy.md` lists the property tests that hold these.

### Confidence and calibration

A low-friction judgment (`unsure` / `fairly_sure` / `certain`) is collected
after selected attempts. It feeds **metacognitive calibration reporting only**.
It never changes an interval, a state, or a score. A learner cannot be punished
for honesty.

### What is stored with every computed transition

`algorithmVersion`, `policyVersion`, the inputs, the outputs, and the reason
string. A scheduling decision that cannot be replayed is a scheduling decision
we cannot defend.

## Features tracked (each with a stated learning use)

first/last exposure · first/last independent retrieval · delay since prior
retrieval · independent correct/incorrect counts · assisted counts and scaffold
level · latency and hesitation markers · random-start vs serial-start context ·
connection-boundary results · confidence and calibration error · human
verification result · recurring correction types · difficulty · stability ·
predicted recall probability at target time · next review date and reason ·
algorithm and policy versions

Nothing is collected "in case it is useful later."

## Later models (gated on data, not enthusiasm)

- **Bayesian Knowledge Tracing** for Qāʿidah micro-skills, once item-level data
  is sufficient.
- **IRT** only when item identity and difficulty are stable and n is adequate.
- Knowledge-graph edges stay **relational in PostgreSQL**; no graph database
  until query evidence justifies one.
