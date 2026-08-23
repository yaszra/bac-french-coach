# 16 — Measurement and experimentation

## North star

> The proportion of scheduled passages **independently recalled after the target
> delay**, weighted by learner effort and required teacher time.

Not sessions. Not time in app. Not passages "completed".

## Guardrails (a north-star gain that damages one of these is not a gain)

| Guardrail | Why it matters |
|---|---|
| **False confidence** — scaffolded success without later independent recall | The single most important failure mode; measures whether we are fooling ourselves |
| Verified → established conversion | Does verification predict survival? |
| Established → durable conversion | Does the scheduler hold memory over months? |
| Correction recurrence | Are we repairing or just re-noticing? |
| Review burden and backlog | Is the queue humane? |
| **Teacher minutes per verified learner** | The buyer's actual currency |
| Active learner time (not open-tab time) | Honest effort measurement |
| Frustration/abandonment during cue withdrawal | The riskiest moment in the loop |
| Accessibility completion gaps | Is the loop equally completable for everyone? |
| Notification opt-out and fatigue | Are we nagging? |
| Tenant reliability and support burden | Operational truth |

## Experiment discipline

Legitimate subjects: cue-fading order, random-start frequency, session length,
reminder timing, explanation placement, teacher-inbox ranking, progress
visualization.

Every experiment pre-registers: the **learning hypothesis**, the **primary
delayed-recall outcome**, guardrails, population, duration, and stopping rules.

> **We do not ship an experiment because clicks or time-in-app increased.**

An experiment that raises engagement and lowers delayed recall is a failed
experiment, and shipping it would be a failure of the product's premise.

## Honest reporting rules (enforced in the `HonestMetric` component)

- Every rate shows its denominator or a plain-language equivalent.
- Total session time and active learning time are always distinguished.
- A quiet day is reported as a quiet day.
- "Not recorded", "not reviewed", "insufficient evidence", and "engine
  unavailable" are valid, designed states — not blanks and never zeros.
- No activity, recommendation, confidence, mastery, or report sentence is
  invented from missing data.
