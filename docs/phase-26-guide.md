# Phase 26 — "How to read a red-team report": the guide and the in-report helpers

*5 October 2026. Branch `p26-guide`, on `phase-23-batch` @ `f9a714e`. Plan §5.
Fixture only; no model was called and no real run is quoted anywhere in the guide.*

## What a reader gets

- **`/guide`**: the guide's front page — the six chapters with the question each
  answers, a start button, and (in two details) phase 24a's short version: the
  report's sections and the glossary.
- **`/guide/1` … `/guide/6`**: one chapter a page, each with one thing to try,
  a contents list (current chapter marked, not linked) and GOV.UK block
  pagination. All six run on one made-up policy, *Breakfast for Every Child*
  ("a free breakfast club in every primary school, paid for per pupil who
  attends"), so nothing can leak or go stale.

| | chapter | the one interactive idea | what it reuses |
|---|---|---|---|
| 1 | What a red team does | SVG: the policy as a machine with three levers; a figure walks round it and stops at the count, which lights as the gap. 10s loop, **Pause/Play** control | — |
| 2 | From paper to parts | Step through the paper a sentence at a time; each highlights and drops its pieces into Parts of the policy / Assumptions / Bodies. Reader-driven, "Show it all", polite announcement per step | — |
| 3 | A way to beat it, in plain words | One play as the report's own `PlainBlock`, then "Show me the detail" opens the report's own `PlayList` card (counters open). "The Department" is tap-to-define through the report's `TermsContext` | `PlainBlock`, `PlayList`, `plays()`, `termFinder` |
| 4 | How exposed? Build the band yourself | Four native range sliders + a number box each, starting on chapter 3's play; band word, score and a marker on the band ramp update live; band changes announced politely | `exposureOf`, `bandOf`, `BANDS`, `BAND_FILL` |
| 5 | What if we're wrong? | GOV.UK small checkboxes for the three assumptions; plays needing a switched-off assumption drop back, strike through and are tagged "Taken off the table"; the conclusion resting on one is tagged "Nothing left supporting it" | `stress`, `reading`, `STANDING_LABEL` |
| 6 | Bodies across policies | Three tiny papers; Local councils named in two with asks that clash (check clubs / run clubs); connectors fade in and the asks pulse once (<3.5s, "Show the clash again" replays). Then one SVG of part-of vs kind-of, and links to `/bodies` and `/bodies/clashes` | — |

**Entry points**
- A dismissible first-visit banner (GOV.UK notification banner markup, its own
  heading id; "Hide this message" as the cookie banner words it) on the landing
  page and every report page once a report exists. Remembered in
  `localStorage` (`prt-guide-banner-dismissed`) with every access in try/catch:
  storage that throws shows the banner and hides it for the visit only. Hiding it
  moves focus to `#main-content`.
- "How do I read this?" in every report page's header status row → `/guide`.
- A "?" (with "How to read this" from tablet up; full chapter name in the
  accessible name) at the head of five sections only — `HELP_FOR_SECTION`:
  parts of the policy → 2, ranked ways to beat it → 3, how exposed → 4, what if
  we are wrong → 5, who is coming for what → 6. Service only.

**The offline pack** gets a section "How to read this report" after the Summary:
each chapter's `takeaway` paragraphs (the same strings the guide prints) and one
static band key (`BandScale`, no marker). No "?", no banner, no header link.

## Decisions

| fork | chosen | why |
|---|---|---|
| Chapter URLs | six literal routes, not `/guide/:n` | `npm run a11y` reads routes off `App.tsx` and skips parameterised ones; literal lines are six audited pages |
| One content source | `client/guide/content.ts`: chapters, takeaways, the paper, the fictional artefacts, `HELP_FOR_SECTION` | the guide and the pack print the same words; the test file pins it |
| Fixture data | real-shaped artefacts, parsed against `artefactSchema` and `dataSchemas` in tests; exposure/band stamped by `exposureOf`/`bandOf` | chapters 3–5 feed them to the report's components and functions, so the guide cannot teach a rule the report does not follow |
| Chapter 5 wiring | `miniStress()` = `stress` + `reading`, tested | a second definition of "taken off the table" would drift |
| Showing both directions in 5 | one conclusion resting on an assumption, beside the plays | the report's own rule: disarmed is good news, losing footing is bad news; the guide should not teach only half |
| Motion | tokens on `:root` (`--motion-duration-short/medium/long`, three easings) in `parts/_motion.scss`; reduced motion collapses them to 0.01ms and kills `.prt-motion-loop` animations | there was no motion before; one vocabulary from the start. Every animated rule's resting state is its end state |
| Chapter 1 under reduced motion | still picture at the end state, no control, a line saying why | a Play button that the stylesheet will not honour is a dead control |
| Slider | native `input type=range` (keyboard, role for free), `aria-valuetext` in words, visible label + hint, a number box per factor as the value text and typing alternative; 28px thumb | GOV.UK has no slider; native beats bespoke ARIA |
| Announcing chapter 4 | only when the band changes | the slider already speaks its own value |
| Ch. 2 controls | one button that changes job (next → start again), never disabled | disabling the focused control drops a keyboard user |
| SVG text | figures drawn at phone width (viewBox ~320–380) and capped in CSS; band scale words are HTML over a stretched SVG ramp | text inside a stretched SVG would squash or shrink below legibility at 320px |
| Faded plays (ch. 5) | grey ink + strike-through + dashed edge, not opacity | opacity fails contrast and the reader wants to read what went |
| Banner on report pages | after the sections bar, only when a report exists | after the `h1` keeps heading order; a run in flight has nothing to read |

## Measured

- Entry bundle (landing): 284,136 → 286,196 bytes (+2.1 KB, the banner and its storage helper; no zod, nothing from the guide).
- Guide chunk: 2.3 KB → 21.7 KB (the six chapters; `PlayList`, `view.ts`, `stress` are shared with the report chunk).
- No sideways scroll at 320px on `/guide` and every chapter (walk asserts it per chapter; screenshot script checked 320px for all).
- Screenshots: `~/prt-guide/shots/phase-26/` (gitignored) — every chapter at 1280 and 320, chapters 1/2/4/5/6 under `prefers-reduced-motion`, the landing banner, and report pages with the banner, header link and "?".

## Tests

- `client/guide/content.test.ts` (21): fixtures parse against the pipeline schemas; exposure/band equal the pipeline's; every play has a plain block and is not a clearance; chapter 2 classification (every sentence yields, all three kinds, a twice-named body listed once, monotonic growth, its assumptions are chapter 5's); the sliders are exactly `EXPOSURE_FACTORS`; zero incentive → 0, zero concealment does not; every band reachable; band key covers 0–1 with no gap; the clash body is in two of three papers; six chapters; every "?" maps to a chapter; the takeaways use the report's words, not "play/mechanism/persona".
- `client/guide/stress-mini.test.ts` (4) and `client/guide/remember.test.ts` (3).
- Walk: banner + header link on a report page; the bands page has exactly one "?", Enter on it opens `/guide/4`; `/guide` then all six chapters by keyboard (focus + Enter on Next), axe on each, no sideways scroll; pause control works; a sentence read is announced; the detail opens the report's play card; Home on the incentive slider changes the band and announces it; Space on an assumption takes exactly its two plays off the table; reduced motion: no loop and no control; banner hidden, focus moves, stays hidden after reload and on a report page.
- Offline: the section and its words are in the pack, it has a band key SVG, and no guide link of any kind.
- a11y: 25 routes (the six chapters added automatically), 0 serious/critical.

