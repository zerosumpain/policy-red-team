# Phase 20 — start from a summary, drill into the detail

*30 September 2026. Kicked off autonomously: "make the interface and intelligence
more of a dashboard style interface; easier to start from a summary and drill into
detail … don't stray from the gov.uk style view … people who will be easily
bewildered with non-intuitive, information-rich complex interfaces."*

## What was measured before anything changed

On the real *Best Start* run (`44dd5420`, a copy of the live database):

| view | height at 1280px |
|---|---|
| Verdict (the landing tab) | 13,737px |
| Causes | 16,664px |
| Threats | 11,903px |
| Who is involved | 12,159px |
| Where this comes from | 33,341px |
| **the report on a phone (420px)** | **162,585px** |

The phone figure is the framework's own narrow-width behaviour: under `tablet`
the tabs are torn down and every panel is shown at once. Five panels of a
document already measured in screens, stacked.

The report is honest and thorough. Its problem for the reader this phase is for
is that the first thing it offers is a document: a headline, then the first of
two key judgements at full length, then a contents list, then 13,000px. There is
no single view that says *how bad, where, who, what to do, and how far to trust
it* — the five things a first-time reader wants — and then lets them choose.

## What this phase does

1. **A Summary view is the new front door of every assessment** (`?move=overview`,
   the default). One screen and a bit: the answer in a sentence; four headline
   figures, each a door into the tab that explains it; the things that matter
   most as short cards; then six summary cards — how exposed, the worst ways to
   beat it, where the pressure lands, who could do it, what it recommends, and
   how far to trust this. Every card ends in one link: *See all … in Threats*.
   Every figure on it is computed by the function the detailed tab already uses,
   so the summary and the detail cannot disagree.
2. **Each tab opens on its own "at a glance" cards** instead of a numbered
   contents list: the sections in that tab as a grid of link cards, each with the
   figure that says how much is behind it.
3. **A phone shows one view at a time.** The tab strip becomes a stacked list of
   the six views and only the chosen one renders. Print is unchanged — every
   panel still prints.
4. **The landing page is a dashboard of assessments.** The latest finished
   assessment leads as a feature card (its answer, its exposure bar, its four
   figures); the rest are compact cards with a mini exposure bar. The
   eighteen-stage explainer moves behind a disclosure.
5. **The offline pack gets the Summary too**, at the head of its cascade, with
   every "See all" link an anchor into the same document.

## Decision log

| fork | options | chosen | why | reversible? |
|---|---|---|---|---|
| Where the summary lives | (a) a new first tab; (b) rebuild the Verdict tab as the dashboard; (c) a separate route | **(a)** | The Verdict tab is a *finding*, not a summary — its brief, recommendations and write-up are the detail a summary card points at. A tab keeps the selection, the URL model and the back-link machinery untouched. `?move=verdict` still opens Verdict. | Yes — one entry in `MOVES`, one default. |
| What the default tab is | keep Verdict / Summary | **Summary** | The brief asked to start from a summary. A bare `/assessments/:id` lands on it; old links carrying `?move=` land where they always did. | Yes |
| New charts or reuse | draw new marks / reuse `StackedBar`, `Bar`, band tags | **reuse** | The band ramp is validated (phase 14, divergence 15). A dashboard in a second visual vocabulary would be two products. | — |
| GOV.UK has no "card" | invent a card / compose from framework parts | **compose**: the metric card's 5px top rule, `govuk-heading-m`, `govuk-body`, `govuk-link`. The whole card is not one link — the link is the last line, so a screen reader hears a heading, a sentence, then a destination. | GOV.UK dashboards (e.g. the performance platform) use exactly this: a figure, a caption, a link. | Yes |
| Phone behaviour | framework (all panels) / one panel | **one panel** | 162,585px is not a page anyone reads. This departs from `tabs.mjs`'s teardown; the list stays a list of links (no ARIA tab roles under tablet), so it reads as navigation, which it is. | Yes — `Tabs` keeps both branches. |
| Home figures | fetch every report / server summary | **server summary**, computed by the same pure module the client uses, cached by id + `updatedAt` | Five full reports is ~15MB for a landing page. | Yes |
| Summary in the pack | skip / include | **include**, anchors not tab switches | The pack is where a recipient without the service reads, and they are exactly the reader this phase is for. | Yes |

## Not done, deliberately

- No numbers invented for the summary: a card with nothing to say (a run with no
  plays, no recommendations) does not render, like every gated section here.
- The drill, personas and bodies pages are unchanged in structure; they are
  already one-thing-per-page.

## What the review caught (all fixed before shipping)

An independent review of the diff found no leak and no crash, and eight
correctness defects. The two that mattered:

- **The "In this tab" cards counted the whole assessment while the tab label
  beside them counted the selection.** Under `?sel=band:severe` Causes said 12
  parts and its card said 33 — exactly the summary-disagrees-with-detail
  failure this phase exists to avoid. The cards now take the tab's own narrowed
  figures; only the Summary reads the whole assessment, and says so.
- **On a phone, a stale `#report-panel-*` hash won the next Back or reload.**
  The phone list is made of those anchors; moving on by a summary box left the
  old one in the address bar. Harmless while every panel was drawn, visible the
  moment only one is. The URL writer now drops a hash naming another view, and
  the walk asserts it at 320px.

Also: the pack's "Read the report in full" links pointed at tab panels a pack
does not have (now the first section of each move); the trust box linked a
heading that a run with no discards never draws; "break no rule" disagreed
with the Legality section's reading of grey-area plays (now "inside the
rules", the same count as that section's own row); the landing page said "6
moves"; a transient database error was cached as "no figures"; and "Latest
assessment" could lead with a failed run while a finished one existed.

## Measured after

| view | before | after |
|---|---|---|
| where a reader lands (1280px) | 13,737px (Verdict) | 4,816px (Summary) |
| the report on a phone (420px) | 162,585px | 8,932px (Summary; each view alone) |
| landing page (1280px) | 1,767px, a table | 2,064px, a feature card + a table that says how each run came out |

Gates: typecheck, 1,214 unit (+8), integration, claim, a11y (15 routes), the
walk (with summary, phone and landing assertions added), offline — all green.
