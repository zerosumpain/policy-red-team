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
| Where to verify for real | OpenRouter on porkserv; Codex on homeserv; Codex on porkserv | **Codex on porkserv, through the live UI's API** | no per-token spend. porkserv DOES reach the bridge: `policy-codex-tunnel.service` (homeserv user unit, since 19 Sept) reverse-forwards 5207. The 21 Sept `policy_providers: openrouter,azure` rested on "never could". Re-allowed codex in `~/porkserv/policy.yml`; active provider set to codex/luna in /admin | yes: switch the active provider back in /admin |

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
  play. None left after the top-up is a counted limit of the run, not a
  failure (see the review fixes below); a surplus is reconciled.
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
| No key judgement | warn; fail | **fail, after one top-up** — reversed after review: **warn** | a report with no "so what" has not done the job; the top-up names the gap (`key_judgements`) so the payload differs from the cached call. But a retry replays every call from the cache, so failing threw a finished report away three times | yes |
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

## Workstream X — actor intelligence: what landed

Branch `phase19-intel`. Migration `0004-body-evidence.sql`.

- **A dated public record for every register body.** `policy_body_evidence`
  holds what GOV.UK and Parliament published about a body: title, link,
  publisher, the date it was published, when it was fetched, and what it can
  tell a red team — track record, money and staff, powers, its own aims, or
  what it has said. `policy_body_evidence_checks` records when each source was
  last asked, so "asked, and nothing" is an answer too. It is public data keyed
  by register id and shared by every owner, like `policy_bodies`.
- **Three free sources, no model, no key.** Each checked by fetching it on 25
  September 2026:
  - GOV.UK search by organisation slug —
    `https://www.gov.uk/api/search.json?filter_organisations=ofsted&filter_content_store_document_type[]=corporate_report&…&order=-public_timestamp&fields[]=title&fields[]=link&fields[]=public_timestamp&fields[]=description&fields[]=content_store_document_type`
  - Parliament committee reports, special reports and responses that name the
    body — `https://committees-api.parliament.uk/api/Publications?SearchTerm="Ofsted"&PublicationTypeIds=1&PublicationTypeIds=2&PublicationTypeIds=12&SortOrder=PublicationDateDescending&Take=12`
  - Hansard debates titled with the body —
    `https://hansard-api.parliament.uk/search/debates.json?queryParameters.searchTerm="Ofsted"&queryParameters.orderBy=SittingDateDesc&queryParameters.take=12`

  A live check returned 12/12/12 records for Ofsted, 12/11/9 for the
  Department for Education and 12/0/2 for Skills England.
- **What a record answers is a rule.** On GOV.UK's document kind and the title:
  "annual report and accounts" is money and staff, "framework document" is
  powers, a committee response is what the body said back. Thirty days a check;
  a source that failed is asked again the next day.
- **It reaches a run as evidence.** For each body stage 4 profiles in full, up
  to three records — one of each kind first, newest first — become the stage's
  own `research_source` artefacts (`s4_body_<n>`, origin `external_evidence`,
  the publication date in `freshness`). They go in that body's call after its
  own context, and in the same body's stage-10 call, never in the shared block.
  A profile or play that cites one rests on a source; a persona prior still
  does not. Stage 4 and 10 prompts say so, and ask for the title and year in
  `precedent`.
- **Fetching is narrower than reading.** Any run may read the store. Only an
  unsealed run allowed to search, on an install whose search is not `none`,
  fetches what is stale. The query is the register's slug or official name,
  and the in-run document guard (`quotesDocument`) still runs over the name.
- **`npm run research:bodies`** checks every body in the library (stale
  sources only; `--force` for all). It opens the database, so stop the server
  first, as for `npm run assess`.
- **Stage 11 reads the library.** Neighbours are ranked by how many register
  bodies they share with this paper — this paper's actors resolved against the
  register, theirs read from the persona library — and date only breaks ties.
  Same document and sealed runs are still out. Each neighbour names its
  `sharedBodies`, each actor carries its `bodyId`, and `crossIdentityHints`
  calls two actors with the same body id `same_body` (basis `register`) and
  never links two different ones.
