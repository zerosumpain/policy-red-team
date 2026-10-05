# Phase 25 — several documents in one assessment, and a grounding library per policy

*5 October 2026, branch `p25-documents-grounding` on `phase-23-batch @ f9a714e`.
Plan §3a and §3b of `site-tech-debt-review-2026-09-26/policy-red-team-phase-23-plan-2026-10-05.md`.
John's decision: grounding lives in a LIBRARY REUSED PER POLICY — attach it once,
every run of that policy uses it. `PROMPT_VERSION` is NOT bumped here (prompts
5, 6, 10, 14, 15 and 16 changed; the integrator bumps once). No model was
called: everything below is the fixture model, a copy of the live database,
or arithmetic on the stored call records.*

## What a reader now gets

- **One "Documents" section** on the submission page. The first row is the
  paper. Each further row takes a role: **Part of the policy** (an annex, a
  technical note — decomposed and attacked as the paper) or **Supporting
  material** (impact assessment, consultation response, statistics, guidance,
  evaluation, other — read in full and cited as evidence, never as the paper).
  Size limits are in the hint and enforced on the server whatever the form
  says: up to 6 documents and 10 MB together under assessment, 600,000
  characters and 400 pages across the set; up to 8 grounding items a run,
  5 MB a file and 10 MB together, the first 60,000 characters of each and
  240,000 in all.
- **"Which policy is this paper part of?"** — pick an existing policy, whose
  grounding library is listed with checkboxes (all ticked), or start one.
  Supporting material brought with an unsealed submission is saved into the
  policy's library, so the next draft has it.
- **A Grounding library** (`/grounding`, in the service navigation): policies,
  and per policy the items — add by file or by public web address (fetched
  now, through the SSRF-guarded page reader), with role, publisher and date;
  remove. Each run keeps its own copy, so removing an item changes only runs
  that start afterwards.
- **Citations name the document** when the paper is several: the item page's
  "Where in the paper" ("Annex A: costings · Page 12"), the brief's quotation
  caption, the Word/Markdown export ("(Annex A: costings, page 12)"), the
  Method page's discarded-items lines, and the pack's "The paper itself", now
  under a heading per document. One paper reads exactly as it did.
- **Findings → "What it was judged against"**: each grounding item, its kind,
  publisher and date, how much was read, how many evidence rows lean on it,
  under a **Grounding** tag. The same tag is on the evidence table and on the
  item page of anything that quotes grounding. **Method → "What it read"**
  lists the documents of the set and the grounding beside them. The pack draws
  both, plus "The grounding material" in full for Ctrl-F.

## 3a. Several documents

**Schema** (`migrations/0009-documents-grounding.sql`). The unique index on
`policy_documents(analysis_id)` was the whole of the one-document rule; it is
dropped and replaced by `(analysis_id, position)`. New columns `position`,
`role` (`main` | `part`), `title` (sealed), `id_prefix`. Document 0 keeps the
prefix `''`, so **every existing passage id survives byte for byte** (checked
below); later documents mint `d1_passage_0001`, `d2_…`. `policy_analyses`
gains `document_set_hash` (the sorted member digests hashed — for ONE document,
that document's own sha256, so every old run keeps its identity; backfilled
that way) and `paper_key`.

**Stage 0** (`server/document-set.ts`) ingests each document with the same
`ingest()`, its title, role, position and the set's size in every passage's
`data`, and — only when there are several — the title at the head of every
label: "Annex A: costings · Page 12 · passage 7". Page numbering restarts per
PDF, which is why the document has to be named. Prompt 1 is told which
document a passage is from **inside the passage artefact** (`data.documentTitle`,
`documentRole`, `documentPosition`), so the cached system prompt for stage 1
is unchanged; a one-document run's passages carry nothing new at all, so its
stage-1 payloads hash exactly as before.

**Totals.** `MAX_CHARACTERS` (600k) and `MAX_PAGES` (400) are now caps across
the SET, enforced at stage 0. Every downstream budget — stage 1's one call per
passage, `stageBudgetMs`, the 1,500-call ceiling — was sized for one document
that large, so holding the set to it keeps those sizings true; the ceiling's
message now says "for one assessment". Stage 6's clock counts one unit per
grounding item as well as per research question.

**Traps fixed on the way**

| trap | fix |
|---|---|
| `asRequest` used `form.set`, so two files under one name collapsed to the last | `append`; the form also uses numbered names (`document.1`), and `readMultipart` takes 24 files / 400 fields |
| `stageOnePlaces` sorted passages by id — `d1_` sorts before `passage_`, shifting every slot | `setPassagesInOrder` (document, then id) shared by the pipeline and the report |
| front matter detected over the whole set | `partitionSet`: per document, with the "almost everything looked like front matter" net per document; the skipped-page note names the document |
| page 3 of the annex and page 3 of the paper shared one "discarded" line | refused groups are keyed by document and page |
| every "same paper" site joined `policy_documents`, one row per DOCUMENT now | all read `policy_analyses.paper_key` (below) |

