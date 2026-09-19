# Phase 9 — the stress test

19 September 2026. The third of the surfaces `docs/phase-4.md` left outstanding:
**the stress lab.** The one thing on the report you run rather than read.

## What it is

Tick an assumption to suppose it false, and the page reports what the
assessment loses. On the real *Best Start in Life* assessment, one lever:

```
26 of 38 conclusions and results lose their footing.
5 of 45 ways to beat the policy are taken off the table.
The 12 structural checks are untouched whatever is failed here.

Recommendations — 5 of 6
  What they rest on no longer stands.
    Create a responsibility, authority and resource compact
      Nothing left supporting it · 3 of what it cites no longer stand
    …

Conclusions — 12 of 15
  rests on “Cross-sector coordination”
    Actors are numerous but institutional accountability is unresolved  Partly undercut
    …

Taken off the table — 5 of 45
  The good news on this page.
  needs “Cross-sector coordination”
    Delegate delivery while retaining credit and shifting blame  Taken off the table

No longer applies — 2
  Everything these rested on that stopped standing was a threat taken off the
  table. They have not been undermined; what they were about is gone.
```

The arithmetic is `stress.ts`, copied and untouched: it walks citations the
assessment already made — a play names the preconditions it needs, a conclusion
names its hypotheses and its results — so the same switches always give the same
answer and **nothing here costs a model call**. Which is also why it works in the
offline pack: verified running from `file://` with every request aborted.

**The two directions stay opposite.** A conclusion that loses its footing is not
thereby wrong; it is no longer supported by what was cited for it. A play whose
precondition fails is DISARMED — the actor needed that to be true. The same
switch is bad news in one panel and good news in the next, and collapsing them
into one "affected" count would be worse than not offering the tool. The walk
asserts they stay apart.

## The levers are checkboxes

"Suppose this turns out to be false", asked of a hundred and eleven assumptions,
is a set of yes/no questions — which is what GOV.UK's checkboxes component is. A
rail of bespoke toggles would be three accessibility problems bought to avoid one
that already works. `Checkboxes` is new, written to mirror `Radios` in the same
file line for line, and is on `/design` where the static gate can see it.

## Height, measured three times

Upstream rebuilt this panel once already, for the reason its own comment records:
1,468px with three levers pulled, two and a half screens for a thing whose point
is that you pull a lever and SEE the answer. Its three causes are in that comment
and they were all avoidable here. Two were not avoided.

| | 1 lever, real paper |
|---|---|
| first cut | **4,206px** |
| direct reasons split from consequential ones | 3,256px |
| one line per lever, machinery behind a disclosure | **2,296px** |

**The cause-once rule only compresses half the reasons.** `stress.ts` writes two
shapes of sentence: one names what the reader failed — *rests on "X"* — and is
the same for every row that cited it; the other is a consequence — *answers "Y",
which no longer stands* — and is different for every row. Grouping on the whole
reason compressed nothing at the second order, so six recommendations each
carried their own three-clause paragraph explaining at length that the
conclusions beneath them had gone. They are split now: the direct reason is
printed once above the rows that share it, and the consequential ones are counted
— "3 of what it cites no longer stand" — with the names one click away in the
drill, which is the page that exists for that question.

**A GOV.UK checkbox hint takes its own line**, so putting the weight there made
every lever two lines and the rail the tallest thing on the page — which is
upstream's third cause, reintroduced by using the component correctly. The figure
goes in the label, and the fieldset's own hint says what it means, once.

**And the machinery went behind a disclosure.** That a model and a scenario also
lost their footing is *how* the conclusions above lost theirs: true, and not the
answer to the question that was asked.

## Verification

```
typecheck            clean
unit                 472 in 28 files   (17 new, on the reading)
integration          19, 1 skipped
a11y                 7 routes, one h1 each, the reflow rule in the built CSS
walk                 pulls a lever, asserts the page changed, walks the DOM to
                     prove no lost row carries a good-news tag, exercises the
                     show-all path, and unticks it again
offline              389 kB pack (up 11 kB)
real data            levers pulled on 3,100 artefacts — axe clean, 0px sideways
                     at 320px, a ticked lever survives the rail collapsing, and
                     no section mixes the two directions
real pack            the simulation RUNS from file:// with every request
                     aborted: no server, no model
```