- **Bodies across papers** (`/bodies`): register bodies down, assessed papers
  across, and in each cell what that paper gives the body — asks, powers,
  plays and the worst one — counted from the paper's own graph. A table,
  because a policy graph is a star.
- **A body's page** gains four sections: where it sits on the register (parent
  and child bodies, linked where the library has them), what each paper asks of
  it, its asks next to what the record says about its money and staff, and a
  dated track record with a free "Check again now".
- **Clashes, by one rule.** Two papers that put the same two register bodies in
  opposite order — one over the other in one paper, the other way round in the
  next. Both sides are the papers' own edges, quoted and linked. Anything else
  is shown as "same body, different asks" for the reader to judge.

### Decision log — X

| Decision | Options | Chosen | Why | Reversible |
|---|---|---|---|---|
| Where the record lives | on the persona; per owner; per register body | **per register body, shared** | it is public and the same whoever asks; a persona is per owner and is context | yes |
| Sources | Tavily; free APIs; both | **free APIs only** | no money, no key, dated by the publisher; `researchPersona` stays the paid, reader-triggered path | yes |
| legislation.gov.uk | include; descope | **descoped** | its search is by Act title, and a body's name is rarely in the title of the Act that set it up — nothing for most bodies, the wrong Act for some | yes |
| GOV.UK kinds | everything; reports and papers | **reports, research, policy papers, consultation outcomes, impact assessments, statutory guidance** | transparency data is mostly monthly spend lines and would crowd out every report | yes |
| Classifying a record | a model; rules | **rules on kind and title** | the store must not depend on a call; a reader can check a rule on sight | yes |
| How it enters a run | a prompt field like `priorPersona`; `research_source` artefacts | **`research_source`, minted at stage 4** | provenance rules already treat a retrieved source as evidence; a field cannot be cited | yes |
| How many | all; top K bodies × 3 | **the `FULL_PROFILES` bodies, 3 each** | per-call context stays small; later stages shed unread sources first | yes — `RUN_RECORDS_PER_BODY` |
| Who may fetch at run time | every run; unsealed and searching | **unsealed, may search, search not `none`** | which bodies a sealed paper asked about says something about it; `none` is a reader saying the estate has no route out | yes |
| `questionId` on a body record | a synthetic question; the actor | **the actor** | the question is "what is this body's record"; it must resolve, and does | yes |
| Stage 11 ranking | recency; shared bodies | **shared bodies, then recency** | a paper from three months ago giving the same department a conflicting duty is the neighbour that matters | yes |
| Clash rule | semantic comparison of duties; opposite hierarchy | **opposite hierarchy between the same two register bodies** | the only conflict the graph can show honestly; different duties are shown side by side instead | yes |
| Redirect in tests | per file; setup file | **setup file, for every integration test** | a guarantee, not an accident of which bodies a fixture names | yes |

### Left open

- Hansard search is by title only; committee search by the quoted name still
  catches reports that list a body among many (the Secondary Legislation
  Scrutiny Committee names the DfE in passing). Both are shown as they come,
  dated, and never more than three reach a run.
- A resumed stage 4 whose store gained records between attempts asks a
  different question and misses its cached answer. Rare, and the right way
  round: it pays to use newer evidence.
- The National Audit Office is still not on the register, so its reports only
  arrive through Parliament's committees (the Public Accounts Committee).

## Fixes after the independent review

Branch `phase19-fixes`, from a review of master on 25 September 2026. Each has
a test that failed first.

- **Stage 17 with no key judgement keeps its report.** A throw here was the
  36ebca37 trap: the retry replays `main`, its repairs and `topup` (whose
  prefix is always `s17_000_`) from the cache and fails the same way three
  times. It is now "1 of 1 key judgement sections were not assessed", decided
  after the final triage.
- **Stage 17 pins what a key judgement quotes from**: the deep-chain
  mechanisms and the claims they rest on (`quotableForJudgements`), one set per
  stage, so the shared block is still fitted once.
- **Model spellings are read before a strict schema refuses them.**
  `normaliseReply` in `validation.ts`, on a copy: null on an optional or
  defaulted field drops the key, an enum spelling becomes the value it spells,
  a numeric string on a number field becomes the number. It never adds a key.
  A key judgement's `assumptionId` naming a claim or mechanism is narrowed to
  its play's assumption.
