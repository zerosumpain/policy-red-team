# Working on this repository

Read `docs/plan.md` first, then the phase document for whatever you are touching.
They carry the decisions and the reasoning; this file is only the things that will
cost you an hour if nobody says them.

## It was a fork, and it is detached now

`src/lib/policy-analysis/**` and most of `src/lib/**` were copied verbatim from
`zerosumpain/SR-Policy-Analysis`. **Since 25 September 2026 the fork is DETACHED**
(`docs/upstream.json` → `detached`): upstream stopped moving on 18 September and
every lever the review of that week found sat inside the copied files. They are
ordinary source files now — **edit them in place.**

- `DIVERGENCES` in `scripts/sync-core.mjs` is history, not a mechanism. Do not
  add to it.
- `npm run sync:check` prints DETACHED and exits 0; plain `sync` REFUSES,
  because a re-copy would overwrite everything done here since.
- `node scripts/sync-core.mjs --check --compare` still runs the old comparison,
  for anyone porting a fix across by hand in either direction.

## The gates

```
npm run test:all     everything below, in order
```

| | |
|---|---|
| `npm test` | 421 unit tests, no database |
| `npm run test:integration` | the pipeline against a throwaway PGlite, provider mocked |
| `npm run a11y` | axe on every static route **and** the licensing assertions |
| `npm run walk` | a browser from submit to report, against the fixture server |
| `npm run offline` | the pack, opened from `file://` with every request blocked |

The integration and walk suites refuse to run unless their data directory is one
they created under the system temp directory. That guard replaces upstream's
`DATABASE_URL` regex and exists for the same reason: **these tests purge and
delete.** Do not weaken it.

## Things that have already cost a day

- **`completed_with_gaps` is a FINISHED run.** `store.ts` picks it over
  `completed` purely on whether any stage recorded a warning, and a run without a
  Tavily key always warns. Treating it as non-terminal hangs the worker.
- **The fixture builds must not be able to reach a provider.** `build.mjs`
  redirects `$lib/llm/client` and fails the build if `openrouter.ai` survives.
  Redirecting only `server/provider` is not enough — `server/personas.ts` calls
  the gateway directly.
- **Keep imports static in anything the offline pack renders.** A dynamic
  `import()` makes Vite emit `__vitePreload`, which builds a `<link rel=stylesheet>`
  and fetches it. Fine on the web, fatal in a pack.
- **Vite's `lib` mode does not substitute `NODE_ENV`.** Without the explicit
  `define` in `vite.config.offline.ts` you ship React's development build.
- **GOV.UK Frontend 6 emits no bare `body` rule.** `.govuk-template` on `<html>`
  and `.govuk-template__body` on `<body>`, or nothing is styled.
- **Read component markup from `node_modules/govuk-frontend/dist/govuk/components/*/template.njk`**,
  not the published documentation. The docs omit the `aria-describedby` wiring
  that makes a task list mean anything to a screen reader.
- **An artefact's stage is NOT reliably in its id.** `stageOfId` reads the
  `s<n>_` namespace, which everything a model writes carries and everything the
  pipeline computes does not — the twelve structural checks are `test_adaptability`
  and read as stage 0, i.e. document ingestion. The true figure is on the wire in
  `detail().artefactMetadata`; use that and fall back to the id.
- **The paper's own words live in two fields.** An ingested passage carries the
  document text in `statement`; everything downstream quotes a span of one into
  `sourceQuote`. Read only one and a provenance walk stops short of the paper.
  `paperWording()` in `src/lib/provenance.ts` is the one place that knows.
- **`<Report>` renders inside the offline pack, where there is no router.**
  Rendering a react-router `Link` there throws. That is why it takes a `linkTo`
  render function from its caller rather than an href and a flag: the pack
  cannot render a link because the machinery is not in its bundle.
- **A POLICY GRAPH IS A STAR — measure before you draw it.** ~79% of stated
  relationships run body→machinery and the degree distribution is FLAT: on a
  real 452-edge assessment, a node-link picture of the busiest ends places ten
  of them. `matrix.ts` encodes the same finding for the grid as `legible` /
  `MIN_GRID_EDGES`. Never count a bodies-against-bodies figure against ALL
  edges — "0 of 452" reads as a failed extraction where "32 of 452 run between
  two bodies" is the fact. The numbers are in `src/lib/relationships.ts`.
