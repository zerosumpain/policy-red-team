# Phase 10 — share links

19 September 2026. The fourth of the surfaces `docs/phase-4.md` left
outstanding, and the one `docs/plan.md` left as an open question:

> Still open: whether share links earn their place in a single-user local tool.
> The read-only view is a clean way to hand someone a report; the token is what
> is in question. Parity builds it; a later decision may retire it.

## The question, answered

**Built, because the redaction is the valuable half and it had no other exit.**

`shareableReport` is the one implementation of "what may leave this account" —
it withholds the policy document's own passages and any comparison with the
owner's other assessments, prunes the dead identifiers those leave behind, and
withholds the warnings belonging to the chapters it removed. That rule was
already copied, already tested, and already depended on by the offline pack's
`sharedPayload`. Until this phase **nothing could reach it**: a token could be
minted and the link went nowhere, because `resolveShare` was in the repository
and no route called it.

So the question was never really "is a bearer token useful to one person" — it
was "does the redaction ever run against anything". It does now, three ways: the
shared page, the shared Word and markdown exports, and the shared offline pack.

What the token is worth on this deployment is a separate and honest matter, and
the panel says it out loud rather than implying a login that does not exist:

> Anyone holding the link can read it. There is no sign-in behind it — the link
> is the permission, so treat it like the assessment itself and withdraw it when
> you are done.

**And a Cloudflare Access policy on the hostname will stop share links working
for anyone outside the allow-list.** That is the correct trade and it is not a
defect in either: Access protects the owner's own pages, and the price is that a
recipient cannot be handed a URL. The offline pack is the answer there — a
shared pack carries exactly what the shared page does, in one file, with nothing
to reach.

## What the link does and does not carry

Measured on the real *Best Start in Life* assessment:

```
owner: 3106 artefacts — passages 44, cross_policy 2
link:  3060 artefacts — passages  0, cross_policy 0
withheld: [{passage: 44}, {cross_policy: 2}]

a 100-character span of the paper in the shared payload:  false
the same span in the shared offline pack:                 false
the token in the owner's own listing of links:            false
a withdrawn link:                                         404
```

The token is shown **once**, at the moment it is minted, because only its hash is
stored. The panel says so — a reader who closes it expecting to find the link
again would otherwise mint a second and leave the first live.

Unknown, revoked, expired and deleted all get the same 404. A link that said
"this was revoked" would confirm the assessment exists.

## The recipient's page

It renders `<Report>`, not a second reader — the same arrangement the offline
pack uses, and for the same reason: one report that can be read two ways cannot
disagree with itself about what the assessment found. **It redacts nothing**:
that was done on the server by the one redactor, and a second pass in the
browser would be a second opinion about what may leave the account.

What it does is say what is absent, because a shared copy that reads as complete
is worse than one that names its own gaps — a reader would take a missing source
quote for an assessment that never had one.

No links into the drill. Every artefact page is an owner route that would 404 for
a link-holder, and `Report` renders a plain name when no `linkTo` is passed. **The
absence of the prop is the enforcement**, not a flag somebody has to remember.

## A gap this closed on the way past

`detail()` never told the client whether the server was read-only, so the
assessment page drew "Cancel this run" and "Resume the incomplete stages" in a
copy that answers 403 to both. The landing page has made the argument since
phase 4 — *a disabled control the reader cannot explain is worse than no control
at all* — and the flag needed to make it on this page only arrived because the
share panel had to ask the same question.

## Verification

```
typecheck            clean
unit                 472 in 28 files
integration          19, 1 skipped
a11y                 7 routes, one h1 each, the reflow rule in the built CSS
walk                 mints a link, asserts on the wire that it carries no
                     passage and no cross-policy artefact, that a span of the
                     paper does not survive into it, that the listing never
                     hands the token back, that the page says it is partial and
                     offers no owner route — then withdraws it and asserts 404
real data            3,106 artefacts: 44 passages and 2 cross-policy findings
                     withheld from the page, the documents and the pack alike
```

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| The open question | retire share links; build them | **build** | the redaction is the valuable half and had no route to it — `resolveShare` was in the repository with nothing calling it | yes, and retiring it now costs one route |
| Where the redaction happens | again in the browser; only on the server | **only the server** | one implementation of "what may leave this account"; a second is how the two disagree and a chapter goes missing from one | no, and should not be |
| The recipient's reader | a page of its own; `<Report>` | **`<Report>`** | two readers of one assessment eventually disagree about what it found | yes |
| Drill links on the shared page | a flag; omit `linkTo` | **omit the prop** | the machinery to render a link is then absent rather than guarded, which is the same argument the offline pack already won | yes |
| Failure modes | name them; one 404 | **one 404** | "this was revoked" confirms the assessment exists | no |
| Where the panel lives | its own page; beside the downloads | **beside the downloads** | a link is the fourth way of handing this to someone and they belong together; `offline` already suppresses both | yes |
| The token after minting | store it for later display; show once | **show once** | only the hash is stored, which is the right design; the panel says so rather than letting a reader discover it | no |

## What is still outstanding

Persona detail — the library lists, the dossier does not open — and material and
restate, whose API accepts both with nothing calling them.
