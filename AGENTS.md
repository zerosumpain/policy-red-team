# Working on this repository

Read `docs/plan.md` first, then the phase document for whatever you are touching.
They carry the decisions and the reasoning; this file is only the things that will
cost you an hour if nobody says them.

## It is a fork, and most of the code is a copy

`src/lib/policy-analysis/**` and most of `src/lib/**` are copied verbatim from
`zerosumpain/SR-Policy-Analysis`. `docs/upstream.json` names every copied file.

- **`node scripts/sync-core.mjs` RE-COPIES EVERYTHING.** There is no way to
  apply a new divergence without also pulling every upstream change that has
  landed since the last sync — which nearly put an unevaluated pipeline rewrite
  into a UI commit on 2026-09-19. After running it, check `git status` for files
  you did not mean to move, `git restore` them, and put their old hash back in
  `docs/upstream.json` or `sync:check` will report an upstream change as a local
  edit.
- **Do not edit a copied file directly.** Add a divergence to the `DIVERGENCES`
  map in `scripts/sync-core.mjs` and describe it in `docs/upstream.json`, then run
  `npm run sync`. A hand edit is silently reverted by the next sync.
- `npm run sync:check` reports drift in three buckets: changed upstream, edited
  here, and not copied yet. It should be clean before you commit.
- Every divergence must actually change something. A `.replace()` that no longer
  matches throws rather than passing quietly, which is how you find out upstream
  moved the code you were patching.

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
- **Node must be 22.23.2 or newer.** `pdfjs-dist` calls `Promise.try` and
  `Uint8Array.toHex`, both ES2025. `src/lib/polyfills.ts` carries them for older
  Node; if a THIRD one appears, upgrade rather than adding to that file.

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
