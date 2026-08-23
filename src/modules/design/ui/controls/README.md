# Marginalia controls — the usage contract

Everything a learner, a teacher or a guardian touches is one of these. If you
are building a screen, you assemble from this list; you do not style your own.

## The rule

**Raw `<button>`, `<input>`, `<select>` and `<textarea>` are lint errors outside
`src/modules/design/`.** The rule is enforced in `eslint.config.mjs`, and the
four wrappers in this directory are the only sanctioned exceptions. If a control
you need is missing, add it here — do not open an escape hatch in a feature
module.

## Which one do I reach for?

| I need…                                   | Use                                              |
| ----------------------------------------- | ------------------------------------------------ |
| the one obvious next action                | `<Button variant="primary">`                     |
| a secondary action beside it               | `<Button variant="secondary">`                   |
| a tertiary action in a dense row           | `<Button variant="quiet">`                       |
| something destructive                      | `<Button variant="danger">`                      |
| an icon-only control                       | `<IconButton label="…">` — `label` is required   |
| navigation that looks like a button        | `<LinkButton href="…">` (`as={Link}` internally) |
| any labelled control                       | `<Field label="…">` wrapping the control         |
| one line of text · many lines · a choice   | `<Input>` · `<Textarea>` · `<Select>`            |
| a setting that applies immediately         | `<Switch>`                                       |
| a tag, a filter, a removable selection     | `<Chip>`                                         |
| sections of one page                       | `<Tabs>` / `<TabList>` / `<Tab>` / `<TabPanel>`  |
| a status marker that is never pressed      | `<Badge>` (in `../display`)                      |
| a rate, a ring, a placeholder, an empty page | `../display`: `Progress`, `Rosette`, `Skeleton`, `EmptyState` |

## What every component assumes

- **A surface.** All of these read tier, theme, direction and the translator from
  `useSurface()`, so they must render inside `<SurfaceProvider>`. Outside one
  they throw, loudly, in development and in tests.
- **You own the words.** No component contains a user-facing literal. Pass
  `label` / `children` from a message key; the only strings the components look
  up themselves are built-in ones (`a11y.loading`, `state.notYetRecorded`,
  `state.empty`, `progress.ofReviewed`).
- **The kids tier resizes itself.** `size="md"` becomes `lg` for children, and
  the `--tap-*` tokens grow with the tier. Never hard-code a size for children.
- **Tap targets are non-negotiable.** Every interactive element spends
  `var(--tap-min)` — 44px, 56px for children. `src/modules/design/ui/controls/contract.test.ts`
  fails the build if a rule stops doing so.
- **Direction is logical.** No component uses `left` or `right`; direction-
  bearing marks mirror in RTL. Do the same in your screen CSS.
- **Tokens only.** Colours, spacing, radii and durations come from
  `tokens/marginalia.css`. No hex, no Tailwind colour utilities, no bare `ms`.
  Tailwind is for layout utilities; component skin is CSS Modules.

## States you get for free — and must not reinvent

- `loading` on `Button`/`IconButton` means **busy, not disabled**: it sets
  `aria-busy`, keeps the label in place so the width never jumps, stays
  focusable, and refuses activation. Use `disabled` only when the action is
  genuinely unavailable.
- `Field` owns the ids. Give it `label`, optionally `description`, `error` and
  `required`, and it wires `htmlFor`, `aria-describedby`, `aria-invalid` and a
  polite live region. Nested controls pick this up through context; a render
  prop (`{(control) => …}`) is there for anything exotic.
- Errors are strings you pass in, always from a message key.

## Honesty, in components

- `<Progress value max label>` **always** renders the denominator next to the
  label — a rate without its count is not shippable.
- Nothing recorded yet is a real state, not a zero: `<Progress unknown />` and
  `<EmptyState variant="not-yet-recorded" />` say so.
- `<Rosette milestone />` is the only place gold appears. Milestones only.

## Composition notes

- `EmptyState` takes exactly one `action` node. If you are reaching for a
  second, the screen has failed the five-second test.
- `Chip` is a `<span>` until you give it `onClick` or `selected`; `onRemove`
  turns it into a group whose remove control is a sibling button, never nested.
- `Table` requires a `caption`, sorts through `aria-sort` on the `<th>` and a
  real button inside it, and takes an `EmptyState` in `<TableEmpty>`.
- `Skeleton` is `aria-hidden`. The live region that says "Loading" belongs to
  you, once per region — not once per box.
