# Phase 13 — the admin panel, and where the model calls come from

Until this phase, which service answered a model call was a compiled fact. The
key came from `OPENROUTER_API_KEY` and nothing else, so using anything else meant
editing an Ansible template and re-applying a playbook. This replaces that with a
registry of providers and one page that configures them.

## What is here

**`src/lib/llm/providers/` — one module per service.** Each exports a
`ProviderDefinition`: the fields it needs, whether each is a secret, what is
wrong with a given configuration, the client to build from it, and the models it
offers. Three exist: **OpenRouter**, **Azure AI Foundry**, and a **Codex bridge
or any other OpenAI-compatible endpoint**.

**`src/lib/llm/client.ts` still owns the seam.** `getLLMClient(ctx)` is the only
way the pipeline reaches a model and that has not changed; what changed is that
it now asks `resolveProvider()` which service is in force instead of assuming.

**`/admin`, behind the one password in this service.** It shows what is
answering calls, whether it is usable, which fields the environment has taken
over, and a button that makes one real single-token call — because *saved* is not
the same claim as *reachable*.

**`policy_settings`** (migration `0002`) holds what the panel writes. A secret is
encrypted with `encryptWith` against a key in a 0600 file outside the database,
which is the same property sealed runs already rely on: losing the key destroys
the value rather than exposing it.

## The things that decided the design

**A secret goes in and does not come out.** `GET /api/admin/config` reports
whether each secret is set — `true` or `false`, never the value. So a screenshot,
a proxy log, or a browser cache between the server and the reader carries nothing
worth having, and the page cannot show a key back even to the person who typed
it. The page says so, because a reader who expects to check a pasted key against
the original needs to know they cannot before they close the tab.

That posture has a consequence the form has to honour: **a blank secret means
"leave it alone", not "clear it"**. The box is always empty, so treating blank as
a deletion would wipe a key every time somebody edited the field beside it.

It cost a bug. The input is uncontrolled, and changing `defaultValue` on a
re-render does not clear what was typed — so after saving, the key the reader had
just pasted was still sitting in the box under a hint promising it is never shown
again. The form is now keyed on a save counter and remounts, which is the only
thing that actually empties it.

**The gate is a signed cookie, never an address check.** Behind a tunnel every
request arrives from `127.0.0.1`, so "local connections only" is a gate that
passes for the entire internet. That mistake put `/admin` on the public internet
for 33 hours on the author's main site, and this page holds credentials that
spend money.

The session is `${expires}.${hmac}` keyed by **the password itself**, so changing
the password invalidates every outstanding cookie with nothing to clean up. Sign-in
is rate limited to 8 attempts refilling at one per 30 seconds — one bucket for
everyone behind a tunnel, which is the conservative direction.

**No password means no panel, not an open one.** `adminProblem()` closes the page
when `POLICY_ADMIN_PASSWORD` is unset or under twelve characters. A service that
published its credential editor because a deployment variable was forgotten is
the exact failure this is gated against, so the missing variable fails closed.

**The environment wins, always, and the field says so.** A value in `app.env`
overrides anything the panel holds, and the input is disabled with the reason
printed rather than accepting an edit that will not take effect. The worst
version of this page is one that lets you change something and then quietly does
not.

**It does not touch `ctx.provider`.** `ModelProvider` in
`src/lib/constants/model-context.ts` is a copied type and records what an
assessment was *run on*. Which service answers is this module's business, and
keeping the two vocabularies apart is what let the whole registry exist without
adding a divergence to the sync manifest.

**The fixture build gets a registry that cannot dial out.** A provider module is
mostly the URL it calls, so the real registry fails `build.mjs`'s "cannot reach a
provider" assertion the moment it exists. `index.fixture.ts` has every shape and
every field — so the panel is exercisable by the browser walk, saving works, the
configuration round-trips — and `client()` throws. A connection test in a fixture
build therefore fails loudly and truthfully instead of quietly costing money in a
test run. The assertion now names endpoints (`openrouter.ai/api`,
`openai.azure.com`) rather than a bare domain, because the bare domain appears in
honest prose.

## Azure, specifically

