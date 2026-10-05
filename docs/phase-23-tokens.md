# Phase 23 — tokens and value (T2, T4, T5, stage 17, T6)

Written 5 October 2026 on branch `p23-token-value`. Plan: §1 of
`site-tech-debt-review-2026-09-26/policy-red-team-phase-23-plan-2026-10-05.md`.
Every figure below comes from a read-only copy of the live database, analysed
offline: no model was called. Run `44dd5420` is *Giving every child the best
start in life* (Best Start, 25 Sept); `36ebca37` is the Post-16 white paper.
`PROMPT_VERSION` is not bumped here; the integrator does it once.

## What changed

| Commit | What a reader or a run now gets |
|---|---|
| `fd64e12` | **T2 warm-up.** A fan-out in `WARM_FIRST_STAGES` (3, 6, 7, 9, 10, 14, 16) sends unit 0 alone and releases the other lanes when it lands, answered or failed. Nothing a call is asked changes. |
| `07af4ce` | **T5 notes.** What a model writes in its reply's `warnings` is stored as `policy_stages.notes`, never carried into a later prompt, and listed under "What the paper does not say" in "What it could not establish". Older runs are parted by matching the stored replies, not the wording. Migration `0006-stage-notes.sql`. |
| `3c0a1a9` | **T4 and stage 17.** The rules replies broke most are in the first instruction (stages 1, 12, 17); stages 12 and 17 are sent `resultAssumptions`; a challenge cited by a guessed id is refiled to its step's one challenge; the final review is asked for five key judgements, and fewer than three asks once more. |
| `02ced97`, `ef38442` | **T6 value ledger** on the Method page ("What each step spent, and what came of it"), from stored rows, in the service and the pack. The fixture provider now keeps a call log so the walk, `a11y` and the pack check exercise it. |

## T2 — warm-up, then fan out

### What the call records say about caching

Every fan-out call on every run in the database (`q8`-style replay of
`policy_model_calls`): did any sibling in the same execution finish before this
call started, and did it read more than half its input from the cache?

| stages | calls started before any sibling finished | hit | calls started after one finished | hit |
|---|---|---|---|---|
| 3 and 14 | 51 | **0%** | 937 | **72–83%**, whether 0 or 5 other lanes were busy |
| 6, 7, 9, 10, 16 | 113 | 2% | 93 | **2%** |

So the plan's diagnosis — *every lane starts cold in the same millisecond* — is
exactly right for stages 3 and 14, and **not sufficient for 6, 7, 9, 10 and 16**.
Those stages missed even when a sibling had finished minutes earlier: stage 6
on the Best Start run made 17 calls after its first had landed and read nothing
from the cache, though the bytes sent were identical for the first 616,838 of
~624,000 characters (checked by rebuilding the sent order from the stored
inputs: the shared block leads and only the per-call block differs). Corrective
rounds in those same stages DID hit (220,928 of 223,897 on `b5774103` stage 6).
Size is not the explanation (stage 6 misses at 150–230k tokens where stage 14
hits at 215–230k), and the key the bridge routes on (a hash of the system
prompt) is constant per stage. The call log does not show the cause.

Decision: ship the warm-up for all seven (it removes the cause the records do
show, and costs ~4 minutes), and **measure the small stages on the first real
run**. If they still miss when warm, the next lever is a caller
`prompt_cache_key` per run and stage (the bridge already admits one,
`callerCacheKey` in `jkai-codex-bridge`), sent only on the Codex provider.

### Cost in time, from the real timings

Simulated rolling pool, six lanes, each unit's real duration (main call plus
its corrective rounds) from the Best Start run:

| stage | units | pool as run | with warm-up | extra | cold calls today | prefix |
|---|---|---|---|---|---|---|
| 3 | 148 | 799 s | 811 s | +12 s | 5 | 128k |
| 6 | 22 | 288 s | 346 s | +58 s | 6 | 153k |
| 7 | 10 | 64 s | 98 s | +34 s | 6 | 256k |
| 9 | 8 | 125 s | 125 s | 0 s | 6 | 253k |
| 10 | 12 | 129 s | 183 s | +54 s | 5 | 250k |
| 14 | 75 | 560 s | 594 s | +34 s | 6 | 214k |
| 16 | 7 | 40 s | 72 s | +32 s | 6 | 221k |
| | | | | **+224 s** | | |

