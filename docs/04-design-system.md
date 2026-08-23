# 04 — Design tokens and component inventory

## Brand concept

ATHAR means *trace* — a lasting imprint. The metaphor is not decoration: it is
**evidence becoming visible**. A blank page receives a restrained ink trace when
memory is retrieved, then returns to blank so memory must prove itself again.

The product should feel like a finely made learning instrument: quiet, exact,
warm, trustworthy. Contemporary without generic-SaaS gloss. Spiritually
respectful **without** mosque arches, zellīj wallpaper, gold frames, crescents,
or ornamental cliché.

All brand strings live in `src/config/brand.ts`. The name is a working creative
direction, not cleared IP; Arabic copy requires review by a qualified Arabic
linguist before release.

## Colour tokens — "paper, ink, and light"

| Token | Value | Use |
|---|---|---|
| `paper` | `#FBF8F1` | Muṣḥaf paper and warm surfaces |
| `canvas` | `#F3F5F3` | Application background |
| `ink` | `#18211F` | Primary text |
| `night` | `#101923` | Dark surround, high-trust contrast |
| `deepIndigo` | `#29466B` | Primary actions and focus |
| `sage` | `#457565` | Retention, success, calm progress |
| `copper` | `#A6673F` | Sparse warmth, milestones — **never body text** |
| `mist` | `#DDE5E1` | Dividers and disabled surfaces |
| `warning` | `#A46A19` | Needs attention (fills / borders / large only) |
| `error` | `#B44444` | Errors and destructive actions |
| `warningText` | `#8A5814` | Warning colour **when it carries text** |
| `copperText` | `#8A5433` | Copper colour **when it carries text** |

### Measured contrast matrix (WCAG 2.2, computed not estimated)

| fg | bg | ratio | grade | use |
|---|---|---:|---|---|
| ink | paper | 15.51:1 | AAA | body text on muṣḥaf paper |
| ink | canvas | 15.02:1 | AAA | body text on app background |
| ink | mist | 12.83:1 | AAA | text on divider / disabled surface |
| deepIndigo | paper | 9.07:1 | AAA | primary action text on paper |
| deepIndigo | canvas | 8.78:1 | AAA | primary action / focus ring on canvas |
| white | deepIndigo | 9.62:1 | AAA | label on primary button |
| sage | paper | 4.97:1 | AA | success text on paper |
| sage | canvas | 4.81:1 | AA | success text on canvas |
| white | sage | 5.27:1 | AA | label on success fill |
| copper | paper | 4.27:1 | **fails AA for text** | milestone accent only |
| white | copper | 4.53:1 | AA | label on milestone fill |
| warning | paper | 4.25:1 | **fails AA for text** | fill / border only |
| warning | canvas | 4.12:1 | **fails AA for text** | fill / border only |
| white | warning | 4.51:1 | AA | label on warning fill |
| warningText | paper | 5.68:1 | AA | warning text on paper |
| warningText | canvas | 5.50:1 | AA | warning text on canvas |
| copperText | paper | 5.83:1 | AA | milestone text on paper |
| error | paper | 5.14:1 | AA | error text on paper |
| error | canvas | 4.98:1 | AA | error text on canvas |
| white | error | 5.45:1 | AA | label on destructive fill |
| paper | night | 16.70:1 | AAA | paper text on dark surround |
| mist | night | 13.81:1 | AAA | muted text on dark surround |
| white | night | 17.72:1 | AAA | high-contrast text on dark surround |

**Finding recorded honestly:** the specified `warning` and `copper` values do
not reach AA at body-text size. They are retained for fills and large accents;
`warningText` / `copperText` are the text-bearing variants. A CI check
(`tests/tokens.contrast.test.ts`) fails the build if any token pair declared
text-bearing drops below 4.5:1.

## Typography

