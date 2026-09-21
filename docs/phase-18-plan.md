# Standalone and Azure-ready: the plan

## What this is for

The next deployment of Policy Red Team goes inside DfE's tenant: Azure AI Foundry for models, restricted egress, possibly no key to type and no route to openrouter.ai. The same build has to be something a stranger can clone and run. Independence here means one thing: nothing about the service's behaviour, its documentation or the artefacts it produces should depend on a machine, a domain or a subscription belonging to the author — Codex stays as one option among several, never a dependency. This plan closes that in six shippable phases and rewrites the README so the configuration story is discoverable without reading `src/lib/llm/client.ts`.

## What is already true

Do not rebuild any of this:

- **A provider registry**, one module per service — `src/lib/llm/providers/{openrouter,codex,azure}.ts`, with `POLICY_PROVIDERS` narrowing at `index.ts:34-38`.
- **An encrypted settings store** — `src/lib/server/settings-store.ts`, AES-GCM, key in a 0600 file outside the database, generic key/value table (`migrations/0002-settings.sql`), so **no new migration is needed** for anything below.
- **"Environment beats the store, always"** as a stated rule with a disabled-field UI — `src/lib/llm/client.ts:15-18`, `client/pages/Admin.tsx:365`.
- **A signed-cookie admin gate** and a real one-token connection test — `src/lib/server/admin-auth.ts`, `server/admin.ts:234-263`.
- **A hand-rolled GDS component set** including TaskList, Radios, SummaryList, ErrorSummary, Panel — `client/govuk/`.
- **A fixture build that cannot reach a provider**, plus five gates — 943 unit tests in ~15s, integration, a11y, walk, offline.

## What actually blocks an Azure-only DfE install

Ranked. Each line is a verified finding.

1. **The server never reads `.env`.** `process.loadEnvFile()` exists only at `cli.ts:26`; `server/index.ts` has none, so README:19's `cp .env.example .env` configures the CLI and nothing else.
2. **Importing undici un-proxies everything.** `transport.ts:1` imports the standalone package, whose `global.js:14-16` overwrites the dispatcher Node's own fetch reads — so `NODE_USE_ENV_PROXY=1` works in a smoke test and fails inside the service, for every provider.
3. **Azure is API-key only.** `azure.ts:43-48,67,75-81` — a resource with local auth disabled cannot be configured at all.
4. **Every call sends `max_tokens`.** `provider.ts:234`, and the connection test too (`server/admin.ts:242-246`); a reasoning deployment 400s, and the pinned `2024-10-21` (`azure.ts:102-104`) rejects the replacement field, so the api-version floor ships with the fix.
5. **Azure gets OpenRouter's 180-second deadline.** `provider.ts:50-53` reads a provider that `default-models.ts:213-224` can only resolve to `openrouter` or `codex`; the file's own table records stage-1 times of 237s and >301s.
6. **Nothing outside `/admin` is authenticated.** `server/index.ts:118-125`; the only shipped lock is a Cloudflare Access script for the wrong cloud that `docs/phase-13.md:209` records as never applied.
7. **The panel cannot be opened on a fresh install.** `admin-auth.ts:35-38,48-57` — env-only, absent closes the door, and the variable is named in no file a newcomer reads.
8. **`npm run assess` is dead.** `cli.ts:126` never awaits `modelAccessProblem()`; every headless path prints `Promise { <pending> }` and exits 2.
9. **Every Azure failure reads "could not be reached".** `provider.ts:303-308`; `server/admin.ts:260` forwards openai's literal `Connection error.` with `err.cause` discarded.
10. **No search on Azure.** `web-search.ts:38-55` — Tavily or a `grounded()` the Azure definition does not declare; the run finishes yellow saying "No sources found" twelve times.
11. **No deployment artefact.** `scripts/deploy-porkserv.sh:18-19` is an rsync to the author's second box; no Dockerfile, unit or CI anywhere.
12. **The README contradicts the code** in five places, including "There is no authentication of any kind" (:83) and "the only one that is required" (:77).

## The design

**The winner is "The First Ten Minutes": `/setup` is the existing `/admin` endpoints walked in order as a GOV.UK one-thing-per-page journey.** No second configuration system, no second store, no second auth gate.

**First run.** `npm start` loads `.env`, prints a resolved-configuration block (Node required vs found, `DATA_DIR`, `keyDir()`, which proxy and CA variables were inherited, migrations applied), and the landing payload gains `setup: { ready, problem, completedAt }`. Not ready means a banner pointing at `/setup` and a 409 on submit.

