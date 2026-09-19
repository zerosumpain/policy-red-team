# Phase 8 — the relationship graph, and its table

19 September 2026. The second of the surfaces `docs/phase-4.md` left
outstanding: **the 3D relationship graph, and the table beside it the
accessibility statement commits to.**

It is not a 3D graph, and the reason is measurement rather than portability.

## What the data said

`network()` and `matrix.ts` came across in the fork and needed nothing written:
edges, entity degrees, seven relation families, eight structural insights, the
bodies-against-bodies grid and its own `legible` flag. What was missing was a
decision about what to draw.

So the derivation was run over a real assessment rather than the one-edge
fixture — *Best Start in Life*, 3,106 artefacts, 452 stated relationships across
420 entities, loaded out of the dev database into a local PGlite:

```
actor → mechanism   359        top 10 bodies carry 23% of outgoing edges
actor → claim        47        top 10 targets carry 18% of incoming
actor → actor        32        183 of 267 bodies point at one thing or nothing
mechanism → actor    14

adjacency(): 12 bodies drawn, 2 edges placed, legible FALSE
```

Then the question a picture has to answer — how much of the graph would a
node-link diagram of the busiest ends actually place?

```
bipartite  8 × 10   draws 10 of 452
bipartite 10 × 12   draws 16 of 452
bipartite 12 × 16   draws 23 of 452
bipartite 16 × 20   draws 34 of 452
bipartite 20 × 26   draws 43 of 452     — and no longer legible
```

**Under four per cent, at a size a reader can still take in.** The degree
distribution is flat, not heavy-tailed: a policy paper is a very wide, very
shallow star — hundreds of bodies each touching one or two pieces of machinery.
A map of it is a shape that flatters the extraction while answering nothing.
`matrix.ts` had already reached the same conclusion for the grid and encodes it
as `MIN_GRID_EDGES`; this is the same finding one level up.

## What is drawn instead

**Where the relationships run** — four bars, one per ordered pair of kinds. On
the real assessment: *79% run from a body to a piece of machinery.* That is the
shape of a paper that says who benefits and what will be done rather than who
answers to whom, and the section says so before the reader meets the thin
bodies-against-bodies list, so it reads as a finding rather than a broken chart.

**What kind of relationship** — the seven families. Money and burden 222,
accountability 93, evidence 65 … **authority 5, influence 3.** The paper's
theory of compliance, visible in one picture.

**Bodies against bodies** — the grid when `legible`, the ranked list when not,
with the reason said out loud. The denominator is the *placeable* relationships,
never all of them: "0 of 452" reads as a failed extraction where "32 of 452 run
between two bodies" is the fact.

**What the connections show** — the eight insights, which lead because they are
the only thing here a reader cannot get by scrolling. Every one is a missing
counterpart, and on the real paper they are worth the whole section:

> **Nesta** — 18 duties attributed, all from pages 26–37; nothing in the paper
> points back at it.

**And a node-link picture where one is honest: around a single body.** The drill
now draws what points at an entity and what it points at. Opened on Nesta, the
asymmetry that takes a paragraph to describe is visible in a second.

Every figure has a table, and the toggle is offered to everyone.

## Three things real data found that no gate could

**The page scrolled 831 pixels sideways at 320px.** Not the new charts — a
quoted passage. The paper's own text carries footnote runs (`childcare.32,33`),
bare URLs and identifiers with no space in them, and one such token is wider
than a phone. WCAG 2.2 1.4.10, present since phase 7's drill and invisible to
every gate, because the fixture's text is written in normal words. Fixed with
`overflow-wrap: anywhere` on `#main-content` — `anywhere` rather than
`break-word` because only `anywhere` also shrinks min-content width, which is
what lets a table cell narrow instead of forcing its column open. `npm run a11y`
now asserts the rule in the built stylesheet, since no fixture can reach it.

**The prose quoted the wrong figures.** `grid.oneWay` and `grid.reciprocal`
count the *drawn grid* — twelve bodies — and the page printed them above the
degraded list: "2 are stated one way only" over a table of thirty that all were.
Each branch now states its own.

**The toggle gave no visible sign of which view was showing.** `aria-pressed`
tells assistive technology and tells a sighted reader nothing: two identical
grey buttons over a chart. Present since phase 4, three of them now.

## Verification

```
typecheck            clean
unit                 452 in 27 files   (11 new, on the shape and the layout)
integration          19, 1 skipped
a11y                 6 routes + the reflow rule asserted in the built CSS
walk                 the section, its tables, the pressed state, 320px
offline              378 kB pack (up 50 kB), opens from file:// with no network
real data            3,106 artefacts: axe clean on the report and on a drill
                     with an ego map; 0px sideways at 320px; report in ~1.1s
real pack            built from the same assessment and opened from file:// with
                     every non-file request aborted — the whole section renders,
                     0 outward links, 0px sideways at 320px, 4.9 MB of one file
```

The last two are not gates and cannot be: they need a real assessment, and the
repository has a fixture. They were run by hand, and between them they found the
reflow failure, the mismatched figures and the invisible toggle state.