| Role | Family | Rule |
|---|---|---|
| Latin UI | Manrope | Open, highly legible sans |
| Arabic UI | IBM Plex Sans Arabic | Navigation and instructional copy |
| Qurʾānic text | Amiri Quran | **Reserved exclusively for verified Qurʾānic text** |

Qurʾānic typography must never be used for headings, controls, generated text,
drills, or brand marks.

## Space, shape, motion

- 4 px spacing grid; 12 px default radius.
- Subtle borders, almost no shadows, no glassmorphism.
- One icon family, 20/24 px optical sizes. Emoji are never primary navigation.
- Motion: 120 ms micro-feedback · 180 ms state change · 240 ms page transition.
- `prefers-reduced-motion: reduce` disables all non-essential motion entirely —
  not merely shortens it.

## Muṣḥaf dominance rules

1. The muṣḥaf is always the visually dominant element on its screen.
2. No ornament, chart, status chip, tooltip, toast, or celebration may overlap
   or compete with it.
3. Dark mode darkens the **surround only**. The page stays warm paper with
   accessible ink. Sacred text is never inverted or tinted.
4. Line geometry is invariant across locale and theme.

## Tone of voice

Calm, precise, encouraging, non-patronising. No guilt, urgency tricks, loss
aversion, exaggerated praise, or "You failed."

- Prefer: *"This join needs another clean recall."*
- Prefer: *"Your next review is ready."*
- Explain an Arabic term once in plain language, then use it consistently.
- All Arabic UI copy is hand-written and linguistically reviewed. Raw machine
  translation never ships.

## Age expression — one engine, three presentations

| | Little learner | Junior | Adult |
|---|---|---|---|
| Controls | Very large, one action at a time | Compact, milestone-visible | Quiet, efficient |
| Colour | Functional illustrated symbols | Stronger accents | Restrained |
| Settings | None — grown-up handoff | Minimal | Full, on demand |
| Data | None | Simple summary | Detailed memory dimensions |

Three presentations. **Not** three apps and **not** three learning engines.

## Component inventory (accessible by construction)

Every component ships with: keyboard operation, visible focus, screen-reader
name/role/state, 44×44 px minimum target, RTL mirroring, reduced-motion
behaviour, and light/dark tokens.

**Primitives** — Button, IconButton, Link, TextField, Select, Checkbox, Radio,
Switch, Slider, Tooltip, Popover, Dialog, BottomSheet, Tabs, Disclosure, Toast,
Banner, Badge, Avatar, Divider, Skeleton, ProgressMeter, EmptyState,
ErrorState, PermissionDeniedState, OfflineState, StaleDataNotice.

**Domain** —
- `MushafPage` — fixed 15-line geometry, blank-first, position-exact fill
- `WordTile` / `TileTray` — RTL, below-page, drag **and** keyboard/click paths
- `ScaffoldLadder` — announces the current rung in words
- `AssistanceControl` — always states its consequence before use
- `EvidenceChip` — independent vs assisted, always with denominator
- `LearningStateBadge` — the nine states, non-colour-encoded too
- `ReviewReason` — the human-readable "why this is due" line
- `MemoryMap` — 604-page grid, legend, non-colour encoding
- `AttentionRow` — evidence → confidence → one action
- `CorrectionPicker` — the correction taxonomy
- `VerificationDecisionBar` — 4 decisions, shortcuts 1–4
- `HonestMetric` — refuses to render without a denominator or a stated reason
  for its absence

## Accessibility floor (non-negotiable)

- WCAG 2.2 AA at the component-system level; AAA for body copy where practical.
- Full keyboard operation, logical focus order, visible focus, error
  announcements, and an **accessible alternative to every drag interaction**.
- Captions/transcripts for instructional media; text alternatives for mouth
  diagrams.
- Zoom to 200 %, dyslexia-friendly spacing option, high contrast, and no
  colour-only meaning.
- English and Arabic/RTL built together from the first component — mixed
  direction strings, numerals, dates, and Qurʾānic references tested.