About **3.7 minutes** a run. A cache hit is no faster (phase 19), so this buys
cost, never time.

### Input moved to the cache (cost, not count)

Caching does not reduce the tokens a run reads; it makes them cheaper.

- **Stage 14 on today's code** (one logic model and eight chains, 9 calls): six
  go out cold today. With the warm-up, one does, and eight start warm at the
  observed 86%: **~0.9M** of ~2M moves to the cache.
- **Stage 3**: on today's shape ~0.5M of the cold first wave (5 × 128k at 72%).
  After the actor builder's batching (T1, ~20 calls) the first wave is a
  quarter of the stage, so the share it saves grows.
- **Stages 6, 7, 9, 10, 16** (13.6M input, 0–12% cached): **between ~0.3M and
  ~8.6M**. The low figure is the observed 2% warm hit rate; the high one is
  every call after the first hitting at stage 14's rate. The plan's "50–70%"
  is the high case and is not yet earned.

### Tests

`warm-up.test.ts` holds the model's calls open and observes the schedule: one
call out, then every lane; identical payloads and artefacts to a serial run; a
failed first call still releases the lanes and is a gap like any other; a dead
provider still trips the brake; a cancel during the warm-up sends nothing more.
The rolling-pool test in `pipeline.test.ts` now slows unit 1, not unit 0.

## T4 — fewer corrective rounds

### Why replies were refused (stored replies, replayed through `triageOutput`)

| stage, run | first replies | needed a repair | refusals by reason |
|---|---|---|---|
| 1, Best Start | 41 | 18 | 17 claim `category` "intervention"/"implementation"; 7 quote not located; 3 assumption not linked to an actor or mechanism; 2 assumption citing an absent id; 2 edges |
| 1, Post-16 | 68 | 31 | 29 edges; 16 claim category; 16 quote not located; 14 assumption citing an absent id; 5 assumption not linked; 7 other |
| 17, Best Start | 7 (across 7 attempts) | 2 | 12 findings whose hypotheses none of their cited results rests on; 29 responses citing a challenge by a guessed id (`s16_003_assurance_001` for `s16_003_assurance_challenge_001`, after one remit really did write `s16_002_assurance_001`); the rest cascades |

The claim category: instruction 1 lists "interventions and implementation"
among the things to extract, and the model made categories of them (16 of 17
invalid values were `intervention`).

### What changed

- `FIRST_ROUND` in `prompts.ts`: a short "before you return, check these"
  block appended to the instructions for stages 1, 12 and 17 (and a
  restatement), naming the enum, "an intervention is a mechanism row", "no edges
  here", the assumption-link rule, and — prose contract only — the quote rule.
  A separate table, so the per-stage prose other streams edit is untouched.
- `resultAssumptions`: stages 12 and 17 (and a restatement) are sent, per
  citable result in their context, the assumption ids it reaches through
  `refs` — the walk the validator makes — nearest first, at most 8. It rides
  after the artefacts, so the cached prefix stands. On the Best Start run all
  12 refused findings cited results that do reach an assumption, so the list
  would have offered a valid choice every time. Size: ~30k characters on the
  old stage-14 shape (163 results), about half that on today's.
- `refileChallenges` in `validation.ts`: an unresolved `s16_<slot>_…` id whose
  slot wrote exactly one challenge is refiled to it, silently, as an id under
  the wrong heading already is. Replayed: the 29 invalid-reference refusals go
  to 0. An ambiguous or empty slot is refused as before.

### Expected reduction

- Stage 1: 11 of the 18 replies that needed a repair on Best Start (16 of 31 on
  Post-16) were refused ONLY for reasons the first instruction now names. If
  the instruction holds for most of them, 19 repair calls become ~8–12. They
  are small calls: 0.13M input and ~4 minutes of lane time on Best Start.
- Stage 17 on today's code is one attempt: main, at most one repair, a top-up.
  The one remaining refusal pattern in a today-code reply is addressed by both
  changes above, so **one repair round (~0.23M input, ~70 s) should go**.
- The plan's "~2–3M plus 40 minutes at stage 17" was the seven ATTEMPTS of the
  Best Start run (3.85M, 66 minutes, a 35-minute gap while a fix was deployed),
  which phase 19's fixes, not this phase, removed. Measured honestly, stage 17
  today should cost ~0.5–0.7M and ~5 minutes.