**"Same paper" is the same document SET's paper — decided: ANY shared member.**
`paper_key` is inherited at submission from the earliest unsealed run of the
owner's that shares any policy document with this one; otherwise it is the
run's own set hash. So a re-run with an annex added, or one dropped, is the
SAME paper — it does not count a body as seen in a second paper, it is not
offered to itself as a neighbour, and the persona library treats it as a
redraft. Exact-set equality was the alternative, and it double-counts every
body the moment someone re-runs with the annex; over-joining (two different
papers sharing a byte-identical annex) costs one neighbour comparison.
Neighbours exclude the same key OR any shared document (`samePaper`), which
also catches the rare transitive case the stored key cannot. Sites moved:
`neighbourSummaries`, `sameDocument`/`recountSightings`/`affectedGroups`/
`personaDetail` (personas.ts), the four in `server/intel.ts` (bodies grid,
recurring bodies, body intel), and the actor register's `papers` count. The
offline pack's `documentSha256` is the set hash. A sealed run's key is its own
set hash and never inherited.

## 3b. The grounding library

**A `policy_policies` table, not a `policy_key` string** — a policy has a name
the reader picks from a list and a library that must cascade when it goes; a
key would have needed both anyway. `policy_analyses.policy_id` (never set on a
sealed run: which policy an unpublished paper belongs to is itself something
about it). An unsealed run that names no policy starts one named after the
paper, so its next draft can find it. Old runs have none; nothing needed one.

