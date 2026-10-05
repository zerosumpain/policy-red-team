# Phase 24, part b — the master list on screen, and one queue to review it

*5 October 2026. Branch `p24b-register-review`, on `phase-23-batch` @ f9a714e.
Plan §4b (John: "a master list of actors with matching back in; if there's a
hierarchy around an actor's role, bake it into the design instead of
recording duplicate actors"). Builds on `phase-23-actors.md` (the register and
its API) and `phase-24-landing.md` (the hub). Migration `0008-alias-origins.sql`.*

## What was measured before anything changed

On a private copy of the live database, migrated and backfilled by phase 23,
served by the fixture build on loopback:

- **180 entries: 174 proposed, 6 confirmed, 12 not actors, 53 groups of people.**
  Not one of them was visible on any page. The only identity review was the
  List view's "These may be the same body" (2 pairs, among the 24 bodies with a
  dossier).
- **Structure is almost empty:** 2 entries have a part-of parent (OfS and
  Ofsted under DfE, from GOV.UK) and none has a kind-of parent. So on the live
  data the tree is 178 roots deep and one level tall until a reader starts
  placing things. That decided the layout (below).
- **No model-made join exists yet on the live copy.** The backfill used rules
  only; every `basis` is name, alias, register, reconciled or fallback. The
  first real run on the phase-23 engine (phase 27) is the first that can make
  one, which is why it had to be recordable before that run, not after.
- `GET …/register` 25 ms / 139 KB; `GET …/register/proposals` 260 ms / 199 KB
  (it now also carries the joins and the pairs).

Screenshots before and after: `~/prt-register/shots/phase-24b/{before,after}/`
(gitignored).

| page | before, 1280 / 320 | after, 1280 / 320 |
|---|---|---|
| `/bodies` | 3,077 / 4,417 | 3,022 / 4,202 (pairs moved to the queue) |
| `/bodies/register` | — | 4,248 / 6,249, page 1 of 7, no sideways scroll |
| `/bodies/review` | — | 7,086 / 10,612, 15 proposals a page |
| Jobcentre Plus `/bodies/:id` | 4,976 / 8,605 | 5,521 / 9,500 (new "Where it sits" section) |
| Government `/bodies/:id` | 6,612 / 13,058 | 7,182 / 13,953 |

Every page above: one `h1`, no page errors, axe (WCAG 2.2 AA + best practice)
clean with every disclosure opened, width 320 at 320.

## What landed

### 1. "Master list" view — `/bodies/register`

- The register as a **nested list with disclosure**, switchable between
  **What each sits inside** (part of) and **What kind of thing each is** (kind
  of). The switch is two links (`?tree=kind`), so each arrangement is an
  address a reader can keep.
- Each actor: name (to its page), a yellow **Proposed** tag, sort of actor,
  papers it is named in, its own ways to beat a policy and worst band
  (`BandMark`), and the **roll-up**: "Inherited from what sits inside it: 8
  ways to beat a policy" (worst band added only when it differs from its own).
- Keyboard and screen reader: `<ul>` in `<li>`; a real `<button>` per actor
  with anything beneath it, `aria-expanded` + `aria-controls`, visible text
  "Show 2 inside it" and the actor's name in hidden text so the accessible
  name starts with what is seen (2.5.3). The controlled list is always in the
  DOM (empty and `hidden` when shut) so `aria-controls` names something.
- **Caps:** 25 roots a page (GOV.UK pagination), 20 children before "Show N
  more", 30 context rows before "Show more". Roots are ordered by how much sits
  beneath them, then papers, then name — structure first.
- **Find an actor** (`?q=`) matches any name a paper used and shows each match
  where it sits, with its ancestors opened.
- Not-actors that sit under nothing are set apart as **Kept as context, not
  actors**; a programme with a runner is drawn under it.
- **No SVG tree.** With 2 parent links in 180 entries a drawn tree is a row of
  dots; even once placed, a policy register is a wide, shallow tree (the AGENTS
  "a policy graph is a star" finding). The list carries everything a picture
  would and is the one a keyboard can use.

### 2. "Actors to review (N)" — `/bodies/review`, and one page per decision

The count in the hub's views comes from `GET …/register/review-count`
(proposals + model joins + pairs), held for the session and refreshed after
every decision.

The queue has three sections (an empty one is said in the "on this page" list
rather than drawn):

1. **Joined by the model — check** (item 4, below).
2. **These may be the same body** — the List view's pairs, moved here (item 3).
   The List view keeps a one-line pointer with the count.
