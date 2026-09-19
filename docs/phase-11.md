# Phase 11 — the persona dossier

19 September 2026. The fifth of the surfaces `docs/phase-4.md` left outstanding:
*the library lists; a dossier does not open yet.*

## What only this page can answer

A dossier on a body met **once** is a profile with extra steps — the assessment
it came from says the same thing and says it in context. What a library can
answer and a single paper cannot is **what changed**: the department that was
"accountable for delivery" in one paper and "a delivery partner" in the next,
the body whose capacity was assumed sufficient here and questioned there.

So `contested()` leads the page. It compares the wording, whitespace-normalised,
and nothing cleverer — two model-written sentences meaning the same thing in
different words will read as a disagreement, which is the right way round to be
wrong. This is an invitation to look; a reader who looks and finds they agree
has lost ten seconds, where the opposite mistake hides the one thing a library is
for.

Where two or more papers recorded the same trait and matched, the page says that
too — the case where a dossier adds confidence rather than a question. That is a
positive claim and needs positive evidence, which the first version of this page
did not have: see the review below.

## A persona is context, never evidence

The rule `personas.ts` is built on, and the reason nothing on this page is
allowed to read like a finding: a dossier was drawn from other papers about
other policies, and importing its conclusions into the assessment in front of
you is the opposite of a red team. The page says so in a warning, the library
says so above its table, and the walk asserts the sentence is still there.

It is also the most sensitive thing this install holds — cross-assessment
intelligence by construction, which is why `persona_link` artefacts are withheld
from everything that leaves (phase 10) and why this page has no shareable form.

## The list was showing three of eleven fields

`listPersonas` computes the worst band any paper found for a body, how many
plays across all of them, when it was last seen, how many reader-commissioned
enquiries it carries, its aliases and its folded dossier. The page rendered
**name, kind and a count**. The figures that decide which row a reader opens
were the ones that were missing.

## A second capability with no route

`researchPersona` sat in the copied store with nothing calling it — the same
shape of defect as `resolveShare` one phase ago: tested, reachable from nowhere,
and therefore never once exercised. It now has
`POST /api/policy-analysis/personas/:id/research`.

**It spends money**, so it is said plainly beside the button rather than in a
tooltip — two model calls and a few searches — and four things gate it: the
read-only gate refuses it outright with every other mutation; it is refused for
a body profiled from a sealed or purged paper, because the check that stops a
query quoting that paper cannot run there; a token bucket brakes a runaway loop;
and the request's own abort signal is passed through so a reader who closes the
tab stops the work rather than paying for an answer nobody reads.

Deliberately not part of a run. Researching every body of every paper would spend
on bodies nobody asked about; this is a decision made against a body the reader
cares about.

## Verification

```
typecheck            clean
unit                 502 in 30 files   (30 new, across both phases)
integration          19, 1 skipped
a11y                 7 routes, one h1 each, the reflow rule in the built CSS
walk                 runs a SECOND paper so the library has a body it has met
                     twice, opens the dossier from the list, and asserts it
                     names the body, says it was seen twice, links back to both
                     papers, names the tab, and still says it is context rather
                     than evidence — axe clean
```

The second paper matters: without it the walk exercises the one case where a
dossier adds nothing.

## What the review found

Thirteen findings. The one that mattered most is about a guard that cannot fire.

**`researchPersona`'s anti-quoting guard is inert for exactly the papers it
exists to protect.** It builds a shingle corpus from the passages of the
assessments a dossier was built from and refuses any query that quotes them —
but it reads those passages without unsealing them. For a **sealed** assessment
the corpus is shingles of ciphertext, the dossier wording is plaintext, and
nothing can ever match. A second hole: a **purged** assessment leaves no
passages at all — its observation rows cascade away — while the wording it
contributed survives in `policy_personas.dossier`, which is neither sealed nor
purged with it. And `quotesDocument` fails open on an empty corpus.

