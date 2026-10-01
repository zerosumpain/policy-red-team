# Phase 21 — one question per page

*1 October 2026. John's brief, after reading the live Best Start run (`44dd5420`):
"simplifying, decluttering, focussing on value. Let's break this application down …
a structured flow of pages, less information per page; more common artefacts, and
importantly clearer language." Decisions taken with him: real pages (not trimmed
tabs), everything in one release, the offline pack stays one document, and refused
items record what they said from now on.*

## What was measured before anything changed (live, 1280px)

| page | height |
|---|---|
| Summary | 4,805px |
| Where this comes from | 33,493px |
| One item (`s10_005_exploit_003`) | 8,016px |

## What John named, and the cause of each

| what he saw | cause |
|---|---|
| A timeline of black bars, some with text, some without, no legend | `ChainRail` (`StageRail.tsx`) prints a band's label only when the band is ≥55% of its row's height, and the label is clipped sideways inside a narrow band ("21 items, stages"). It restates the four lists printed under it. |
| A row of numbers 1–18 at the top of an item | `StageRail`: which of eighteen stages made, fed and cites this item. No key; meaningless to a reader. |
| Text running to two thirds of the page | `govuk-grid-column-two-thirds` and `max-width` measures left from when components were standalone pages. |
| Tables that look plain | Every table styled on its own. |
| "Where this came from" names refused items by id | They were never stored — the warning keeps only `s1_014_claim_002 (claim)`. The id does encode the step and the passage. |
| "Read the report in full" on the Summary | Duplicates the section navigation that floats over it. |
| "What you can do with this" is a big block | It is a set of actions, not content. |

## The shape

```
/assessments/:id                        Summary
/assessments/:id/findings[/:section]    was Verdict      (?move=verdict)
/assessments/:id/causes[/:section]      was Causes       (?move=causality)
/assessments/:id/threats[/:section]     was Threats
/assessments/:id/who[/:section]         was Who is involved (?move=actors)
/assessments/:id/method[/:section]      was Where this comes from (?move=provenance)
/assessments/:id/use                    downloads, add to it, write it again
/assessments/:id/items/:itemId          one item (was /artefacts/:id, which redirects)
   …/items/:itemId/rests-on             the trail back to the paper
   …/items/:itemId/used-by              what rests on it
   …/items/:itemId/record               everything recorded about it
```

- A section's landing page is its lead plus cards for its parts; each part is a
  page of its own with a side menu of its siblings and GOV.UK previous/next.
- Service navigation (govuk-frontend 6 `service-navigation`) across the top of
  every assessment page; a thin bar above the footer links to `/use`.
- `?sel=` survives every navigation between these pages. Old `?move=` URLs and
  `/artefacts/` URLs redirect.
- The offline pack keeps its one-document cascade, with the new names.

## Shared parts

One page frame (back link, caption, title, section menu, pagination), one card,
one table, one item link (readable name + kind + page, never an id).

## Words

artefact → item · move → section · stage → step · play/exploit → way to beat it ·
"Structural inference" → "Worked out from how the paper fits together" · an
"Unknown" value is not printed.

## Decision log

| fork | options | chosen | why | reversible? |
|---|---|---|---|---|
| Tabs or pages | trim tabs / real routes | **routes** | a 33,000px tab is a document, not a panel; John chose it | yes |
| Sequence | fixes first / all at once | **all at once** | John's call | — |
| Offline pack | split / one document | **one document** | `file://`, Ctrl-F is its interface | yes |
| Refused items | display only / record label + quote | **record** in `validation.ts`, display parses both shapes | John's call; old runs still read by page | yes |
| The chain chart | fix labels / replace | **replace** with a four-step ladder whose every box carries text | it restated the lists beneath it | yes |
