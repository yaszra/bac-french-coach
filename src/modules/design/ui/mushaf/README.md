# The muṣḥaf page — rules any screen must obey

The page a learner recites from is the one surface in Itqān that the design
system is not allowed to design. Everything here exists to protect it.

## 1. The text is never ours

`InkWord`, `AyahLine`, `MushafPage` and `PageFrame` all receive Arabic as
**props**. Nothing in this folder contains an Arabic string, and nothing here
may ever generate, complete, correct, paraphrase, reconstruct or transliterate
one. Scripture comes byte-for-byte from the content package (`content/quran/`,
Tanzil ʿUthmānī Ḥafṣ) and is proven by `scripts/verify_content.mjs`.

The header band takes a **node**, not a sūrah name: the caller supplies it from
content. Numerals are produced by `Intl` from a number (`numerals.ts`), so no
glyph is ever typed by hand.

If the page cannot be loaded, render the honest state — `MushafPage` with an
empty `lines` array shows `state.notYetRecorded`. Never fill the gap.

## 2. Fixed tokens only

The page is styled exclusively from the `--mushaf-*` family plus the
`--ink-depth-*` ladder. Those tokens are identical in every theme and every
tier and it is a **test failure** to redefine one inside a `[data-theme]` or
`[data-tier]` block (`src/modules/design/tests/tokens.test.ts`).

In dark theme the chrome around the page becomes slate; the sheet keeps
`--mushaf-paper` and `--mushaf-ink`. There is no dark muṣḥaf.

Do not put a tier radius on the sheet, a gradient behind it, a tint over it, or
a card treatment around it. The only theme-aware value that touches the frame
is the shadow that lifts it off the chrome.

## 3. Ink depth is alpha, never hue

Memory strength 0–5 maps to `--ink-depth-0…5` and is applied as the **alpha of
the one ink colour**:

```css
color: color-mix(in srgb, var(--mushaf-ink) calc(var(--ink-strength) * 100%), transparent);
```

Never map depth to a colour, a background, a badge or a size. Depth 0 leaves
the word's space blank (the glyph is `visibility: hidden`, so the line does not
reflow) with a faint ink rule beneath it, and the button's accessible name
becomes `a11y.wordInAyah` plus `a11y.inkDepth` — a hidden word is announced as
present and unearned, never silently dropped.

`revealed` is the scaffold: it shows a depth-0 word at full ink for review. It
changes what is *shown*, never what was *earned* — the `data-earned` attribute
keeps the real depth.

## 4. One mark may move

The word-sync indicator (`state="active"`) is a restrained ink underline that
transitions at `--motion-fast`. It is the only animation permitted on the page.

- `correct` — a faint ink ground (6% ink). Ink, not a colour.
- `lapsed` — a dotted ink underline. Ink, not a colour.
- hover — **nothing**. The page does not react to a passing cursor.

No coloured highlight, no glow, no confetti, no rosette animation, no page
transition. The one deliberate exception to "no colour on the page" is the
focus ring: keyboard users must see where they are, so `:focus-visible` keeps
the platform ring.

## 5. Every word is a button

Muṣḥaf words are operable, so they are real `<button>` elements — never spans
with click handlers. They are inline targets inside a line of scripture, so
they are deliberately exempt from the `--tap-min` floor (WCAG 2.5.8 inline
exception); the floor still governs every control around the page.

`MushafPage` owns keyboard navigation: **one tab stop for the whole page**
(roving tabindex), then

| key | movement |
| --- | --- |
| `ArrowLeft` | next word (the page is right-to-left: leftwards is forwards) |
| `ArrowRight` | previous word |
| `ArrowUp` / `ArrowDown` | same column, previous / next line |
| `Home` / `End` | first / last word of the line |
| `Ctrl`+`Home` / `Ctrl`+`End` | first / last word of the page |

The arrow mapping follows the **page's** direction, not the interface locale:
the muṣḥaf is right-to-left in English too. Every Arabic node carries
`lang="ar"` and `dir="rtl"`.

## 6. The page decides nothing

Evidence rule: `onSelect` reports that a learner touched a word. It never
writes memory state, never marks mastery, never advances anything. `depth` and
`state` arrive from the server, already decided.

## 7. The legend lives elsewhere

`InkLegend` explains held / due / not yet earned. Show it in onboarding. Never
on the page — the page is recited from, not read about.

## 8. Density, not shrinkage

`PageFrame`'s `dense` mode narrows the margins for the phone. It never scales
the scripture: `--mushaf-font-size`, `--mushaf-leading` and `--mushaf-word-gap`
are fixed. If the page does not fit, give it more of the viewport — never less
type.

## Known gaps (be honest about them)

- Lines are centred, not justified. True muṣḥaf justification needs the layout
  file's line breaks plus the KFGQPC font metrics; when the layout package
  lands, `AyahLine` should switch to `justify-content: space-between` per
  layout-declared line.
- Word states `active` / `correct` / `lapsed` have no dedicated message keys
  yet, so only depth-0 words carry a spoken state.