`policy_grounding` is the library (the owner's, clear). `policy_run_grounding`
is what ONE run was given: **a copy taken at submission**, sealed with the run
(`SEALED_FIELDS.grounding`), purged with it (sixteenth census probe). A run
reads only its copy, so it reads the same material however the library
changes, and a SEALED run never reads or writes the library at run time: at
submission it may copy ticked items into its sealed rows; it cannot start a
policy (refused, with the reason) and what it brings is never saved to the
library.

**In a run** (`server/grounding.ts`, `grounding.ts`):

- Stage 0 ingests each item as **`grounding_passage`** under `g<n>_` — never
  `passage`, so `locate()` (the only thing that may say "the paper said")
  cannot be satisfied by it, `paperWording` never reads it, and the shared copy
  can withhold it separately. A page given by address is fetched at stage 0
  under the reader-source rule (never sealed, never on a `none` install); a
  fetch for an unsealed run is written back to the library item.
- It is in the inventory **before the stage-5 planner** (phase 22's reader
  sources arrived after round 1's planning call).
- **Quotes from it are verified** against its text in `semanticFault` exactly
  as the paper's are; found, the page, section and offsets are the grounding
  passage's. An `extracted_fact` citing it is refused.
- **Graded as full text** (`evidence-grade.ts` `readInFull`; the triage cap
  that narrows snippet-only rows to weak does not fire), so eligible for
  moderate and strong — on what it IS: prompt 6 says a consultation response
  is a stakeholder speaking.
- **Search block-list**: `documentShingles` includes it.
- `hasSource` treats it as ground; a play's `external_evidence` precedent may
  rest on it.
- **Trusted as evidence, never instruction**: prompts 5, 6, 10, 14, 15 and 16
  say so in their own words, and the UNTRUSTED DATA line above every prompt is
  untouched.

### Phase 22's "Sources it should use" — kept, with a clear relationship

Decided: **kept as-is, beside grounding**, and the form says which is which.
A source there is for THIS run: read like a research result (10,000
characters, at stage 5, after the planner), graded as one, and its look-ups
are unchanged. Supporting material is the POLICY's: read in full before
research is planned and kept in its library. The URL path into the library is
the Documents section's "Or its web address" on a supporting row and the
library page. Merging the two was the plan's suggestion; it would have changed
what an existing run's "Supplied by you" rows mean and the walk's and the
pack's phase-22 assertions for no reader gain, so the two stay distinct
concepts with one sentence of hint between them.

## Token cost of grounding, and how the fitter shares the budget

Measured shape of the Best Start run (`44dd5420`, from `policy_model_calls`):
calls per stage including corrective rounds — 5: 2, 6: 26 (avg payload
584,924 characters), 10: 15, 14: 77, 15: 1, 16: 7. Run total ≈ 200M
characters of input, about 50M tokens at four characters a token.

| where | what is sent per item | calls per item | tokens per item (≈ chars/4) |
|---|---|---|---|
| stage 0 | nothing — server-side ingestion | 0 | 0 |
| stage 5 (planner, rounds) | digest ≤ 700 chars, in the shared block | 2 | ~350 |
| **stage 6** | **the item in full (≤ 60,000 chars) as the call's own block, beside the stage's shared inventory** | **1** (+ up to 2 corrective) | **~15,000 own + the ~146,000-token shared prefix**; ~15–20k if that prefix is served from cache |
| stage 10 | digest | ~15 | ~2,600 |
| stage 14 | digest | ~77 | ~13,500 |
| stage 15 | digest | ~1 | ~175 |
| stage 16 | digest | ~7 | ~1,200 |

So **per item: ~160k tokens uncached, ~35k cached**, almost all of it the one
stage-6 call; **eight items, the maximum, ≈ 1.3M tokens uncached** — about
2.6% of the Best Start run — of which the digests elsewhere are ~140k
(0.3%). Output is one evidence-matrix reply per item (a few thousand tokens).

**Caching.** Stage 6's grounding calls are ordinary members of the evidence
fan-out: same `orderedContext(inventory, …, 'evidence', …)` key, so the SAME
fitted shared block as the research-question calls, in front, and the item
after it. The phase-23 warm-up applies. (Phase 23 measured stage 6 missing the
cache even warm; if the first real run confirms that, the per-item cost is the
uncached figure, and the `prompt_cache_key` lever in `phase-23-tokens.md`
applies to grounding exactly as to research.) Digests are constant for the
whole run, so they sit in a stage's shared block without moving its prefix
between calls; they change only when the grounding changes — a different run.
`StageInput` is untouched; `groundingItem` rides as an `extra`, after the
artefacts.

**The fitter.** `STAGE_CONTEXT` names `grounding_passage` LAST for 5, 6, 10,
14, 15 and 16, so under pressure a digest is the first declared kind shed —
it is the cheapest to lose, because stage 6 already turned the item into
evidence rows those stages see. `scoped()` turns the declared kind into one
digest per item (never the passages) and keeps grounding out of every stage
that does not declare it (7, 9, 11, 12, 17, the undeclared 1–4 and 13, and
every pass). At stage 6 the per-item block is part of `evidenceOwns`, so the
largest item sizes the shared block's allowance (`largest + 40,000`, at most
half of `FIT_LIMIT`) — a 60,000-character item leaves the inventory ~940,000
characters, more than the measured 585k average, so on the Best Start run
nothing is shed that was not shed before.

## Proved on a copy of the live database

| check | result |
|---|---|
| migrations 0000–0009 (with phase 24b's 0008) on a fresh copy | applied; all 20 analyses keyed (`paper_key` = their document's sha256), every document `position 0, main, ''` |
| passage ids, all runs | 1,328 passages; md5 of the ordered id list identical before and after (`a404ecc7…`) |
| report pages + exports, `44dd5420` and `36ebca37` | **81 of 81 identical** — every move and section page's `#main-content` text, the Markdown export, the brief and the shared export; no page errors |
| papers counted | 2 distinct paper keys, as 2 distinct sha256s before |

Method: the base build
(`f9a714e`) and this build, each as the fixture server bound to 127.0.0.1, each
on its own copy of the live database; every report page of both finished runs
(the five moves and every section page linked from them) rendered in a
browser, `#main-content` text compared, plus the Markdown export, the brief
and the shared export.

## Decision log

| fork | options | chosen | why | reversible? |
|---|---|---|---|---|
| Policy grouping | `policy_key` text / table | **table** | a name to pick and a library to cascade | yes |
| Same paper | exact set / main document / any member | **any member, stored as an inherited `paper_key`** | a re-run with an annex is not a second paper; stable when runs are deleted | yes — recompute the column |
| Grounding storage per run | reference the library / copy | **copy at submission** | reproducible runs; sealed runs never touch the library after submission | yes |
| Grounding kind | `passage` with a flag / new kind | **`grounding_passage`** | "the paper said" stays a check on the kind | no (data) |
| Grounding elsewhere than 6 | passages / digest / nothing | **digest** | the plan's default; ~0.3% of a run | yes |
| Grounding in a share | keep / withhold | **withhold** | phase 10's attachment rule; quotations still travel | yes |
| Phase 22 sources | fold into grounding / keep | **keep, explain** | different trust and lifetime; old runs unchanged | yes |
| Sealed + new policy | allow / refuse | **refuse, said** | the name would be clear text | yes |
| One-document labels | add the title / unchanged | **unchanged** | caches and old reports identical | yes |

## Gates

See the report to the integrator for the `test:all` line.

## Left undone

- No real model has read grounding. The first real run (phase 27, option 3)
  should be read for whether stage 6 grades grounding on its merits, and
  whether its grounding calls hit the cache.
- A library item cannot be edited in place (remove and add again), and a
  policy cannot be renamed or deleted from the page.
- A shared copy withholds grounding passages, so it shows no Grounding section
  (the handling note says the material was left out); the evidence rows and
  their quotations still travel.
- The drill's "Checked outside the paper" box lists research sources, not
  grounding; the Grounding tag and the evidence table carry it instead.
