# Phase 29 — a press is answered where it is made

*6 October 2026. Branch `p29-filtering`, off master @ `96e63a9`. Fixture only.*

## Why

The owner: on Threats and Who is involved, filtering "appears broken". The page is
long, and the thing being filtered is not on the page. Measured on the fixture:

- **Threats** opens on the pattern grid. Pressing a row or square narrowed the
  *ranked list*, which is a different page (`/threats/weights`). On the page
  itself the only change was the pressed label turning black.
- A **banner was inserted above the page** at the moment of the press. That
  pushed everything under the pointer down by its own height, and on a long page
  it was off screen (sticky from tablet, but only once scrolled into).
- **Who is involved**: the body table deliberately never narrows itself (it is
  the picker). Its answer, "What X could do", sat below the whole table, a screen
  and more away at 24 bodies. A part pressed in the table above had no answer on
  the page at all.
- The "In this section" cards kept saying "31 ways to beat it" under a selection.

## What changed

| | before | after |
|---|---|---|
| Threats grid | press → the label goes black | `SelectionAnswer` under the grid: "“Gaming a measure”: 3 ways to beat it", the worst five by name, **See all 3 ranked, with what would stop each** (routes to the ranked list with the selection), **Clear the selection** |
| Who: body table | answer below the whole table | the answer opens **in a row under the pressed body**, and follows it through a sort |
| Who: parts table | no answer on the page | the same row under the pressed part |
| Selection banner (service, tablet up) | inserted above the page, moving it | **a bar fixed to the foot of the window**: nothing moves when it arrives, always in view, with the count ("1 of 3 ways to beat it") |
| "Ways to beat it" card | "3 ways to beat it" regardless | "1 of 3 ways to beat it match" under a selection |
| Instructions | "narrow the whole report to it" / "this table … never narrows itself" | say where the answer appears and that the choice carries until cleared |

Below tablet the banner stays in the flow, as phase 21 decided: a fixed bar would
spend a phone's height (and 400% zoom's) on furniture. The pack is unchanged. It
is one document with its own in-flow banners at each move.

## Decisions

| fork | chosen | why |
|---|---|---|
| Answer component | one `SelectionAnswer` (`.prt-mech` block) for every picker | the Causes page already answered its bars this way; one look for "the answer to what you pressed" |
| Where in a table | an expansion row (`Table`'s new `expanded`) | follows the row through a sort; the press and the answer stay one glance apart |
| A table that scrolls sideways | the answer is sticky against the scroll box's left edge, capped at the window | it spans the full table; unpinned, its lines ran off a phone's right edge |
| Fixed bar vs focus | `scroll-padding-bottom` while it shows | WCAG 2.2 2.4.11: focus and anchor targets stop short of the bar |
| Answer as live region | no | the bar's `role="status"` already announces each press; twice is noise |
| List length in the answer | worst five, then "and N more" plus the link | it answers "what is this?" and sends "all of them" to the page built for it |

## Tests

- `selection.test.ts`: `answerHeading` wording (one and many, all four kinds, none).
- Walk: a grid square is answered under the grid with a count, the bar counts what
  is left, "See … ranked" routes to `/threats/weights` carrying `sel`; on Who a
  pressed body does not move under the pointer (≤2px), its answer is the very
  next row, and clearing closes it. The two existing "Clear the selection"
  presses are scoped to the bar.
- `test:all` green: unit 1,499, integration, claim, a11y (28 routes, 0
  serious/critical), walk, offline.