- Stage 4 (18 repairs, 0.68M) belongs to the actor builder.

## T5 — the warnings channel split

`triageOutput` now returns the model's envelope `warnings` as `notes`; the
provider and the pipeline carry them in their own channel; the worker writes
them to `policy_stages.notes` (sealed like `warnings`) with
`output.contractVersion: 2`, and carries only `warnings` forward. The plain-English
builder's quality warnings are pushed to `output.warnings`, so they stay machine
state, as asked.

**Prefer provenance to prose.** The brief's 136 was an estimate from the
wording. Matching the Post-16 run's 256 warnings against the strings its models
actually wrote gives **103** (`client/report/warnings.fixture.notes.json`, read
off the stored replies); all 103 fall to `stage-facts.ts`'s `open` bucket, so
the two methods agree on direction. Best Start: 99 of 257.

**What leaves the carried-forward budget** (`notes.test.ts`, on the fixture):

| | before | after |
|---|---|---|
| warnings carried into a later prompt (12,000-character budget) | 90 | 71 |
| of which the model's notes | 54, **7,364 characters** | 0 |
| machine facts carried | 36 | **71** |

The budget is a cap, so the prompt does not get much shorter: the room the
notes took now carries 35 more machine facts (context clipped, outputs refused)
that used to be dropped. Token saving is ~0; the gain is that later stages are
told what the run could not do rather than what the paper does not say.

**Old runs still render.** `withNotes` (`src/lib/policy-analysis/notes.ts`)
keeps `warnings` as the whole record on the API, so the Word export, the pack,
the brief and the step list count exactly what they did; `notes` is the model's
part. A stage written before the split is parted by the stored replies
(`legacyNotes` in `store.ts`: 48 ms on Best Start, cached on `updatedAt`). A
sealed older run stores no reply and reads as before. The pack and a shared
copy mark notes with `note: true`; an older pack marks none.

## Stage 17 — why only 2 key judgements survived

Replayed from the stored stage-17 input and replies: **the main call was sent
none of the 75 mechanisms and none of the 365 claims** a key judgement must name
and quote. The old theory of change (75 chains, 537k characters) and every
pinned item overflowed the budget; the stage's own warning says "No actor,
claim, evidence, mechanism, research_source was left in this call's context at
all". The model wrote the two it could, and both quoted through a mechanism's
own quote. The key judgements were never refused — they were never written.

Simulating today's fit (`fitOnce`, `STAGE_CONTEXT[17]`) on the same inventory
with stage 14's new shape (one logic model, eight chains): all **75 quotable
items** are sent (48 of 75 mechanisms, 67 of 365 claims, every assumption and
evidence row). So the cause was the context, and phase 19's stage-14 change has
already removed it; it has simply never met a real run.