3. **Proposed for the list** — 15 a page, most-seen first. Each card shows:
   sort of actor, what it is, papers (linked), **how papers worded it** (the
   mention wordings, with paper counts), **what papers give it to do**
   (capacities, in papers), where the matcher suggested it sits (part-of /
   kind-of path), the GOV.UK body, ways to beat a policy, the paper that first
   proposed it, and similar names. Actions: **Accept**, or **Decide something
   else** → `/bodies/review/:id`.

`/bodies/review/:id` shows the same evidence plus what sits beneath it, and
the decisions, each its own page and form at `/bodies/review/:id/:decision`:

| decision | page | calls | undo offered |
|---|---|---|---|
| accept | button on the card / actor page | `POST register/:id/accept` | **reopen** (new) |
| merge into an existing actor | `merge` — search the list, radios | `POST personas/:chosen/merge {other}` | **split the name back off** (new) |
| move inside a different actor | `part-of` — search, radios, "Nothing: the top" | `POST register/:id/parent` | re-parent back |
| put in a different category | `kind-of` — only categories and groups offered | same | re-parent back |
| change the sort | `kind` — four radios with a one-line hint each | `POST register/:id/kind` | kind back (+ reopen if it was proposed) |
| not an actor | `not-actor` — reason radios; "who runs it" from actors in its own papers | `POST register/:id/not-actor` | kind back, parents back, reopen; children let go are **not** restored (said) |
| a named person | from `not-actor`, explained, then a warning button | `DELETE personas/:id` | none — said before and after |
| split a wording off | `split` — radios of every wording but its own name | `POST register/:id/split` (new) | merge back |

- GOV.UK forms: error summary that takes focus and links to the field; the
  cycle refusal ("Department for Education already sits inside Council, so …
  Move one of them first") comes from the API's 400 and is shown as written.
- **POST-redirect-GET in the SPA sense:** a decision navigates to the page that
  now shows the result, carrying the confirmation in router state; a GOV.UK
  success banner (`role="alert"`) takes focus after `Template`'s own route-change
  focus, and the state is then cleared so Back or reload does not repeat it.
  Undo swaps the banner for "Undone. …", announced the same way.
- **Read-only:** the queue, the evidence and the tree render; no button or form
  is drawn and every decision page says it is read-only. Checked against a
  `POLICY_READ_ONLY=1` server: 0 Accept buttons, 0 forms, the write 403s.

### 3. Duplicate pairs folded into the queue

`GET …/register/proposals` now carries `duplicates` (the same
`duplicateSuggestions` the List view used). The pairs link to the existing
side-by-side `/bodies/:a/merge/:b` page, which already does that job well.

### 4. Model-made joins are reviewable — migration `0008-alias-origins.sql`

**The data did not record it.** `aliases` is a bare jsonb list, and a reader's
merge, a rule's alias and the model's guess all landed in it the same way. The
mention rows say `basis = 'model'`, but they go when their paper is deleted
while the alias stays — exactly the cemented case.

- **Additive column** `policy_personas.alias_origins jsonb NOT NULL DEFAULT '{}'`,
  keyed by normalised alias: `{ by: model | rule | reader, analysisId, at }`.
  Written in the same statement as `aliases`. Plain SQL, PGlite and Postgres
  alike; `analysisId` is a string, not a foreign key, so the note outlives the
  paper as the alias does. A key with no entry (older rows, the backfill) is
  "origin unknown", never read as the reader's word.
- `assemble` marks a wording `byModel` when every mention of it in that group
  was resolved by the model; `applyRegisterPlan` writes the origin. A reader's
  merge writes `reader` for the merged name and carries the other row's
  origins.
- `modelJoins(owner)` lists: model-origin aliases still on the row, and
  mentions with `basis = 'model'` filed under an actor of another name
  (including wordings the model folded into a new proposal). A wording the
  reader ruled "the same" is not listed again. 40 most recent, with a total.
- **One-step split** (`POST register/:id/split {wording}`, `splitWording`):
  every mention so worded moves to an actor of that name (existing, else a new
  proposal), with each paper's dossier sighting whose every mention moved; the
  alias and its origin go; a **"not the same" name ruling** is recorded so the
  next paper does not match it back by rule; the two rows are ruled different
  both ways. Its undo is a merge (which overwrites that name ruling with "the
  same").
- **Keep** (`POST register/:id/keep {wording}`) records a "the same" name
  ruling and marks the alias `reader`.
- **Reopen** (`POST register/:id/reopen`) is the undo of an accept.
- The fixture model makes one: a paper saying "The local authority" gets that
  mention, no rule can place it, and the fixture's matching answer joins it to
  the council (`tests/fixtures/policy-analysis/model.ts`).

### 5. A body's page says where it sits

New section **Where it sits on your master list** (caption "Your record", in
the "On this page" list between fact and context), from
`GET …/register/:id` (new): status, sort, part-of path, kind-of path, what sits
inside it and what is of its kind (linked, capped at 12), **what papers give it
to do** in plain words — "Funds in 2 papers, delivers in 2, regulates in 1" —
and what is inherited from below. A part-of breadcrumb sits under the title.
`RegisterNode` gains `capacityPapers` (papers by document, per capacity),
additively. The page fetches it as a courtesy: if it fails, nothing is drawn.

### 6. Stage 11 uses the register's identity

- `Neighbour.artefacts[].masterId` (additive). `neighbourSummaries` reads each
  neighbour actor's master id from **`policy_actor_mentions`** (which a reader's
  merge re-points), falling back to the artefact's `data.master.id` stamp.
- `crossIdentityHints` decides **first** on the master id: the same id is
  `same_body`, basis `master`. A different master id does **not** forbid a link
  — the list holds unreviewed proposals — so it falls through to the GOV.UK
  body and name rules as before.
- **Prompt text changed** (stage 11, one clause explaining basis `master`).
  `PROMPT_VERSION` was not bumped, as instructed — the integrator should.
- Tests: three in `body-evidence-pipeline.test.ts` (same master links across
  different wordings; different masters fall through; master never overrides
  two different GOV.UK bodies the other way).

## Words

"Register" stays GOV.UK's: a body's page already says "What the register says"
about the list of organisations. The reader's list is **Master list** (view
label; slug `register` kept from the reserved slot) and the queue is **Actors
to review** — the owner's own words in §4b. `VOCABULARY` records both and
`GLOSSARY` gains "Master list of actors". "Part of" is "sits inside";
"kind of" is "a kind of" / "category". Capacities have reader words in
`client/register-words.ts`, tested against the server's enums.