Azure puts the deployment in the **path**, the API version in the **query**, and
the key in an **`api-key` header** rather than a bearer token, so the OpenAI SDK
has to be built with `baseURL`, `defaultQuery` and `defaultHeaders` all set. The
default API version is a stable GA one (`2024-10-21`), not a preview that gets
retired underneath a deployment.

An Azure deployment name is not in the model catalogue, so
`registerProviderModels` teaches `isOfferedModel` about whatever the active
provider serves. Without it `ingest.ts` reads a deployment name as unknown and
records "the configured default" for a run that named one.

## Codex, and how it leaves a shipped build

`POLICY_PROVIDERS` is a comma list of what an install offers; unset means all of
them. Shipping to anyone else is:

    policy_providers: openrouter,azure

The module stays in the source, but nothing can select or configure it and the
panel does not mention it. That is the whole removal — no code deleted, no
build variant.

**A bridge is reachable from the machine running the service, not from yours.**
`jkai-codex-bridge` binds `127.0.0.1:5207` **on homeserv**, so a Codex
configuration on the porkserv deployment will never connect, and the panel warns
about exactly this on the Codex form. Verified both ways: the provider shape
answers from homeserv in 2.9 s, and porkserv has no route to a loopback socket on
another box.

## Verification

- 533 unit tests, 19 integration tests, three browser walks — all green.
- The walk asserts, against the running service: all four admin endpoints 401
  without a session; a wrong password is refused; sign-in works; **the saved
  secret never appears in `/api/admin/config`**; the fixture build's connection
  test reports `ok: false` and says why; sign-out really signs out; and the
  secret box is empty after a save.
- Live on `policy.strangeramblings.com`: signed in, saved the OpenRouter key
  **through the panel**, and the connection test made a real call —
  `deepseek/deepseek-v4-flash` in 1,572 ms. That is the first time this service
  has reached a model.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| What guards the panel | nothing (Access only); password on the panel; password on everything | **password on the panel only** | Access is not configured yet and is not something this repo can add; the page that holds credentials cannot wait for it, and the rest of the service has nothing worth a password | yes |
| Where the secret lives | the database in clear; the environment only; encrypted in the database | **encrypted, key in a 0600 file outside the DB** | a database copy is not a credential leak, and it is the property sealed runs already have | yes |
| Secret in the config response | masked (`sk-or-…xyz`); omitted; a boolean | **a boolean** | a mask is still a leak once you have two of them, and "is one set" is the only question the page actually asks | yes |
| Blank secret on submit | clears it; leaves it alone | **leaves it alone** | the box is always empty, so blank cannot mean deletion without wiping a key on every neighbouring edit | yes |
| Clearing the typed secret | `form.reset()` after save; controlled input; remount on a save counter | **remount** | reset races the parent's re-render, and a controlled secret puts the value back in React state, which is the thing this page exists not to do | yes |
| Env vs panel precedence | panel wins; environment wins | **environment wins** | a deployment managed by Ansible keeps doing what its files say, and nobody has to work out which of two sources is live | yes |
| `POLICY_PROVIDERS` unknown names | reject; ignore | **ignore** | a typo in a deployment variable should not take the service down, and the panel shows what is actually offered | yes |
| A failed connection test | 500; 200 with `ok: false` | **200 with `ok: false`** | a failed connection test is a successful test; the message from the service is the useful half and an error page throws it away | yes |
| Removing Codex for a ship | delete the module; a build flag; an allow-list | **the allow-list** | deleting it loses the work, and a build flag makes two artefacts to test; the list is one line in `app.env` | yes |
| `OPENROUTER_API_KEY` in `app.env` | keep it pinned; let the panel own it | **the panel owns it** (`policy_pin_openrouter: true` restores the pin) | a panel that cannot edit the one credential the install uses is a panel for nothing | yes |

## What this does not close

**No real assessment has ever completed.** Every gate here runs against a
deterministic fixture, which proves the machinery and proves nothing about the
quality of the analysis. The install can now reach a model, which is the thing
that was missing.

**`policy.strangeramblings.com` still has no Cloudflare Access policy.** The
admin panel is behind a password; everything else on that hostname is open to
anyone who knows the name. That lock is not something this repository can add.
