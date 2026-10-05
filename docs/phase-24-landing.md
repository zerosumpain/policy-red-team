# Phase 24, part a — landing and the bodies hub (L1–L6)

*5 October 2026. Plan §4. Branch `p24-landing-hub`.*

## What was measured before anything changed

On a private copy of the live database, served by the fixture build on loopback:

| page | 1280px | 320px |
|---|---|---|
| `/` | 1,907px | 2,958px, **527px wide** (the assessments table pushed the page sideways) |
| `/personas` (library) | 5,090px | 7,098px |
| `/bodies` (grid) | 1,488px | 2,916px |
| `/personas/:id` (Jobcentre Plus) | 4,030px | 7,268px |

- The only way to the cross-policy pages was "Persona library" in the footer. `/bodies` was a link in that page's body text.
- No report linked to a body's page, although `detail().personas` has always carried `personaId` and `sightings`.
- The live library has **one** body seen in two papers, Jobcentre Plus, and it is **not on the GOV.UK register** (it is part of DWP). So the register-only grid at `/bodies` never showed it, and its page said "needs the body to be matched" for what each paper asks.

## What changed

| # | Change |
|---|---|
| L1 | The interface says **body** and **Bodies across policies**. "Persona", "the library" and "dossier" are gone from visible text (titles, headings, footer, identity pages, report copy, API error messages). Code identifiers and API paths keep `persona`. `VOCABULARY` records the change; `GLOSSARY` gains **Body**. |
| L2 | GOV.UK service navigation on **every page**, in `Template`: Assessments · Bodies across policies · How to read a report · Assess a paper. Current item read off the path (`page` on the exact URL, `true` beneath it). "Assess a paper" is omitted in a read-only copy, using a `readOnly` flag added to `/api/reader/status` (the request `ReaderGate` already makes per document). No Grounding library item yet. |
| L2 | An assessment's six views are no longer a second full-bleed bar: they are **sections**, the same component with `sections` set, drawn inside the page under the title (`.prt-subnav`: no colour band, 16px, own toggle text "Sections of this assessment"). The hub's views use the same thing. One bar across the top always means the service. `Template`'s `navSlot`/portal is gone. |
| L2 | `/guide` ("How to read a report") is a short real page — the six sections and their questions (`MOVES`) and the glossary (`GLOSSARY`) — rather than a "coming soon". Phase 26 builds the full guide at the same address, so the nav never moves. |
| L3 | Landing: **"Bodies that turn up again"** beside "Latest assessment" (two thirds / one third from desktop, stacked below). Each body seen in ≥2 papers: a link to its page, a small-multiples strip (one square per paper, oldest first, painted with that paper's worst band from the existing ramp, words in the `aria-label` and `title`), and up to three "paper: what it asks" lines. Empty says why: no paper yet / one paper so far / N papers and nothing in common. Data: `GET /api/policy-analysis/bodies/recurring` (`recurringBodies` in `server/intel.ts`), from the **library** (persona sightings, counted by document), not the register grid — the grid would hide Jobcentre Plus. Cached on a signature of the library and the finished papers; any write drops it. Home still imports only types and leaf modules. |
| L4 | One hub at `/bodies` with views **List** (`/bodies`), **Across papers** (`/bodies/across`), **Clashes** (`/bodies/clashes`, `?body=` narrows), **Groups of people** (`/bodies/groups`, each group linking to the "Who is involved" page of every assessment that named it, capped at five). The list's duplicate-pair offers stay on List until 24b's review queue absorbs them. Removed: "Same body, different asks" (a restatement of the grid's Papers column) and the clash list on a body's page (now a count and a link into Clashes, narrowed). |
| L5 | `client/report/body-pages.tsx`: a context provided at `Report`'s root and on the item page. `bodyIndex` maps every actor row sharing the filed actor's label (and its profile) to the record. "seen in N policies →" beside a body in the "Who could do it" table, the "met before" table, the cast grid, every play card's actor line, and the item page. Tables and cards link only bodies seen in **two or more** policies (twelve "seen in 1 policy" was the noise phase 20 removed); an actor's or profile's item page always links. The pack has no personas and passes no renderer, so it renders plain text twice over. The body page's paper links are phase-21 routes: `/assessments/:id/who?sel=actor:…`. |
| L6 | A body's page is three labelled bands — **What the register says** (fact: register facts, where it sits, the "wrong body / find it on the list" ruling), **What papers ask of it** (context: the warning, then each *paper* once — figures, asks, what it said, the split link — then where papers agree or disagree, every way to beat a policy, what is kept across them, the clash count), **What public records show** (evidence: money and staff, track record, check again, commissioned enquiries) — then **Is this the right record?** (merge/compare, forget). An "On this page" list names the bands. Asks are now read for a body **not** on the register too (`bodyIntel` → `personaRows`), keyed by the persona, the same `actorsOfBody`/`asksOf` rule. |

### Routes

`/bodies`, `/bodies/across`, `/bodies/clashes`, `/bodies/groups`, `/bodies/:id`, `/bodies/:id/{register,merge,merge/:other,sightings/:observationId}`, `/guide`. `/personas` → `/bodies`; `/personas/*` → `/bodies/*` with query and hash. Why `/bodies`: it is the reader's word, it already existed (the likeliest bookmark), and a body's id is unchanged so every old link has exactly one new home. Static segments outrank `:id` and ids are UUIDs.

### Where 24b goes

`HUB_VIEWS` in `client/places.ts` has a commented `register` entry between Clashes and Groups: the register tree and review queue are a fourth view of the same hub, a route under `/bodies`, with the List view's "These may be the same body" folding into its queue.

## Measured after (same copy, same widths)

| page | 1280px | 320px |
|---|---|---|
| `/` | 2,007px, bodies panel on the first screen | 3,570px, **320px wide** |
| `/bodies` (List) | 3,148px | 4,463px |
| `/bodies/across` | 1,448px | 2,698px |
| `/bodies/:id` (Jobcentre Plus) | 4,976px — now with what each paper asks | 8,605px |
| `/assessments/44dd…/who` | 4,978px (+100, the sections bar) | 7,840px |

No sideways scroll at 320 on any of these. Screenshots: `~/prt-landing/shots/phase-24/{before,after}/` (gitignored).

## Decision log

| fork | options | chosen | why |
|---|---|---|---|
| Two navigations | two full-bleed bars / sections as side nav / sections inside the page | **inside the page** (`sections`) | One bar at the top that always means the service; the sections keep the component a reader already learned, including its 320px toggle. A side nav already exists for a view's own sections. |
| `/guide` | placeholder / short real page | **short real page** | A nav item leading to an apology is a dead end; `MOVES` and `GLOSSARY` are true today. |
| Landing data | extend landing list / new endpoint | **new endpoint** | The landing list also feeds the submit form, and this reads graphs; separate request keeps the table on screen first. |
| Recurring source | register grid / library | **library** | The one live cross-paper body is not on the register. |
| Link threshold | every body / ≥2 / always on item pages | **≥2 in tables and cards, always on a body's item page** | Avoid a constant column; one link on the page about the body costs nothing. |
| Groups | link under List / a view | **a view** | A page not in the navigation is found by luck. |

## Left

- Bodies across papers still needs the register to compare papers by identity; 24b's master register replaces that rule.
- The play-card edit is the link only (the plain-English stream owns the rest of that file).
- The duplicate-pair list stays on List for 24b's queue.
