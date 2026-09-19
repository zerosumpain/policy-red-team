# Phase 12 — material, and writing the report again

19 September 2026. The last of the surfaces `docs/phase-4.md` left outstanding:
*the API accepts both, and nothing calls them.*

## What it is

An assessment is a reading of a paper at a moment. A later draft lands, a
consultation response arrives, somebody writes a rebuttal — and the useful
question is not "run it again" but **what does this change**. Attaching
something runs a four-stage pass that reads it against the conclusions already
reached and returns a verdict on each:

```
A critique or rebuttal · rebuttal.txt
Attached 19 September 2026 · 1 passage read · 1 conclusion moved
Your note: Sent by the Council.

  Synthetic finding actors    Weakened
```

And above the verdict, where a reader meets it before the conclusion:

> **This report has been overtaken in part.** 1 thing was attached after it was
> written and moved 1 conclusion. What came after this was written, below, says
> which.

Once one addendum has finished, the report can be **written again** — a
restatement over everything including what has been added. The superseded report
is kept: still stored, still cited by its own recommendations, still reachable.
It is simply no longer the current one.

## Nothing is re-run, and that is structural

Every late stage cites earlier ids and `persistArtefacts` is a plain insert
against an `(analysis_id, id)` primary key, so a stage **cannot** execute twice:
the `s<n>_<slot>_` namespace collides. A pass owns its own block of ordinals
(`PASS_BASE * n + k`) and appends. The original report stays exactly as it was,
which is the point — a reader can see what was concluded before the material
arrived and what it did to it. The walk asserts the original eighteen stages are
undisturbed after a restatement.

## The role is an instruction, not a label

`MATERIAL_ROLES` is interpolated into the decomposition and reconciliation
prompts rather than left for the model to infer, and the form says why it
matters: a consultation response read as though it were the policy yields claims
the policy never made, and a later draft read as though it were a critique
yields contradictions that are only the paper being rewritten. The reader is the
one who knows which.

## Three things that had never run

**The material route could not work.** `readMultipart` discarded the upload's
field name and `asRequest` put every file back under `document` — the name the
*submission* form uses. `readMaterial` looks for `material`, found nothing, and
answered *"attach a document or paste its text"* to a reader who had attached
one. Present since phase 4; the route existed and nothing drove it.

**`Radios` was always controlled**, so a caller that omitted `value` got a group
that silently refused every click: `checked` was `false` on every item and React
put it back after each one. The material form is read through `FormData` on
submit and wants the uncontrolled shape. `Checkboxes` had the same trap and both
now work either way.

**And the precondition needed writing down twice.** `store.ts` refuses a
restatement over an inventory nothing has been added to — *"it would spend the
most expensive call in the feature to produce the report that already exists"* —
and refuses one before the assessment has finished. `canRestate` mirrors both so
the page can explain the refusal instead of drawing a button that collects a 400.

## Verification

```
typecheck            clean
unit                 502 in 30 files   (10 new, on the precondition)
integration          19, 1 skipped
a11y                 7 routes, one h1 each, the reflow rule in the built CSS
walk                 attaches a rebuttal, waits for the pass, asserts it says
                     what was attached, that it read something, that the
                     reader's own note survived, that it reached a verdict, and
                     that the banner above the verdict says the report has been
                     overtaken — then writes the report again and asserts the
                     original eighteen stages are undisturbed
```

**The walk raced itself twice before it was right.** Waiting for the report's
own heading after clicking matched the report that was still on screen, so every
assertion read a page with no addendum in it — and the step passed its
restatement check regardless, because by then the pass had finished. It waits on
the API for the thing that must become true now, which is the only version that
cannot race.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| Where it lives | its own page; a report section | **a report section** | what came after the report was written is part of reading it, and it sits between the report and the downloads for that reason | yes |
| The banner | in the section; above the verdict | **above the verdict** | a reader who meets the conclusion first has already formed a view of a report that has been overtaken | yes |
| When to show it | whenever material was attached; only when something moved | **only when something moved** | `addendumBanner`'s own rule, and the right one: "1 addendum, 0 changes" above an unchanged report is a notification, not a finding | yes |
| The refusal | a disabled button; the reason in words | **the reason** | the argument this codebase has made since the landing page — a disabled control the reader cannot explain is worse than no control at all | yes |
| `Radios`/`Checkboxes` | hold the state in the form; make them work uncontrolled | **uncontrolled when `value` is omitted** | a component that silently refuses input when you forget a prop is a trap, not a default; and a form read through `FormData` should not be asked to hold state it never reads | yes |
| The upload's field name | special-case the material route; carry the name through | **carry it** | one route knowing another route's field name is how the next one breaks too | yes |

## What this closes

Every surface `docs/phase-4.md` listed is now built: the drill, the relationship
graph and its table, the stress test, the copy you send someone, the persona
dossier, and material and restate.

What remains is not a surface. **No real assessment has ever completed** — every
gate in this repository runs against a deterministic fixture, which proves the
machinery and proves nothing whatever about the quality of the analysis. And
`policy.strangeramblings.com` still has no authentication; a Cloudflare Access
policy on the hostname is the lock that matters and is not something this
repository can add.
