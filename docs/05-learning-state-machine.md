# 05 — Learning state machine

Implemented in `src/core/states.ts`. Pure, deterministic, versioned
(`ENGINE_VERSION`). Every transition returns a human-readable reason that is
persisted with the resulting state.

## Why a state machine at all

Because a button must never be able to say "learned". The client submits
*events carrying evidence*; the server decides what that evidence means. An
illegal transition throws rather than silently promoting a learner — a bug
becomes a loud failure, not a false claim about a child's memory.

## States

| State | Meaning |
|---|---|
| `assigned` | Work exists; no evidence yet |
| `preparing` | Listening and scaffolded practice underway |
| `recalled_independently` | Cue-free evidence exists, no required human decision yet |
| `ready_for_verification` | Assignment evidence threshold satisfied |
| `verified` | An authorized human approved the oral recitation |
| `established` | A later independent recall succeeded after a meaningful delay |
| `durable` | Multiple delayed recalls succeeded across longer intervals |
| `fragile` | Recall probability or recent evidence indicates risk |
| `repairing` | A targeted correction / relearning sequence is active |

**`durable` never means permanently learned.** It means the evidence so far is
good. The next session still starts blank.

## Events

All events carry evidence, never verdicts.

- `practice_started`
- `independent_recall_recorded { correct, progress, policy }`
- `verification_recorded { decision }`
- `delayed_recall_recorded { correct, hesitant, delayDays }`
- `correction_recurred`
- `repair_completed`
- `forgetting_risk_detected`

## Legal transitions

```
assigned ──practice_started──▶ preparing

preparing ──independent_recall_recorded(correct, threshold met)──▶ ready_for_verification
preparing ──independent_recall_recorded(correct, below threshold)──▶ recalled_independently

recalled_independently ──(correct, threshold met)──▶ ready_for_verification
recalled_independently ──(incorrect)──▶ preparing

ready_for_verification ──verification_recorded(verified_cleanly | verified_minor_slip)──▶ verified
ready_for_verification ──verification_recorded(practice_again)──▶ preparing
ready_for_verification ──verification_recorded(unable_to_assess)──▶ ready_for_verification
ready_for_verification ──(incorrect recall)──▶ preparing

verified    ──delayed_recall_recorded(correct, delay ≥ 3d)──▶ established
established ──delayed_recall_recorded(correct, ≥3 successes AND longest ≥ 14d)──▶ durable
durable     ──delayed_recall_recorded(correct)──▶ durable

verified | established | durable ──delayed_recall_recorded(incorrect)──▶ fragile
verified | established | durable ──forgetting_risk_detected──▶ fragile
fragile ──delayed_recall_recorded(correct, short delay)──▶ verified
fragile ──delayed_recall_recorded(correct, delay ≥ 3d)──▶ established

any state except assigned ──correction_recurred──▶ repairing
repairing ──repair_completed──▶ fragile     (must re-prove itself)
```

## Illegal transitions (throw `IllegalTransitionError`)

These are the safety rails. Each one corresponds to a way a system could lie.

| Attempted | Why it is illegal |
|---|---|
| `verification_recorded` from any state but `ready_for_verification` | A teacher cannot verify work whose evidence threshold was never met |
| `independent_recall_recorded` while `verified` / `established` / `durable` | Post-verification recall is *delayed recall*, a different evidence type — conflating them would inflate stability |
| `delayed_recall_recorded` from `assigned` / `preparing` / `recalled_independently` / `ready_for_verification` / `repairing` | There is no verified baseline to be delayed from |
| `forgetting_risk_detected` before verification | Risk is only meaningful against an established baseline |
| `repair_completed` outside `repairing` | No repair was active |
| `correction_recurred` from `assigned` | Nothing has been practised yet |

## Design decisions worth naming

**`repair_completed` lands in `fragile`, not back where it came from.** Repairing
a passage does not restore its former standing; the memory must survive a
delayed probe again. This is deliberately conservative.

**A verification with a minor slip still reaches `verified`,** but the attached
correction persists until explicitly resolved, and a recurrence drops the target
straight to `repairing`.

**`unable_to_assess` is a real outcome,** not an error. It leaves the target
awaiting another verification and is visible to the academy as an unmet
obligation.

**Context is carried, not recomputed.** `StateContext` tracks
`delayedSuccesses` and `longestSuccessfulDelayDays`; verification resets it,
because durability earned before a re-verification is not evidence about the
memory that exists now.
