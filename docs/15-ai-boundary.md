# 15 — AI boundary

## We do not launch with a general learner chatbot.

## Permitted first uses (all teacher- or admin-facing)

- Draft a teacher's weekly summary **from cited learning events**
- Group recurring correction patterns for teacher review
- Suggest differentiated assignments from **approved curriculum + explicit
  learner evidence**
- Help administrators find anomalies or missing content approvals
- Assist curriculum teams with metadata — **never source scripture**

## Every AI output must

- Distinguish **evidence** from **inference**
- Cite the internal records or approved sources used
- Show uncertainty
- Remain editable and reviewable by a human
- Obey tenant boundaries
- Be excluded from model training unless policy and consent explicitly allow it

## Every AI output must never

- Certify recitation or pronounce a learner correct
- Generate, alter, or translate Qurʾānic text
- Invent tafsīr
- Modify learner state directly
- Create production knowledge-graph edges without review and provenance

## Enforcement, not policy prose

The AI boundary is a **bounded module**. It has no write access to
`memory_state`, `oral_verification`, `attempt`, or any corpus table. No code
path passes corpus text into a model. Both are asserted by tests, not by
convention.

## Model routing

```
deterministic rules  →  small model (extraction / classification)
                     →  larger model (complex teacher-facing synthesis only)
```

Cache only where privacy and staleness allow. Track **cost per useful teacher
action**, not tokens. Hard per-tenant and per-workflow budgets.

## Speech recognition specifically

An **advisory mirror**. It may help a learner notice a possible mismatch. It may
**not** certify tajwīd, pronunciation, makhārij, vowels, memorization, or
readiness. It never writes a learning state. Confidence and limitations are
shown. We do not claim ḥarakah-level precision unless independent validation
supports that claim **for the exact population and task** — and today it does not.
