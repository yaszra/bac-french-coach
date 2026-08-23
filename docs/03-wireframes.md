# 03 — Wireframes (low fidelity, layout-normative)

ASCII wireframes are normative for **hierarchy, order, and dominance**, not for
pixel values. Design tokens in `04-design-system.md` govern appearance.

---

## 1. Learner Today (`/learn/today`)

```
┌──────────────────────────────────────────────────────────┐
│ ATHAR                                    [ ]  account ▾  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Continue now                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Al-Baqarah, joins from yesterday                   │  │
│  │ ~9 minutes of active practice                      │  │
│  │                                    [ Continue → ]  │  │  ← ONE primary CTA
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  New memory                                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Today's segment · assigned by Ustadh Kareem        │  │
│  │ 4 āyāt · 3 listens required          [ Start ]     │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Keep strong            3 due · 1 fragile                │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Why: verified 6 days ago, hesitant yesterday       │  │  ← reason, always
│  │                                      [ Review ]    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Teacher response                                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Verified with a minor slip · 1 join to repair      │  │
│  │                                      [ Repair ]    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Optional practice                              (quiet)  │
│                                                          │
│  Today's effort target: 12 active minutes · 4 done       │  ← effort, not screen time
└──────────────────────────────────────────────────────────┘
```

Rules: vertical order is fixed. If the due queue exceeds the session budget,
the visible queue is capped and the page states **what was prioritised and
what was deferred** — it never marks deferred work complete.

---

## 2. Memorization session (`/learn/session/[assignmentId]`) — desktop

```
┌────────┬────────────────────────────────────────┬──────────────────┐
│ RAIL   │            MUṢḤAF PAGE                 │  ACTION PANEL    │
│        │      (visually dominant, warm paper)   │                  │
│ Stage  │  ┌──────────────────────────────────┐  │  Stage 2 of 9    │
│  1 ✓   │  │                                  │  │  Listen and map  │
│  2 ✓   │  │   line 1 ......................  │  │                  │
│  3 ●   │  │   line 2 ......................  │  │  [ ▶ Play āyah ] │
│  4     │  │   ...                            │  │  Listens: 2 / 3  │
│  5     │  │   (15 lines, geometry fixed,     │  │                  │
│  6     │  │    begins BLANK each session)    │  │  ○ 0.75×  ● 1×   │
│  7     │  │   ...                            │  │                  │
│  8     │  │   line 15 .....................  │  │  [ Need a hint ] │
│  9     │  │                                  │  │   ↳ marks this   │
│        │  └──────────────────────────────────┘  │     attempt      │
│        │                                        │     assisted     │
│        │  ┌─ tile tray (RTL, BELOW the page) ─┐ │                  │
│        │  │  [tile] [tile] [tile] [tile]      │ │                  │
│        │  └───────────────────────────────────┘ │                  │
└────────┴────────────────────────────────────────┴──────────────────┘
```

Rules:
- Tiles are **below** the page, never overlaid on it.
- Nothing — chart, chip, tooltip, celebration — may overlap the muṣḥaf.
- Line geometry is invariant across EN/AR and light/dark. Never reflow into a
  scrolling paragraph.
- Mobile: page goes full width; controls move to an accessible bottom sheet.
- Hint control is always visible and always labelled with its consequence.

---

## 3. Teacher Today (`/teach/today`)

```
┌──────────────────────────────────────────────────────────────┐
│ Attention                                    Class: Ḥifẓ 2 ▾ │
├──────────────────────────────────────────────────────────────┤
│ ① Waiting for verification                              (5)  │
│   Amina S.   Al-Mulk 12–15   requested 2h ago   [ Verify ]   │
│   Yusuf K.   Al-Mulk 1–4     requested 5h ago   [ Verify ]   │
│                                                              │
│ ② Repeated corrections / recall decline                  (2) │
│   Bilal R.   "join" correction 3× in 9 days                  │
│     Evidence: 3 corrections, 2 verifications  Confidence: high│
│                                            [ Open profile ]  │
│                                                              │
│ ③ Assigned, not started                                  (3) │
│ ④ Review overload or inactivity                          (1) │
│ ⑤ Governance requests                                    (2) │
│ ⑥ Preparation / recently improved                        (4) │
└──────────────────────────────────────────────────────────────┘
```

