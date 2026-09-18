# Working on this repository

Read `docs/plan.md` first, then the phase document for whatever you are touching.
They carry the decisions and the reasoning; this file is only the things that will
cost you an hour if nobody says them.

## It is a fork, and most of the code is a copy

`src/lib/policy-analysis/**` and most of `src/lib/**` are copied verbatim from
`zerosumpain/SR-Policy-Analysis`. `docs/upstream.json` names every copied file.

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
