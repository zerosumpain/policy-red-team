# Standalone Policy Analysis — build plan

Written 18 September 2026. Decisions taken with John the same day are recorded in
§8; they are settled, not open, and this file is the record of them.

The tool being made standalone is `zerosumpain/SR-Policy-Analysis`, which reads a
policy paper as an adversary would across eighteen durable stages. That version is
a SvelteKit application coupled to the Strange Ramblings site: its database, its
model gateway, its queue and its sign-in. This plan builds a second version that
depends on none of them, in raw TypeScript, Node and React, following the GOV.UK
Design System, against a local database.

## 1. What this job actually is

It looks like porting a 35,000-line application. It is not. Measured against the
source repository on 18 September 2026:

| Layer | Size | Fate |
|---|---|---|
| `src/lib/policy-analysis/*.ts` — pipeline, contracts, validation, budget, view-shaping | **11,347 loc, framework-free** | copies verbatim |
| its vitest suite, 30 files | **6,130 loc** | copies verbatim |
| `src/lib/jkai/intel/resolve/match.ts` — entity resolution | 1,068 loc, pure | copies verbatim |
| Svelte components and routes | **~15,000 loc** | **discarded, rebuilt in React/GDS** |
| Edges out to the rest of the site | **27 distinct imports** | a shim layer, ~1,200 loc |
| Schema | **11 tables, 317 lines of explicit SQL** | runs unchanged on PGlite |

The product value — the eighteen stages, the contracts, the repair loop, the
budget fitter, the geometric-mean ranking of the exploitation playbook, and the
failure handling written into `validation.ts` and `provider.ts` — lives entirely
in the framework-free lines. **The interface is the work. The core is a copy.**

Two facts establish that rather than assert it: no Svelte import appears anywhere
in `src/lib/policy-analysis/*.ts` except `peek.svelte.ts` and `network.ts`, and
none of the 30 test files boots a browser.

## 2. Stack

Matched to precedent in the existing estate rather than chosen fresh.

- **Server: plain `node:http`.** The three Node servers already in the estate —
  `jkai-codex-bridge/src/server.ts`, `jkai-policy-worker/bin/start.ts` and
  `local-plan-navigator/scripts/serve.mjs` — all use it, and none uses a
  framework. The only place this costs anything is multipart upload, which is
  `busboy` and about forty lines.
- **Client: Vite, React 19, TypeScript, react-router.** A single-page app; no
  Next.js, which keeps the brief's "raw ts, node and react" honest.
- **Styling: `govuk-frontend` 6.x SCSS.** No Tailwind. Local Plan Navigator
  already runs this major version.
- **Database: PGlite with `drizzle-orm/pglite`.** Real Postgres in-process, one
  data directory, nothing to install. `pg_advisory_xact_lock`, `jsonb ->>`,
  `::uuid` and `DESC NULLS LAST` keep working, so `server/store.ts`,
  `server/personas.ts` and `server/census.ts` port untouched.
- **Graph: `react-force-graph-3d`**, by the author of the `3d-force-graph` the
  source already uses, so the layout logic in `network.ts` survives.
- **Model: the `openai` SDK pointed at OpenRouter's base URL**, which is what
  `llm/client.ts` already does once the gateway, the settings table and the Codex
  fallback are removed.
- **Queue: an in-process worker loop.** The `workflow_runs` lease machinery —
  `SELECT … FOR UPDATE SKIP LOCKED`, lease renewal, the reaper — exists to
  coordinate a fleet of workers. A single-user local tool has one. Drop the
  leases; keep durable resume, which is the part that matters.
- **Tests: vitest**, inherited with the suite, plus **Playwright and axe-core**
  for accessibility, following Local Plan Navigator.

## 3. The design brief, and where it fights the source

The GOV.UK Design System is not a skin. It is a different theory of an interface,
and it agrees with about two-thirds of this tool.

**Where it fits better than what exists now.** The report is a document: findings,
evidence, and a chain back to a passage in the source paper. Summary lists,
tables, `details`, accordions, tags and a task list for the eighteen stages are a
straight improvement on a bespoke dashboard. Submission becomes one thing per page
with an error summary. The stage guide becomes an accordion. This is the pattern
language the content was already reaching for.

**Where it fights.** The current surface is a dense, dark intelligence dashboard:
hover-peek cards (`PeekCard`, 400 loc), a 3D force graph (1,535 loc), an adjacency
heatmap, a stress lab. GOV.UK has no pattern for any of them, and hover-only
disclosure fails WCAG 2.2 AA outright.

**The resolution.** GOV.UK components for everything that is a document or a form.
The visual set becomes *enhanced views*, each shipping a table equivalent behind a
"Diagram / Table" toggle — which is both the accessibility answer and, for most of
them, the more useful view. `PeekCard`'s hover becomes click to expand.

