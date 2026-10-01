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

---

# Part 2 — what the reader brings, and what was checked outside the paper

*1 October 2026. John's decisions, taken before the build: a reader can bring
a source or a question at ALL THREE entry points (the submission form, every
item page, every open research gap); the SERVER fetches pages, SSRF-guarded,
full text, free; a reader's look-ups are ASKED FIRST, above the model's own,
within the same source budget. Plus one ruling added mid-build: an open rival
explanation blocks decision support. Checked against a fresh copy of the real
Best Start run (`44dd5420`), which has no reader inputs.*

## What was measured before anything changed

| | |
|---|---|
| Research questions | 43 |
| Sources kept | 116 — **0 read in full**: research runs on the grounded search, whose `extract()` always fails |
| Pages showing a research question, what came back and what it did | **none** |
| Highest-priority questions with no source | the top ten — and not because a search found nothing: 12 of the 43 were raised by later steps that follow up two at a time, and were "Not pursued" |
| Ways for a reader to say "read this" or "look that up" | none |

## What changed

**1. A page reader** (`src/lib/server/fetch-page.ts`). `assertPublicUrl` on
the address and again on every redirect (followed by hand, five at most), 15
seconds, 2 MB counted as it streams, HTML / plain text / PDF only, HTML to text
with no new dependency (`<main>` first, no script, style, nav, header or
footer, entities decoded), capped at 10,000 characters. Node's global `fetch`,
so the `EnvHttpProxyAgent` `transport.ts` installs is honoured. Research uses
it as the full-text fallback INSIDE the existing full-read budget: a source
already chosen for a full read that `extract()` cannot read is fetched instead
(`readBy: 'page_fetch'`). Never on a sealed run, a run that may not search, or
an install set to `none`. Both fixture bundles redirect it to
`fetch-page.fixture.ts`; its user agent is one literal on `build.mjs`'s
forbidden list. The egress page and `doctor --reach` now say research needs
ordinary HTTPS out to the open web for full text.

Manual check, outside the suite, against a real page the run had kept as a
154-character-median snippet: `gov.uk/…/early-years-places-and-workforce-need`
came back as 6,716 characters of the publication itself; an Explore Education
Statistics release came back at the 10,000-character cap.

**2. Reader sources and look-ups, as data.** `research_source` gains optional
`supplied: 'reader'`, `suppliedAs: 'file' | 'page'`, `about`, `aboutIds`,
`note` (and `readBy`); `research_question` gains `asked: 'reader'` and
`wording`. A new table `policy_reader_inputs` (migration `0005`, sealed as a
whole on a sealed run, fourteenth purge probe) holds what the form sent;
`policy_passes` gains `target_id`, `source_url`, `look_up`. At stage 5 the
worker extracts files and fetches pages; `readerArtefacts` mints a reader
question per look-up (query built by the server, refused if it carries an
address, an email, a phone number, a postcode or an NI number) and, per
supplied source, a reader question that carries it plus the source itself,
linked by a plain label match on "about". `researchRank` puts every reader
question above every model question, so the existing budget walk spends on
them first; a model that writes `asked` has it stripped. Prompt 6 (3.5) cites
supplied sources like any other and never grades them up for who supplied
them. `supplied_balance` is the thirteenth remit, fanned out and counted only
where the run holds a supplied source (`assuranceCategories`). After the run,
"I have a source for this" and "Look this up" go through phase 12's material
pass with a `targetId` the reconciliation and verdict read first; an address
is fetched and a look-up searched by the route, before the pass is queued,
behind a six-an-hour brake and the read-only gate.

**3. Research made visible.** Findings has "Checked outside the paper"
(`$lib/research-view`): per question, who asked, why and what it tests, how it
ranked, what came back (grade, full text or snippet, publisher and date,
"Supplied by you"), what it did, and what is still open — with the two actions
on every open one. The first ten open; the rest behind one disclosure; five
sources a question. A question never searched says so, and why, read off the
run's own warnings — rather than "nothing came back", which on this run would
have said the opposite of what happened. Every item page has a compact
"Checked outside the paper" box and the two actions. The pack renders the
section with no actions.

