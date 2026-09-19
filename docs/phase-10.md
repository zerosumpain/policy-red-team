# Phase 10 — the copy you send someone

19 September 2026. The fourth of the surfaces `docs/phase-4.md` left
outstanding, and the one `docs/plan.md` left as an open question:

> Still open: whether share links earn their place in a single-user local tool.
> The read-only view is a clean way to hand someone a report; the token is what
> is in question. Parity builds it; a later decision may retire it.

**Built, reviewed, and the token half retired the same day.** What ships is the
redaction — as a file.

## Why there is no link

The first version was the obvious one: mint a bearer-token URL, serve a redacted
copy at `/shared/<token>`, list and withdraw links. It worked, it was gated, and
a security review of it found the premise false.

**Every owner route in this service is unauthenticated, by design.** The server
binds to loopback, there is no sign-in, and everything it serves belongs to
whoever can reach the port — a decision phase 4 took deliberately and logged
(*"a local single-user tool, and a half-built login is worse than an honest
boundary"*). A share link is only useful to someone who CAN reach the host. So:

```
1. GET /api/policy-analysis  → 1 assessments: best start in life
2. GET /api/policy-analysis/<id>  → passages: 44 | cross_policy: 2
   first passage, verbatim: "Giving every child\nthe best start in lifeCP 1362"
3. the share link itself withholds 44 passage and 2 cross_policy
```

Two requests, no token needed after the first. The page promised a redaction the
deployment does not enforce, and **advertising a protection you do not have is
worse than not offering one**: a reader takes the absence of a source quote for
an assessment that never had one.

It is not fixable inside this phase. Making the link safe means authenticating
every owner route, which is the login phase 4 decided against on grounds that
have not changed.

## What ships instead

A file. `Send it to someone` offers the redacted assessment as an offline pack,
a Word file or markdown — built from `shareableReport` exactly as the link was.

A file has no hole to walk sideways out of. It needs no server, does not expire,
has nothing to revoke, and **still works for someone a Cloudflare Access policy
would turn away at the door** — which the link never could. The panel says the
trade out loud rather than implying a login:

> Send the file. There is no link to send: this service has no sign-in, so a URL
> that worked for your recipient would also let them read everything it
> withholds.

And it says the honest cost, which the link's revoke button was quietly denying:

> Once you have sent it you cannot take it back. Nothing here expires and there
> is nothing to withdraw — which is the honest shape of handing someone a
> document.

## An upstream leak, through the redactor itself

The review found a second thing, and this one survives whatever is done about the
first. **`persona_link` is not withheld.** Stage 13 mints those artefacts and
their `data` carries the merged standing dossier — `traits` updated from priors,
`continuity` (*"what this assessment adds to what was already held"*) and
`divergence` (*"where this policy's evidence CONTRADICTS the standing
dossier"*). Those priors come from the owner's **other assessments**, which is
the one thing `share.ts`'s own header says must never travel.

The file contradicts itself about it: `WITHHELD_STAGES` withholds stage 13's
*warnings* on exactly that ground, while stage 13's *output* goes in full. And
its test blesses it — `share.test.ts` asserts every kind but the two withheld
ones "carries through untouched", so it is tested-and-blessed rather than an
oversight anyone would trip over.

Measured on the real assessment: **10 such artefacts in a shared copy.**

A second upstream bug in the same file: the `fromId`/`toId` pruning is a no-op,
both branches of the ternary returning the same value, where the two lines above
prune `refs` and `sourceId` correctly. It leaks withheld identifiers rather than
content, but the function does not make the guarantee it claims.

Both are fixed here as **recorded divergences** — `scripts/sync-core.mjs` plus
`docs/upstream.json`, the fork's mechanism for a deliberate edit to a copied
file, which re-applies after every re-sync and throws if upstream moves the code
out from under it. There are twelve divergences now. Both are worth reporting
upstream, like the two found in phase 2.

## What a recipient receives

```
              owner   sent
passage          44      0
cross_policy      2      0
persona_link     10      0
withheld: [{passage: 44}, {cross_policy: 2}, {persona_link: 10}]

documentSha256 — owner: null | sent: null
a 120-char span of the paper — in the owner pack: true | in the copy sent: false
persona dossier fields in the copy sent: 0

POST /api/policy-analysis/:id/shares   → 404
GET  /api/policy-analysis/:id/shares   → 404
GET  /api/policy-analysis/shared/x     → 404
```

## Two gaps closed on the way past

`detail()` never told the client whether the server was read-only, so the
assessment page drew "Cancel this run" and "Resume the incomplete stages" in a
copy that answers 403 to both — and `/new`, which is directly addressable,
rendered a whole submission form that could only 403 on POST. The landing page
has made this argument since phase 4; the flag needed to make it elsewhere only
arrived because the share panel had to ask the same question.

And the drill returned a bare paragraph while it loaded, so the page had no `h1`
at all until the fetch resolved.

## Verification

```
typecheck            clean
unit                 473 in 28 files
integration          19, 1 skipped
a11y                 7 routes, one h1 each, the reflow rule in the built CSS
sync                 93 verbatim files, 12 diverging as recorded
walk                 downloads the copy, asserts on the PARSED payload that no
                     passage, cross-policy or persona artefact is in it, that
                     the digest is null, and that a span of the paper is absent
                     — with the owner's own pack as the control
real data            44 passages, 2 cross-policy and 10 persona dossiers
                     withheld; the retired routes all answer 404
```

**The control caught a vacuous assertion.** The first version searched the raw
pack HTML for a span of the paper — but the payload is a JSON island, so a
newline arrives as the two characters `\` `n` and the search silently matched
nothing, in the owner's pack as well as the recipient's. Asserting that the
owner's pack DOES contain what the sent one drops is what turned a green tick
into a real one.

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| The open question | retire it; build the link; build the file | **the file** | a link promises a redaction this architecture cannot enforce — two unauthenticated requests reach the whole paper. The redaction is the valuable half and a file delivers it without the hole | yes; the link costs one route if the API ever gets a front door |
| Making the link safe | authenticate the owner routes; retire the link | **retire** | that is the login phase 4 decided against, on grounds that have not changed. Half a login is worse than an honest boundary | yes |
| `persona_link` leaking | filter it in the fork; a recorded divergence | **divergence** | a second redactor is how two implementations of "what may leave this account" disagree; the fork has a mechanism for editing a copied file deliberately, and it re-applies and fails loudly | yes |
| The no-op pruning | leave it (identifiers only); fix it | **fix** | the function does not otherwise make the guarantee it claims, and the file was being diverged anyway | yes |
| Revocation | keep the row machinery; say it plainly | **say it** | a file cannot be recalled, and a withdraw button on something already sent is a comfort rather than a control | yes |

## What is still outstanding

Persona detail — the library lists, the dossier does not open — and material and
restate, whose API accepts both with nothing calling them.