What this phase adds, because "between one and five … the few things" invites
two: the instruction asks for five, each about a different mechanism or play,
three at the least; and the existing top-up now fires below
`KEY_JUDGEMENT_FLOOR` (3) instead of only at none, handed
`keyJudgementsWritten`, with its additions ranked after them (the reconcile
keeps the LAST of each rank, so an addition numbered 1 would have replaced the
first ask's).

**One call per judgement — designed, not built.** It would send five calls of
a slim context (deep chains and logic model, the quotable mechanisms and
claims, the leading patterns' plays, the assured findings), one subject each
(the k-th pattern's sharpest play and its mechanism), in parallel with a
warm-up. It needs the provider to triage against this stage's own findings (its
`prior` is fixed at stage start), a fixture change, and a new failure rule. It
is not justified while the replay says the single call failed for want of
context that today's code supplies. Build it if the first real run still leads
with fewer than three.

## T6 — the value ledger

`src/lib/value-ledger.ts`: per step, calls, corrective rounds, calls with no
usage recorded (a timeout records none), input, cached, output; items made
(`policy_artefacts.stage`); items cited by a LATER step's `refs`
(`policy_provenance`); items of a kind the report draws on a page (`DRAWN`, a
named table — a stage-1 actor mention is not drawn, a resolved body is). Built
by `forTheReport` before stubbing and by `runFacts` for the pack; rendered by
`client/report/ValueLedger.tsx` as a `Figure` (diagram: the ladder's grid with
two `Bar`s — input in millions, share cited — and a GOV.UK table), in section
`value` beside the ladder on the Method page. No sideways scroll at 320px.
Older runs work (they have calls); a pack made before this has no ledger and
draws none.

### Validated against plan §1 on a copy of the live database

Fixture server bound to `127.0.0.1:5530`, `POLICY_DATA_DIR` on a copy, read
through `GET /api/policy-analysis/44dd5420…?view=report`:

| step | calls (repairs) | input | cached | output | made | cited later | plan §1 |
|---|---|---|---|---|---|---|---|
| 1 Decomposition | 61 (19) | 0.25M | 17% | 176k | 812 | 704 (87%) | 61 (19), 0.25M, 17%, 176k, 812, 87% ✔ |
| 3 Knowledge graph | 158 (3) | 19.56M | 65% | 200k | 455 | 347 (76%) | 158, 19.6M, 65%, 200k, 455, 76% ✔ |
| 4 Profiles | 58 (18) | 1.91M | 7% | 144k | 147 | 17 (12%) | ✔ |
| 6 Evidence | 26 (3) | 3.99M | 0% | 84k | 197 | 135 (69%) | ✔ |
| 7 Models | 10 | 2.56M | 0% | 17k | 10 | 9 (90%) | ✔ |
| 9 Scenarios | 8 | 2.02M | 12% | 17k | 29 | 10 (34%) | 15 scenarios, 47% |
| 10 Ways to beat it | 15 (2) | 3.52M | 0% | 33k | 56 | 20 (36%) | 46 plays, 43% |
| 14 Theory of change | 77 (1) | 16.27M | 79% | 165k | 256 | 43 (17%) | 75 chains, 24% |
| 16 Challenge | 7 | 1.55M | 0% | 8k | 17 | 7 (41%) | 7, 100% |
| 17 Final review | 17 (10) | 3.85M | 6% | 72k | 32 | — | ✔ |
| **Whole run** | **460** (60), 10 unrecorded | **57.46M** | **46%** | **978k** | 2,464 | 1,622 | 450, 57.5M, 46%, 978k, 2,317 |

Every token figure matches. Two definitions differ, on purpose: the ledger
counts ALL calls (the plan's 450 were those that reported usage; 10 more timed
out or failed and recorded nothing, which the page says), and ALL items a step
kept — stages 9, 10, 14 and 16 also mint assumptions, which the plan's "items
made" column left out by counting the step's main kind.

## Projected run after all phase-23 work

Input tokens per run (count), from 57.5M on Best Start:

| change | from | to | owner |
|---|---|---|---|
| stage 14 on today's code (never measured) | 16.3M | ~2M | phase 19 |
| stage 17 on today's code (one attempt, not seven) | 3.85M | ~0.5–0.7M | phase 19 + this phase |
| stage 3 batching (T1) | 19.6M | 1.5–2.5M | actor builder |
| stage 4 short profiles (T3) | 1.9M | ~0.9M | actor builder |
| stage 1 and 17 repairs (T4) | 0.36M | ~0.1M | this phase |
| `resultAssumptions` on stages 12 and 17 | — | +0.02M | this phase |
| T5 notes split | ~0 | ~0 | this phase |
| **total** | **57.5M** | **~21–22M** | |

That is a little above the plan's 15–20M: the plan did not count stage 17 as
already fixed, and stages 6, 7, 9, 10 and 16 (13.6M) are untouched in COUNT by
anything in this batch — the warm-up moves their cost, not their size.

**Uncached input** (the cost proxy; 31.1M today): **~8–17M**. The low end
needs stages 6–16 to cache like stage 14 once warm; the high end is the
observed 2%. Stage 3 and stage 14 contribute ~1.5M of fresh input between them.

**Wall clock**: the warm-up adds ~3.7 minutes, the key-judgement top-up ~0.5
minutes when it fires, and T4 removes ~1–2 minutes of corrective round-trips —
**about +2 to +3 minutes** net from this stream. Batching stage 3 (T1) is where
time moves.

All of this is an estimate until the phase-27 runs (baseline `bad0631` and this
build, both on gpt-6-luna, same paper). The ledger is how that comparison will
be read.

## Decision log

| Decision | Options | Chosen | Why | Reversible |
|---|---|---|---|---|
| Warm-up scope | 6, 7, 9, 10, 16; plus 3 and 14 | **all seven** (`WARM_FIRST_STAGES`) | cold calls in 3 and 14 hit 0%, warm ones 72–83%; 3's and 14's first waves are 5–6 calls of 128–214k | yes, one set |
| Warm-up release | all lanes at once; ramp | **all at once** | in 3/14 warm hits do not fall with lanes busy (83% at 0, 72% at 5) | yes |
| Warm-up as a run toggle | form field like `sharedContextFirst`; none | **none** | a stage-level set is what was asked; the phase-27 comparison is between builds | yes |
| Notes storage | new column; tag inside `warnings`; artefacts of a new kind | **column `notes`, sealed** | structured at the source, survives sealing, no new kind for every view to learn | additive migration |
| API shape | `warnings` machine-only; `warnings` whole + `notes` | **whole + `notes`** | Word, pack, brief, step tags keep their counts; only the gaps section parts them | yes |
| Older runs' notes | regex classifier; stored replies | **stored replies** | exact (103 of 256, all `open`); a sealed run has none and reads as before | yes |
| Stage-1 hints | edit instruction 1; separate table | **`FIRST_ROUND` table** | keeps other streams' prose edits clean; each rule is visibly earned | yes |
| Guessed challenge ids | prompt only; refile | **refile by unique slot, plus a prompt line** | 29 refusals → 0 on replay; ambiguous slots still refused | yes |
| Key judgements | one call per judgement; ask for five + floor top-up | **ask for five + top-up below 3** | replay shows the cause was context, which today's stage 14 frees | yes — design above |
| Ledger "cited" | refs only; refs + data id fields | **refs (`policy_provenance`)** | the provenance graph is what later steps cite through; data fields mirror refs by triage | yes |
| Ledger "on a page" | rendered-within-cap; kind has a section | **kind has a section (`DRAWN`)** | caps vary by view; this says what a reader can reach without opening a record | yes |
| Ledger in the pack | include; exclude | **include, via `RunFacts`** | the pack is the copy that outlives the service; counts only, no text | yes |
| Fixture call log | none; synthetic rows | **synthetic rows, model `fixture`** | otherwise no gate ever renders the ledger | yes |

## For other streams and the integrator

- **Shared files touched**: `pipeline.ts` (`fanOut` gate; `absorb` parts
  `notes`; KJ top-up; `supportsFor`/`resultAssumptions`), `prompts.ts`
  (`FIRST_ROUND` appended in `systemPrompt`; the first line of
  `KEY_JUDGEMENT_PROMPT`; the last sentence of instruction 17), `validation.ts`
  (`triageOutput` returns `notes`; `refileChallenges`), `contracts.ts`
  (`StageOutput.notes`, `KEY_JUDGEMENT_FLOOR`), `provider.ts`, `worker.ts`,
  `store.ts`, `shares.ts`, `share.ts`, `offline/payload.ts`,
  `client/report/{Limits,Report,warnings}.tsx/ts`, `client/api.ts`,
  `client/offline/OfflineApp.tsx`.
- **Migration number**: `0006-stage-notes.sql`. If another stream also adds a
  `0006-`, renumber one and keep `order.txt` in step.
- **The fixture model** now writes a note at stage 1, three key judgements
  where the inventory allows (the synthetic paper allows one, so every fixture
  run makes one stage-17 top-up), and the fixture provider writes
  `policy_model_calls` rows (provider and model `fixture`): "How this was
  produced" in the walk now names a model and shows a cost.
- **A model reply's `warnings` are notes now.** Anything that pushes a machine
  fact should push to `output.warnings` in the pipeline, never expect a model's
  `warnings` to reach `priorWarnings`.
- For `AGENTS.md`: "`policy_stages.warnings` is the run's state and is carried
  forward; `policy_stages.notes` is what the model said about the paper and is
  not. The API returns `warnings` as the whole record and `notes` as the
  model's part (`withNotes`)."

## Left open

- Why stages 6, 7, 9, 10 and 16 do not cache when warm. Measure on the first
  real run; next lever is a caller `prompt_cache_key`.
- Stage 4's repairs (18 calls, 0.68M) — the actor builder's.
- The quote-location refusals at stage 1 (7–16 a run) are paraphrase or text
  from elsewhere; the first instruction now says "one unbroken span of THIS
  passage", but nothing deterministic fixes them.
- The ledger's "on a page" is by kind; a section that shows the top N of a kind
  is still counted as showing all of it.
