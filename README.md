# Policy Red Team

Reads a policy paper as an adversary would: who gains if it fails, and what they
can do about it while staying compliant.

It is **not an assurance review**. It will not tell you a policy is fine — a clean
report means it found nothing, which is not the same thing. Every profile it
writes is a hypothesis about a body's incentives, never a finding about a named
person.

The database is embedded in the application. There is no database server to run,
no cache, no second process, and nothing to install beyond Node.

## Run it

```bash
npm install
npm start                   # http://127.0.0.1:5290
```

Then open `/setup`. It will ask you to set an admin password — the service ships
accepting `admin` / `admin`, once, and the only thing that credential can do is
replace itself — and then walk you through connecting a model.

Node 22.23.2 or newer. Why that exact floor: `pdfjs-dist` calls `Promise.try` and
`Uint8Array.toHex`, which are ES2025 and not in earlier releases.
`src/lib/polyfills.ts` carries both so the test suite runs on 22.22, but do not
rely on that in production.

### Or try it without a key, a bill, or a network

```bash
npm run assess:fixture -- tests/fixtures/policy-analysis/policy.txt
```

That runs all eighteen stages against a deterministic fixture model and writes a
report. The fixture build is compiled with **no path to a model provider or a
search service at all**, and the build fails if one survives into the bytes — so
it is a checkable claim rather than a promise.

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

## Configuring it

There are three ways in, and they have a strict order of precedence:

> **the environment beats the stored settings beats the built-in defaults**

A value in the environment wins, always, and the page that would otherwise edit
it says so rather than accepting a change that will not take effect. That is what
lets a deployment managed by Ansible or systemd keep behaving the way its files
say it does.

| | |
|---|---|
| **`/setup`** | a guided journey — one thing per page, a task list, and a real call at the end |
| **`/admin`** | the same settings on one page, for when you know what you are changing |
| **the environment** | for a deployment whose configuration is managed elsewhere |

Both pages are behind the admin password. Everything else is as open as this
install is configured to be — see **Who can reach it** below.

### Which service answers

One module per service. `POLICY_PROVIDERS` narrows the list a build offers
without a rebuild, which is how you ship this without the Codex entry:
`POLICY_PROVIDERS=openrouter,azure`.

| | |
|---|---|
| **Azure AI Foundry** | a deployment you have already provisioned. API key, or Microsoft Entra — app registration, managed identity or AKS workload identity, for a resource with local authentication switched off |
| **OpenRouter** | one key, billed per token, reaching every model in the picker |
| **An OpenAI-compatible endpoint** | anything speaking that API at a URL you control: a local Ollama or vLLM, a gateway of your own, an APIM front end, a Codex bridge |

**"Saved" is not the same claim as "reachable."** An expired key, a bridge on
another machine and a renamed deployment all look identical until something asks,
so the setup journey ends by making one real call for a single token, and that —
not a filled-in form — is what counts as configured.

### The variables

Everything here is optional. An install configured entirely through `/setup`
needs none of it.

| | |
|---|---|
| `POLICY_PORT`, `POLICY_HOST` | where it listens. Loopback by default, deliberately |
| `POLICY_HOSTNAME` | the public name, if it has one. Used to refuse a citation that points back at this service |
| `POLICY_DATA_DIR` | the database |
| `POLICY_SEAL_KEY_DIR` | the settings key and the per-run sealing keys. **See Backing it up** |
| `POLICY_ADMIN_PASSWORD` | pins the admin password and is the recovery path if it is lost |
| `POLICY_SETUP_TOKEN` | required to claim an install that is not bound to loopback |
| `POLICY_ACCESS` | `open` or `password` — who may read the assessments |
| `POLICY_READER_PASSWORD` | the reader password, when `POLICY_ACCESS=password` |
| `POLICY_READ_ONLY` | `1` makes every mutation a 403. Existing assessments still open and export |
| `POLICY_PROVIDER`, `POLICY_PROVIDERS` | pin the active service; narrow the list this build offers |
| `POLICY_MODELS`, `POLICY_RESEARCH_MODEL` | replace the model menu; set the default model |
| `POLICY_SEARCH` | `auto`, `tavily`, `grounded` or `none` |
| `TAVILY_API_KEY` | a search service for the research stage |
| `POLICY_PRODUCER` | what an offline pack says produced it |
| `POLICY_OWNER_EMAIL` | assessments are scoped to an owner because the column is `NOT NULL` |
| `NODE_EXTRA_CA_CERTS`, `HTTPS_PROXY`, `NO_PROXY` | see **Deploying somewhere restricted** |

Per provider, for a deployment that sets them in a file rather than typing them:

| | |
|---|---|
| OpenRouter | `OPENROUTER_API_KEY` |
| Azure, all modes | `AZURE_FOUNDRY_ENDPOINT`, `AZURE_FOUNDRY_DEPLOYMENT`, `AZURE_FOUNDRY_API_VERSION`, `AZURE_AUTH_MODE` |
| Azure, API key | `AZURE_FOUNDRY_KEY` |
| Azure, Entra | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_FEDERATED_TOKEN_FILE`, `AZURE_AUTHORITY_HOST` |
| OpenAI-compatible | `CODEX_BASE_URL`, `CODEX_MODEL`, `CODEX_API_KEY` |

A `.env` beside the application is read at startup by both the server and the
command line. Copy `.env.example` if you want one.

### Who can reach it

Two passwords, and they are deliberately different.

The **admin password** opens `/setup` and `/admin`, which is where the model
credentials live. On a fresh install the service accepts `admin` / `admin` **once**,
and the only request that credential is accepted on is the one that replaces it —
no session exists until a real password has been written. Off loopback it is
refused entirely unless you also set `POLICY_SETUP_TOKEN` and present it, so a
service reachable from outside cannot be claimed by whoever finds it first.

The **reader password** (`POLICY_ACCESS=password`) closes everything else. Someone
who can read an assessment should not thereby hold the key to your model
credentials, which is why it is a separate password and a separate cookie. The
default is `open`, so nothing changes for an existing install until you decide.

**Do not gate this on a source address.** Behind a tunnel or a reverse proxy every
request arrives from `127.0.0.1`, so "local connections only" is a gate that passes
for the entire internet. Nothing in the application does this and nothing should.

## Deploying somewhere restricted

`deploy/` has a Dockerfile, a systemd unit and an nginx sample. `npm run doctor`
answers "is it reading my configuration" before an eighteen-stage run answers it
the slow way; `npm run doctor -- --reach` also tries the network, through the
proxy the service itself would use.

### What it needs to reach

At runtime, HTTPS on 443, and only the service you actually configure:

| | |
|---|---|
| your Azure resource endpoint | if you use Azure |
| `login.microsoftonline.com` | Azure with Entra app registration or workload identity only |
| `openrouter.ai` | if you use OpenRouter |
| `api.tavily.com` | only if you configure Tavily for the research stage |

And explicitly, so a security review does not have to take it on trust: **no
telemetry, no update check, no analytics, no content delivery network and no web
font.** Everything the page needs ships with it. Nothing is sent anywhere except
the model service you configure and the search service if you configure one.

At install time it also needs `registry.npmjs.org`. If that is not reachable from
the target, build the image or the `node_modules` tree somewhere that can reach it
and carry the result across — the Dockerfile does exactly this in two stages.

### Through a proxy

Set `HTTPS_PROXY` and `NO_PROXY` and the service uses them, for every outbound
call. Set `NO_PROXY` to include `127.0.0.1,localhost` if anything is configured on
loopback: a bridge sent to a corporate proxy is a bridge that never answers, and
the error reads as "unreachable" either way.

For a TLS-inspecting middlebox, point `NODE_EXTRA_CA_CERTS` at the inspection CA.
Node reads it before any of this code runs and says nothing if the path is wrong,
so the first symptom is every handshake failing — `npm run doctor` checks it is
readable.

## Backing it up

Three things, with three different rules. Getting the second one wrong is quiet
and getting the third one wrong is not recoverable.

| | |
|---|---|
| **The database** (`POLICY_DATA_DIR`) | back it up normally. It holds the assessments |
| **`settings.key`** (in `POLICY_SEAL_KEY_DIR`) | back it up **separately from the database**. It decrypts every stored credential. Lose it and the service starts fine and reports every credential as unset, because a row that will not decrypt is dropped rather than thrown on |
| **The sealing keys** (same directory) | **a lost key is a shredded run, by design.** Backing them up is a decision to weaken that guarantee, not an oversight to correct. Decide deliberately |

The settings key and the database are kept apart on purpose: a database copy, a
nightly dump or a snapshot beside it carries ciphertext and no key.

## Upgrading

Migrations run at boot and are forward-only. `git pull && npm install && npm run build`,
then restart. There is no down migration and no rollback path for the schema; take
a copy of the data directory first if that matters to you.

## Commands

```
npm start              build everything and serve on 127.0.0.1:5290
npm run dev            the client alone, with hot reload
npm run doctor         what this install resolved, and optionally --reach
npm run cli            the command line: assess, list, report, migrate
npm run test:all       every gate below, in order
```

| | |
|---|---|
| `npm test` | 1,010 unit tests, no database |
| `npm run test:integration` | the pipeline against a throwaway database, provider mocked |
| `npm run claim` | the shipped credential cannot survive, and both gates gate |
| `npm run a11y` | axe on every route **and** the licensing assertions |
| `npm run walk` | a browser from submit to report, against the fixture server |
| `npm run offline` | the pack, opened from `file://` with every request blocked |

Three of those drive a real browser and need one: `npx playwright install chromium`.
The running service needs none of it.

## How it is built

- **Node 22 and `node:http`** — no web framework
- **React 19, TypeScript, Vite** — a single-page client, no meta-framework
- **[GOV.UK Design System](https://design-system.service.gov.uk/)** — see below
- **PGlite** — real PostgreSQL compiled to WebAssembly, in-process, one directory

### If you fork this

The pipeline — eighteen stages, the contracts, the validation and repair loop, the
budget fitter — is copied from a private SvelteKit application, about 14,000 lines
of it plus its test suite. `docs/upstream.json` names every copied file and
records every deliberate divergence; `npm run sync:check` reports drift.

**That machinery is for the author and it does not work without the private
repository beside this one.** You can ignore it. If you change a file
`docs/upstream.json` lists, `sync:check` will tell you so — it applies each
recorded divergence and compares byte for byte — and you can simply not run
`npm run sync`, which is the thing that would overwrite your change.

`deploy/estate/` is the author's own deployment and is no use to anybody else. It
is kept, labelled, rather than deleted, because it is the working record of how
this is actually run.

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
the application it was forked from: hovering became clicking, and every diagram
ships with the same data as a table.

## Documentation

`docs/` carries the plan and a record of each phase — what was built, what broke,
and the decisions taken with their reasoning. `plan.md` is the original build
plan; `phase-18-plan.md` is the most recent, and covers standing this up
independently. `AGENTS.md` is the short list of things that will cost you an hour
if nobody says them.

## Licence

MIT. See `LICENCE`.

GOV.UK Frontend is used under the MIT Licence. Its crown, coat of arms and
typeface are not used.