- **`fanOut` brakes where it dispatches**: while a failure has landed ahead of
  the fold, unit k goes out only if k < folded + lanes. Each fan-out passes an
  `AbortSignal` to its calls (`ModelCall`'s fourth argument, never the
  payload) and withdraws them when the stage fails.
- **A register body's own name is not paper text.** `refreshBody` checks the
  name against the register and sends it unguarded; a skip the guard does cause
  is never stored in the shared checks table.
- **A persona's summary travels** by the same rule as its traits, on write, on
  rebuild, and on the legacy summary.
- Smaller: deleting a paper rebuilds the persona's aliases (and a non-register
  name) from the remaining papers; a persona takes its actor's type before its
  link's, and the boot upgrade moves only version-0 groups; "Check again now"
  and `research:bodies` respect search `none`; grounded search retries a 429 or
  5xx twice with a deadline per try; the "could not be fully checked" warning
  is sorted; `s4_body_*` records reach only stages 4 and 10, and 12 and 17
  where cited; clashes read only authority relations (not `funds` or
  `depends_on`); stage 11 gives two runs of one document one slot.

## Workstream B — the brief: what landed

Branch `phase19-brief`. No migration.

- **The one-page brief is the first thing on the report.** It fills the
  `brief` slot R left in `VerdictLead`, so it is the top of the Verdict move in
  the service and the top of the pack's cascade. In order: the headline and
  one sentence after it; at most five key judgements (each with the paper's
  own words as a quote, the sharpest way to beat it with its early warning and
  its fix, what would change our mind, and who should act), each linked to its
  drill page through `linkTo`; and "What we could not check", three lines at
  most. `briefOf` in `src/lib/brief.ts` decides all of it, once, for the page,
  the pack and Word.
- **An older assessment gets the same layout.** With no key judgements, the
  brief carries the five findings `rankFindings` chooses, each with the worst
  way to beat the policy its citation chain reaches, the quote of the part of
  the policy that play is aimed at, and the recommendation that answers it.
  What a finding does not carry is left out, not invented.
- **What we could not check** reads the run's own classifiers — `stageFacts`,
  and `truncations`, which moved into `stage-facts.ts` so the server and the
  client share one parser. On the real Post-16 run: 17 questions not searched,
  10 of 18 steps cut short (3 say "read as partial"), 176 of 398 mentions
  unresolved.
- **Print to A4 and Word.** "Print the brief" marks `<html>` for one print and
  `parts/_brief.scss` drops everything else in both renderers; Ctrl-P still
  prints the whole report. `?part=brief` on the export is a document scope
  (`docx` or `md`) that combines with `scope=shared`, rendered from the same
  `shareableReport` output as every shared file.
- **Every renderer leads with the same list.** `briefItems` is what the page,
  the pack, the brief's Word file and the full Word document lead with. The
  full document used to lead with key judgements only, so an older
  assessment's Word file led with nothing while its page led with five
  findings. Its headings now use R's words ("Ways to beat the policy", "Checks
  on how the policy is set up", "What it recommends").
- **The pattern grid leads Threats.** `patternGrid` as a heatmap: kinds of way
  to beat it (rows, ranked) against the twelve parts of the policy most aimed
  at, each square shaded in the band ramp by its worst and printing its count,
  with a Diagram/Table toggle. A square, a row name or a column number is a
  carried selection — a new `pattern` kind (optionally with a mechanism) and
  the existing `mechanism` kind — and the grid is one tab stop. It replaces
  the capped mechanism bars in Causes; their table is every row now.
- **From the review of master** (folded in here): `stubForReport` keeps a
  chain's `weakestLink` and stores how each step entry reads from the
  unclipped text, so the service's clipped chains and the pack's full ones
  classify the same; the strips draw the model's weakest link as "Weakest
  link" and the page's own reading as "Least specified"; the programme's
  `logic_model` is the first strip of "How each part is meant to work"; the
  pack no longer clamps strip text, and `offline-check` measures what exists
  (it counted `.prt-writeup__body`, which is gone); the play cards carry the
  precedent and its "not checked" label, so the pack shows it; and three
  disclosures open in the pack.