The write path is upstream. **The route that made it reachable is mine**, so it
now fails closed: an enquiry is refused outright for a body profiled from a
sealed or purged paper, because the check that stops a query quoting that paper
cannot run. Worth reporting upstream alongside the two in `share.ts`.

| | also fixed |
|---|---|
| **two observations from one paper counted as two papers** | `applyPersonaLinks` keys on `(personaId, analysisId, actorId)` — the actor deliberately — so two actors resolving to the same body make two rows for one paper. That named the paper twice in "where the papers disagree", let one paper contradicting itself outrank two papers agreeing, said "seen in 1 paper" beside "seen — 2", and produced a duplicate React key |
| **agreement was claimed without evidence** | the "papers describe it consistently" note showed whenever nothing was contested — which covers papers recording DISJOINT traits and papers recording none. Now there is an `agreed()` and the claim is made only where two papers recorded the same trait and matched |
| **a dead branch promising a record never written** | `researchPersona` throws when it retrieves nothing; the "nothing usable came back, the enquiry is recorded below" branch was unreachable and its promise false |
| **any action failure destroyed the page** | `error` was both "could not load" and "the action failed", so a 429 unmounted the dossier, the plays and the research section — and a successful paid-for enquiry followed by a failing refresh lost the outcome just earned |
| **the rate limit reset instead of refilling** | the refill period equalled the bucket's GC TTL, so anyone who waited got a full bucket rather than one token. The comment claimed a ceiling four times tighter than the code. It is now described as what it is: a brake on a loop, not a quota |
| **the token was taken before the id was validated** | six requests for a persona that does not exist locked the reader out of six that do |
| **two enquiries in two tabs silently lost a fold** | `applyPersonaLinks` takes an advisory lock for this exact reason; this path took none. Serialised per owner |
| **the contested list dropped trait origin** | "the document said X" and "a model inferred Y" were presented as two equal readings, in the list that leads the page |
| **a capitalised band sank to the bottom** | `bandRank` was exact-match, so a model writing `"Severe"` put the worst play last in a table captioned "worst first" |
| **`aborted` is deprecated, and a closed tab logged a 500** | `close` now, and an `AbortError` maps to 499 so a cancellation stays out of the log that means something went wrong |
| **the live region was inserted with its content** | a region that does not exist at announcement time is not announced; it is on the page from first render and says when the enquiry starts, which is the only feedback a screen-reader user gets once the button takes `disabled` and loses focus |
| **one click destroyed a record built across several papers** | there is a confirmation step now |
| **the list's "Last seen" became untrue** | `listPersonas` computes it over every observation including enquiries, so looking a body up moved the date for a body no new paper had named. Renamed to "Last recorded", with the enquiries column beside it that phase 11 promised and did not render |

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| What leads the page | the folded dossier; what the papers disagree about | **the disagreement** | a dossier on a body met once is a profile with extra steps; the assessment says the same thing in context. What changed is the only thing a library can answer | yes |
| Comparing traits | semantically; on the wording | **the wording** | two sentences meaning the same thing will read as a disagreement, and that is the right way round to be wrong — the opposite hides the point of the feature | yes |
| `researchPersona` | leave it unreachable; wire it | **wire it** | a tested capability nothing can call is the defect phase 10 just found in `resolveShare`; it spends only on an explicit click, exactly like the submit button that already exists | yes |
| Saying it costs | a tooltip; beside the button | **beside the button** | a control that spends should say so where the finger is, not where the cursor hovers | yes |
| The rate limit | none; a bucket | **four in hand, one back every five minutes** | a brake on a stuck loop, and described as that rather than as a quota — `rate-limit.ts` forgets an idle bucket, so anyone who waits gets a full four again | yes |
| Where research sits | folded into the dossier; its own section | **its own section** | it is a third kind of thing — public sources the reader asked for, neither a paper's conclusion nor the library's fold — and `dossier()` keeps them apart | yes |

## What is still outstanding

Material and restate, whose API accepts both with nothing calling them. That is
the last of the surfaces `docs/phase-4.md` listed.