- **Every word on these pages came out of a document, and a document is not
  copy.** Footnote runs (`childcare.32,33`), bare URLs and identifiers with no
  space push the whole page sideways at 320px. `#main-content` carries
  `overflow-wrap: anywhere` and `npm run a11y` asserts it in the BUILT CSS,
  because the fixture's text is written in normal words and no browser gate can
  reach it.
- **`network()` is 145ms on a real assessment.** Memoise it wherever it is
  called from a render body — the report re-renders on every stage event.
- **A GOV.UK checkbox or radio HINT takes its own line.** Putting a per-item
  figure there doubles the height of the list. The figure goes in the label and
  the fieldset's own hint says what it means, once — see `client/report/StressLab.tsx`.
- **`stress.ts` writes two shapes of reason and they compress differently.**
  "rests on X" / "needs X" names what the reader failed and is the SAME for every
  row that cited it; "answers Y, which no longer stands" is different for every
  row. Grouping on the whole string compresses nothing at the second order and
  took the panel to three screens. `reasonsOf` in `src/lib/stress-view.ts` splits
  them.
- **THERE IS NO SHARE LINK, and do not add one.** Every owner route here is
  unauthenticated by design, so a URL a recipient could use would also serve
  them `GET /api/policy-analysis/:id` — the whole paper, two requests later. A
  redacted copy leaves as a FILE: `?scope=shared` on the owner's own export.
  Making a link safe means authenticating the API, which is the login phase 4
  decided against. See `docs/phase-10.md`.
- **`shareableReport` is the ONLY redactor, and it runs on the server.** The
  shared documents and the shared pack all take a report that has already been
  through it. Never redact a second time: two implementations of "what may leave
  this account" is how a chapter goes missing from one of them.
- **`persona_link` IS withheld here and is not upstream** — a recorded
  divergence. Its data carries the standing dossier drawn from the owner's other
  assessments, which is the thing `share.ts`'s own header says must not travel;
  upstream withholds stage 13's warnings on that ground and ships its output.
- **NOTHING IS EVER RE-RUN.** Every late stage cites earlier ids and
  `persistArtefacts` is a plain insert against an `(analysis_id, id)` primary
  key, so a stage CANNOT execute twice — the `s<n>_<slot>_` namespace collides.
  A pass appends into its own block of ordinals (`PASS_BASE * n + k`).
- **`Radios` and `Checkboxes` are uncontrolled when you omit `value`/`values`.**
  They used to be always-controlled, so a caller that omitted the prop got a
  group that silently refused every click. A form read through `FormData` wants
  the uncontrolled shape.
- **An upload keeps its own field name through `readMultipart`.** It did not,
  and `asRequest` put every file back as `document` — so the material route,
  whose field is `material`, told readers to attach a document they had already
  attached.
- **A PERSONA IS CONTEXT, NEVER EVIDENCE**, and the dossier page has to say so.
  It is drawn from other papers about other policies; importing its conclusions
  into the assessment in front of the reader is the opposite of a red team. It is
  also the most sensitive thing this install holds — cross-assessment
  intelligence by construction, which is why `persona_link` is withheld from
  everything that leaves and why the dossier has no shareable form.
- **`POST .../personas/:id/research` SPENDS MONEY** — two model calls plus
  retrieval. Read-only refuses it, a token bucket caps it at six in a sitting,
  and the request's abort signal is passed through. Never call it from a run.
- **GDS has no modal component, on purpose.** A layer over a page wants a focus
  trap, its own Escape handling and a back stack. The pattern here is a route —
  see `client/pages/Drill.tsx`.
- **A persona's `dossier` and `summary` are COMPUTED — never write them.**
  `rebuildPersonas` folds them from the observations that remain, keeping only
  sentences that travel (`travels.ts`). Write an observation and rebuild. A
  value written straight into the dossier survives the paper it came from,
  which is the leak phase 19 closed.
- **Groups of people are not personas.** A `user_group` actor goes to
  `policy_affected_groups` and never reaches the matcher. "Children" as a
  persona is what split the live library.
