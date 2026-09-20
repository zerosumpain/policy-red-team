# Phase 16 — a gate that asks again, and a play that survives its bookkeeping

Three changes to how a stage decides it has failed. All three come from one run:
assessment `36ebca37`, the Post-16 Education and Skills white paper, 19 September
2026. That run took **623 minutes** and produced a complete report — and
**498 of those minutes**, 80% of the wall clock, were stage 17 failing the same
assertion nine times over and then sitting dead until a human resumed it.

## What the run showed

`policy_executions` for stage 17, in order:

| attempt | minutes | calls | error |
|---|---|---|---|
| 1 | 3.6 | 1 | 2 independent challenges have no response in the revised assessment. |
| 2 | 1.2 | 2 | 1 independent challenge has no response… |
| 3 | 1.1 | 2 | 2 independent challenges… |
| 4–9 | ~1.2 each | 2 each | alternating 1 and 2 |
| 10 | 1.5 | 2 | *completed* — eight hours later, on a different model |

Three facts sit behind that table.

**The gate is all-or-nothing.** Seven challenges, five or six answered, and
`pipeline.ts` threw away a complete nineteen-finding assured report every time.
The rule two blocks above it in the same file already knows better — the report
sections have a load-bearing `coreSections` list that throws and a tail that
warns. The challenge-response rule never got that treatment.

**The repair loop was aimed at the wrong thing.** `provider.ts` gets two
corrective rounds per call, and both are about artefacts *triage rejected*. A
coverage failure is assembled after the whole stage is built and thrown from
`executeStage`, so every attempt replayed the cached `main` response, spent its
two rounds re-asking about rejected artefacts, and arrived at the same gap. The
mechanism for "here is exactly what you left out, return only that" already
exists as `repairPrompt`; it was simply never wired to coverage.

**The thing that unblocked it was a model swap.** `gpt-5.6-luna` for
`gpt-5.6-sol` at 00:10. That is luck, not a fix, and it is the reason this phase
was scoped to exclude changing the model.

The second finding is in `triageArtefacts`. Of 41 refusal warnings on the same
run, the largest single class — ten of them, all at stage 10 — is *"An
exploitation play must depend on assumptions, not on other kinds of artefact."*
That is the red team, the point of the product: 47 plays survived of 73 written.
The play named a mechanism or a claim among its `preconditions`, every id
resolved, and the whole play went in the bin for it.

## What is here

**1. A coverage top-up round.** When a stage's coverage rule finds a gap, the
stage now asks once more for exactly what is missing before it decides anything.
Two shapes, because the stages have two shapes:

- **Fan-out stages** re-dispatch the missing units. Stage 16 asks again for the
  categories that produced no challenge. No prompt change: re-running a unit is
  what the existing `attempt()` already does, with a fresh slot so identifiers
  cannot collide.
- **Single-call stages** — 15 and 17 — issue one targeted call carrying the
  identifiers of what is absent, under a key of its own so the response cache
  cannot replay the omission.

**2. Every hard gate degrades the way synthesis already does.** After the top-up,
a gate that is still short warns and lets the run finish as `completed_with_gaps`
unless the missing part is load-bearing. `requireMajority` is the existing
statement of that policy and it is what stages 15, 16 and 17 now use. A run that
answers six of seven challenges is a run with a named gap, not a dead one.

**3. A play survives a mis-typed precondition.** `semanticFault` narrows
`preconditions` and `assumptions` to the entries that really are assumptions and
keeps the artefact, exactly as the `finding` rule narrows `hypothesisIds`. It
still fails when nothing valid remains, because `preconditions` is `min(1)` and a
play resting on nothing is not a play.

## Decision log

| Fork | Options | Chosen | Why | Reversible |
|---|---|---|---|---|
| Where to apply | (a) here only, (b) here and upstream `sr-policy-analysis` | **Here only** | Upstream is live production serving `strangeramblings.com/projects/policy-analysis`. The brief named this repo. The changes are recorded as divergences and are worth reporting upstream separately. | Yes — `sync-core.mjs` carries them |
| How to edit copied files | (a) hand-edit, (b) recorded divergence | **Divergence** | `pipeline.ts` and `validation.ts` are verbatim copies. A hand edit is silently reverted by the next `node scripts/sync-core.mjs`. | n/a |
| Top-up scope | (a) every coverage rule, (b) the hard gates only | **The hard gates: 15, 16, 17** | Stages 7, 9 and 14 already use `requireMajority` or a half-coverage floor, so they warn rather than throw. The rules that throw on a single absence are the ones that end runs. | Yes |
| Top-up rounds | (a) one, (b) retry until covered | **One** | The failure mode this fixes is a *deterministic* gap — nine attempts reached the same place. One targeted ask that names the gap is a different question; asking it five times is not. | Yes |
| Stage 17 floor | (a) warn on any shortfall, (b) keep a majority floor | **Majority floor** | A revised report answering two of seven challenges has not done the job, and `requireMajority` is the phrase this codebase already uses for that judgement. | Yes |
| Salvage scope | (a) plays only, (b) every kind with a typed assumption list | **Every kind** | `exploit.preconditions` and the `assumptions` array on models, scenarios, causal chains, appraisals and evaluation plans are one rule in one `if`. Fixing one and not the others would be arbitrary. | Yes |
| Where new tests live | (a) in the copied `*.test.ts`, (b) a fork-written file | **Fork-written `coverage.test.ts`** | The copied test files are themselves verbatim; a new test in one is another divergence to maintain. Anything not in `docs/upstream.json` is fork-written and safe. | Yes |

## What this does not do

It does not batch a fan-out, split the warning channel, or add per-stage cache
telemetry — the other three findings from the same review. It does not touch the
model, the prompt for any stage that already covers its library, or the
`CONSECUTIVE_LIMIT` machinery.

And it does not make a gap invisible. Every top-up and every degraded gate writes
a warning, which is what the report's "what this run discarded" panel reads.