## What the review found

Two criticals, both about the one thing this panel must never do — collapse the
two directions — and both live on the real assessment rather than theoretical.

**The headline counted a disarmed play as a conclusion that fell.** `moved` was
`counts.total`, which sums all five kinds including plays. So a lever that only
took threats off the table printed *"2 of 4 conclusions and results move"* — and
because the reassurance sentence was gated on the same figure, it suppressed
*"nothing the assessment concluded was resting on it"* in exactly the case where
that is true. Two sentences now, two denominators:

```
26 of 38 conclusions and results lose their footing.
5 of 45 ways to beat the policy are taken off the table.
```

**And a conclusion whose only loss was a threat being removed was printed in red
as "Nothing left supporting it".** `RESULT_KINDS` includes `exploit`, so a
finding may cite an exploitation play as a result — the expected shape in an
adversarial assessment, not an odd one — and `stress.ts`'s test for whether a
cited result still stands is standing-blind. The page reported a conclusion as
undermined three inches above the same event listed as good news. `reading()`
now recognises those rows and says what is true of them: **No longer applies.**
On the real paper there are two, and they were in the red list before this.

| | also fixed |
|---|---|
| `Checkboxes` | filtered the selection through the RENDERED items, so anything ticked but off-screen was silently dropped on the next click — a reader who expanded the rail, ticked lever fifteen, collapsed it and ticked another lost the first without being told |
| the rail | collapsing it left a full results panel with no ticked box anywhere and no way to untick the lever driving it. A ticked lever is now always on screen |
| the hint | said 111 assumptions were offered while the button said "show all 24" |
| `byCause` | keyed on the join, so the same two reasons in the order the model happened to write them made two groups printing the same two sentences |
| the summary | had no `role="status"`, on the one control whose whole purpose is that you pull it and the answer changes. axe cannot see a missing live region, so the gate passed |
| the show-all | had no `aria-expanded` |
| `Cause` | keyed on the index, so an open `<details>` stayed open over rows from a different cause |
| the rail's ids | could collide with the panel's own section anchors |
| the link-button | omitted `-webkit-appearance: none`, which the mixin it cites does not |

**And the gate assertion for the thing that matters could not fail.** It tested
that two adjacent string literals were still adjacent. It now walks the DOM and
asserts that no row under a lost heading carries a good-news tag — which is the
check that would have caught the second critical — and it exercises the
show-all path, where two of the fixes above live.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| The levers | port upstream's toggle rail; checkboxes | **checkboxes** | it is a set of yes/no questions, and GOV.UK has the component; a bespoke rail is three accessibility problems bought to avoid one that works | yes |
| Where it lives | its own route; a report section | **a report section** | the pack renders `<Report>`, and the simulation needs no server — a pack that cannot run it is a lesser copy for no reason | yes |
| The second-order reasons | print them; count them | **count them** | six recommendations each explaining at length that the conclusions beneath them had gone is how the panel reached three screens; the names are one click away in the drill | yes |
| The lever's weight | a hint; a figure in the label | **the label** | a hint takes its own line, which doubles the rail — upstream's third cause, reintroduced by using the component correctly | yes |
| Scenarios and models | in the flow; behind a disclosure | **a disclosure** | they are how the conclusions lost their footing rather than the answer to the question asked | yes |
| `leverage()` | inside the panel; passed in | **passed in** | the report has to know whether there are levers before it prints a heading, and a section whose body is nothing is a heading over blank space | yes |
| The show-all control | a secondary button; a link-styled button | **link-styled** | it changes the page so it must be a button, and at the weight of a real GOV.UK button it would outrank what it reveals. govuk-frontend ships this exact reset for the accordion's own "Show all sections" | yes |

## What is still outstanding

Share links in the interface (the API is built and tested), persona detail, and
material and restate.
