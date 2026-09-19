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

Where the papers *do* agree, the page says that too, because it is worth knowing
on its own — the case where a dossier adds confidence rather than a question.

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
tooltip — two model calls and a few searches — and three things gate it: the
read-only gate refuses it outright with every other mutation, a token bucket
allows six in a sitting refilling one every ten minutes, and the request's own
abort signal is passed through so a reader who closes the tab stops the work
rather than paying for an answer nobody reads.

Deliberately not part of a run. Researching every body of every paper would spend
on bodies nobody asked about; this is a decision made against a body the reader
cares about.

## Verification

```
typecheck            clean
unit                 484 in 29 files   (12 new, on the dossier shaping)
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

## Decision log

| Fork | Options | Chosen | Why | Reversible? |
|---|---|---|---|---|
| What leads the page | the folded dossier; what the papers disagree about | **the disagreement** | a dossier on a body met once is a profile with extra steps; the assessment says the same thing in context. What changed is the only thing a library can answer | yes |
| Comparing traits | semantically; on the wording | **the wording** | two sentences meaning the same thing will read as a disagreement, and that is the right way round to be wrong — the opposite hides the point of the feature | yes |
| `researchPersona` | leave it unreachable; wire it | **wire it** | a tested capability nothing can call is the defect phase 10 just found in `resolveShare`; it spends only on an explicit click, exactly like the submit button that already exists | yes |
| Saying it costs | a tooltip; beside the button | **beside the button** | a control that spends should say so where the finger is, not where the cursor hovers | yes |
| The rate limit | none; a bucket | **six in a sitting, refilling one per ten minutes** | enough to work through a handful of bodies in one sitting, not enough for a stuck retry loop to spend all night | yes |
| Where research sits | folded into the dossier; its own section | **its own section** | it is a third kind of thing — public sources the reader asked for, neither a paper's conclusion nor the library's fold — and `dossier()` keeps them apart | yes |

## What is still outstanding

Material and restate, whose API accepts both with nothing calling them. That is
the last of the surfaces `docs/phase-4.md` listed.