## Left, and for other streams

- **`parts/_fullwidth.scss` breaks GOV.UK checkbox and radio labels.** It sets
  `max-width: none` on every `#main-content .govuk-label`, which removes the
  checkbox label's own `calc(100% - 74px)` cap — a long label wraps UNDER its
  box. Fixed for the guide only (`#main-content .prt-ministress
  .govuk-checkboxes__label`); the report's Stress lab and other narrow columns
  likely have it too. One-line fix in `_fullwidth` (exclude
  `.govuk-checkboxes__label` / `.govuk-radios__label`) for whoever owns it.
- Shared files touched: `Report.tsx` (only the `section`/`lead` helpers wrap a
  body with the "?" in the service, and one offline-only section),
  `Assessment.tsx` (header link, banner), `Home.tsx` (banner), `App.tsx`
  (routes), `places.ts` (`guideChapter`), `app.scss`, `walk.mjs` (the `/guide`
  heading is now "How to read a red-team report"), `offline-check.mjs`.
- On a phone, chapter 4's answer sits below the four sliders; the band change
  is announced, but a sighted phone reader scrolls to see it. A compact sticky
  answer bar is the obvious next step.
- Chapter 6's register picture is the idea, not the hub's real tree; it links
  to the hub rather than rendering 24b's register.