- **The GOV.UK register is a committed file, not a fetch.**
  `register/govuk-organisations.json` is bundled into the server; `npm run
  register:refresh` rewrites it. It is not under `data/`, which is gitignored
  for the settings key. `build.mjs` fails if the refresher's page URL reaches a
  fixture bundle.
- **"Seen in N papers" counts documents.** Two runs of one file are one paper,
  in the figure, in a prior and on the dossier page. The walk submits a
  DIFFERENT second document for exactly this reason.
- **Node must be 22.23.2 or newer.** `pdfjs-dist` calls `Promise.try` and
  `Uint8Array.toHex`, both ES2025. `src/lib/polyfills.ts` carries them for older
  Node; if a THIRD one appears, upgrade rather than adding to that file.

## Which service answers a model call

`src/lib/llm/providers/` — one module per service, each exporting a
`ProviderDefinition`. `getLLMClient(ctx)` in `src/lib/llm/client.ts` is still the
only seam the pipeline reaches a model through; it asks `resolveProvider()` which
provider is in force rather than assuming one.

- **The environment wins over the panel, always.** `POLICY_PROVIDER` pins the
  choice; the per-field names in `ENV_NAMES` pin individual values. The panel
  shows which fields the environment has taken over and disables them.
- **`POLICY_PROVIDERS` is a comma list of what an install offers.** Unset means
  all of them. `POLICY_PROVIDERS=openrouter,azure` is how the Codex bridge leaves
  a build that ships to anyone else — no code deleted.
- **Do not extend `ModelProvider`** in `src/lib/constants/model-context.ts`. It
  is a COPIED type that records what an assessment was run on; the registry has
  its own `ProviderId` in fork-written code, which is why it needs no divergence.
- **A new provider needs a stub in `index.fixture.ts` too.** `build.mjs`
  redirects `$lib/llm/providers` in fixture builds and then asserts the endpoints
  are absent from the bytes. Add the URL to a real module without stubbing it and
  the build stops — correctly.

## The model menu

`offeredModels()` is the menu the submit form draws. Precedence is `POLICY_MODELS`
(comma list of ids), then what the admin panel stored, then the built-in five.

- **A provider's `catalogue()` is inventory; `models()` is the menu.** Do not
  confuse them: the first is 447 rows, the second is a decision. `catalogue()` is
  optional — Azure has none, because its deployment list is behind a separate ARM
  API.
- **The menu lives in a module variable**, refreshed by `loadOfferedModels()`.
  That is not laziness: `isOfferedModel` is called synchronously from
  `ingest.ts`, which this fork keeps byte-identical to upstream, so an async
  catalogue would force a divergence into the one place that must not have one.
  Refresh it in anything that is about to serve or commission a model.
- **Whole records are stored, not ids** — the submit form must never need a
  network call to render a dropdown.
- **`tierForCost`'s boundaries are read off the built-in five**, and a test
  asserts each one lands in the tier a human gave it. Change a threshold and that
  test tells you which curated model you just contradicted.

## The admin panel

`/admin` is the only page behind a password, and the only one that needs one: it
holds the credentials this service spends money with.

- **`POLICY_ADMIN_PASSWORD`, twelve characters or more.** Absent or shorter
  closes the panel rather than opening it. A forgotten deployment variable must
  not publish a credential editor.
- **The gate is a signed cookie, never an address check.** Behind a tunnel every
  request arrives from `127.0.0.1`. An address check there passes for the entire
  internet — the mistake that took the author's main site down for 33 hours.
- **A secret goes in and does not come out.** `GET /api/admin/config` reports
  `true`/`false` per secret, never a value, and the browser walk asserts it. If
  you add a field, `redact()` decides what is visible — not the handler.
- **A blank secret means "leave it alone".** The box is always empty, so blank
  cannot mean deletion without wiping a key on every neighbouring edit. The form
  remounts on a save counter, because an uncontrolled input does not clear itself
  when `defaultValue` changes.

## The report is four moves

