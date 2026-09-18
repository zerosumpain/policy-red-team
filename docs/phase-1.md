# Phase 1 — the core, copied; the seams, written

Completed 18 September 2026. The gate `docs/plan.md` set for this phase was a
clean `tsc --noEmit`. That is met, and the unit suite came green as well, which
was phase 2's gate rather than this one's.

## Result

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **0 errors** |
| Unit tests | `npm test` | **418 passed, 0 failed, 3 skipped** |
| Upstream drift | `npm run sync:check` | 92 verbatim files, 90 identical, 2 diverging as recorded |

The three skips are honest ones: `offline/pack.test.ts` skips itself until the
offline bundle is built, which is phase 5, and one case in `pipeline.test.ts` is
skipped for a reason that is the most important finding below. The four
`*.integration.test.ts` files are excluded until phase 2 gives them a migrated
database and a worker loop.

## What moved

93 files copied from `zerosumpain/SR-Policy-Analysis` at `b540072`, 14,424 lines
of it. Not by hand: `docs/upstream.json` names every verbatim file and
`scripts/sync-core.mjs` reproduces the copy, reports drift in three buckets, and
re-applies the recorded divergences. The plan named fork drift as a risk; this is
the answer to it, and `npm run sync:check` is how it gets asked.

The directory layout MIRRORS upstream — `src/lib/policy-analysis/…`, the `$lib/*`
alias and all — rather than the flatter `core/` the plan sketched. That is the
decision that makes everything else cheap: a copied file keeps every one of its
import lines, so it stays byte-identical to its original and a fix ported across
the fork applies without a rewrite.

### Eleven seams

The 27 edges the plan counted came to eleven modules actually worth writing, and
most needed only one or two exports:

| Seam | Upstream | Here |
|---|---|---|
| `db/schema.ts` | 207 tables, 365 kB | 13 tables, 266 lines, copied from upstream's own definitions |
| `db/index.ts` | `pg` pool over the shared server | PGlite, one directory, one connection |
| `llm/client.ts` | OpenRouter + Codex bridge + outage fallback + settings table | one OpenRouter key from `.env` |
| `llm/keys.ts` | encrypted settings store | `process.env`, with Tavily optional |
| `server/models/workload-settings.ts` | 499 lines of workload registry | one resolver, `POLICY_RESEARCH_MODEL` |
| `server/models/settings.ts` | 209 lines over a settings table | one question: is Codex there (no) |
| `server/models/codex-catalogue.ts` | the Codex model list | deliberately empty — see below |
| `server/access.ts` | allow-list in the database, checked per request | one local owner, for the NOT NULL column |
| `workflows/run-queue.ts` | fleet coordination, `SKIP LOCKED`, reaper | one worker, keeping the lease columns and the delay scheduling |
| `context/research-meter.ts` | AsyncLocalStorage, site cost ledger | a process counter, same credit arithmetic |
| `lib/polyfills.ts` | — | new; two ES2025 APIs this Node lacks |

## The finding that matters: the model picker is inert

`server/ingest.ts:78` accepts a commissioned model only if it appears in
`CODEX_MODELS`:

```ts
const model = CODEX_MODELS.some((m) => toCodexModelId(m.slug) === askedModel) ? askedModel : null;
```

The site offers Codex models in its picker because they are funded by a
subscription rather than per token. A standalone install has no Codex bridge, so
that catalogue is empty — and **every submission therefore degrades to `model:
null`**, and every run uses whatever `POLICY_RESEARCH_MODEL` says.

Nothing is broken. The stage is doing exactly what its test name says it should:
"degrades rather than refusing". But a per-assessment model picker that can never
pick anything is not the parity `docs/plan.md` promised, and **phase 4 must
re-point that catalogue at OpenRouter** — which is a product decision about which
models to offer, not a typecheck fix, which is why it was not made here.

The test that covers it is skipped rather than rewritten, with that reasoning in
the file. Rewriting its five assertions to expect `null` would have left a test
that asserts nothing, and would have hidden the gap instead of recording it.

## Two ES2025 APIs this Node does not have

`pdfjs-dist` 5.4 calls `Promise.try` and `Uint8Array.prototype.toHex`. Both are
ES2025 and neither exists on Node 22.22.0, which is what this machine runs. PDF
ingestion died on the first, then on the second.

This is the phase 0 environment note biting: upstream's `engines` asks for
`>=22.23.2`, and **that pin exists for exactly this reason**. `package.json` now
asks for the same floor.

`src/lib/polyfills.ts` supplies both, guarded, so the suite runs on the Node that
is actually here. The Node on this box also runs the live site, and a system-wide
upgrade is not a change this project gets to make on its own. The file says in its
own header that a third missing API means stop polyfilling and upgrade Node.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| Directory layout | flat `core/` per the plan; mirror upstream's `src/lib/**` | **mirror upstream** | copied files keep every import line, so they stay byte-identical and `sync:check` can tell drift from a deliberate edit | yes, but the longer it stands the less anyone will want to |
| How the copy happens | one-off `cp`; a manifest and a script | **manifest + `sync-core.mjs`** | the plan named fork drift as a risk and a `cp` leaves no way to ask about it | yes |
| Codex modules | delete the imports from the copied core; keep the modules as stubs | **stub them** | editing `provider.ts` and `ingest.ts` would forfeit their verbatim status, which is the whole value of the fork | yes — the catalogue gets a list back if a user ever runs a bridge |
| `workflows`/`workflow_runs` | patch the copied SQL; recreate the tables locally | **recreate locally** (phase 0) | keeps `store.ts`, `worker.ts`, `census.ts` verbatim | yes |
| Lease columns | drop them with the fleet machinery; keep them | **keep** | the copied cancel, purge and progress paths read them, and a held lease is how a crashed run is told from a running one | yes |
| `peek.svelte.ts` | drop it and lose `dashboard-shaping.test.ts` (782 lines); re-home the pure half | **re-home into `peek.ts`** | `parseSubject` is pure; the runes are not. One import line of divergence buys back a large test | yes |
| The Codex commission test | rewrite its assertions to expect null; skip it with reasoning | **skip** | rewritten it would assert nothing and hide a real gap | yes — phase 4 restores it |
| Node version gap | raise `engines` and leave the box broken; polyfill | **both** | the floor is the truth; the polyfill is what lets work continue on this machine without touching the Node the live site runs on | yes — delete the file once the floor is met |
| `legacy-peer-deps` | pin around it; set it in `.npmrc` | **`.npmrc`** | npm 10.9's resolver crashes on vitest 4's optional playwright peer; a flag nobody remembers is not reproducible in CI | yes, on the next npm |
| Route guards (`owner.ts`, `access.ts`, `client-address.ts`) | shim them; leave them out | **leave out** | they are `@sveltejs/kit` request guards; phase 4's `node:http` server does this itself | yes |

## What phase 2 inherits

- A green unit suite and a clean typecheck, both as npm scripts.
- Eleven seams written and commented, with `db/index.ts` and `run-queue.ts` the
  two that phase 2 will actually exercise.
- Four `*.integration.test.ts` files waiting on a migrated database and a worker
  loop — which is precisely phase 2's deliverable, so they are its acceptance
  test rather than extra work.
- One known gap to hand to phase 4: the model picker, above.
