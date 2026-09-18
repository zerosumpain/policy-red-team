# Policy Red Team

Reads a policy paper as an adversary would: who gains if it fails, and what they
can do about it while staying compliant.

It is **not an assurance review**. It will not tell you a policy is fine — a clean
report means it found nothing, which is not the same thing. Every profile it
writes is a hypothesis about a body's incentives, never a finding about a named
person.

Everything runs locally. The database is embedded in the application, and the only
thing that leaves your machine is the text of the paper, as prompts to the model
you configure.

## Run it

```bash
npm install
cp .env.example .env        # put an OpenRouter key in it
npm start                   # http://127.0.0.1:5290
```

Node 22.23.2 or newer. Nothing else to install — no database to run, no container.

To try it without a key or a bill:

```bash
npm run build:offline && node build.mjs
node dist/cli-fixture.js assess tests/fixtures/policy-analysis/policy.txt
```

That runs all eighteen stages against a deterministic fixture model. The fixture
build is compiled with no path to a model provider at all, and the build fails if
one gets in — so it is a checkable claim rather than a promise.

## What it does

Eighteen durable stages, one at a time, resumable across restarts:

| | |
|---|---|
| **Read the paper** | ingestion · decomposition · entity resolution · knowledge graph |
| **Work out who is in it** | actor and incentive profiles |
| **Test it against the world** | targeted research · evidence matrix · interaction models · automated policy tests |
| **Attack it** | adversarial scenarios · **exploitation playbook** · cross-policy exposure |
| **Write it up, then challenge it** | synthesis · persona library · theory of change · options · independent challenge · assured synthesis |

The exploitation playbook is the red team. Per profiled body, the concrete plays
it can run to serve itself at the policy's expense — preferring the ones that stay
**compliant**, because those are the ones nothing will stop. The model judges four
factors, and the server computes the ranking as their geometric mean: a play that
scores high on three and near zero on one is not a threat, and an average would
hide that.

A finished assessment can be read in the browser, downloaded as Word or markdown,
or taken away as a pack that opens by double-clicking it and needs no network at
all.

## Commands

```
npm start              build everything and serve on 127.0.0.1:5290
npm run dev            the client alone, with hot reload, on :5290
npm run cli            the command line: assess, list, report, migrate
npm run test:all       typecheck, 421 unit, 19 integration, a11y, browser walk, offline pack
```

Individually: `npm test`, `npm run test:integration`, `npm run typecheck`,
`npm run a11y`, `npm run walk`, `npm run offline`, `npm run sync:check`.

## Configuration

Everything is optional except the key. See `.env.example` for the full list.

| | |
|---|---|
| `OPENROUTER_API_KEY` | the only one that is required |
| `TAVILY_API_KEY` | optional. Without it the research stage records that it could not search, and the run finishes "with gaps" rather than failing |
| `POLICY_RESEARCH_MODEL` | the default model. The picker offers a menu; `POLICY_MODELS` replaces it |
| `POLICY_DATA_DIR`, `POLICY_SEAL_KEY_DIR` | where the database and the sealed-run keys live |
| `POLICY_PORT`, `POLICY_HOST` | where it listens |

**It binds to loopback on purpose.** There is no authentication of any kind, so
anyone who can reach the port can read every assessment and start new ones against
your key. `POLICY_HOST` will bind elsewhere, and warns when it does.

**A sealed assessment's key is the assessment.** Destroying the key destroys the
run, by design. Back up `POLICY_SEAL_KEY_DIR` deliberately or accept that a purge
is final.

## How it is built

- **Node 22 and `node:http`** — no web framework
- **React 19, TypeScript, Vite** — a single-page client, no meta-framework
- **[GOV.UK Design System](https://design-system.service.gov.uk/)** — see below
- **PGlite** — real PostgreSQL 18 compiled to WebAssembly, in-process, one directory
- **OpenRouter** through the OpenAI SDK — one key, every model

### It is a fork, and the core is a copy

The pipeline — eighteen stages, the contracts, the validation and repair loop, the
budget fitter — is copied verbatim from
[`SR-Policy-Analysis`](https://github.com/zerosumpain/SR-Policy-Analysis), the
SvelteKit version that runs inside strangeramblings.com. Roughly 14,000 lines of
it, plus its test suite.

`docs/upstream.json` names every copied file and the commit it came from;
`scripts/sync-core.mjs` reproduces the copy, reports drift in three buckets, and
re-applies the deliberate divergences. `npm run sync:check` is how you ask whether
the two have moved apart.

A fix made upstream has to be applied here by hand. That is the cost of the fork
and it was chosen knowingly — `docs/plan.md` §8 records why.

## Not a government service

This is styled with the GOV.UK Design System because the design system is good at
documents and forms, which is what this is. It is **not a government service** and
has no connection with any government department.

The GOV.UK crown, the royal arms and the GDS Transport typeface are deliberately
not used — they are licensed to services on GOV.UK. Text is set in the fallback
stack GOV.UK itself specifies off GOV.UK. `npm run a11y` asserts all of that
against the built files, because it is a promise about what ships rather than a
setting someone might change.

Accessibility is checked with axe-core against WCAG 2.2 AA on every route, and the
browser walk checks the pages that only exist while a run is in flight. The
[accessibility statement](/accessibility) names the two places this departs from
the site version: hovering became clicking, and every diagram ships with the same
data as a table.

## Documentation

`docs/` carries the plan and a record of each phase — what was built, what broke,
and the decisions taken with their reasoning:

- `plan.md` — the build plan and the decisions that shaped it
- `phase-0.md` … `phase-5.md` — findings, including several bugs found in upstream
- `upstream.json` — every copied file, and every divergence

## Licence

MIT. See `LICENCE`.

GOV.UK Frontend is used under the MIT Licence. Its crown, coat of arms and
typeface are not used.