**Credentials.** `admin`/`admin` is a one-shot **claim**, not a login. It is accepted only while all of these hold: no `admin.verifier` stored, `policy_settings` holds no provider secret, no assessment exists, and either `POLICY_HOST` is loopback or `POLICY_SETUP_TOKEN`/`POLICY_ADMIN_PASSWORD` is supplied. **No cookie is issued before the new verifier is written.** The verifier is scrypt (`node:crypto`), and the cookie HMAC key is derived **from the verifier**, so rotating the password still kills every outstanding cookie — the property `admin-auth.test.ts:87` pins. `admin-auth.ts` becomes pure (`passwordMatches(candidate, credential)`), with the credential in a module variable refreshed at boot, the `refreshModelMenu()` pattern. `POLICY_ADMIN_PASSWORD` still wins and is the recovery path. To an unauthenticated caller, **unclaimed and closed look identical**. While unclaimed the product routes 503 with `{ setup: '/setup' }` — `/health` (narrowed to `{ok:true}`) and the SSE stream are exempt, because `deploy-porkserv.sh:54` smoke-tests with `/health`. Nothing anywhere keys on the request's source address; reading our own `POLICY_HOST` is reading what the operator configured, and that rule goes into `AGENTS.md`: **an address may make you stricter, never more permissive.**

| Step | Route | Asks | Skippable |
|---|---|---|---|
| Claim the install | `/setup/password` | New password, twice, 12+ | No |
| Task list | `/setup` | Nothing; status from `GET /api/admin/setup` | No |
| Who can reach it | `/setup/access` | `POLICY_ACCESS`: open / reader password / a named trusted header | No |
| Which service answers | `/setup/service` | Radios; writes `ACTIVE_PROVIDER` explicitly | No |
| Connect it | `/setup/service/:id` | Auth mode first, then only the fields it needs | No |
| Network | `/setup/network` | Read-only report; "Check the network" separates TLS, DNS, connect | Yes |
| Try the connection | `/setup/test` | One real call via `POST /api/admin/probe`, no write, no switch | No |
| Search | `/setup/search` | Tavily / grounded / none, deliberately | Yes |
| Spend | `/setup/spend` | Run token ceiling | Yes |
| Name | `/setup/name` | What the offline pack says produced it | Yes |
| Egress | `/setup/egress` | Nothing; prints the allow-list | Yes |
| Check your answers | `/setup/check` | SummaryList; server-set rows carry no Change link | No |

`/setup/import` and `/setup/export`, with `npm run config:apply` / `config:export` twins, let a tenant's own tooling write the configuration through the same keys, the same validation and the same mandatory probe. Secret fields export as set/unset flags and are never echoed back.

**Providers.** `ProviderField` gains `kind`/`options`/`showWhen` so an auth mode is a question, not four extra boxes. Azure gains four modes — API key, managed identity (IMDS), app registration, workload identity — built on the **already-vendored** `AzureOpenAI` (`node_modules/openai/azure.d.ts:6-55`) with a hand-rolled cached token fetch. **One** translation seam: a `create` wrapper inside `azure.client()`, which renames `max_tokens`, ships the api-version floor, strips OpenRouter's `reasoning` object, honours `Retry-After`, and names 401/403/404/429 and content-filter refusals as themselves. `provider.ts` stays byte-identical for all of it. It takes one edit for the deadline only: `callTimeoutMs` consults a registered per-provider value — with `longRunningTransport()` spread into Azure's client, or undici's 300s default undercuts it. `transport.ts` becomes one shared `providerTransport()` built on undici's `EnvHttpProxyAgent`, plus `setGlobalDispatcher` at module load. Every definition declares `egress: string[]`, which `build.mjs` imports instead of its own literal list. The `codex` entry is renamed `openai-compatible` with presets and a repeatable custom header (APIM wants `Ocp-Apim-Subscription-Key`), keeping `codex` as a legacy id **with a stored-key migration in the same commit**.

**We do not reorder `ALL`.** `providers()` filters and preserves `ALL`'s order, so narrowing cannot reorder anything; the DfE case is `POLICY_PROVIDERS=azure` plus an explicit `ACTIVE_PROVIDER`. Reordering would silently switch every existing install with no stored choice.

**Search** becomes three named states. `searchEngine(): {kind, why}` short-circuits on `none` with one scope sentence per run, not twelve warnings; the state is printed in `GapsBanner` and `RunProfile`. Tavily becomes store-backed through the fork-owned `keys.ts` cache (the copied `tavily.ts` is untouched). The domain allow-list goes into both the Tavily options and the grounded prompt. The grounded client gets wrapped in `instrument()` — today up to 24 research calls a run reach neither the ledger nor the spend ceiling.

