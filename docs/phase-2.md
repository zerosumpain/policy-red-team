# Phase 2 — headless, end to end

Completed 18 September 2026. The gate `docs/plan.md` set: a CLI takes a document
and runs all eighteen stages to a report, and the integration suite passes. Both
are met, and no interface work starts before this point, which was the rule.

## Result

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **0 errors** |
| Unit | `npm test` | **418 passed**, 3 skipped |
| Integration | `npm run test:integration` | **19 passed**, 1 skipped |
| End to end | `npm run assess:fixture -- tests/fixtures/policy-analysis/policy.txt` | **18/18 stages**, a 131 kB report, ~2s |
| Drift | `npm run sync:check` | 93 verbatim files, 87 identical, 6 diverging as recorded |

The one skip is the browser-driven case, which needs a running preview; phase 4
gives it one.

## The CLI

```
policy migrate                      apply the migrations
policy assess <file> [options]      run an assessment to completion
policy list                         every assessment and its status
policy report <id> [--out file]     re-emit a finished report
```

A real run needs `OPENROUTER_API_KEY` in `.env` (see `.env.example`). **No paid
run has been made from this repository.** Everything above was verified against
the deterministic fixture model, which is a build-time guarantee rather than a
promise — see below.

### Two bundles, and why

`build.mjs` produces `dist/cli.js` and `dist/cli-fixture.js` from the same source.
The fixture build resolves the one value import of `server/provider` to
`server/provider.fixture.ts` instead, so the bundle contains no path to a provider
at all; the build then fails if `openrouter.ai` appears in it.

A runtime `--fixture` flag would have been easier and weaker. This one cannot be
mis-set, and it is what makes "eighteen stages verified without spending money" a
checkable claim rather than an assurance. `npm run assess:fixture` is the command.

esbuild rather than `node --experimental-strip-types`, because the copied core
imports through `$lib/*` — deliberately, so its files stay byte-identical — and
Node cannot resolve that. Upstream ships its worker the same way
(`packages/jkai-policy-worker/build.mjs`), including the check that no `$lib`
import survives bundling, which is kept here.

## What the integration suite found

Running upstream's integration tests somewhere they had not been run turned up
three things.

**1. Two columns exist in upstream's schema and in no migration.**
`policy_analyses.extraction` and `policy_analyses.shared_context_first` are in
the Drizzle schema and in the running database but in none of the ten migration
files — added with `drizzle-kit push` rather than written down. A fresh deployment
from those migrations produces a table the code cannot insert into, which is
exactly what happened on the first run here:

```
column "extraction" of relation "policy_analyses" does not exist
```

`migrations/0001-schema-catchup.sql` adds them. A diff of the whole Drizzle schema
against the migrated database found these two and nothing else across thirteen
tables, which is also a fair check on the schema copy — and that diff is now a
permanent test (`src/lib/db/schema.integration.test.ts`), because this class of
drift is silent and cheap to catch.

**2. An upstream test asserts a number its own source contradicts.**
`server/census.ts` opens with "THE TWELVE PROBES" and lists twelve;
`sealed.integration.test.ts` asserts eleven, and says "eleven" in the test name.
Both were last touched in the same upstream commit (`b2e2c06`), which added the
`policy_passes` probe without updating the assertion. It goes unnoticed because
upstream's integration suite needs an isolated Docker Postgres and is not part of
its CI. **Worth reporting upstream** — it is a real failing test there, not a
divergence caused by this fork. Fixed here, and recorded in `docs/upstream.json`.

**3. The guard on those tests had to be replaced, not removed.** Upstream refuses
to run them unless `DATABASE_URL` matches its isolated Postgres on port 15435 — a
regex, because these tests purge and delete. This build has no connection string,
so the same promise is kept differently: `tests/setup-integration.ts` creates a
throwaway database under the system temp directory, and the tests refuse to run
unless `POLICY_DATA_DIR` names a path of that shape. Pointing the suite at a real
install still cannot be done by setting one variable.

## Three faults in the new code, found by running it

None of these were in the copied pipeline. All three were in the ~200 lines
written this phase, and all three were found by running the thing rather than by
the type checker.

**`completed_with_gaps` is a finished run.** `drain` had a terminal-status set I
guessed instead of read. A run whose research stage warns — which is *every* run
without a Tavily key — ends in `completed_with_gaps`, so the first real end-to-end
run completed all eighteen stages and then hung for the full 120-second idle
timeout before reporting failure. Five places in the copied code treat
`completed` and `completed_with_gaps` as one thing; now so does this.

**A bundled "run as a script" guard is always true.** `scripts/migrate.mjs` ended
with the usual `import.meta.url === \`file://${process.argv[1]}\``. esbuild inlines
the module into `dist/cli.js`, where `import.meta.url` IS the bundle's url and the
comparison holds — so the block fired inside the CLI and read `argv[2]` as a data
directory. `policy list` tried to migrate a database called "list". The guard now
checks the filename too.

**`policy list | head -1` crashed.** An unhandled `EPIPE` on stdout is a stack
trace for a completely ordinary way to use a command-line tool.

`src/lib/worker/drain.integration.test.ts` exists because of the first of these:
the copied tests advance one stage at a time on purpose, so nothing covered
"keep going until there is nothing left", which is precisely what the CLI does.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| Proving eighteen stages | make a real paid run; a runtime `--fixture` flag; a separate fixture bundle | **separate bundle** | spending money is outside what "crack on with phase 2" delegates, and a build-time alias is a stronger claim than a flag | yes |
| Running TS with `$lib` | `--experimental-strip-types`; tsx; esbuild bundle | **esbuild** | Node cannot resolve the alias, and upstream already ships its worker this way | yes |
| The long-running loop | write one; copy upstream's `createPolicyWorker` | **copy it** | it already handles renewal, recovery and draining on stop; a second one would be a second thing to keep right | yes |
| `drain` vs the loop | one abstraction; two | **two** | a CLI wants a command that finishes; a server wants a loop that does not | yes |
| The integration guard | delete it; replace it | **replace** | these tests purge and delete; the guard is the reason that is safe | no, and it should not be |
| The census bug | match upstream's failing assertion; fix it | **fix** | the source says twelve and lists twelve; matching the bug would import it | yes |
| The two browser tests | skip the files; gate the browser blocks | **gate the blocks** | one of the two is mostly database assertions that all still run | yes |
| Missing columns | hand-write from the error; diff the whole schema | **diff** | one error at a time would have found `extraction` and missed `shared_context_first` | n/a |

## What phase 3 inherits

- A pipeline proven end to end on the embedded database, with a command that
  drives it — so every interface question from here is about presentation, not
  about whether the thing works.
- `runWorker()`, wired and unused, for phase 4's server to start.
- A report shape (`policy report <id>`) that the React views can be built against
  before any of them render.
- Still open from phase 1: the model picker is inert until its catalogue is
  re-pointed at OpenRouter.