### Measured on the real Post-16 run (`36ebca37`, a copy of porkserv's DB)

| | Before B | After B |
|---|---|---|
| Verdict panel at 1280 | 15,295px | 14,193px |
| The brief at 1280 | — | 2,612px |
| "Print the brief", A4 | — | 2 pages |
| Whole report printed, A4 | — | 127 pages |
| Pattern grid at 1280 / 420 / 320 | — | 1,094 / 1,728 / 2,013px |
| Sideways scroll at 320 | none | none |

The fixture writes key judgements, so the walk proves that path: the brief
leads the Verdict from them (739px at 1280, one printed page), its Word copy
answers, and a square narrows and says "aimed at". The real run proves the
fallback and the grid.

Gates: typecheck; `npm test` 1,145 passing across 77 files; `npm run a11y` 14 routes clean; `npm run walk`
passing; `npm run offline` passing (29 blocks measured, nothing clipped);
`pack:live` against the real run on a local copy passing (35 sections,
78 of 199 controls pressed, no request left the page).

### Decision log — B

| Decision | Options | Chosen | Why | Reversible |
|---|---|---|---|---|
| Where the brief lives | its own first tab; the top of the Verdict | **top of the Verdict**, in R's slot | the Verdict is where every reader lands; a sixth tab touches `moves.ts`, the landing page, the tab counts and the pack order for no reading gain | yes |
| The lead's ranked list under the brief | keep it; drop it | **drop it, and send what the brief does not carry to "All findings"** | five findings under five judgements is the long Verdict again; nothing is lost | yes |
| Headline length | the whole executive statement; headline + one sentence | **headline + one sentence** | the brief's own spec; the rest of the paragraph is in "All findings" now, which it was not | yes |
| A finding's quote (fallback) | nearest quote on the chain; the quote of the part the play is aimed at | **the part's quote, or none** | the nearest quote on the real run was about Skills Bootcamp starts under a finding about test results — the paper's words, not what was judged | yes |
| Early warning and fix length | whole; first sentence; first sentence clipped at 200 | **first sentence, clipped at 200 with an ellipsis** | the model writes them as one 240–330 character list; the whole is on the play's page. Took the printed brief from 3 pages to 2 | yes — `PROSE_MAX` |
| The brief's Word scope | a new format; `part=brief` | **`part=brief`** | `scope` already means sharing; a document scope combines with it, and `shareableReport` stays the only redactor | yes |
| Grid shading | `relative` percentile; band | **band** | the ramp means a band everywhere else in the report; shading the 40th cell "limited"-pink whatever its band would make one colour mean two things. The standing is in the table view ("3rd of 40") | yes |
| Grid selection | cell only; row, column and cell | **all three, as carried selections** | a column is the existing `mechanism` kind; a row and a cell are one new `pattern` kind, joined on `data.targets` as the grid is | yes |
| What narrows the grid | everything; a band or a body only | **a band or a body** | it is the picker for the other two kinds, the rule `narrowExcept` states | yes |
| Grid on a phone | flip to the table; keep the grid | **keep the grid** | HTML, scrolls in its box with the names pinned; the table measured 17,294px at 420 | yes |
| The capped mechanism bars | keep beside the grid; replace | **replace; the table is every row, one tab stop** | R's own comment said the grid replaces them; the grid's columns are the same selection | yes |
| Weakest link | the page's regex; the model's `weakestLink` | **both, named differently** | "Weakest link" is the assessment's judgement; "Least specified" is the page's reading of the words | n/a |
| Clipped chain steps | send them unclipped; classify before clipping | **classify before clipping** (`stepFlags`) | keeps the payload small and makes both renderers read the same words the same way | yes |

### What this does not do

- The pack's zip still carries only the full `report.docx`; the brief prints
  from the pack but has no Word file of its own there.
- `patternOf` reads English words; on the real run one play is aimed at no
  part of the policy and 43 parts are too rarely aimed at to be drawn. Both are
  counted under the grid.
- Key judgements have not met a real paper yet; the fixture proves the path.