**What gets cut:** the offline pack's "Produced by strangeramblings.com", the author's domain in `contracts.ts:680` (paired with the `guards.test.ts:69` substitution, or `npm test` fails), `pack-live.mjs`'s default of fetching his own assessment, the estate deploy scripts (moved to `deploy/`, labelled), the copied `default-models.ts` (fork-written; only two copied importers need it), the unlabelled cost figures in `client/measured.ts`, and a preface on `docs/plan.md`, whose §8 still says there is no settings table.

**Not doing:** `@azure/identity` (a large MSAL tree for two POSTs); Grounding with Bing (an Agents API, and external egress); Azure `catalogue()` (reverses a recorded decision, unverifiable here); routing Azure through a `codex/` prefix to win the deadline; changing the `completed_with_gaps` rule; React component tests (no jsdom — wizard logic stays pure in `src/lib/server/setup.ts`).

## The phases

**1 — Make the box configurable and the network diagnosable. (M)**
`server/index.ts` (loadEnvFile, boot report, `/health` narrowed), `transport.ts` (EnvHttpProxyAgent + global dispatcher), `server/admin.ts` (walk `err.cause`), `cli.ts:126` (the missing `await`), `scripts/doctor.mjs`, widen the vitest includes to `{src,client,server}`, add `sync:check` to `test:all`, `.nvmrc` + `engine-strict`. No copied files.
*Gate:* new transport unit test asserting the global dispatcher is proxy-aware after importing the registry; `offline-check.mjs` asserts the fixture CLI exits 0.

**2 — Azure actually works. (L)**
Field kinds; four auth modes; endpoint normalisation; the `create` wrapper; `egress[]`; `fixture-parity.test.ts`; `ENV_NAMES` parity test; `build.mjs` asserts the fixture sentinel is present. **Touches `src/lib/policy-analysis/server/provider.ts` (copied)** for `callTimeoutMs` and a 429 branch — no seam will do, because the deadline is computed inside that file from a union that cannot name Azure; it already carries a divergence and `sync-core.mjs:502-516`'s anchor begins with those exact lines. Register it.
*Gate:* a local `node:http` stand-in asserting request line, api-version, auth header, body field names, and the sentence a reader ends up with for 429 / content-filter / 404.

**3 — The door. (L)**
Pure `admin-auth.ts`, scrypt verifier, the claim rule, the reader credential, `POLICY_ACCESS`, Origin/Sec-Fetch-Site rejection on state-changing methods plus a host allow-list (multipart POST is CORS-simple today), rate-limit split, `Cache-Control: no-store`, `__Host-` prefix, `POLICY_SETTINGS_KEY_DIR`, undecryptable-row count.
*Gate:* `walk.mjs` refactored to `startServer(env)` with a second pass on a fresh unclaimed install; sentinel sweep across every secret field and every admin response.

**4 — The wizard. (L)**
The `/setup` routes, `setup.*` state in the store, `POST /api/admin/{password,probe,search,access,setup}`, import/export, `TaskList` render prop, the `ErrorSummary` refocus fix, `/setup/egress`.
*Gate:* `a11y` with every route in `ROUTES` (derived from `App.tsx`) and a JSON stub for the status endpoints; walk asserts resumption across a restart.

**5 — Search as a stated choice. (M)**
`searchEngine()`, store-backed Tavily, allow-list on both paths, grounded client instrumented, `BudgetExceeded extends PolicyError`, banner and `RunProfile` copy. The Tavily fixture module and its resolver must land **before** `api.tavily.com` joins `ENDPOINTS`, or the build fails immediately.
*Gate:* `npm run build` plus walk; `grep -c api.tavily.com dist/server-fixture.js` → 0.

**6 — Independence and the README. (M)**
Producer string and `contracts.ts`/`guards.test.ts` divergences (**three copied files, all registered in `scripts/sync-core.mjs`**), fork-written `default-models.ts`, `measured.ts` labels, `pack-live.mjs`, `deploy/` (Dockerfile, unit, nginx sample, `package-offline.sh`), docs preface, README and `.env.example`.
*Gate:* `sync:check` clean and `git status` clean after `npm run sync`; `grep -aob strangeramblings dist/server.js` → nothing.

## The README rewrite