**The written exports already had this.** `report-doc.ts` — copied, untouched —
has carried `## The policy as a network` all along, with the same insights and
the same placeable-against-total framing. Checked against the real assessment,
the Word file and the page say the same thing to the digit (267 bodies, 452
relationships, 32 between two bodies), because both derive from `network()`.
That is the whole argument for having copied the view layer rather than
reimplementing it: two pictures of one graph cannot disagree about what is in
it.

## What the review found

Eight real defects, several verified by the reviewer rendering the components
against a synthetic graph built to the real assessment's proportions. The two
that mattered most were invisible to every gate:

| | What was wrong | Why it mattered |
|---|---|---|
| 1 | white text on `#b58840` in the ego map — **3.20:1** | 359 of 452 relationships end at a mechanism, so the commonest map there is lettered its subject below the contrast minimum. axe cannot see it: it will not resolve an SVG `<text>` against a sibling `<rect>` fill. The comment above the ramp asserted an invariant that was simply false. Now a white box with a coloured border and black text — 21:1, and the colour only has to clear 1.4.11's 3:1 as a graphical object |
| 2 | `egoLayout` sized the picture at one row per spoke and nothing else | a body with a single relationship — **183 of 267 on the real paper** — got a 30-unit box holding a 40-unit subject, and SVG clipped it off its own diagram. The last spoke's second line was clipped at every count |
| 3 | the page named the wrong entities on two insights | `network()` composes those subjects as "A → B" while the subject id is the EDGE's; the link renderer read `artefact.label` and printed the model's name for the edge. "Parents bear childcare access costs" where the truth was "Health → State-funded preschool childcare". **The offline pack, which has no renderer, was printing it correctly the whole time** |
| 4 | "N busier-than-average bodies are not on the grid" | `adjacency()` draws the busiest and drops the tail. The sentence said the opposite of the cap's own rule |
| 5 | grid cells counted relation TYPES | while `placeable` and `shown`, quoted in the sentence directly above, count relationships. Three `reports_to` edges on one pair rendered as `1` |
| 6 | the ego table's headers were written from the subject's point of view | true for half the rows and a lie for the other half: an incoming row put the other entity under "This body" |
| 7 | `network()` ran on every drill | including the ~90% of artefacts that have no relationships. Now gated on a scan for "is this id an edge endpoint" |
| 8 | `grid.bodies.indexOf(from)` inside the inner map | correct, but O(n) run n² times, and cubic the day the cap is raised |

Plus: a chart of zero rows produced `viewBox="0 0 720 0"`, which renders nothing;
the two charts' percentages had different denominators with nothing saying so; a
self-relationship appeared on both sides of its own map; `kind === 'actor'`
re-implemented `isBody` from the copied core; and the longest pair label ran
past the viewBox.

**And the fix for (3) did not work the first time.** The type changed, both
implementations changed, and the call site still passed one argument — so the
page rendered exactly as before. Found by re-rendering the real assessment and
looking for the arrows, not by re-reading the diff.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| The 3D graph | port it; a 2D node-link map; figures that fit the shape | **figures that fit the shape** | a map of the whole graph places under 4% of it at a legible size — measured, not assumed | yes, and the measurement is in `relationships.ts` for whoever revisits it |
| A node-link picture at all | none anywhere; around one entity | **around one entity** | that is the one scale at which it answers a question, and the asymmetry it shows takes a paragraph to say in prose | yes |
| Where it lives | its own route, like the drill; a report section | **a report section** | the offline pack renders `<Report>`, and a pack missing the relationship analysis is a lesser copy | yes |
| The colour ramp | upstream's `GRAPH_KIND` hues; GOV.UK's palette | **GOV.UK's, upstream's labels** | the two builds should call the same things by the same names; the hues belong to a dark dashboard | yes |
| Colour on the shape chart | by the kind at one end; one colour | **one colour** | three of four bars came out purple, which reads as a grouping that is not there | yes |
| The toggle | `govuk-tabs`; a button pair | **a button pair** | tabs below 641px render every panel stacked, so a phone would get the chart and the identical table beneath it — duplication where the point is a choice | yes |
| `network()` in the render body | leave it; memoise | **memoise** | 145ms on a real assessment, and the report re-renders on every stage event while a run is in flight | yes |
| The walk's body-to-body assertion | enrich the fixture; accept either branch | **accept either branch** | the fixture's one relationship runs body→machinery, which is the real shape too; ten test files read that fixture and changing it to satisfy a gate is the wrong way round | yes |
| The ego map's subject | darken the fill; letter it in black on white with a coloured border | **border** | there is no darker brown in the GOV.UK palette, and a rule that says "pick the text colour from the fill" is a rule somebody gets wrong later | yes |
| The grid contract | trust the reviewer's reading; pin it in a test | **pin it** | the branch real data never reaches is the branch nothing was checking; `relationships.test.ts` now asserts that a cell's `ids` sum to `shown` | yes |

## What is still outstanding

The stress lab, share links in the interface (the API is built and tested),
persona detail, and material and restate.

One thing this phase noticed and did not do: **a drill opened on a stage-1
actor shows no relationships**, because the graph's endpoints are the *resolved*
stage-2 bodies. The report's own "Who is involved" table links to the resolved
ones, so a reader following the page never lands wrong — but a reader following
a provenance chain into the extraction can. Saying "its relationships are
recorded against X" would need the resolution direction, which is not something
to guess at.
