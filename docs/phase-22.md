# Phase 22 — a rival explanation, a cleared check, and a graded piece of evidence

*1 October 2026. Part 1 of phase 22: three changes to how the assessment reasons,
each working for a NEW run (contract, prompt, validation) and reading sensibly on
an EXISTING one through view-layer fallbacks. Checked against a copy of the real
Best Start run (`44dd5420`), which has none of the new fields.*

## What was measured before anything changed (`44dd5420`)

| | |
|---|---|
| Rows in the playbook | 46 |
| …that are a body saying it has no material way to beat the policy | **8** (the brief estimated 7 — "Low room for families to defeat delivery" is the eighth) |
| …of which a body's ONLY row | 2 (Children and babies; Families and children) |
| …written beside real plays, as "nothing further" | 6 (Family hubs, Families, Parents and families, Jobcentre Plus, Ofsted, Educators) |
| Evidence rows | 197 — 100 cite the paper, 97 cite a research source |
| Research sources read in full | **0 of 116** — every one a search excerpt |
| Evidence rows stating a grade | 0 (the field did not exist) |
| Assured findings judged "well supported" | 1 of 18 |
| Challenge remits | 11, all critical; none builds a competing account |

## What changed

**1. Rival explanations.** `rival_explanation` is the twelfth challenge remit,
appended. `assurance_challenge` gains optional `rival` and `discriminators`,
required by `validation.ts` for that category only (refused, not narrowed —
the stage-16 top-up re-asks a refused remit). Prompt 16 asks the reviewer to
BUILD the strongest other account and say which evidence would favour each;
prompt 17 must weigh it explicitly and may answer `unresolved`. The fan-out is
per category, so it picks the new one up with no pipeline change;
`requireMajority` now counts against 12. The fixture writes one and answers it
`unresolved`. The report view stubs `assurance_challenge`; a rival keeps its
five fields through the stub. Findings gets an "Another explanation" page (what
it competes with, what would tell them apart, what the report concluded); the
challenge round on How it was made shows the same two fields in the row. A run
with no rival draws nothing.

**2. "No way to beat it" is a cleared check.** `exploit.cleared` (optional).
Prompt 10 now asks for exactly one row with `cleared: true`, zero factors and
the reason in `play`, and never a cleared row beside real plays. Triage stamps
the flag on a row written in clearance words without it (with a warning), and a
key judgement cannot rest on a clearance. `isCleared()` in
`src/lib/policy-analysis/cleared.ts` reads the flag, else a tight wording test
pinned against all 46 real labels (8 match, 38 do not). Clearances are out of
`plays()` — and so out of every total, band, legality figure, board, summary,
brief and Word file — and out of `playPatterns`, `playStanding`,
`unansweredPlays`, the stress lab, the recommendation join, the persona track
record and the deep-chain ranking. Threats has a "Checked and cleared" page:
cleared bodies with their reasons, and one sentence naming the six "nothing
further" notes by body. An item page of a clearance is tagged "Checked and
cleared". The stage-10 coverage gate asks only for some exploit row, so a
cleared row satisfies it and nothing is re-asked.

**3. Evidence grade.** `EVIDENCE_GRADES = strong | moderate | weak | none`;
`evidence.grade` optional. Prompt 6 carries a rubric on the usual hierarchy
(review/trial/robust quasi-experiment → strong; official statistics or a
method-stated evaluation, read in full → moderate; one study, a stakeholder
report, a government's assertion including the paper itself, or ANY search
excerpt → weak at best; no source → none). Triage narrows a row graded above
weak whose only sources are excerpts to weak, keeps it, and warns.
`$lib/evidence-grade` derives a grade for older rows (the lowest step the
quality sentence names, capped at weak when only the paper or snippets stand
behind it, weak when it names none; a withheld source in a shared copy is weak,
not none). `markDownJudgements` turns "well supported" over weak-or-no evidence
into "supported with limits" (and "supported with limits" over no evidence into
"provisional"), with one sentence saying why — applied once at the root of the
report, the item page and the exported documents. The brief's limits — and so
the trust card — lead with "Nothing outside the paper was read in full; these
judgements rest on the paper and search snippets." The evidence section shows
the grade tally, a grade column, and the rubric behind a disclosure.