Every currently-false statement, named so none survives: **:11-13** the privacy claim omits Tavily, the grounded query and the DNS resolution of every candidate source; **:19** `cp .env.example .env` (the server never reads it); **:23** "Nothing else to install" (three of six gates need a Chromium `npm install` does not fetch); **:63-64** `npm run cli` against a gitignored `dist/`; **:65** "421 unit, 19 integration" (it is 943); **:69** `sync:check` needs a private sibling checkout and exits 0 without it; **:73** "See `.env.example` for the full list" (six of fourteen); **:77** "the only one that is required"; **:83-85** "There is no authentication of any kind"; **:97** "OpenRouter — one key, every model"; **:103** a link to a repository the reader cannot open; **:139** phase-0…phase-5 when the repo carries phase-16. `.env.example:1` says the same thing as :77 and is equally wrong.

New sections: **What it is** · **Requirements** (Node floor; `npx playwright install chromium` for three of six gates; the running service needs none of it) · **Run it** — fixture path first · **Configure it** — wizard, then panel, then environment, with the full variable table by provider and "environment beats the store, always" · **Egress** — every host, port and direction, runtime separated from install-time (registry.npmjs.org, cdn.playwright.dev, playwright.download.prss.microsoft.com), and the explicit negative: no telemetry, no update check, no analytics, no CDN, no webfont; research hostnames are *resolved* but never fetched · **Deploying somewhere restricted** — proxy variables, `NODE_EXTRA_CA_CERTS`, the three install modes, the offline tarball · **Backing it up** — three files, three policies: the database, the settings key (lose it and every credential silently reads as unset), the sealing keys (backing them up voids the erasure guarantee) · **Upgrading** — migrations run at boot, forward-only · **If you fork this** — provenance via `docs/upstream.json`, the licence position, and that the font check is a blanket refusal of bundled fonts · **For maintainers only**.

## Decisions before this starts

**A. The claim credential off-loopback.** (a) *Recommended:* refuse `admin`/`admin` unless `POLICY_SETUP_TOKEN` or `POLICY_ADMIN_PASSWORD` is set. (b) Allow everywhere with a warning. (c) No default credential at all.

**B. The live box.** (a) *Recommended:* set `POLICY_ACCESS=password` on `policy.strangeramblings.com` in the same deploy — it is loopback-bound behind a tunnel, so the derived default leaves it as open as it is today. (b) Leave it open and say so. (c) Apply the Cloudflare Access policy instead.

**C. Entra.** (a) *Recommended:* hand-rolled token fetch, no new dependency. (b) Add `@azure/identity` now, while npmjs.com is still reachable, for federated breadth.

**D. Search for DfE.** (a) *Recommended:* ship "none, stated honestly" plus the seam; build Azure AI Search once someone is inside a tenant. (b) Build the Azure AI Search backend now against Microsoft's documentation.

## What this plan does not close

Nothing in the Azure path has ever made a real request — `providers.test.ts:49-60` asserts only `client.baseURL`, and the fixture build keeps `openai.azure.com` out of every browser gate. The local stand-in proves what we send and how we report a failure; it cannot prove Azure accepts it. The api-version floor, the Foundry endpoint families and the content-filter shapes are documented behaviour, not measured. Azure AI Search's request and response shape cannot be checked from here, so it is a seam, not a costed piece of work. Two Azure assertions reach into the SDK's private `_options`; an `openai` major bump breaks them. **There is no CI** — no `.github`, no workflow — so every gate above is a convention until something runs it. The wizard moves configuration out of the environment, which survives a redeploy, into the store, which survives only if two directories are on persistent volumes. `packages/jkai-policy-worker` stays: it is the running queue loop, and the honest fix is one README sentence.

**Rejected outright:** a bootstrap cookie signed under a public credential; leaving the unclaimed state discoverable on an unauthenticated GET; reordering `ALL`; a setup token written inside `POLICY_DATA_DIR`; an import diff that echoes secrets; two `max_tokens` translation sites; Grounding with Bing; Azure `catalogue()`; and any gate keyed on where a request says it came from.
---

## Measured on homeserv, 21 September 2026

Four of the blockers above were checked directly rather than read off the code.

**The proxy takeover is real and it is process-wide.** With
`NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:9999` (a port nothing is
listening on), a plain Node `fetch` fails with `ECONNREFUSED` — it tried the
proxy, which is correct. After a bare `await import('undici')`, the same fetch
**reaches example.com directly**. The standalone package's `global.js` installs
its own plain `Agent` as the global dispatcher, and Node's own `fetch` reads it.
`transport.ts:1` imports that package at module load, so loading the provider
registry silently un-proxies the whole process — not just Codex, and not just
the calls that spread `longRunningTransport()`.

**`npm run assess` is dead.** It builds, prints `Promise { <pending> }`, and
stops. `cli.ts:126` calls `modelAccessProblem()` without awaiting it; a Promise
is always truthy, so the guard fires on every run. The README's headline command
has never worked.

**943 unit tests in 63 files, 14.7s.** The README says 421 and AGENTS.md says
421. Both are three phases stale.