**The branding constraint.** This service may not use the GOV.UK crown, the royal
arms, or the GDS Transport typeface, which is licensed only to services on GOV.UK.
Local Plan Navigator already handles this: `src/styles/app.scss` overrides
`$govuk-font-family` to Helvetica Neue and Arial, and its accessibility statement
names the deviation. Copy both. The service must also say on its own pages that it
is not a government service.

## 4. Repository layout

```
server/          node:http router, upload, SSE progress, exports
  shims/         db · llm · queue · execution-ctx · extract · research · seal · access
core/            copied verbatim from src/lib/policy-analysis (11.3k loc)
  *.test.ts      copied verbatim (6.1k loc, 30 files)
client/
  govuk/         thin React components over govuk-frontend classes
  pages/         submit · history · run · report · personas · shared
  views/         report sections, ported from the Svelte components
  styles/app.scss  font and brand overrides, after Local Plan Navigator
offline/         second Vite build, one IIFE and one stylesheet
migrations/      the ten existing .sql files, unchanged
docs/            this file, and the decision log
```

There is no first-party React library for GOV.UK. `govuk-react-jsx` is
community-maintained and lags version 6, so the components are hand-written over
the CSS classes — which is what Local Plan Navigator does in nunjucks.

## 5. Phases, each with the command that proves it

| # | Phase | Proof |
|---|---|---|
| **0** | **Spike.** PGlite runs the ten migrations and honours `pg_advisory_xact_lock`. `govuk-frontend` 6 compiles under Vite with the font override. | eleven tables present; a second transaction blocks on the lock; a stylesheet builds with no GDS Transport `@font-face` |
| **1** | **Core and shims.** Copy the core and the tests. Write the 27 shims. Nothing renders. | `npx tsc --noEmit` clean |
| **2** | **Headless end to end.** A CLI takes a PDF and runs all eighteen stages to a JSON report. **No interface work starts until this is green.** | `npm test` — 30 files pass; `node cli.ts assess paper.pdf` writes a report |
| **3** | **Design system.** Page template, header and footer without the crown, the component set, the accessibility statement. | `npm run a11y` — axe-core clean across a static page set |
| **4** | **Interface, in dependency order.** Submit, history, run progress, report and drill, playbook, actors, graph, stress lab, personas, shares. The bulk of the calendar. | Playwright walks submit to report; axe clean on every page |
| **5** | **Exports.** Word, Markdown, and the offline single-file HTML as a second Vite build with a React entry. | the pack opens from `file://` with networking disabled |
| **6** | **Packaging.** `npm install && npm start` on a clean machine, `.env.example`, README, licence. | fresh clone, one key in `.env`, an assessment completes |

Phases 0 to 2 hold the risk and are quick. Phase 4 is most of the time.

Phase 4 shipped the interface but not all of it — the surfaces it left are
listed at the end of `docs/phase-4.md` and are being completed one at a time,
each with its own record from `docs/phase-7.md` onwards. **7** is the drill, **8** the relationship graph and its table, **9** the stress
test, **10** share links — which also answers the open question below.

## 6. Risks

- **PGlite advisory locks** are the one unverified assumption, which is why phase
  0 exists. If they fail, the store layer needs a single-process mutex instead:
  half a day, not a redesign.
- **Full parity includes the 3D graph**, the least GOV.UK-shaped thing in the
  product. `react-force-graph-3d` keeps `network.ts` alive; budget a day for the
  table equivalent.
- **The fork diverges.** Both READMEs should say the core is duplicated and where
  the other copy lives.
- **Tavily** is a second API key, for the research stage. The standalone version
  should degrade without it rather than fail the run.
- **Sealed runs** write keys to disk. `seal.ts` uses `node:crypto` and `fs` and has
  no coupling to the site, so it ports, but the standalone needs its own key
  directory and a documented backup story: a lost key is a shredded run by design.

## 7. Effort

Roughly eighteen to twenty-five working days, front-loaded with low-risk copying.
Phases 0 to 2 produce a working headless analyser inside a week, which is the
point at which the thing is real and everything after it is interface.

## 8. Decisions taken

| Question | Decision |
|---|---|
| Local database engine | **PGlite, embedded.** Keeps the Postgres-specific store layer and the existing migrations. |
| Scope of version 1 | **Full parity** with the site version, including the 3D graph, sealed runs, shares, personas and the offline pack. |
| Relationship to the source repository | **Hard fork.** The core is copied and the two diverge; pipeline fixes are applied twice, by hand. |
| Model access | **One OpenRouter key in `.env`.** No gateway, no settings table, no Codex bridge. |
| Repository name | `policy-red-team`. |

~~Still open: whether share links earn their place in a single-user local tool.~~
**Answered in phase 10: built.** The token is the questionable half; the
redaction is not, and until that phase nothing could reach it — `resolveShare`
sat in the repository with no route calling it. See `docs/phase-10.md`.