**4. An open rival blocks decision support.** `capForRival`
(`decision-use.ts`): a `rival_explanation` raised as an issue whose response
is `unresolved`, or that has none, caps `decisionUse` at `exploratory` with
`decisionUseReason` — "Another explanation fits the same evidence and the
report could not rule it out, so this is not yet fit to support a decision."
— shown on the challenge round and second on the trust card. Applied by the
pipeline and again by the view, so a summary written before the rule reads the
same. The fixture's rival is unresolved, so the fixture run is now exploratory.

## What the real run now reads

| | |
|---|---|
| "Checked outside the paper" | 43 questions, 29 with something back, 116 sources, 0 in full, 22 still open — 12 of them never searched |
| …what each did | 20 mixed, 1 supports, 8 found but not used as evidence, 2 searched with nothing found, 12 not searched |
| Item page `s1_022_mechanism_001` (Funded-hours entitlement) | 13 links to evidence from outside the paper, all weak, all search snippets; 6 shown, "And 7 more" |
| Items with at least one such link | 136 |
| Height at 1280 / 420 | 5,182px / 7,746px; no sideways scroll at either |

## Decision log

| fork | options | chosen | why | reversible? |
|---|---|---|---|---|
| How supply is recorded | new `retrieval` values / a separate field | **separate `supplied`**, `retrieval` stays `full_text` | `retrieval` says how much was READ, and the grade rubric and `$lib/evidence-grade` key on it; supply says who CHOSE it. Mixing them would make every reader of `retrieval` learn two new words for "full text" | yes |
| Reader priority | `priority` above 1 / rank function | **`researchRank` = 1 + priority** for a reader question | `priority` is a product of unit scores and the schema says so | yes |
| Where the inputs live | JSON column on the analysis / own table | **own table** | the analysis row is read by every lease check; six megabytes of files on it is why documents have their own table | yes |
| When a page is fetched | at submission / at stage 5 | **stage 5** | a run may be sealed or the install set to `none` by then; the run's own rules apply | yes |
| A supplied source and the evidence fan-out | a source with no question / a question per source | **a reader question per source**, not searched | the matrix reads one question at a time; a questionless source is never read | yes |
| What a reader question rests on | exempt it from triage / cite something | **the items its words name, else the paper's first passage**; a source-carrying question cites its source | every artefact must cite its ground; a question asked of the paper rests on the paper | yes |
| After-run look-up | a research round / material | **material** | nothing is re-run; a pass that searched would be a research round in an addendum's clothes | yes |
| Shared copies | keep / drop | a supplied **file's** text and filename, and every note and look-up wording, stay behind | the attachment rule of phase 10: a document the recipient was never given, and the owner's own words | yes |
| "Nothing came back" | one outcome / read the warnings | **`unasked` from "Not pursued" / ceiling warnings** | on the real run the ten top questions were never searched | yes |
| Open rival | count it with the others / its own cap | **caps at exploratory, with the reason** | John's ruling: a rival the report could not rule out means a decision does not know which account it acts on | yes |

## Gates

`typecheck` clean · `npm test` 1,344 · `test:integration` 45 (+1 preview-only
skip) — a drain run from submission with a page and a look-up to a cited,
graded source and a `supplied_balance` challenge; a sealed run whose raw rows
hold none of the reader's words · `a11y` 15 routes, 0 serious · `walk` passed,
now submitting a page and a look-up and asserting them on the new page and the
source's item page · `offline` passed, asserting the section and the tag and
the absence of the actions.

## What was left undone

- No real run has had a reader source, a look-up or the page-fetch fallback:
  no model was called. The first live run should be read for how many of its
  sources come back in full, and whether stage 6 grades supplied sources on
  their merits.
- In a shared copy a supplied web page still says "Supplied by you", which is
  the owner, not the recipient.
- The fixture search finds nothing, so the walk proves a look-up is ASKED and
  listed, not that one is answered; the unit tests cover answering.
- The after-run actions are exercised by unit tests and drawn in the walk, not
  submitted end to end in the browser.
- Not deployed: John asked for build and deploy; this checkout's brief said do
  not push, deploy or merge.
