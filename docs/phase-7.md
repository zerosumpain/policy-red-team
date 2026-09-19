# Phase 7 — the drill

19 September 2026. The first of the six surfaces `docs/phase-4.md` left
outstanding: **an artefact's own page, with its provenance chain**.

## What it is

`/assessments/:id/artefacts/:artefactId`. Every name in the report — a play, a
body, a structural check, a finding, a recommendation — is now a link into it.

The page answers the question a policy professional actually asks when they
disagree with a finding, which is *says who?*

```
Followed back 4 steps, through 16 things the assessment established,
ending at 1 passage of the paper itself.

What it cites directly — 10
  Adaptability under changing conditions   Test, stage 9
  …
Second step back — 4
  Council                                  Actor, stage 2
  Policy text · passage 1                  Passage, stage 1

Back at the paper — 1 passage
  “The Council is accountable for delivery and bears implementation costs…”
```

Alongside the chain: what a play's four factors scored and what a high score
means in each; the seven narrative fields the report's table summarises away;
what a body says it wants against what its position rewards; what rests on this
artefact, which is what the assessment would have to revisit if it turned out to
be wrong; and every structured field, behind one disclosure.

## A page, not a drawer

Upstream's drill is a modal drawer over the dashboard. This is a route.

The GOV.UK Design System has no modal component, deliberately — the pattern is
one thing per page. A drawer would have meant a focus trap, its own Escape
handling and a bespoke back stack, which is three accessibility problems bought
to save a page load. A page gets all of it from the browser: **the back button
is the trail**, the URL is shareable, and three findings can be opened in three
tabs, which no drawer allows.

The cost is a navigation, so `Template`'s back link stopped being a plain `<a>`
and became the router's `Link`. The walk asserts that leaving the drill does not
reload the app, by stamping `window.__spa` before navigating and checking it
survived.

## Two bugs the fixture found

**The chain stopped short of the paper.** An ingested passage carries the
document's text in `statement`; everything downstream quotes a span of one into
`sourceQuote`. Filtering the terminus on `sourceQuote` alone therefore ended at
the claims and never reached the document — the one thing the walk exists to
find. `paperWording()` reads whichever field this kind of artefact uses.

**A structural check claimed it was produced during document ingestion.**
`stageOfId` reads the stage off the `s<n>_` id namespace, which is right for
everything a model writes and wrong for everything the pipeline computes: the
twelve checks are minted as `test_adaptability`, carry no prefix, and read as
stage 0. `detail()` has always sent the true figure per row in
`artefactMetadata`; nothing had ever described the field, so the client type did
not have it. No server change — the data was already on the wire.

Neither was visible to a type check or to a green test. Both were found by
looking at the rendered page, which is the third time in this build that has
been the thing that worked.

## Verification

```
typecheck            clean
unit                 433 in 25 files   (12 new, on the walk)
integration          19, 1 skipped
a11y                 6 routes, WCAG 2.2 AA, no licensed asset shipped
walk                 submit → report → drill → follow the chain → back
offline              opens from file:// with every request blocked
```

The walk gained four assertions that matter: the drill is reached by *clicking a
name in the report* rather than by typing a URL, its chain says how far back it
went, it reaches the paper, and coming back out of it routes rather than
reloads. axe is clean on the drill and on the page a chain link lands on.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| Drawer or page | port upstream's modal drawer; a route | **a route** | GDS has no modal on purpose; the browser already provides the trail, the URL and the tabs | yes — a drawer could wrap it later |
| The back stack | bespoke trail with a back button; browser history | **browser history** | a trail the browser already keeps, kept a second time, is a trail that can disagree with the back button | yes |
| Where the walk lives | add to `view.ts`; a new module | **`src/lib/provenance.ts`** | `view.ts` is copied verbatim and anything added to it reads as drift on every `sync:check` | yes |
| A new endpoint | `GET /artefacts/:id`; reuse `detail()` | **reuse `detail()`** | what cites this artefact is a question about all of them, and the chain walks refs across the set; a second shape of the same data is a second thing to keep in step | yes |
| Links in the report | thread an `offline` flag through; pass a render function | **a render function** | the pack physically cannot render a link, because the machinery is not in its bundle — rather than a flag being read correctly in eight places | yes |
| Chain caps | uncapped; cap silently; cap and say so | **cap and say so** | "rests on nothing further" and "we stopped looking" are different facts, and only one of them is about the policy | yes |
| Duplicate quotations | show both; keep the fuller wording | **keep the fuller** | a claim's `sourceQuote` is a span of the passage above it, and showing both implies two groundings where there is one — except in a shared copy, where the passage is redacted and the quote is all that is left | yes |
| The true stage | accept `stageOfId`; type the field the server already sends | **type the field** | the alternative was telling a reader that a structural check was produced during ingestion | yes |

## What is still outstanding

Unchanged from phase 4 except that the drill is now done: the 3D relationship
graph and the table beside it, the stress lab, share links in the interface (the
API is built and tested), persona detail, and material and restate.

Two smaller things this phase noticed and did not do:

- **No page sets `document.title`.** A drill opened in a tab is "Policy Red
  Team" like every other page. Fixing it for one route only would be worse than
  the current consistency, so it is a change for all of them or none.
- **`src/lib/policy-analysis/pipeline.ts` has moved upstream** (`72c40f6`, sizing
  the shared-context reserve from the calls rather than from a guess). It is a
  prompt-cache optimisation, unrelated to this work, and pulling it in changes
  how the pipeline fits context — a deliberate sync with its own verification,
  not a side effect of a UI phase.
