# Phase 23 — one master list of actors, with a hierarchy

Written 5 October 2026. Branch `p23-actor-register`. Migration
`0007-actor-register.sql`. Plan: §4b (John's requirement), §1 T1 and T3.

> "I've found lots of duplicate actors, because they're recorded from different
> perspectives. I want to create a master list of actors with matching back in.
> If there's a hierarchy around an actor's role, that should be baked into the
> design, vs recording duplicate actors." — John, 5 October

## What was measured

On the real Best Start run (`44dd5420`), read from a copy of the live database:

- **236 stage-2 actor rows under 150 labels. 227 of them were `_candidate_`
  rows.** The duplication was manufactured *after* the model. The main stage-2
  call had grouped the mentions into 19 actors — mostly right. Two
  "unclaimed" top-ups then dumped 115 more mentions into two buckets called
  "Unresolved source actor mentions A/B". Then `preserveAmbiguity` split every
  group in which any two members failed the identity policy pairwise (a
  `department` and a `concept` cannot link, nor two rows with different
  `parent`s). "Government" went back to 13 rows, "Parents" to 13. Post-16
  (`36ebca37`): 155 of 171 rows were candidates.
- So the fix is a register and a server that decides — not a longer prompt.
- **Stage 4's commonest refusal**, found by reading the repair instructions
  stored for its 18 repair calls: "An extracted assertion could not be
  located", about 83 of the ~90 rejections. In the stored main replies, 82 of
  148 profiles carried `origin: extracted_fact` on the profile itself, with no
  quote.
- **Groups of people carry real plays.** "Parents and families" had 5 ways to
  beat the Best Start policy, "Parents" 4, "Families" 4. "Students and
  applicants" had 4 on Post-16. This shaped one decision below.

## What landed

### The register is `policy_personas`, extended

There is one identity system, not two. A persona already carried the GOV.UK
body, aliases, rulings, observations and a computed dossier. A register entry
with no observation is simply a master actor that no paper has written a
dossier for yet.

New columns:
- `kind`: organisation, office_or_role, sector_or_category, group_of_people
  or **not_an_actor**
- `part_of`: structure, for example a Secretary of State is part of their
  department. For a programme, this is the actor that runs it.
- `kind_of`: category
- `status`: confirmed or proposed. The default is **proposed**: a writer that
  forgets to say is never taken as a reader's word.
- `what_it_is`
- `not_actor_reason`
- `proposed_in`

New table `policy_actor_mentions`. Each source mention of an unsealed paper
maps to its master actor, with a **capacity**, the basis of the match and the
paper's wording. It cascades with the paper and is the purge census's
fifteenth probe.

### Groups of people are on the list, kind group_of_people

They need dedupe and hierarchy as much as bodies do: "Parents" ×13; "Low-income
families" is a kind of "Families". They never become dossier candidates:
`personaCandidates` excludes them and not-actors. `policy_affected_groups` is
unchanged. It stays the per-paper record behind the existing groups list,
written at stage 13 as before.

### Capacity is a property of a mention

The vocabulary was read off real stage-1 statements: `decides`, `funds`,
`commissions`, `regulates`, `delivers`, `partners`, `advises`, `receives`,
`is_measured`, `is_affected`, `named_only`.
- The brief's seven were not enough. "Named as partners", "gives evidence"
  and "affected by" are the common forms.
- The model gives a capacity where it answers. `capacityOf()` reads one off
  the mention's statement everywhere else.

### Stage 2 (`actor-register.ts`, pipeline `matchIntoRegister`)

1. **Rules first.** Rulings ("the same" name → that row; "not the same"
   excludes), then exact name and alias by `actorKey`, then the GOV.UK register.
   - `actorKey` is the register's `nameKey`, plus government variants folded
     into one, plus the last word made singular.
   - A body the GOV.UK register knows but the reader's list does not becomes a
     proposal under its official name, with the register's gloss as
     `whatItIs`.
   - **Named private individuals are dropped before anything else sees them**.
     The rule: person-typed, the shape of a name, no role word. They are
     counted in a warning and never named.
   - Places and datasets are kept as `not_an_actor` context.
   - A programme-typed label is an actor when its last word is a hub, team,
     service or role. Otherwise the model is asked about it as a scheme.
   - A composite ("Nurseries and childminders") is split by rule only when
     every part is already named on the list or in this paper.
   - Identical names in one paper are one item, always.
2. **One model call** (`match`, or `match1…` beyond 120 names). It carries the
   register as a compact tree, one line per entry with short ids `r…`, plus
   `n…` for this paper's rule-proposed actors.
   - The tree is passed as a `lead` that `send` places **before** the
     artefacts and the id prefix, so every chunk shares it as a cached prefix.
     No other stage's payload changes by a byte.
   - The model writes `actor_match` artefacts only. Each one says: existing
     `matchId` + capacities; or new + kind, `partOf`/`kindOf`, `whatItIs`; or
     not_actor + reason (+ `runBy`).
   - One `unanswered` ask follows for anything left. Then a fallback: a name
     nobody answered for becomes a proposal under its own name. The stage
     never drops a mention and never fails for want of an answer.
3. **Reconciliation** (`assemble`) builds ONE stage-2 actor per master actor:
   - ids are `s2_reg_000…`, in the order of first mention
   - a capacity per mention
   - `data.master` holds `{id, key, status, kind, partOf, kindOf, bodyId, basis}`
   - `data.whatItIs`, for the plain-English stream
   - `data.programmes`: the schemes it runs
   - `data.parent`: the part-of name
   - Loops among a run's own proposals are broken and said.
4. **Writing happens in the worker's commit, never from a sealed run.**
   `applyRegisterPlan` runs in a savepoint before `persistArtefacts`. It
   re-matches each proposal under the owner lock (a concurrent run may have
   proposed it already), sets parents with a cycle check, and replaces the
   run's mentions. It adds the paper's wordings as aliases on matched rows,
   but never a personal name. Ids are stamped on the artefacts only after the
   savepoint commits.

The old path (model resolution + `preserveAmbiguity` + `unclaimedMentions`) is
gone from stage 2. A run with no list (tests, an empty install) matches with
an empty view by the same rules.

### Downstream, keyed by master actor

- **Stage 3 (T1).**
  - Units are master actors: `actorUnitKey`, which falls back to the label on
    old rows.
  - A unit is skipped when no stage-1 claim, mechanism or assumption names
    the actor or one of its mentions (`linkedToPolicy`; passage refs do not
    count). Nothing is skipped if that would skip everything.
  - Up to 6 units share a call, with at most 40 mentions between them; a busy
    actor goes alone. Each unit keeps its own block, and the prompt asks for
    every listed body's relationships "as if it had this call to itself".
  - fanOut's warm-up call (merged from the token stream) is kept: the batch
    passes no fourth argument, so `WARM_FIRST_STAGES` still applies.
  - `graphUncovered` counts the same population, so a skipped actor is not a
    gap.
- **Stage 4 (T3).**
  - `FULL_PROFILES` stays 24.
  - Short profiles go only to actors with an edge to a mechanism, and never
    to a group of people.
  - **Deviation:** a group central enough to rank in the top 24 still gets its
    full profile. Dropping it would delete its plays at stage 10 (see what was
    measured above).
- **Stage 4 repairs (T4).**
  - `stampProfileForm` (already applied to live replies, cached replays and
    the fold) now reads a profile marked `extracted_fact` with no quote as
    `structural_inference`.
  - The stage-4 instruction says the same up front.
  - Each field still carries its own origin, and that is where "the paper
    says so" lives.
- **Stage 13 and priors.**
  - `priorsFor` and `applyPersonaLinks` use the actor's master id first. A
    master actor with no dossier yields no prior.
  - Stage 13 already runs per actor, and there is now one actor per master.

### Rulings and the API (for the phase-24 hub)

Register ids ARE persona ids. The existing routes stay where they were:
`POST …/personas/:id/merge|different|body|split`.
- `merge` now also moves mentions, re-points children (cycle-safe), and
  confirms the kept row.

New routes:

| route | what |
|---|---|
| `GET /api/policy-analysis/register` | `{entries, partOf:{roots,children}, kindOf:{roots,children}, counts, readOnly}`. Each entry has: kind, status, parents, `partOfPath`/`kindOfPath` (nearest first), whatItIs, aliases, GOV.UK body, `papers` (by document), analyses, capacity counts, dossier flag, plays, worst band, `rollup` per tree (descendants' plays and worst band, for "inherited" labels), proposedIn |
| `GET …/register/proposals` | the proposed entries, most-seen first, each with up to five `similar` rows |
| `POST …/register/:id/accept {kind?}` | confirm (optionally with a kind) |
| `POST …/register/:id/parent {partOf?, kindOf?}` | move in either tree. `null` = to the top. A loop, an actor under a not-actor, or "kind of" a single organisation is refused with a 400 |
| `POST …/register/:id/not-actor {reason, runBy?}` | programme, place, assessment or other. Children are let go. `named_person` is refused: delete the row instead (`DELETE …/personas/:id`) |
| `POST …/register/:id/kind {kind}` | what sort of actor it is (and so an actor again) |

**Every ruling feeds the next run's rules.**
- A merge records "same" name rulings.
- A split records a "different" name ruling.
- A GOV.UK body link: the body is matched by id.
- Accept, re-parent and not-actor change the row the rules match.

`GET …/personas` is unchanged in shape. It still lists only bodies with a
dossier, so the landing builder's pages read what they read before.

### Privacy and sharing

- A shared copy (`shareableReport`) keeps none of `master`.
- An actor matched to a row the owner already had is renamed to this paper's
  own wording, and loses `whatItIs` and `parent`. Those may come from the
  owner's other papers.
- A sealed run reads the list, writes nothing and stores no mention.
- Deleting a paper takes its proposals with it unless a reader confirmed them
  or another paper still names them.

### The report

The body table in "Who is coming for what" (`ActorsLead`) prints "part of X"
under a body that has a parent. It reads `data.master` directly, so the pack's
bundle does not carry the identity policy. Old runs have no `master` and
render as before.

## Measured and projected

**Projection over the stored stage-1 mentions.** Matcher run offline against
the live copy. The script is in the session scratchpad; it is not committed.

| | Best Start | Post-16 |
|---|---|---|
| stage-1 mentions | 247 | 398 |
| stage-2 rows / labels today | 236 / 150 | 171 / 56 |
| placed by rules, first paper (empty list) | 33 | 116 (79 via GOV.UK) |
| placed by rules, against today's 24 personas | 88 | 175 |
| named people dropped | 2 | 3 |
| one matching call's tree + items | ~7.2–7.8k tokens | ~9.1–9.5k tokens |
| master actors with NO model merging (upper bound) | 124 | 137 |
| master actors if the model groups as its own main call did | 107* | 27 |
| stage 3 today | 151 calls, 19.6M input (130k/call) | 56 calls, 9.4M |
| stage 3 projected | ~13–18 calls, **~1.7–2.3M** | 4–9 calls, ~0.7–1.5M |

\* Best Start's estimate is inflated by the two junk buckets. Their 115
mentions are counted one master per label, which is what the new single
matching call is asked to collapse. The "~40–50" a person counts depends on
the model folding perspective variants (teachers/educators/workforce). Nothing
in the rules does that, by design.

**Backfill, on a copy of the live database** (migration 0007 applied, no
model):

| | count |
|---|---|
| personas before | 24 |
| entries after | 180: 6 confirmed, 174 proposed, 12 not actors, 53 groups |
| mentions written | 467 |
| `part_of` seeded from GOV.UK | 2 (OfS and Ofsted under DfE — GOV.UK's own structure) |
| Best Start: 236 rows / 150 labels → | **138 master actors** (117 matched, 118 proposed, 2 named people dropped) |
| Post-16: 171 rows / 56 labels → | **51 master actors** |

- Clusters resolved by rule:
  - Government ← Central government / The Government / UK Government
  - Family hubs → Best Start Family Hubs (the library's alias)
  - Department of Education → Department for Education
  - Early education and childcare providers → Childcare providers
  - Employer/Employers, Stronger Practice Hub/Hubs, Health services/Services
- Not actors:
  - Universal Credit, NHS App, Plan for Change, Tax-Free Childcare scheme,
    Mastering Number, Families First Partnership programme, School-Based
    Nurseries Programme, Making it Real, Maths Champions programme, Childcare
    Grant and Parental Learning Allowance (programmes)
  - the EYFS Profile assessment
  - Lincolnshire
- "Lauren" and "Alex Armstrong" appear nowhere on the list.
- The artefacts of both runs were 4,760 before and 4,760 after, with ids and
  data unchanged. The integration test asserts this byte-for-byte on its own
  fixture.
- A second backfill is a no-op (marker in `_migrations`).
- The fixture server on 127.0.0.1 against the copy rendered Findings, Causes,
  Threats, Who and Method for both runs with no page or console errors.

What the backfill does NOT do: merge perspective variants. Those stay as
proposals for the reader, or for a new run's model call. That is the brief's
"anything uncertain becomes a proposal".

## Tests

- `actor-register.test.ts` (unit) covers:
  - names
  - named-person and non-actor filtering
  - composite splitting
  - capacity
  - deterministic matching by name, alias, GOV.UK and rulings
  - the tree's byte identity
  - one actor per master across independent answers
  - cycle prevention (reader and run)
  - breadcrumbs
- `actor-register.integration.test.ts` covers:
  - a first run writes proposals and mentions, with no named person anywhere
  - rulings, with a loop refused
  - a second run matches with **no stage-2 model call**
  - a **sealed run leaves the list byte-identical**
  - not-actor keeps a row out of the next cast
  - deleting papers removes their unconfirmed proposals
  - backfill maps old rows, leaves artefacts alone and runs once
- The walk:
  - reads the register after two papers (one council seen in two papers; the
    programme kept as context; the named resident absent)
  - accepts, re-parents and has a loop refused
- `share.test.ts` covers the redaction.
- Changed counts, because the fixture now names five more mentions (GOV.UK
  DfE, "Councils", "Providers", a programme, "Jane Smith") and so red-teams
  three bodies:
  - census 15 probes, 21 tables
  - exploits 3, key judgements 3

## Left, and for other streams

- **Landing (phase 24):**
  - The register tree, the review queue and the roll-up have APIs, but no
    page.
  - `personaGroups`/`bodiesGrid` still group by persona and register body.
    Neither uses master hierarchy yet.
- **Stage 11** still decides cross-paper identity by GOV.UK body and name.
  Passing master ids through `neighbourSummaries` would make two papers' "same
  master actor" a hint as strong as the register. Not done.
- Aliases from model matches cement them. A wrong merge by the model becomes a
  rule-based match next time, until a reader splits it.
- No Postgres binary on this box. The SQL is plain Postgres, checked on
  PGlite (Postgres 17) only.
- `PROMPT_VERSION` not bumped (the integrator's).
