# 01 — Role-based journey maps

Each journey names the moment of truth, the evidence written, and the failure
mode we are designing against.

---

## Learner (adult or junior), daily loop

| Step | Learner sees | System writes | Failure mode designed against |
|---|---|---|---|
| Opens Today | One primary CTA, exact estimated **active** minutes | `assignment_opened` | A wall of cards; learner chooses badly |
| Orients | Passage, unit size, *why today* | — | Learner does not know why this is scheduled |
| Listens | Real reciter audio, blank page | `passage_listen_completed` (server-counted) | Client-claimed listen counts |
| Reconstructs | RTL tiles below the page; words land in exact positions | `retrieval_submitted` (scaffolded) | Tile success read as memorization |
| Loses cues | Ladder step announced plainly | `scaffold_changed` | Silent difficulty spikes; abandonment |
| Recalls cue-free | Blank page, random-start and join probes | `independent_recall_succeeded/failed` | Serial recitation mistaken for recall |
| Requests recitation | "Ready for your teacher" | `recitation_requested` | Learner self-approving |
| Waits | Honest pending state | — | Fake progress while waiting |
| Sees result | Verified / minor slip / practice again + corrections | — | Opaque score |
| Returns next session | **Blank page again** | `review_completed` | Page "stays filled" and flatters the learner |

**Moment of truth:** the first time the page goes blank again after a session
where it was full. If the learner understands *why* and does not feel punished,
the product works.

---

## Little learner (with a grown-up nearby)

Three destinations only: Today, My Page, Grown-up.

1. One very large "Start" control. One action visible at a time.
2. Listen → tap-to-place tiles → a short cue-free attempt.
3. When a decision or setting is needed, an explicit **grown-up handoff** card —
   never a settings screen exposed to the child.
4. Milestones reveal part of a private "night sky" — **only from verified or
   delayed evidence**, never from time spent.

Failure mode designed against: a child optimising for the reward animation.

---

## Teacher, daily loop

| Step | Teacher sees | System writes |
|---|---|---|
| Opens Today | Ordered attention inbox (see below) | — |
| Verifies | Expected passage, prior corrections, cue history, delayed-recall history, advisory signals | `oral_verification_recorded`, `correction_added` |
| Records correction | Taxonomy + optional note; correction persists until resolved | `correction_added` |
| Moves to next learner | No page transition; keyboard shortcut | — |
| Assigns | 4-step wizard: Who → What → Evidence policy → Review | `AssignmentPolicyVersion` row |
| Investigates | Learner profile: independent vs assisted, joins, corrections, reading prerequisites | — |

**Attention inbox order** (fixed, not configurable in v1):
1. Recitations waiting for verification
2. Learners with repeated corrections or recall decline
3. Assigned work not started
4. Review overload or inactivity
5. Pending guardian/teacher governance requests
6. Class preparation and recently improved learners

Every row shows **evidence, confidence, and one direct action**. No black-box
"at-risk" label.

Failure mode designed against: a dashboard that shows everything and decides
nothing.

---

## Parent / guardian

1. Requests a relationship claim → **sees nothing at all** until approved.
2. Once approved: Today shows plain-language guidance, not a percentage.
   - "Your child recalled this passage after seven days, but two joins still
     need support."
   - "No recorded practice today." (A quiet day is reported as a quiet day.)
   - "The teacher asked for ten minutes of listening before the next recitation."
3. Home tasks show **who assigned** and **who checked**.
4. A tutoring guardian may approve only work they themselves created, and only
   while the grant is active. Any authorized adult can revoke immediately.

Failure mode designed against: a parent making a judgement from an unexplained
number.

---

## Academy administrator

1. Onboards academy, classes, rosters; invites staff (MFA required for staff).
2. Reviews content approvals — **nothing Qurʾān-adjacent goes live without a
   qualified human approval recorded against source, licence, and expiry.**
3. Manages governance: guardian claims, tutoring grants, revocations, exports,
   deletions — each an auditable workflow, not a database edit.
4. Reads analytics at academy level: verification throughput, review backlog,
   teacher minutes per verified learner.

Failure mode designed against: governance handled by an engineer with psql.
