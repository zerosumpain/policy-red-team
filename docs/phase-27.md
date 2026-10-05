# Policy red team — phase 27 real runs on gpt-6-luna (5 October 2026)

Three runs of *Giving every child the best start in life* (same PDF, standard depth, 6 lanes), compared with the September run of the same paper on gpt-5.6-luna (`44dd5420`, phase 19 build).

| Run | Build | Documents | Outcome |
|---|---|---|---|
| 1 baseline | `bad0631` (before phases 23–26) | white paper | **Failed at step 2 of 18.** Luna refused the old one-call actor matching ("not enough output space"), 0 of 282 mentions claimed, three times |
| 2 new build | `phase-23-batch` | white paper | Finished (completed with gaps) after **three luna-only fixes** (below), resumed from the failed step each time |
| 3 grounded | `phase-23-batch` (before the step-17 split) | white paper + LA guidance (policy) + Ecorys evaluation + grant letter (grounding) | Finished first time, 58 minutes |

## Headline

- **The new build is what lets luna run at all.** The old build cannot get past actor matching on luna. The new chunked register matching passed every time.
- **Tokens fell by more than half.** Run 2 used about 23.5M input tokens once the wasted retries are taken out, against 57.5M in September; the phase 23 plan projected 21–22M. Output tokens fell from 978k to 453k, calls from 450 to 210 and repairs from 60 to 33. Steps 3 and 14, the two biggest costs, are each down about 85%.
- **A clean run takes about an hour.** Run 3 took 58 minutes; September took 142.
- **Plain English is in place.** Every scenario and key judgement now has a plain-words block, as do 11 of 13 and 17 of 18 threats. September had none. There are 5 key judgements, up from 2. Warnings fell from 257 to 92 (run 2) and 161 (run 3).
- **Main concern: far fewer live threats.** September had 46; run 2 has 8 and run 3 has 11. Luna marks 5–7 of the 12 bodies it red-teams as "no material way to beat it" and writes about one threat per remaining body; 5.6 wrote 4–5. The "cleared body" rule landed on 1 October, after the September run, so model and rule are confounded. One 5.6 run on the new build would separate them.

## Figures

| | Sept 5.6 | Run 2 luna | Run 3 luna + grounding |
|---|---|---|---|
| Input tokens | 57.5M | 26.0M (≈23.5M without the failed retries) | 34.3M |
| Of which cached | 26.4M (46%) | 2.1M (8%) | 10.3M (30%) |
| Output tokens | 978k | 453k | 645k |
| Model calls / repairs | 450 / 60 | 210 / 33 | 321 / 52 |
| Step 3 input (fan-out) | 19.6M, 151 calls | 3.0M, 23 calls | 12.5M, 50 calls |
| Step 14 input | 16.3M, 76 calls | 2.2M, 10 calls | 2.4M, 10 calls |
| Step 17 input | 3.8M, 17 calls, 66 min | 3.7M incl. two failed attempts | 0.5M, 2 calls |
| Busy time | 142 min | n/a (resumed three times) | 58 min |
| Resolved actors (s2) | 236 | 132 | 291 (two policy documents) |
| Live threats / cleared bodies | 46 / – | 8 / 5 | 11 / 7 |
| Plain blocks: threats, scenarios, key judgements | 0 / 0 / 0 | 11 of 13, 50 of 50, 5 of 5 | 17 of 18, 29 of 29, 5 of 5 |
| Assured findings / recommendations | 18 / 6 | 19 / 10 | 19 / 6 |
| Warnings | 257 | 92 | 161 |

**Cache.** Luna through the Codex bridge caches much less than 5.6 did: 8% and 30%, against 46%. So the fall in billed tokens is a little smaller than the fall in raw tokens.

**Grounding cost.** Run 3 cost about 10M input tokens more than run 2. Nearly all of the difference is step 3: the extra policy document and the grounding passages push every fan-out call to the context ceiling (about 250k tokens each, against about 130k).

## Grounding use

Run 3 created 39 grounding passages. 13 evidence rows and 4 assured findings cite them. That's real use, but modest for a 147-page evaluation. Worth a later look at whether step 6 (evidence) should be pointed at grounding more directly.

## Master actor list