## Gates and tests

- New unit tests: `client/register-words.test.ts` (3), `client/register-tree.test.ts`
  (5), stage 11 (3).
- Integration: `actor-register.integration.test.ts` gains a run that makes a
  model join through the real pipeline, lists it, splits it (and proves the
  next match goes to the new row), merges it back (the reader's word now
  stands), keeps, reopens, and reads one entry with its children.
- a11y: the router-derived route list picks up `/bodies/register` and
  `/bodies/review`; stubs added for `register`, `register/proposals`,
  `register/review-count` with a two-level tree, a proposal, a join and a pair.
- Walk: accepts the council from its queue card (focus on the confirmation),
  undoes and re-accepts; moves it inside the department through the part-of
  page; has the reverse move refused as a GOV.UK error summary that takes
  focus; splits the model's join and undoes it; opens the tree in both
  arrangements, checking `aria-expanded` and the inherited roll-up; checks the
  body page's breadcrumb and capacity sentence. Every new page is axe-audited.

## Shared files other streams touch

`server/api.ts` (register routes), `client/api.ts`, `client/App.tsx`,
`client/places.ts` (`HUB_VIEWS`, `reviewPath`), `client/pages/Bodies.tsx`
(`Hub` and `Loading` exported; `Hub` takes `heading`), `client/pages/Persona.tsx`,
`scripts/walk.mjs` (second paper gains one sentence), `scripts/a11y.mjs`,
`src/lib/plain-words.ts`, `tests/fixtures/policy-analysis/model.ts`,
`migrations/order.txt` (**0008** — phase 25's migration must be numbered after
it or renumbered at merge).

## Left

- **The live list needs a reader.** 174 proposals will not review themselves;
  the "Government" ×2 / "early years provider" ×4 duplicates sit as pairs and
  proposals until merged. Nothing here merges on its own, by design.
- No bulk actions ("accept all 40 bodies on GOV.UK"). Worth adding once John
  has used the one-at-a-time queue and said which ones are rote.
- `not-actor`'s undo cannot put back children it let go (the API clears them);
  the banner says so.
- Neighbour ranking in stage 11 still counts shared GOV.UK bodies, not shared
  master actors; only the identity hints use the master id.
- `personaGroups`/`bodiesGrid` (Across papers, Clashes) still compare by GOV.UK
  body; moving them to master identity is a follow-up.
