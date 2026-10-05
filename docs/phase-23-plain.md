# Phase 23 — plain English for someone who has not read the policy (P1–P6)

*5 October 2026. Stream: plain English (branch `p23-plain-english`). Plan §2
and §5's in-report helpers. Checked on the fixture and against a copy of the
live database (both real runs, served on 127.0.0.1 only). No model was called.*

## What was measured before anything changed

On the live Best Start run (`44dd5420`):

| | |
|---|---|
| Words a sentence, acronyms (phase 19's rule) | 13.7; 1 in 46 plays — the sentence was already fixed |
| Ids written into prose (labels, statements, data text; references excluded) | **353**: 200 in causal chains, 76 in scenario sensitivity ("If s1_023_assumption_001 is true…"), 55 in models, 22 in challenges |
| …on the older run (`36ebca37`) | 308 |
| Ids a reader could see across all 37 report pages (every disclosure opened) | the 353 above, minus what pages do not print |
| A play's `play` text on its card | never printed — the card had title, body, figures and a cost/warning/fix disclosure |
| Paper names explained anywhere | none |

## What changed

**P1 — the writing rule's audience** (`prompts.ts`, `WRITING_RULE`). The reader is
now "someone who has never read this policy"; the first time a programme, fund,
body, target or phase from the paper is named, say what it is; say what happens
to a real person; never put an id in a sentence. 735 → 944 characters (the
four clauses cost ~210; three filler examples and the separate "explain any
technical term" clause went to pay for them). The test's cap is 1,000, with why.

**P2 — `plain` on every way to beat it** (`exploit.data.plain`: `who`, `does`,
`goesWrong`, `likeWhen`, `whyItMatters`). `likeWhen` is **required and
nullable**: null says "no honest comparison" in the data, where a missing key
would say "the model forgot" — the two must not read the same. A cleared row
owes no block.

**P3 — scenarios and key judgements.** Scenario: `what`, `firstMove`, `result`,
`whyItMatters` — the four beats a newcomer needs, in the order the sequence
already runs. Key judgement: only `forWhom` and `whyItMatters`. Its `statement`
is already one plain sentence under 30 words saying what happens, to whom and
why, and it carries an action and owner; restating who and what would be the
same sentence twice. What it lacked was the person and the stakes in everyday
words. No `likeWhen`: a comparison is for a mechanism someone has to picture,
which is the play's job. Stage 9's prompt now names assumptions in words.

**P4 — `whatItIs` on every mechanism** (stage 1, the indexed path and an
addendum's step 1), and a per-assessment glossary (`$lib/policy-terms`) from
mechanisms' `whatItIs` and, read as optional, resolved bodies' (`s2_`) — the
actor-register stream adds that. `Term` (`client/report/Term.tsx`) is a
`<button aria-expanded>` that shows the definition straight after it in reading
order until pressed again: no hover, keyboard by default, React state only, so
it works in the pack. `TermText` marks the first mention of each term in a
sentence (three at most); `TermName` marks a lone name. Used on play cards (the
body line and every plain line), the Summary (the new card and "Who could do
it") and the item page; the Glossary lists the paper's own names under the
report's own words, because the pack's interface is Ctrl-F and paper has no
buttons.

**P5 — ids never reach a reader.**
- Validation: `plainChecks` warns (never refuses) when prose holds an id.
- Display backstop: `withoutIds` in `plain.ts`, applied at the three roots that
  render prose — `Report` (page and pack, wrapping the component once),
  `Drill`, and the export route (beside `markDownJudgements`). An id in a
  sentence becomes the item's name in quotes; one the run does not hold becomes
  "another item in this assessment". An entry that is WHOLLY an id in a field
  of words (a logic model's "What goes in" was `s1_011_claim_001`) becomes the
  bare name. Reference fields are never touched: `refs`, `*Id`/`*Ids`, the
  known arrays, and a check's `inputs`/`actors` (kind-aware — a logic model's
  `inputs` are words).
- `test_…` is weak: `test_results` is also a section name, so a `test_` word is
  replaced only when the run holds that id, and never warned about.

**P6 — soft word limits** (`WORD_LIMITS`: 20–25 a line, 15 for `forWhom`, 20 for
`whatItIs`) — a warning, never a refusal.

### A missing block costs an ask, never the item

The shapes parse `plain`/`whatItIs` as optional, so every older row parses; the
prompt's JSON schema marks them required (`promptSchema`). Triage:
- A malformed block (a stray key under the strict shape, a page-long field) is
  REMOVED before the shape check — the play is kept, not refused for a badly
  formed summary of itself (`stripMalformedPlain`).
- A kept play/scenario/judgement with no block goes into a new `incomplete`
  list on `TriagedOutput` — never `rejected`, so never counted as discarded.
- `provider.ts` treats `incomplete` as asks beside the refusals: the existing
  corrective round asks for **the block alone** (`{id, kind, data: {plain}}`,
  `repairPrompt`), and `graftPlain` puts the answer on the kept item before the
  rest of the reply is triaged (on a copy: the stored reply stays the model's
  words). One ask per item, under the existing round budget.
- `whatItIs` is not re-asked: stage 1 is ~60 calls and a corrective round each
  for a one-line gloss is not worth it. A missing one is a warning and the name
  simply has no definition.

### Warnings for the stream that splits the warnings channel

All of these come from ONE function, `plainChecks(kept)` in `plain.ts`, called
once at the end of `executeStage`, at most four sentences a stage (id in prose;
no block after the ask; no `whatItIs`; over the word limit), every one starting
`PLAIN_CHECK` = `"Plain English check:"` (`isPlainCheck`). They are machine /
quality warnings about the run's writing, not document gaps. **Until they are
routed, `stage-facts.ts` files them as `open`** — I did not add a rule there,
because that file's structure is the other stream's. The fixture never trips
them, so no gate depends on the routing.

## Report rendering

- Play card: the plain block (five labelled lines) under the title and figures,
  before the detail; with counters, the disclosure now starts with "How it
  runs" (the play itself, which the card never printed); without counters
  (Findings' three-play sample) a "How it would be run" disclosure.
- Scenario: the block first inside each disclosure, then "The full sequence";
  the summary's gist is `plain.what` when there is one.
- Key judgement (Brief, pack, Word): the two plain lines under the statement;
  every brief item also gets "What goes wrong" from its play.
- Summary: a first card, "What this report says, in plain words" — up to three
  `goesWrong` lines, the brief's plays first, then the worst of the rest, never
  the same line twice (`plainLines` in `brief.ts`).
- Item page: the block (or "In everyday words: …" for a part of the policy or a
  body) under the lead sentence.
- Word/Markdown: the block leads each play, scenario and judgement.
- **Older runs**: no block anywhere → every component draws what it drew
  before; the glossary is empty; the Summary card is not drawn. Checked on both
  live runs: 37 pages each, no page error, Threats unchanged.

## Measured after

| | before | after |
|---|---|---|
| Ids in stored prose as a reader receives it (`withoutIds`), `44dd5420` | 353 | **1** (an entry naming an id the run does not hold) |
| …`36ebca37` | 308 | **0** |
| Ids visible across all 37 report pages of `44dd5420`, disclosures open | (most of the 353) | **1**, on How it was made → gaps: a REFUSED item's id quoted in a run warning (the item was never stored, so there is nothing to name; that sentence is the other stream's channel) |
| Sideways scroll at 320px on the new card and play cards | — | none (walk) |

## Output-token cost (from `44dd5420`'s own usage: 998k output, 57.4M input, 450 calls)

| stage | today | added | how |
|---|---|---|---|
| 1 decomposition | 176k | ~2.3k | 75 mechanisms × ~30 tokens of `whatItIs` |
| 9 scenarios | 17k | ~1.5k | 15 × ~85 tokens of plain; sensitivity in words is about as long as in ids |
| 10 playbook | 33k | ~4.2k | 38 real plays × ~110 tokens (cleared rows owe none) |
| 17 assured synthesis | 72k | ~0.1–0.25k | 2–5 judgements × ~45 tokens |
| **total output** | 998k | **~8–9k (~0.9%)** | the low end of the plan's 10–18k |

Input: the rule grows ~50 tokens and rides on ~450 calls (~23k, almost all in
the cached prefix); the schemas add ~150 tokens to stages 9, 10, 17. **The risk
is the ask, not the block**: a stage-10 corrective round re-sends ~250k input
tokens (output tiny). It fires only when a model omits the block the schema
marks required; the first real run should be read for how often
(`callKey … #repair1` on stage 10 with a "plain-words block" instruction).

## Decision log

| fork | options | chosen | why | reversible |
|---|---|---|---|---|
| Missing block | refuse (repair, then lose the play); keep silently; keep and ask | **keep and ask** | a play refused for lacking a summary is the all-or-nothing loss this codebase removed a dozen times; silently absent defeats the point | yes |
| What a repair resends | the whole item; the block alone | **block alone**, grafted | ~110 output tokens instead of ~700; the item is already validated | yes |
| Malformed block | refuse the item; strip and ask | **strip and ask** | strict shapes would refuse the play over its summary | yes |
| `likeWhen` none | omit; "None"; null | **required, nullable** | distinguishes "no honest comparison" from "forgot" | yes |
| Key judgement block | five fields like a play; `forWhom` + `whyItMatters` | **two** | the statement already is the plain sentence | yes |
| Re-ask `whatItIs` | yes; warn | **warn** | 60 stage-1 calls; a gloss is not worth a round | yes |
| Where ids are swapped | each component; the roots | **the three roots**, as `markDownJudgements` | one reading; a component that forgets is the defect | yes |
| Whole-id entries | always reference; key-aware | **key- and kind-aware**, only when resolvable | the live logic model put a claim id as an input; an unknown field that is a join must keep working | yes |
| Term UI | hover tooltip; `<details>`; button + following text | **button + following text** | the accessibility page promises click not hover; `<details>` is block-level and cannot sit in a sentence | yes |
| Glossary source | a model call; `whatItIs` | **`whatItIs`** | no call; nothing invented; empty on old runs | yes |
| Summary card lines | judgement statements; play `goesWrong` | **`goesWrong`** | the concrete harm to a person is the line a newcomer lacked; statements are already the next block down | yes |

## Gates

See the report-back for the `TESTALL_EXIT` line. Added: `plain.test.ts` (14),
`policy-terms.test.ts` (6), a provider integration test (a play with no block is
kept, one ask is made for the block alone, the answer is grafted on, nothing is
counted discarded), walk assertions (the Summary's plain card leads; a play card
draws its five plain lines before its detail and the detail carries the play; a
term opens and closes from Enter/Space with axe clean), and offline assertions
(the plain card, plain lines, a judgement's "Who it happens to", the paper's
names glossary, and a term that opens from `file://`).

## Left undone

- `stage-facts.ts` routing for `Plain English check:` warnings (other stream).
- `pack-live.mjs` was not run: this box has no `unzip`. The offline gate passed
  on the fixture, and the service render of both real runs was checked page by
  page.
- Terms are matched by exact name. A model that writes "the hubs" for "Family
  Hubs" gets no definition there; the Glossary still lists it.
- The "?" beside each figure that opens a guide chapter (§5) waits for the guide.
- No real run: whether a real model writes `goesWrong` about a real person, and
  how often a block has to be asked for, is for the phase 27 run to show.