`client/report/Report.tsx` is a spine, not a cascade. Every section it builds
carries a `move` — `verdict`, `causality`, `threats`, `actors` or `provenance` —
and the tabs group them. A reader arrives with one of four questions and a single
scroll answers whichever is uppermost by making them pass the other three.

- **The Verdict leads with what it FOUND.** Since phase 19 the move opens with
  `VerdictLead` — the ranked findings (`rankFindings` in `src/lib/writeup-view.ts`)
  — and the rest are the "All findings" appendix. The lead takes
  `KeyJudgement[]` and has a `brief` slot, so the key-judgements artefact and the
  one-page brief wire in as a mapping, not a rewrite. Machine figures (items
  held, run time, tokens) live in "Where this comes from", never above the tabs.
- **The brief is the Verdict's lead, and `briefOf` decides it** (`src/lib/brief.ts`).
  Page, pack, the brief's Word file (`?part=brief`) and the full Word document all
  lead with `briefItems` — key judgements, or the ranked findings on an older
  assessment. Add a lead list anywhere else and it will disagree with these four.
  "Print the brief" is a class on `<html>` for one print (`parts/_brief.scss`);
  Ctrl-P prints the whole report and must keep doing so.
- **The pattern grid leads Threats and is a picker.** A row or square sets the
  `pattern` selection kind, joined on `data.targets` as `patternGrid` is; a column
  sets `mechanism`. It narrows only by the kinds it cannot set (band, body).
- **The visible words are chosen, and written down** in `src/lib/plain-words.ts`:
  "ways to beat it", not plays; "parts of the policy", not mechanisms; "how
  exposed", "final review", "steps". Ids, routes and CSS classes keep the old
  names (`?move=causality`, `#mechanisms`) — only text changed. A new label
  checks itself against that list, and a word that must stay goes in `GLOSSARY`.
- **Adding a section means choosing its move.** `section(id, title, move, body)`
  will not compile without one. A section in the wrong move still renders — just
  never where the reader looking for it will be — so the walk visits every move
  and asserts its headings.
- **The offline pack keeps the cascade.** It is one file opened from `file://`
  with every request blocked, and `Ctrl-F` across a whole document is its real
  interface; a tabbed spine would hide five sixths of it behind JavaScript.
  `Report` branches on `offline` for exactly this.
- **`client/govuk/Tabs.tsx` does not instantiate `govuk-frontend`'s Tabs class.**
  That component owns its selected state in the DOM, which makes the carried
  selection impossible — choosing a mechanism in Causality has to move the reader
  to Threats with the filter intact.
- **The selection is carried, and stated in words.** `client/report/selection.ts`.
  A filter that survives a tab change breaks silently: nothing throws, the view is
  simply narrower. The walk asserts it survives and is clearable from another move.
- **Opening a play is not selecting it.** Opening navigates to the drill page —
  `Drill.tsx` argues the page case in writing — and changes no filter.
- **A failed or cancelled run still renders a report.** Seventeen completed
  stages are seventeen stages of work; the failure is stated and nothing absent
  is invented.
- **`BAND_FILL` is a recorded divergence.** Upstream's ramp is `var(--accent)`
  plus three `color-mix()` steps and neither property is defined here, so every
  mark painted black. The four values live in `scripts/sync-core.mjs` and in
  `app.scss`, and they must agree. No status colour ever enters a plot frame.
- **`client/report/warnings.ts` parses prose, and should not stay that way.** It
  reads a run's own stage warnings for what was discarded; the durable version
  emits those counts from the stage writer. It is tested against all 256 warnings
  of a real run.

## Migrations

Explicit SQL in `migrations/`, applied in the order `migrations/order.txt` gives —
**not** filename order, and the runner refuses to start if the two disagree. Files
numbered `0000-`, `0001-` are ours; dated ones are copied from upstream and must
be added to `order.txt` by hand.

`src/lib/db/schema.integration.test.ts` checks the Drizzle schema against the
migrated database. It exists because upstream has two columns that live in its
schema and in none of its migrations.

## Not a government service

The GOV.UK crown, the royal arms and the GDS Transport typeface may not be used —
they are licensed to services on GOV.UK. `npm run a11y` asserts this against the
built files. If you add a font or an image to the build, expect that gate to stop
you, and it is right to.