- **Same paper, run again (run 2):** 132 actors resolved to 157 master entries. 112 of those were already on the list from September; 45 were new. Matching works well when the bodies have been seen before.
- **New documents (run 3):** 291 actors, 239 new entries. Most are genuinely new groups from the LA guidance and the evaluation (midwives, family hub staff, school staff). But near-duplicates get through ("Local NHS trusts" / "NHS Foundation Trust" / "Health Trusts"; "Parents of children under five" / "Parents and carers of children aged 0–5"), along with some generic junk ("Services", "Community"). All of them wait in the review queue as proposals; none was merged silently.
- **The hierarchy is hardly used.** Only 1–3 entries per run were given a parent. A next step would be a register pass that proposes `part_of` and `kind_of` links for new generic groups against existing entries.

## Fixes made during the runs (on `phase-23-batch`, local commits, not pushed)

1. **`89358b1`: step 12 asks once more for a missing core chapter.** Luna left out "high risk assumptions". Step 12 had no top-up, so each retry replayed the cached answer.
2. **`ea3986b`: steps 12, 15 and 17 send `idPrefix` before the artefacts.** Luna said it couldn't find the prefix after about 1 MB of input. Fan-out steps keep their old order so their shared cache prefix is unchanged.
3. **`6a84106`: step 17 is written in four parts.** The parts are: headline and analysis findings; appraisal and limits findings; challenge responses and key judgements; recommendations and review summary. Luna refused the one-call version twice ("too large to reproduce a complete assured replacement"). Each later part is given the IDs the earlier parts wrote, and each response is cut to its own part. The second ask now also names a missing core chapter or missing recommendations. On resume, the four parts took eight calls including repairs, with no refusals. The extra cost is roughly +0.8M input tokens per run.

Each fix has a test that reproduces the failure; it fails without the fix and passes with it. The full gate is green: 1482 unit tests plus integration, claim, a11y, walk and offline. One intermittent colour-contrast check on `/guide/3` failed once and passed on three reruns; it's a follow-up.

## Recommended next steps

1. **Find out why threats dropped.** Run the new build once on gpt-5.6-luna (about 24M tokens). If 5.6 still writes 4–5 threats per body, it's the model, and the step-10 prompt should ask luna for several plays per body explicitly. If 5.6 also clears bodies, revisit the cleared rule.
2. **Register:** propose hierarchy links, and tighten matching for generic group names.
3. **Grounding:** cap how much grounding goes into fan-out steps (step 3 especially), so a grounded run doesn't cost 45% more.
4. **Deploy:** production is still on `43febcd`. The batch (phases 23–27) is ready for a PR when you want it.

Offline packs of the three reports are in the owner Drive under `Architecture/phase-27-reports/`.
## Addendum, evening: gpt-5.6 on the new build, and what caused the drop in threats

John asked whether the fall in threats came from our token savings rather than from the model. A fourth run put the new build on gpt-5.6-luna, with the same paper and settings as run 2.

| Same new build | gpt-6-luna (run 2) | gpt-5.6-luna (check) | Sept 5.6, old build |
|---|---|---|---|
| Graph links (step 3) | 62 | 188 | 455 |
| Live threats / cleared bodies | 8 / 5 | 37 / 1 | 46 / – |
| Threats per real body | ~1 | 3–4 | 4–5 (but ~6 distinct bodies under 12 names) |
| Input tokens | ≈23.5M without retries | 30.3M (≈25M without the broken step-17 attempts) | 57.5M |

- **The model is the bigger factor.** On identical code, luna writes about a third of the graph links per call and about one threat per body, while 5.6 fills the space. Token cost is about the same on both models.
- **The token savings also played a part.** Batching step 3 thinned the graph even on 5.6, from 455 links to 188. Step 10 ranked bodies by graph links, so on luna's 62-link graph the ranking broke: Maths Hubs and the IFS took red-team slots from Parents, and luna correctly cleared both.
- **September's 46 were inflated.** About 6 distinct bodies were red-teamed under 12 duplicate names.

### Fixes after the check (local commits on `phase-23-batch`)

- **`b0a29e7`:**
  - bodies are ranked by how often the paper names them, with graph links as a tie-break;
  - step 3 is told to be exhaustive for every body;
  - step 10 asks for three to five distinct plays where a body has room;
  - prompt version 3.7.
- **`0c5292c`: a part of step 17 may cite what an earlier part wrote.** On 5.6, every recommendation was rejected for having "no supporting evidence links": the provider validated each part against its own payload only. The earlier parts now go to the validator only; they're never sent to the model or hashed. There is a new integration test through the real provider.

The 5.6 check finished after resuming step 17 on the fixed build: 10 recommendations, 5 key judgements, and plain blocks on all 38 threats.

**Next:** one luna run on the fixed build (about 24M tokens), to confirm the ranking and prompt fixes recover the threats.