**`AzureOpenAI` is already vendored** — `node_modules/openai/azure.d.ts` carries
the client, the `AzureClientOptions` shape and an `azureADTokenProvider` hook. So
Azure endpoint handling and a bearer-token path cost no new dependency, which is
what makes decision C(a) cheap.

**Node here is v22.22.0, below this repo's own `engines` floor of 22.23.2.**
`src/lib/polyfills.ts` is why the suite still runs. An `engine-strict` setting
would have said so at install time.

---

## Decisions taken, 21 September 2026

| | Decision | Consequence |
|---|---|---|
| A | **Refuse `admin`/`admin` off-loopback** unless `POLICY_SETUP_TOKEN` or `POLICY_ADMIN_PASSWORD` is supplied | The claim is free on a laptop and gated on a server. Phase 3. |
| B | **`POLICY_ACCESS=password` on `policy.strangeramblings.com`**, set explicitly in the Ansible | The live hostname stops being readable by anyone who knows the name. Phase 3, plus one line in `~/porkserv/policy.yml`. |
| C | **Hand-rolled Entra token fetch**, no `@azure/identity` | Two cached POSTs on the `openai` package's `azureADTokenProvider` hook. Phase 2. |
| D | **Search ships as "none, stated honestly" plus the seam** | One scope sentence per run instead of twelve warnings. Azure AI Search is a seam, not a deliverable. Phase 5. |

---

## What was built, 21 September 2026

All six phases landed. Commits `f2b45b2`, `b2e0774`, `240b10f`, `f14f02c`,
`16de246`, `c8cfc39` — read in that order they are the record.

Gates went from five to eight and from 943 unit tests to 1,010:

| | |
|---|---|
| `npm run claim` | NEW. Four servers, real HTTP, no browser: the shipped credential cannot survive by any route, both gates gate, no secret comes back out |
| `npm run doctor` | NEW. What this install resolved, and `--reach` through the proxy the service itself uses |
| `npm run a11y` | routes read off `App.tsx` (6 → 14) and an API stub, so a page under audit renders instead of showing its spinner |
| `npm run sync:check` | now APPLIES each divergence and compares byte for byte, instead of waving through every file that has one |

### What the plan got wrong

**`build.mjs` was not supposed to import `egress`.** The plan said the endpoint
assertion should read the providers' declared egress instead of its own literal
list. Having read both: they answer different questions. `egress` is prose for a
network team and contains entries like "your Azure resource endpoint", which is
not a string anything can be grepped for; `ENDPOINTS` is the set of literal
substrings that must be absent from the fixture bytes. Merging them would have
quietly weakened the byte check. The endpoints were added by hand instead.

**Two bugs came from reading the SDK rather than its documentation comment**, and
either would have shipped a feature that never worked: `apiKey` and
`azureADTokenProvider` are mutually exclusive and passing both throws at
construction, and `buildRequest` pastes the deployment into the path with no
encoding at all. Neither is in the review's findings; both were found by opening
`node_modules/openai/azure.js`.

**The `.env` bug was older and wider than the review found.** The reviewers caught
that the server never loads one. They did not catch that `cli.ts`'s load has been
in the wrong position since phase 0 — a bare `try { process.loadEnvFile() }` among
the imports, which are hoisted, so it ran after `$lib/db` had frozen `DATA_DIR`.
`POLICY_DATA_DIR` in a `.env` had never once been honoured.

### What is still open

**Nothing in the Azure path has made a real request**, and this repository cannot
make one. What is asserted is what we send and how we report what comes back: the
request line, the auth mode, the parameter names, the sentence a reader ends up
with for a 429 or a content filter. Whether Azure accepts it is not knowable from
here. The api-version floor and the endpoint families are documented behaviour,
not measured.

**`default-models.ts` is still copied and still carries OpenRouter ids.** The plan
had it becoming fork-written. It was left: the ids are a MENU, already replaceable
by `POLICY_MODELS` and by the panel, and a provider that serves one model decides
for itself. Rewriting a copied file to change a default nobody is forced to use
was the wrong trade against the sync cost.

**`npm run sync` was not run.** The plan's gate was "sync:check clean and git
status clean after `npm run sync`". `sync-core.mjs` re-copies EVERYTHING, and
running it would pull every upstream change since the last sync into a commit
about configuration — which is the failure `AGENTS.md` records. The strengthened
`sync:check`, which applies each divergence and compares byte for byte, is a
stronger guarantee than the one the plan asked for and does not carry that risk.

**There is still no CI.** No `.github`, no workflow. Every gate above is a
convention until something runs it.