## What the real run now reads

| | before | after |
|---|---|---|
| Ways to beat it (Summary, Threats, Findings "Do they break a rule?", ranked list, pack) | 46 | **38** |
| Inside the rules | 36 | 28 |
| Bodies that could do it | 12 | 10 |
| Evidence by grade | — | 0 strong · 0 moderate · **197 weak** · 0 no source (all derived) |
| Assured findings, trust card | "the final review judged 1 well supported, 12 supported with limits…" | "13 supported with limits, 4 provisional, 1 unknown. One is counted a step lower than the final review wrote it, because the evidence behind it is too weak to carry more." + "Nothing outside the paper was read in full…" |
| "What is backed up" first line | "All 197 evidence links are passages of the policy paper itself" (false) | "100 of the 197 … the other 97 cite a source outside it" |

The last row is a pre-existing defect found on the way: `evidence-view.ts`
decided "outside the paper" by a URL on the evidence row, which lives on the
research source it cites. Fixed and tested, because it sat directly above the
new grade tally and contradicted it.

## Decision log

| fork | options | chosen | why | reversible? |
|---|---|---|---|---|
| Cleared rows in the schema | relax `targets`/`preconditions` for a clearance / keep them | **keep** | a clearance names what it was checked against and the assumption it rests on; the JSON schema the model sees cannot say "required unless" | yes |
| Which bodies are "cleared" | every body with a clearance row / only bodies whose every row is one | **only all-clear bodies**; the rest named as notes | Ofsted has four plays and a fifth "no material exploit beyond…" row — listing Ofsted as cleared would be false | yes |
| Wording fallback | label only / label or play opening; "low factors" | **label or play opening**, no score test | a low-scoring play is still a play; the band says so | yes |
| Where clearances leave the counts | each component / `plays()` and the few raw `kind === 'exploit'` readers | **`isPlay()` at the readers** | one predicate, and every figure moves together | yes |
| Rival fields | separate kind / optional fields on `assurance_challenge` | **optional fields** | stage 17's one-response-per-challenge rule and the top-up already cover it | yes |
| Grade on `research_source` | add / derive | **derive** (`retrieval` already says it) | the adapter writes that kind, never a model; `retrieval` is the fact the grade would restate | yes |
| Snippet cap | refuse / narrow | **narrow to weak, warn** | the link is real; the weight claimed is not — the phase-16 rule for misfiled preconditions | yes |
| Mark-down | rewrite stored rows / a reading at render | **a reading**, once per renderer | nothing is ever re-run; older runs get it for free | yes |
| No-search sentence | the brief's exact sentence everywhere / a "paper alone" form when nothing was searched | **both forms** | "search snippets" is false on a run with no sources | yes |

## Gates

`typecheck` clean · `npm test` 1,289 · `test:integration` 43 (+1 preview-only
skip, as before) · `a11y` 15 routes, 0 serious · `walk` passed, now visiting
the rival page at 320px · `offline` passed, now asserting the rival and the
grade tally in the pack.

## What was left undone

- The mid-run progress page (`RunFindings`) still counts exploit items held
  by kind, clearances included — it is an inventory of what a running stage
  has written, from the server's counts.
- `scripts/pack-live.mjs` and a real run with prompt 3.4 have not been tried:
  no model was called. The first real run should be read for whether stage 10
  returns one clean cleared row per empty body and whether stage 6 grades
  without being capped.
- `review_summary` counts are recomputed by the server; a rival left
  `unresolved` is counted open. Whether an unresolved rival should block
  `decision_support` is a judgement for John, not made here.
