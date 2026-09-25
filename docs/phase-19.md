# Phase 19 — faster runs, a report that says something, and actors across papers

Written 25 September 2026, from a read-only review of the same day (three
reviewers on a copy of porkserv's database). John's brief: *"crack on with it"*,
plus *"a simpler, easier to access language in the output too where possible."*

## What the review measured

- **Only one real assessment has ever finished** (`36ebca37`, Post-16). 19 on the
  box: 1 completed-with-gaps, 15 cancelled, 3 failed. **No run since 21
  September**, so phases 16–18 have never met a real paper.
- **Time is output-bound.** The model writes ~50 tokens/s and a cache hit is no
  faster than a miss (stage 14: 59.4s vs 60.3s). Caching and batching change
  cost, not time. What changes time is keeping lanes busy and writing less.
  - A UI submission runs ONE lane (the form has no field): 387 min serial vs
    ~126 at six.
  - `fanOut` is `Promise.all` in batches, so only 3.2–3.9 of 6 lanes are busy.
  - Stage 13 is a serial loop, and research is serial I/O.
- **The context fitter starves late stages.** On `03c83ea5`:
  - stage 7's context was 90% actor profiles;
  - stage 14 saw 1 mechanism, 1 assumption and no evidence;
  - stage 16 saw no plays.

  The long, late kinds win the fit.
- **The report is inventory, not judgement.** No final finding names a play.
  150 of 150 theory-of-change chains are "provisional". 46 of 47 plays have no
  precedent. Stage 3's prompt names 8 of 26 relation types, so the measurement
  check reports "the paper wires no measurement" over 39 extracted measures.
- **The persona library has never made a real cross-policy link.**
  - Its only repeat sightings are two runs of the same paper.
  - DfE was never linked across two papers that both name it.
  - One call can mint two personas for one actor.
  - A generic alias causes a tie, and a tie opens a new persona, with no merge.
  - Dossiers hold paper-specific money figures as "facts".
  - It holds zero external evidence.

## Programme

| Wave | Workstream | What |
|---|---|---|
| 0 | fork | Detach from upstream — done, `579e25f` |
| 1 | **E — engine** | lanes default 6 + form field; rolling pool in `fanOut`; stage 13 through `fanOut`; research in parallel; per-stage context allow-list by kind; full profiles for the top K actors and short batched ones for the tail; stage 3 offered every relation type; structural checks say "extraction gap" when the graph is thin; a plain-English writing rule in the system prompt |
| 1 | **P — actor identity** | fix the library (one link per actor, exclude the same document, keep paper-specific values out of the dossier, rebuild the dossier from what is left on delete, groups-of-people apart from bodies); a canonical register of bodies seeded from the GOV.UK organisations API, with parent/child links; resolve against the register first; merge / split / confirm in the UI |
| 1 | **R — report** | Verdict leads with conclusions, machine figures move to Provenance; cut what says nothing; theory-of-change strips; "what rests on what"; a watch list; plain-English labels and a glossary across the UI |
| 2 | **A — analysis** | key judgements (≤5, each naming mechanism, quote, play, assumption, what would prove it wrong, action + owner); challenge looks for "generic" and "missed the sharpest play"; plays grouped into patterns and ranked against each other; theory of change: one programme logic model + deep chains for the top mechanisms |
| 2 | **B — brief** | the one-page brief as the landing view and an A4/Word export; the pattern × mechanism grid leads Threats |
| 2 | **X — actor intelligence** | a dated, reusable research store keyed by register id (NAO/PAC, Hansard, legislation, GOV.UK content first); bodies × papers grid; clashes between papers; stage 11 reads the register |
| 3 | ship | gates, deploy to porkserv, verify live, one real run |

## Decision log

| Decision | Options | Chosen | Why | Reversible |
|---|---|---|---|---|
| Fork | keep syncing; detach | **detach** | Upstream last moved 18 Sept; almost every lever is in copied files; a divergence per change doubles the cost | yes — `--compare` still diffs |
| Default lanes | 1; 3; 6 | **6** | measured on every real run, no 429s seen; output is lane-independent (`pipeline.test.ts`) | yes — form field |
| Faster model | tier cheaper models | **no** | sol was 3–4× slower, deepseek-flash broke JSON on 35/86 | n/a |
| Stage 14 batching | batch k mechanisms | **no, scope instead** | decode-bound, saves ~0 time; fewer, deeper chains serve quality too | yes |
| Plain language | UI copy only; prompts only; both | **both** | readers meet model prose more than labels; GOV.UK style is the house standard already | yes |
| Canonical register seed | Wikidata; GOV.UK orgs API; Companies House | **GOV.UK organisations API first** | free, no key, ~1,200 public bodies with parent/child and closure status: exactly the bodies policy papers name, plus the delivery hierarchy papers never state | yes — the register takes more sources |
| Groups of people | personas like bodies; separate | **separate "affected groups"** | 18 of 35 personas are `user_group`; a group has no strategy, and "children" caused the tie that split the library | yes |
| Dossier | merged model prose; computed from per-paper observations | **computed** | fixes the delete leak, the exact-wording "disagreement", and makes continuity measurable | yes |
| Where to verify for real | OpenRouter on porkserv; Codex on homeserv | **Codex on homeserv, CLI, throwaway data dir** | no per-token spend; porkserv cannot reach the bridge | n/a |

## Workstream P — actor identity: what landed

Branch `phase19-actors`. Migration `0003-actor-identity.sql`.

- **A register of public bodies.** `register/govuk-organisations.json`: all
  1,265 GOV.UK organisations, committed, one per line. `npm run
  register:refresh` rewrites it. The server loads it into `policy_bodies` at
  boot. It is bundled, so no test or fixture run can reach gov.uk.
- **The register decides first.** An actor the register resolves carries a
  body id. A persona with that id is the same body, whatever the paper typed it
  as. Two different ids never link. New personas take the official name.
- **The library fixes.** One link per actor. Groups of people go to
  `policy_affected_groups`. Sightings count documents, not runs. A prior
  leaves out every run of the same document. The dossier is rebuilt from the
  observations that remain, keeping only sentences that travel. Deleting a
  paper rebuilds each persona it touched, or deletes it if no paper is left.
- **A reader can put it right.** Four pages, one question each: which GOV.UK
  body this is, which record is the same body, "are these the same?", and
  "this paper meant a different body". Rulings are stored and go into
  `assessIdentity` as the `IdentityDecision` it was written to take.
- **The live library is upgraded once, at boot.** Groups move out, dossiers
  are recomputed, bodies are matched, and personas with no paper are removed.
  Possible duplicates are offered on the library page. They are never merged
  without a reader.

### Decision log — P

| Decision | Options | Chosen | Why | Reversible |
|---|---|---|---|---|
| Where the register lives | fetch at run time; read a file at run time; bundle a committed snapshot | **bundle a committed snapshot, loaded into `policy_bodies`** | works offline and in every fixture run; a refresh is a reviewable diff; no deploy path has to ship a data directory | yes |
| Snapshot path | `data/register/`; `register/` | **`register/`** | `/data/` is gitignored because the settings key lives in `data/policy-keys`; loosening a secrets rule to commit public data is the wrong trade | yes |
| The refresher | a CLI subcommand; its own bundle | **its own bundle, file only** | PGlite is one process and the server may hold it; `build.mjs` asserts the page URL is absent from both fixture bundles | yes |
| Groups of people | a kind flag on personas; a table | **a table, `policy_affected_groups`** | never reachable by the matcher, cascades with the paper, one census probe; a flag would leave every reader of `policy_personas` to remember it | yes |
| Paper-specific values | ask the model; strip deterministically | **both** | a sentence with money, a year, a dated month, a percentage or one of the paper's own `programme` actors stays in the observation; the prompt asks the model not to write them | yes |
| What "seen in N papers" counts | analyses; documents | **documents (by hash)** | the live library's only repeat sightings were one paper run twice | yes |
| When the model echoes no persona | open a new one; match on the server | **match on the server** | the old path opened a new persona whenever the prior was missed, which is how one body was recorded twice | yes |
| Name matching across types | exact type; type families | **department, agency, local authority and committee are one family** | the same department was typed differently in different papers; a strong name signal is still required | yes |
| Merging duplicates found at upgrade | merge automatically; offer them | **offer them** | a merge nobody saw is the silent contamination the matcher exists to avoid | n/a |

### Left for other workstreams

- **E:** stage 13 still spends one model call per profiled group of people,
  whose link the library now drops. Filter `isAffectedGroup` out of stage 13's
  ranked list in `pipeline.ts`. DfE missing the top 12 there is also E's.
- **E:** `PROMPT_VERSION` was not bumped for the stage-13 wording, so one bump
  covers E's system-prompt change too.
- **X:** the National Audit Office and other bodies of Parliament are not on
  the GOV.UK list. A second source can join `policy_bodies` under its own
  `source`.

## Workstream A — analysis: what landed

Branch `phase19-analysis`. No migration. Prompt generation `3.2`.

- **Key judgements.** Stage 17 writes one to five `key_judgement` artefacts,
  ranked. Each is one plain sentence (`statement`) with a mechanism, a quote
  from the paper (`sourceId` + `sourceQuote`, located exactly as an extracted
  fact is), at least one play, the assumption it rests on, `wouldChangeIf`,
  `decision`, `action` and `owner`. Triage refuses one without a mechanism or a
  play. None left after the top-up fails the stage; a surplus is reconciled.
  The Word export leads with them after the verdict, and the nineteen sections
  become the appendix. A shared copy keeps the quote, as it does for a finding.
- **The challenge asks whether the report is useful.** Four more remits, one
  call each, equal weight: `generic`, `actionability`, `sharpest_play`,
  `unanswered_play`. The instruction says hedging is not a fix; specificity is.
- **Plays grouped into patterns.** `patterns.ts` files each play under an
  archetype from its own words and ranks the patterns within the run. Stages
  12, 16 and 17 are handed the ranked patterns and the severe plays no
  recommendation answers.
- **Theory of change scoped.** One programme `logic_model` and deep
  `causal_chain`s for the `DEEP_CHAINS` (8) mechanisms the most plays are aimed
  at. Each deep call is given those plays. Every chain names its `weakestLink`,
  and the prompt says what earns each judgement. Stage 14 goes from one call per
  mechanism (~150 on the real run) to at most nine. Stage 16 goes from 7 to 11.
- **Precedents from recall, labelled.** `precedentBasis` on a play:
  `external_evidence` (must cite a source or evidence row, or triage relabels
  it), `prior_assessment`, `unverified_recall` (shown as "not checked") or
  `none`. A link in the text is removed.

### For the brief builder (B) and the report builder (R)

- `keyJudgements(artefacts)` in `src/lib/policy-analysis/judgements.ts`: the
  current generation, in rank order, each joined to its mechanism, plays,
  patterns, assumption, findings and quote. Returns `[]` on an assessment
  written before key judgements.
- `patternGrid(artefacts)` in `src/lib/policy-analysis/patterns.ts`: ranked
  pattern rows, up to `GRID_MECHANISMS` (12) mechanism columns, a cell per
  pattern × mechanism with the worst exposure, band, play ids and `relative`
  (the cell's percentile among filled cells, for shading), and counts of hidden
  mechanisms and plays aimed at no mechanism.
- Also there: `playPatterns`, `playStanding` ("3rd of 47"), `unansweredPlays`,
  and `precedentOf` in `view.ts`.
- No UI renders key judgements yet. Master had no Verdict slot for them, so the
  only client change is the precedent label on the drill page.

### Decision log — A

| Decision | Options | Chosen | Why | Reversible |
|---|---|---|---|---|
| How plays become patterns | a model call over labels; deterministic | **deterministic** | stage 10's own checklist plus selective take-up covers the archetypes the real run showed; the label weighs three times the prose; no call, nothing re-run, old runs get patterns at once, and every rule is tested | yes — a model call could replace `patternOf` |
| Where patterns live | artefacts from a new stage; a computed view | **computed view** | nothing to persist that the plays do not already hold | yes |
| How the model sees them | a new artefact kind in `STAGE_CONTEXT`; an `extra` on the call | **`extra` (`playPatterns`)** | rides after the artefacts, so the cached prefix is unchanged; no kind for every view to learn | yes |
| Pattern ranking | absolute exposure; within-run percentiles | **mean of percentiles of worst exposure, bodies and mechanisms** | 38 of 47 plays sat between 0.54 and 0.77; a relative rank separates them, and the same plays rank the same however the scores bunch | yes |
| New challenge checks | lines in the existing seven remits; remits of their own | **four remits of their own** | "equal weight" means a call each; a line in a long remit is the one skipped | yes |
| Programme logic model | `causal_chain` with a scope flag; a new kind | **new kind `logic_model`** | the chain views key on `mechanismId` and would attach a programme model to every mechanism it names | yes |
| Which mechanisms get a deep chain | connectivity; plays aimed at them | **plays, then connectivity, then id** | a chain is worth reading where somebody is trying to break it | yes — `DEEP_CHAINS` |
| A top-up for stage 14 | re-dispatch missing units; none | **none** | the majority floor already tolerates a short stage; the old test counts are exact | yes |
| Precedent basis | a new `ORIGINS` value; a field beside `precedent` | **a field (`precedentBasis`)** | an origin describes a whole artefact and every view reads it that way | yes |
| A key judgement's quote | send stage 17 the passages; copy a mechanism's or claim's quote | **copy the quote** | every mechanism and claim in 17's context already carries a located `sourceQuote`; passages would crowd the context | yes |
| No key judgement | warn; fail | **fail, after one top-up** | a report with no "so what" has not done the job; the top-up names the gap (`key_judgements`) so the payload differs from the cached call | yes |
| More than five | fail; reconcile | **reconcile: last of each rank, then the top five, renumbered** | `provider.ts` accumulates corrective rounds, so the review-summary trap applies; a surplus is the correction arriving | n/a |
| Restatement pass | floor as at 17; reconcile only | **reconcile only** | a restatement has never had coverage rules; the view falls back to the previous set | yes |
| Verdict UI | render key judgements; skip | **skip** | master had no slot for them and R and B own `client/report/**` | n/a |

### What this does not do

- It does not check that chain judgements vary. The prompt says what earns
  each one; the first real run will show whether that is enough.
- `patternOf` reads English words. A paper that describes its plays in other
  words gets more "other" plays. That is shown, not hidden.
- It has not met a real paper. The fixture proves the plumbing, not the
  quality of the judgements.
