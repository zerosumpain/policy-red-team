# Phase 23 and 24a — index

The plan: `~/site-tech-debt-review-2026-09-26/policy-red-team-phase-23-plan-2026-10-05.md`
(owner-readable copy in the site Drive, Architecture folder).

Built as four parallel streams on branch `phase-23-batch`, each with its own
decision log:

| stream | log | what |
|---|---|---|
| sealed fix (23a) | commit `35fc399` | a ticked "Seal this assessment" box sent `sealed=sealed` and ran unsealed |
| plain English | `phase-23-plain.md` | newcomer writing rule, `plain` blocks, `whatItIs`, no ids in sentences |
| tokens and value | `phase-23-tokens.md` | warm-up fan-out, notes split from warnings, fewer repairs, five key judgements, value ledger |
| actor register | `phase-23-actors.md` | one master list with part-of / kind-of trees, capacity per mention, matching back in |
| landing and hub (24a) | `phase-24-landing.md` | "body" everywhere, site navigation, bodies hub, report links to body pages |

Prompt version 3.6 covers all of it (see `contracts.ts`).

**Nothing in this phase has been run against a real model.** The owner's ruling:
real runs happen at the END of the batch, after a warning, on `gpt-6-luna`, with
the baseline run on the old build (`bad0631`) and the same model, so the code's
savings are not confused with the model's. Projections in the stream logs
(≈21–22M input tokens a run against 57.5M) are estimates until then.
