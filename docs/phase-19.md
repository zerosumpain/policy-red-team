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