Each row: **evidence → confidence → one action.** No decorative charts.

---

## 4. Verification workspace (`/teach/verify/[requestId]`)

```
┌──────────────────────────────────────────────────────────────┐
│ Amina S. · Al-Mulk 12–15 · policy v3 · assigned by you       │
├──────────────────────────────────────────────────────────────┤
│  EXPECTED PASSAGE (reference, teacher-only)                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  ... muṣḥaf reference, chain boundaries marked  ⟨ ⟩    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Prior corrections (2)          ← BEFORE any telemetry       │
│   • join at 12→13 · unresolved · added 9 Aug                 │
│   • madd at 14 · resolved 12 Aug                             │
│                                                              │
│  Cue history: 4 independent, 1 assisted · delayed 6d ✓       │
│  Advisory signal: uncertain region at 13 (low confidence)    │  ← advisory only
│                                                              │
│  Decision:  [1 Verified] [2 Minor slip] [3 Practice again]   │
│             [4 Unable to assess]                             │
│  Correction: [word][omission][insertion][order][join]        │
│              [similar][vowel][letter][makhraj][madd]         │
│              [ghunnah][waqf] + note                          │
│                                                              │
│              [ Save and next learner → ]  (no page change)   │
└──────────────────────────────────────────────────────────────┘
```

Rules: keyboard shortcuts 1–4; large touch targets; no score or leaderboard
that could pressure the teacher's judgement.

---

## 5. Learner profile for teachers (`/teach/learners/[learnerId]`)

```
┌──────────────────────────────────────────────────────────────┐
│ Amina S. · Ḥifẓ 2 · joined 3 Feb                             │
├──────────────────────────────────────────────────────────────┤
│ What needs attention next                                    │
│  The join at Al-Mulk 12→13 has failed twice after verifying. │
│  Reading prerequisite "madd ʿāriḍ" is unconfirmed.           │
├──────────────────────────────────────────────────────────────┤
│ Memory      ┌──────────────────────────────────────────────┐ │
│ dimensions  │ sequence      ████████░░                     │ │
│             │ oral recall   ██████░░░░                     │ │
│             │ connections   ███░░░░░░░  ← weakest          │ │
│             │ cue independ. ███████░░░                     │ │
│             │ fluency       ██████░░░░                     │ │
│             │ page location █████░░░░░                     │ │
│             └──────────────────────────────────────────────┘ │
│ States   assigned 2 · preparing 1 · verified 6 · established │
│          4 · durable 2 · fragile 1 · repairing 1             │
│ Independent 41 · Assisted 68   (denominators always shown)   │
│ Recurring corrections: join ×3, madd ×2                      │
│ Active time this week: 96 min · Inactive days: 2             │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Parent report (`/family/children/[childId]`)

```
┌──────────────────────────────────────────────────────────────┐
│ Amina                                                        │
├──────────────────────────────────────────────────────────────┤
│ This week                                                    │
│  Amina recalled Al-Mulk 8–11 on her own after seven days.    │
│  Two joins still need support.                               │
│                                                              │
│  Tuesday: no recorded practice.                              │
│                                                              │
│ What the teacher asked for                                   │
│  Ten minutes of listening before the next recitation.        │
│  — Ustadh Kareem, 14 Aug                                     │
│                                                              │
│ Home tasks                                                   │
│  ✓ Listening 10 min · assigned by Ustadh Kareem              │
│                       checked by you, 15 Aug                 │
│  ○ Listening 10 min · not yet done                           │
│                                                              │
│ Last teacher verification: 14 Aug — verified with minor slip │
└──────────────────────────────────────────────────────────────┘
```

No unexplained percentage anywhere. Every claim names its source and its
denominator or a plain-language equivalent.
