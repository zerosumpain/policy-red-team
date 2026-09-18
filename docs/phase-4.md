# Phase 4 — the interface

18 September 2026. The gate `docs/plan.md` set: *a browser walks submit to report,
and axe is clean on every page.* That is met. The surface is not complete — what
is outstanding is listed at the end rather than implied by silence.

## Result

| Check | Command | Result |
|---|---|---|
| The journey | `npm run walk` | **submit → 18 stages → report → history**, axe clean on every page it lands on |
| Static routes | `npm run a11y` | **6 routes, 0 serious or critical**, none at any severity |
| Unit | `npm test` | **419 passed** (up one: the commission test is back) |
| Integration | `npm run test:integration` | 19 passed |
| Typecheck | `npm run typecheck` | 0 errors |

## The model picker works now

Phases 1 and 2 both closed with the same line outstanding: `server/ingest.ts`
validated a commissioned model against `CODEX_MODELS`, a standalone install has no
Codex bridge, so the catalogue was empty and **every submission degraded to
`model: null`**.

`src/lib/server/models/catalogue.ts` is the catalogue it should have been checking
— OpenRouter ids, the one provider this build can reach. Three lines of `ingest.ts`
diverge to use it, managed by `scripts/sync-core.mjs` like every other divergence.
The ids are ones already in service in this estate rather than guessed off a price
page, `POLICY_MODELS` replaces the menu outright, and the default still comes from
`POLICY_RESEARCH_MODEL` — a menu, not a hard-coded model.

The test phase 1 skipped is **restored rather than deleted**. Every case had a
direct equivalent once the catalogue was real, including the last one: `max` is a
Codex-only effort level, so on OpenRouter it is still "an effort this model will
not take", and the model is still kept while the effort falls back.

Proof it is not just compiling — through the HTTP API, with a real submission:

```
status: completed_with_gaps | model: anthropic/claude-sonnet-4.5 | effort: high
stages completed: 18 of 18 | artefacts: 100
```

## The server

One process: HTTP, the static client, and the worker. Upstream splits web and
worker into separate containers because several web replicas share one queue; here
there is one of everything and a second process would be two things to start.

**It binds to loopback, and that is the security model.** No session, no password,
no per-request owner check, because the tool belongs to whoever is at the machine.
That is reasonable for something local and indefensible for something on a network,
so `POLICY_HOST` must be set deliberately to bind anywhere else — and doing so
prints a warning saying exactly what it means.

Progress is server-sent events, not polling. A run emits a handful of updates over
several minutes; asking every second for twenty minutes to catch eighteen of them
is the wrong shape of work.

## What the report is

`client/report/Report.tsx` decides presentation and nothing else. Every figure in
it is shaped by `$lib/policy-analysis/view` — `plays()`, `actorBoard()`, `ledger()`,
`findingsBySection()` — the same framework-free functions the site version renders
from. That is the whole payoff of having copied the core: a change to what counts
as a severe play lands in both without being reimplemented in React.

The shape is GOV.UK's, not the dashboard's. A report is a document: the conclusion
first, then the figures behind it, then the detail on request. The site version
opens with a wall of tiles because it is a dashboard; this opens with the sentence
the assessment actually concluded.

Two things the design brief promised and this delivers:

- **The exposure plot ships with its table**, behind a toggle offered to everyone
  rather than hidden behind assistive technology. Neither is the "accessible
  alternative" to the other — a scatter plot answers "is anything in the top
  right" at a glance and "what exactly is play four" not at all.
- **Nothing reveals on hover.** Every disclosure is a `<details>` that opens and
  stays open.

A contents list was added after looking at a real report: fifteen thousand pixels
of document with no way to jump is a flaw, and GOV.UK guidance pages solve it with
exactly this. It is generated from the sections that actually rendered, because a
hand-kept list of anchors goes stale the first time a section is added and an
entry pointing at nothing is worse than no contents at all.

## Four faults, found by running it

**The fixture build could still reach a provider.** `build.mjs` swaps
`server/provider` for a fixture — which covers the pipeline, and not
`server/personas.ts`, which calls `getLLMClient` directly to research a dossier.
The build's own `openrouter.ai` check caught it *after* the swap had been declared
a success. The fix redirects the gateway itself, so the guarantee no longer depends
on anyone remembering to add a file to a list.

**`role="alert"` on both the error summary and its child.** govuk-frontend's
template carries a comment explaining why the role belongs on a *separate* child:
putting it on the element that also takes focus races the focus against the
announcement, and a screen reader drops what it was about to read. This component
had it on both — reintroducing precisely the bug the child container exists to
avoid. Found because Playwright reported two elements where it expected one.

**A button-shaped link reloaded the whole app.** `<a href>` with the GOV.UK button
class is the right markup and the wrong behaviour in a single-page app: it threw
away the app to move one page. The router's `Link` wearing the same class is the
same markup and keeps navigation client-side.

**`getByLabel` is a substring match.** "The paper" also matched "Anything the paper
does not say". A test fault, not a product one, but the kind that makes a walk
flaky rather than failing.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| The model catalogue | edit `ingest.ts` in place; add a catalogue module and diverge three lines | **catalogue module** | keeps ingest a managed divergence rather than a rewrite, and makes the menu configurable | yes |
| The skipped commission test | leave it skipped; translate it | **translate** | every case had a real equivalent, and a promise made in phase 1 | yes |
| Submission form | one thing per page; one page | **one page** | one-thing-per-page serves someone filling a form once under stress; this is a tool its owner uses repeatedly, and eight pages is friction with nothing behind it | yes |
| Progress | poll; server-sent events | **SSE** | a handful of updates over minutes |  yes |
| Web and worker | two processes as upstream; one | **one** | one of everything; a second process is a second thing to start | yes |
| Authentication | add a password; bind to loopback and say so | **loopback** | a local single-user tool, and a half-built login is worse than an honest boundary | yes, and phase 4's `server/index.ts` is where it would go |
| Long report | leave it; add a contents list | **contents list**, generated | 15,000 pixels with no way to jump; generated so it cannot go stale | yes |
| Fixture safety | redirect the provider; redirect the gateway | **the gateway** | the provider swap missed a caller, and the guarantee should not depend on a list | yes |

## What is not done

Full parity was the choice in `docs/plan.md`, and these are the surfaces still
outstanding. None is blocked; all are additive to what now works.

- **The drill** — an artefact's own page, with its provenance chain.
- **The 3D relationship graph**, and the table beside it the accessibility
  statement commits to.
- **The stress lab** (`StressLab.svelte`, 921 lines upstream).
- **Share links** — the API is implemented and tested; there is no UI, and the
  open question from `docs/plan.md` about whether a single-user tool wants them
  at all is still open.
- **Persona detail** — the library lists; a dossier does not open yet.
- **Material and restate** — the API accepts both; nothing calls them.
- **Exports** — Word, Markdown and the offline pack are phase 5.
