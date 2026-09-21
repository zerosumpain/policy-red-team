/**
 * The fork's copy mechanism.
 *
 * `docs/plan.md` chose a hard fork: the framework-free core is copied into this
 * repository rather than shared as a package, so a pipeline fix upstream has to
 * be applied twice. The risk that creates is silent drift — nobody can tell, six
 * months from now, which of these files still matches upstream and which was
 * edited here on purpose.
 *
 * So the copy is not a one-off `cp`. `docs/upstream.json` names every verbatim
 * file and the commit it came from, this script reproduces the copy, and
 * `--check` reports drift in three buckets: files that changed upstream, files
 * edited here, and files that have gone from upstream altogether.
 *
 *   node scripts/sync-core.mjs --check    what has drifted, changes nothing
 *   node scripts/sync-core.mjs            re-copy every verbatim file
 *   node scripts/sync-core.mjs --commit <sha>   re-copy and record a new baseline
 *
 * The upstream checkout defaults to ~/sr-policy-analysis and can be pointed
 * elsewhere with UPSTREAM=/path.
 */
import { readFile, writeFile, mkdir, cp, stat, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const UPSTREAM = process.env.UPSTREAM ?? path.join(path.dirname(ROOT), 'sr-policy-analysis');
const MANIFEST = path.join(ROOT, 'docs', 'upstream.json');

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

/** Expands a manifest entry — a file, or a directory with an exclude list — into
 *  concrete relative paths. */
async function expand(entry) {
  const rel = typeof entry === 'string' ? entry : entry.path;
  const exclude = new Set(typeof entry === 'string' ? [] : (entry.exclude ?? []));
  const abs = path.join(UPSTREAM, rel);
  const s = await stat(abs).catch(() => null);
  if (!s) return { missing: [rel], files: [] };
  if (s.isFile()) return { missing: [], files: [rel] };
  const names = await readdir(abs, { recursive: true, withFileTypes: true });
  const files = [];
  for (const d of names) {
    if (!d.isFile()) continue;
    const child = path.join(path.relative(UPSTREAM, d.parentPath ?? d.path), d.name);
    // Exclusions are written relative to the ENTRY, which is how anyone reading
    // the manifest would expect them to read: "server/access.ts" under the entry
    // "src/lib/policy-analysis". Comparing against the repo-relative path made
    // every nested exclusion silently miss.
    const within = path.relative(rel, child);
    if (exclude.has(within) || exclude.has(path.basename(child))) continue;
    files.push(child);
  }
  return { missing: [], files: files.sort() };
}

async function resolveAll(manifest) {
  const files = [];
  const missing = [];
  for (const entry of manifest.verbatim) {
    const r = await expand(entry);
    files.push(...r.files);
    missing.push(...r.missing);
  }
  return { files, missing };
}

/**
 * The deliberate edits to otherwise-verbatim files, keyed by path. Each must be
 * described in `docs/upstream.json`'s `divergences` and must actually change
 * something, so an upstream rewrite that makes one a no-op fails the sync
 * instead of passing quietly.
 */
/**
 * PHASE 16 — a gate that asks again, and a play that survives its bookkeeping.
 *
 * Three edits to copied files, all from assessment 36ebca37 (the Post-16 run of
 * 2026-09-19). Stage 17 failed NINE consecutive times on "N independent
 * challenges have no response in the revised assessment" — 498 of the run's 623
 * minutes — because the gate throws on a single absence, the retry replays the
 * cached `main` response so the omission is deterministic, and the two repair
 * rounds are aimed at artefacts triage REJECTED rather than at what was never
 * returned. It was unblocked by a change of model, which is luck, not a fix.
 *
 * So: a coverage gap is named and asked about once before any rule decides
 * (`pipeline.ts`, `prompts.ts`), and a gate still short then degrades the way the
 * synthesis rule beside it already does. Separately, `validation.ts` narrows a
 * mis-typed `preconditions` list instead of discarding the play — the largest
 * single class of refusal on that run, ten of them at stage 10, the red team.
 *
 * Generated from the working tree and verified to reproduce it exactly; see
 * `docs/phase-16.md` for the decision log. Every anchor throws if it moves, so
 * an upstream rewrite fails the sync rather than silently dropping the fix.
 */
const PHASE16 = {
  'src/lib/policy-analysis/validation.ts': [
    [` * rewritten to the document's own wording for the span it located.
 */
function semanticFault(a: Artefact, all: Map<string, Artefact>, stage: number): Fault | null {
  // An artefact that names its source and leaves \`refs\` empty is stating the same
  // link twice and recording it once. Fold it in rather than rejecting: measured`,
     ` * rewritten to the document's own wording for the span it located.
 */
function semanticFault(a: Artefact, all: Map<string, Artefact>, stage: number, note?: (what: string) => void): Fault | null {
  // An artefact that names its source and leaves \`refs\` empty is stating the same
  // link twice and recording it once. Fold it in rather than rejecting: measured`],
    [`    : null;
  if (citedAssumptions) {
    const wrongKind = citedAssumptions.filter((id) => all.get(id)?.kind !== 'assumption');
    if (wrongKind.length) return fault('hypothesis', a.kind === 'exploit'
      ? 'An exploitation play must depend on assumptions, not on other kinds of artefact.'
      : 'Interaction models and scenarios must depend on assumptions, not on other kinds of artefact.');
    for (const id of citedAssumptions) if (!a.refs.includes(id)) a.refs = [...a.refs, id];
  }
  if (a.origin === 'normative_judgement' && a.kind === 'research_source') return fault('source', 'A recommendation is not an external source.');`,
     `    : null;
  if (citedAssumptions) {
    /**
     * DIVERGENCE: NARROW THE LIST, KEEP THE ARTEFACT — the \`finding\` rule below,
     * applied one stage earlier.
     *
     * The paragraph above is right that a cited assumption missing from \`refs\` is
     * bookkeeping rather than fabrication. It then treats naming the WRONG KIND as
     * fatal, and that is the same all-or-nothing failure in the same costume: by
     * the time this runs \`prune\` has already removed every identifier that does
     * not resolve, so what is left is a real artefact of this assessment that the
     * model filed under the wrong heading. Discarding the whole play for it throws
     * away the reasoning to punish the filing.
     *
     * Measured on assessment 36ebca37, the Post-16 run of 2026-09-19: of 41
     * refusal warnings the largest single class is ten of these, every one at
     * stage 10 — the red team, the point of the assessment — and 47 plays
     * survived of 73 written.
     *
     * \`relationalFault\` already does exactly this for a finding's
     * \`hypothesisIds\`: keep the supported ones, drop the rest, refuse only when
     * nothing is left. Nothing is left is still a refusal here, because
     * \`preconditions\` and \`assumptions\` are both \`min(1)\` and a play resting on no
     * hypothesis is not a play.
     */
    const real = citedAssumptions.filter((id) => all.get(id)?.kind === 'assumption');
    if (!real.length) return fault('hypothesis', a.kind === 'exploit'
      ? 'An exploitation play must depend on assumptions, not on other kinds of artefact.'
      : 'Interaction models and scenarios must depend on assumptions, not on other kinds of artefact.');
    if (real.length !== citedAssumptions.length) {
      const field = a.kind === 'exploit' ? 'preconditions' : 'assumptions';
      const noun = field === 'preconditions' ? 'precondition' : 'assumption';
      // TWO DIFFERENT LOSSES, AND THE NOTE MUST NOT CONFUSE THEM. An id that
      // resolves to the wrong kind was mis-filed by the model. An id that
      // resolves to nothing at all is an assumption this stage QUARANTINED on an
      // earlier settle pass — \`all\` is rebuilt from the survivors each time round
      // — and saying that one "named something other than an assumption" would be
      // false: it named one, and the one it named did not survive.
      const gone = citedAssumptions.filter((id) => !all.has(id)).length;
      const misfiled = citedAssumptions.length - real.length - gone;
      a.data[field] = real;
      if (misfiled) note?.(\`“\${a.label}” dropped \${misfiled} \${noun}\${misfiled === 1 ? '' : 's'} that named something other than an assumption.\`);
      if (gone) note?.(\`“\${a.label}” dropped \${gone} \${noun}\${gone === 1 ? '' : 's'} whose assumption did not survive this stage.\`);
    }
    // EVERY CITED IDENTIFIER STILL LANDS IN \`refs\`, exactly as it did before this
    // rule narrowed anything. The model named it and it resolves, which is all a
    // reference asserts; what it is not is a hypothesis the artefact RESTS on, and
    // that is the only claim being withdrawn here. A \`prune\` on a later pass takes
    // any that stop resolving.
    for (const id of citedAssumptions) if (all.has(id) && !a.refs.includes(id)) a.refs = [...a.refs, id];
  }
  if (a.origin === 'normative_judgement' && a.kind === 'research_source') return fault('source', 'A recommendation is not an external source.');`],
    [`  const pruned: string[] = [];
  const dropWarning = (a: Artefact) => (what: string) => pruned.push(\`“\${a.label}” lost \${what}.\`);

  let kept: Artefact[] = [];`,
     `  const pruned: string[] = [];
  const dropWarning = (a: Artefact) => (what: string) => pruned.push(\`“\${a.label}” lost \${what}.\`);
  // DIVERGENCE: the same channel for a citation that resolved but was filed under
  // the wrong kind. Kept apart from \`pruned\` because the sentence it belongs in
  // is a different one: nothing here referred to something absent.
  const narrowed: string[] = [];

  let kept: Artefact[] = [];`],
    [`    for (const a of kept) all.set(a.id, a);
    const survivors = kept.filter((a) => {
      const f = semanticFault(a, all, stage) ?? relationalFault(a, all);
      if (f) { drop(a, f); return false; }
      return true;`,
     `    for (const a of kept) all.set(a.id, a);
    const survivors = kept.filter((a) => {
      const f = semanticFault(a, all, stage, (what) => narrowed.push(what)) ?? relationalFault(a, all);
      if (f) { drop(a, f); return false; }
      return true;`],
    [`  const warnings = [...parsed.warnings];
  if (pruned.length) warnings.push(\`\${pruned.length} item\${pruned.length === 1 ? '' : 's'} referred to something that is not in this assessment; the reference was dropped and the item kept. \${pruned.slice(0, 4).join(' ')}\${pruned.length > 4 ? \` And \${pruned.length - 4} more.\` : ''}\`.slice(0, 1000));
  if (rejected.length) {
    const byCode = new Map<string, Rejection[]>();`,
     `  const warnings = [...parsed.warnings];
  if (pruned.length) warnings.push(\`\${pruned.length} item\${pruned.length === 1 ? '' : 's'} referred to something that is not in this assessment; the reference was dropped and the item kept. \${pruned.slice(0, 4).join(' ')}\${pruned.length > 4 ? \` And \${pruned.length - 4} more.\` : ''}\`.slice(0, 1000));
  // DIVERGENCE: see the narrowing rule in \`semanticFault\`.
  if (narrowed.length) warnings.push(\`\${narrowed.length} item\${narrowed.length === 1 ? '' : 's'} named something real among the hypotheses \${narrowed.length === 1 ? 'it rests' : 'they rest'} on that is not an assumption record; that citation was dropped and the item kept, with the identifier retained in its provenance. \${narrowed.slice(0, 4).join(' ')}\${narrowed.length > 4 ? \` And \${narrowed.length - 4} more.\` : ''}\`.slice(0, 1000));
  if (rejected.length) {
    const byCode = new Map<string, Rejection[]>();`],
  ],
  'src/lib/policy-analysis/prompts.ts': [
    [`Keep the dossier to what TRAVELS between policies — what this body is, what its position rewards, what it can compel or block, what it does instead if it declines. This paper's own objectives, measures and timetable belong in the assessment above, not in a persona that will be read against a different policy next year.\`,
  14: \`THEORY OF CHANGE. Produce exactly one causal_chain for targetMechanismId. Reconstruct the chain from inputs through activities, outputs, outcomes and impacts. State the causal mechanism at every substantive jump, the assumptions it needs, plausible alternative explanations, possible negative pathways and indicators that would reveal whether the chain is working. Do not invent budgets, baselines or targets: say "not specified" where the paper or evidence does not supply them. Every assumption must resolve to an assumption artefact and appear in refs. Cite the target mechanism and the evidence the chain rests on. Give a qualitative judgement: well_supported, supported_with_limits, contested, provisional or unknown. This is a causal hypothesis to test, not proof that the intervention will cause the outcome.\`,
  15: \`APPRAISAL AND EVALUATION. Produce option_appraisal rows for all four option types: business_as_usual, minimum_intervention, proposed_policy and at least one alternative. Compare objective fit, social and financial costs and benefits, risks, distribution, affordability, deliverability and reversibility. Do not invent monetary values. State where comparison is impossible because the paper supplies no evidence. Also produce exactly one evaluation_plan covering process, impact and value-for-money questions, a defensible counterfactual, indicators with baselines, targets, data source, owner and cadence, decision rules and data gaps. "Not specified" is a valid and important answer. Link every option and the evaluation plan to causal chains, findings, evidence and assumptions. Use qualitative judgements only.\`,
  16: \`INDEPENDENT CHALLENGE. Act as the second analytical reviewer, separate from the analyst who produced the supplied findings. Review only targetCategory. Produce exactly one assurance_challenge. Set finding=issue when a material weakness exists, otherwise finding=cleared and explain the test that cleared it. Check the strongest relevant conclusion, not an easy example. Inspect provenance rather than trusting a citation count. Test for omitted actors or impacts, a citation that does not entail the claim, an unsupported causal leap, neglected counter-evidence, confidence stronger than the evidence, a recommendation that does not follow, or incomplete appraisal according to the assigned category. Name the target artefact IDs and cite the evidence used in refs. Do not rewrite the report and do not assume that an automated review is formal human assurance.\`,
  17: \`ASSURED SYNTHESIS. Revise the INITIAL report after reading every causal chain, option appraisal, evaluation plan and independent challenge. Produce a complete replacement set of findings with revision=assured, including all report sections where evidence permits: \${REPORT_SECTIONS.join(', ')}. Every assured finding must name the initial findings it reviewed in reviewedFindingIds, the challenges that affected it in challengeIds, a qualitative judgement, resultIds and hypothesisIds; put every one of those identifiers in refs. Produce one assurance_response for every assurance_challenge, stating accepted, partly accepted, rejected or unresolved and what changed. Preserve disagreement where it remains. Produce replacement recommendations with revision=assured and one review_summary. The server recomputes the review_summary counts and decision-use level; do not use a numerical confidence or claim formal assurance. A recommendation is a normative judgement. An automated independent challenge can support decision use, but human sign-off and specialist legal, economic or scientific review remain outside scope.\`,
};
/**`,
     `Keep the dossier to what TRAVELS between policies — what this body is, what its position rewards, what it can compel or block, what it does instead if it declines. This paper's own objectives, measures and timetable belong in the assessment above, not in a persona that will be read against a different policy next year.\`,
  14: \`THEORY OF CHANGE. Produce exactly one causal_chain for targetMechanismId. Reconstruct the chain from inputs through activities, outputs, outcomes and impacts. State the causal mechanism at every substantive jump, the assumptions it needs, plausible alternative explanations, possible negative pathways and indicators that would reveal whether the chain is working. Do not invent budgets, baselines or targets: say "not specified" where the paper or evidence does not supply them. Every assumption must resolve to an assumption artefact and appear in refs. Cite the target mechanism and the evidence the chain rests on. Give a qualitative judgement: well_supported, supported_with_limits, contested, provisional or unknown. This is a causal hypothesis to test, not proof that the intervention will cause the outcome.\`,
  15: \`APPRAISAL AND EVALUATION. Produce option_appraisal rows for all four option types: business_as_usual, minimum_intervention, proposed_policy and at least one alternative. Compare objective fit, social and financial costs and benefits, risks, distribution, affordability, deliverability and reversibility. Do not invent monetary values. State where comparison is impossible because the paper supplies no evidence. Also produce exactly one evaluation_plan covering process, impact and value-for-money questions, a defensible counterfactual, indicators with baselines, targets, data source, owner and cadence, decision rules and data gaps. "Not specified" is a valid and important answer. Link every option and the evaluation plan to causal chains, findings, evidence and assumptions. Use qualitative judgements only.

If a "coverageGap" list is supplied, this is a SECOND call about an appraisal you have already written, and the list names the option types — and possibly the evaluation plan — that your previous response omitted. Return ONLY those artefacts, one for each entry, and nothing else. Everything else you produced is already recorded and must not be restated.\`,
  16: \`INDEPENDENT CHALLENGE. Act as the second analytical reviewer, separate from the analyst who produced the supplied findings. Review only targetCategory. Produce exactly one assurance_challenge. Set finding=issue when a material weakness exists, otherwise finding=cleared and explain the test that cleared it. Check the strongest relevant conclusion, not an easy example. Inspect provenance rather than trusting a citation count. Test for omitted actors or impacts, a citation that does not entail the claim, an unsupported causal leap, neglected counter-evidence, confidence stronger than the evidence, a recommendation that does not follow, or incomplete appraisal according to the assigned category. Name the target artefact IDs and cite the evidence used in refs. Do not rewrite the report and do not assume that an automated review is formal human assurance.\`,
  17: \`ASSURED SYNTHESIS. Revise the INITIAL report after reading every causal chain, option appraisal, evaluation plan and independent challenge. Produce a complete replacement set of findings with revision=assured, including all report sections where evidence permits: \${REPORT_SECTIONS.join(', ')}. Every assured finding must name the initial findings it reviewed in reviewedFindingIds, the challenges that affected it in challengeIds, a qualitative judgement, resultIds and hypothesisIds; put every one of those identifiers in refs. Produce one assurance_response for every assurance_challenge, stating accepted, partly accepted, rejected or unresolved and what changed. Preserve disagreement where it remains. Produce replacement recommendations with revision=assured and one review_summary. The server recomputes the review_summary counts and decision-use level; do not use a numerical confidence or claim formal assurance. A recommendation is a normative judgement. An automated independent challenge can support decision use, but human sign-off and specialist legal, economic or scientific review remain outside scope.

If a "coverageGap" list is supplied, this is a SECOND call about a report you have already written, and the list names assurance_challenge identifiers that your previous response left with no assurance_response. Return ONLY the missing assurance_response artefacts — exactly one for each identifier listed — and nothing else. Do not restate the findings, the recommendations or the review summary: they are already recorded, and repeating them would replace them with duplicates. Answer each challenge on its merits; "rejected" and "unresolved" are proper answers and a disposition you cannot support is worse than an honest refusal.\`,
};
/**`],
  ],
  'src/lib/policy-analysis/pipeline.ts': [
    [`    // shared fit rather than seven times at the boundary. See sync-core.mjs.
    const assured = [...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses];
    await fanOut(ASSURANCE_CATEGORIES.map((category) => ({
      key: category,
      context: orderedContext(context, [], 'assurance', [[]], new Set(assured)),
      describe: \`\${category.replaceAll('_', ' ')} challenge\`,
      extra: { targetCategory: category, protect: assured },
    })));
  } else if (stage === 11) {
    // Failing to LOAD the comparison must not cost the assessment its stage; the`,
     `    // shared fit rather than seven times at the boundary. See sync-core.mjs.
    const assured = [...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses];
    const remit = (category: string) => ({
      key: category,
      context: orderedContext(context, [], 'assurance', [[]], new Set(assured)),
      describe: \`\${category.replaceAll('_', ' ')} challenge\`,
      extra: { targetCategory: category, protect: assured },
    });
    await fanOut(ASSURANCE_CATEGORIES.map(remit));
    /**
     * DIVERGENCE: THE FAN-OUT SHAPE OF THE SAME TOP-UP.
     *
     * A fan-out gap needs no new instruction: a unit that answered emptily, or
     * whose one artefact was quarantined, is re-run as itself. \`reserve\` hands it
     * a fresh slot, so the second attempt's identifiers cannot collide with the
     * first's, and \`attempt\` records a failure as a gap exactly as the sweep did.
     *
     * Stage 16 is the fan-out whose coverage rule throws on a SINGLE absent
     * category, which makes it the one where a silent unit ends the run. Stages 7,
     * 9 and 14 already tolerate a shortfall through \`requireMajority\` or a half
     * coverage floor, so they are left alone.
     */
    const absent = () => ASSURANCE_CATEGORIES.filter((category) =>
      !output.artefacts.some((a) => a.kind === 'assurance_challenge' && a.data.category === category));
    // No warning for the ask itself: a gap the second sweep closes is not a limit,
    // and \`requireMajority\` reports one that survives. See the note in the
    // single-call branch below.
    const missing = absent();
    if (missing.length) await fanOut(missing.map(remit));
  } else if (stage === 11) {
    // Failing to LOAD the comparison must not cost the assessment its stage; the`],
    [`    const extra = { ...(protect.length ? { protect } : {}), ...(stage === 5 ? { remainingQuestions: limits.questions } : {}) };
    await request('main', context, extra);
  }
`,
     `    const extra = { ...(protect.length ? { protect } : {}), ...(stage === 5 ? { remainingQuestions: limits.questions } : {}) };
    await request('main', context, extra);
    /**
     * DIVERGENCE: ONE MORE ASK FOR EXACTLY WHAT IS MISSING.
     *
     * The coverage rules at the bottom of this function decide whether a stage
     * did its job. When one of them finds a gap it throws, the worker records an
     * attempt, and the stage is claimed again — where \`provider.ts\` replays the
     * CACHED \`main\` response, because the payload hash has not changed. The
     * omission is therefore reproduced exactly, and the two repair rounds that
     * follow are aimed at artefacts triage REJECTED rather than at what was never
     * returned. Retrying cannot reach a different answer.
     *
     * Measured on assessment 36ebca37, the Post-16 run of 2026-09-19: stage 17
     * failed NINE consecutive times on "N independent challenges have no response
     * in the revised assessment", answering five or six of seven each time and
     * discarding a complete nineteen-finding assured report on every attempt.
     * 498 of that run's 623 minutes went on it, and what finally unblocked it was
     * a change of model — which is luck, not a mechanism.
     *
     * So the gap is named and asked about ONCE, before any rule decides. What
     * makes it a different question is the PAYLOAD: \`provider.ts\` keys its cache
     * on \`(stageId, inputHash, promptKey)\` and not on the call key, so it is
     * \`coverageGap\` and the call's own \`idPrefix\` that miss the cache where a bare
     * retry hits it. A later execution of the same stage replays both calls from
     * the cache, which is correct — it is the degraded gate below, not this, that
     * stops a stage retrying its way to the same place.
     *
     * ONE round, deliberately. A deterministic gap asked about differently is a
     * different question; asking it five times is the loop this replaces.
     *
     * This is stage 2's \`unclaimedMentions\` loop, which has done exactly this for
     * source mentions since before the fork, applied to the two stages whose
     * coverage rule can end a run over a single absence.
     */
    const gap = stage === ASSURED_SYNTHESIS_STAGE
      ? input.artefacts.filter((a) => a.kind === 'assurance_challenge')
        .filter((c) => !output.artefacts.some((a) => a.kind === 'assurance_response' && a.data.challengeId === c.id))
        .map((a) => a.id)
      : stage === APPRAISAL_STAGE
        // Mirrors the appraisal rule below. Written out rather than shared with it
        // because the two sit 120 lines apart and this is a recorded divergence:
        // a constant hoisted between them is a much larger patch to re-apply.
        ? [...['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative']
          .filter((type) => !output.artefacts.some((a) => a.kind === 'option_appraisal' && a.data.optionType === type)),
        ...(output.artefacts.some((a) => a.kind === 'evaluation_plan') ? [] : ['evaluation_plan'])]
        : [];
    if (gap.length) {
      /**
       * A RECOVERY IS NOT A LIMIT, so it writes no warning of its own.
       *
       * Every warning is carried into the later stages' context and counted on
       * the report's own account of what the run discarded. A gap that the second
       * ask CLOSED is neither: the stage is complete, and saying so would spend
       * the warning budget claiming a deficiency that no longer exists. That the
       * second call happened is on the durable record either way — \`policy_model_calls\`
       * holds it under the key \`topup\`. A gap that survives is reported by the
       * coverage rule below, which is the thing that knows it survived.
       */
      const before = output.artefacts.length;
      /**
       * A TOP-UP THAT FAILS MUST NOT CHANGE THE STAGE'S OWN VERDICT.
       *
       * \`attempt\` routes a failure through \`gap\`, which sets \`fault.last\` — and
       * the appraisal rule below throws \`fault.last?.code ?? 'coverage'\`, while
       * \`worker.ts\` treats \`budget\`, \`extraction\` and \`timeout\` as codes NOT worth
       * retrying. So a top-up that merely ran out of time would relabel the
       * stage's coverage failure as a timeout and spend two of its three attempts
       * at a stroke: an extra chance, taken, turning into a penalty. It also
       * feeds \`consecutive\`, which exists to detect a dead provider from the
       * stage's own sweep and not from a bonus call appended to it.
       *
       * So this catch is the whole of the handling. It writes no warning either:
       * the rule below reports the gap that survived, in the sentence
       * \`stage-facts.ts\` counts, and reporting it twice would put a phantom
       * "could not be assessed" beside it. The failed call itself is on the
       * durable record in \`policy_model_calls\`, with its error.
       */
      try {
        await request('topup', context, { ...extra, coverageGap: gap });
      } catch (err) {
        deps.signal.throwIfAborted();
        if (!(err instanceof PolicyError)) throw err;
      }
      /**
       * A TOP-UP CONTRIBUTES WHAT IT WAS ASKED FOR, AND WHAT THAT RESTS ON.
       *
       * The instruction says "return only the missing artefacts", and a model that
       * ignores it hands back the whole report a second time. Nothing else would
       * catch that: the identifiers carry this call's own slot so they collide
       * with nothing, and the result is a duplicate set of findings under a second
       * review summary — which the rule below then fails on, turning a stage that
       * was one response short into one that cannot finish at all.
       *
       * But the answer is not simply "the kind that answers the gap". Both these
       * stages may write an \`assumption\` (\`STAGE_KINDS\`), and both
       * \`option_appraisal.assumptions\` and an \`exploit\`'s preconditions are
       * \`min(1)\` — so a call that obeys the instruction perfectly may still have
       * to mint the hypothesis its one new row rests on. Admitting only the row
       * would strand it, and \`semanticFault\` folds a cited assumption into \`refs\`,
       * so the row would then be dropped for leaning on something absent: the one
       * thing that was missing, deleted, under a warning saying the stage already
       * held it.
       *
       * So keep what answers the gap, then close over what those rows cite from
       * this same call. A closure rather than one pass, because an
       * \`evaluation_plan\` citing an option appraisal citing a new assumption is
       * two hops, and one pass would resolve it or not depending on array order.
       */
      const wanted = new Set(gap);
      const answers = (a: Artefact) => stage === ASSURED_SYNTHESIS_STAGE
        ? a.kind === 'assurance_response' && wanted.has(String(a.data.challengeId))
        : (a.kind === 'option_appraisal' && wanted.has(String(a.data.optionType))) || (a.kind === 'evaluation_plan' && wanted.has('evaluation_plan'));
      const added = output.artefacts.slice(before);
      const byId = new Map(added.map((a) => [a.id, a]));
      const keep = new Set(added.filter(answers).map((a) => a.id));
      for (let settled = false; !settled;) {
        settled = true;
        for (const id of [...keep]) {
          for (const ref of byId.get(id)?.refs ?? []) {
            if (byId.has(ref) && !keep.has(ref)) { keep.add(ref); settled = false; }
          }
        }
      }
      const unwanted = added.filter((a) => !keep.has(a.id));
      if (unwanted.length) {
        output.artefacts = output.artefacts.filter((a) => keep.has(a.id) || !byId.has(a.id));
        output.warnings.push(\`The second call restated \${unwanted.length} item\${unwanted.length === 1 ? '' : 's'} this stage already holds; \${unwanted.length === 1 ? 'it was' : 'they were'} discarded rather than recorded twice. Only what was actually missing, and what that rests on, was taken from it.\`);
      }
    }
  }
`],
    [`    const types = new Set(output.artefacts.filter((a) => a.kind === 'option_appraisal').map((a) => String(a.data.optionType)));
    const missing = ['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative'].filter((type) => !types.has(type));
    if (missing.length || !output.artefacts.some((a) => a.kind === 'evaluation_plan')) throw new PolicyError(fault.last?.code ?? 'coverage', \`The appraisal omitted \${missing.length ? missing.join(', ').replaceAll('_', ' ') : 'the evaluation plan'}.\${fault.last ? \` Last reason: \${fault.last.message}\` : ''}\`);
  }
  if (stage === ASSURANCE_STAGE) {
    const covered = new Set(output.artefacts.filter((a) => a.kind === 'assurance_challenge').map((a) => String(a.data.category)));
    const missing = ASSURANCE_CATEGORIES.filter((category) => !covered.has(category));
    if (missing.length) throw new PolicyError(fault.last?.code ?? 'coverage', \`Independent challenge omitted \${missing.join(', ').replaceAll('_', ' ')}.\${fault.last ? \` Last reason: \${fault.last.message}\` : ''}\`);
  }
  if (stage === SYNTHESIS_STAGE || stage === ASSURED_SYNTHESIS_STAGE) {`,
     `    const types = new Set(output.artefacts.filter((a) => a.kind === 'option_appraisal').map((a) => String(a.data.optionType)));
    const missing = ['business_as_usual', 'minimum_intervention', 'proposed_policy', 'alternative'].filter((type) => !types.has(type));
    /**
     * DIVERGENCE: A LOAD-BEARING CORE THAT THROWS, AND A TAIL THAT WARNS.
     *
     * The synthesis rule below already draws this distinction — \`coreSections\`
     * against the rest — and says why in its own comment: a missing chapter is a
     * gap the reader should see named, not a reason to throw away an assessment.
     * Every other gate in this function threw on a single absence, and the one at
     * stage 17 is what cost the live run its day.
     *
     * The proposal itself and the evaluation plan are the two an appraisal cannot
     * be read without: without the first there is nothing to appraise, and without
     * the second no way to tell whether it worked. A missing counterfactual makes
     * the comparison narrower, which is a limit to report rather than a failure.
     */
    const core = missing.filter((type) => type === 'proposed_policy');
    if (core.length || !output.artefacts.some((a) => a.kind === 'evaluation_plan')) throw new PolicyError(fault.last?.code ?? 'coverage', \`The appraisal omitted \${core.length ? core.join(', ').replaceAll('_', ' ') : 'the evaluation plan'}.\${fault.last ? \` Last reason: \${fault.last.message}\` : ''}\`);
    // Phrased "N of M ... were not assessed" because that is the sentence
    // \`stage-facts.ts\` parses into a counted limit; anything else it does not
    // recognise is filed as an open QUESTION, which is a different claim. Same
    // wording \`requireMajority\` uses, including its plural for a count of one.
    if (missing.length) output.warnings.push(\`\${missing.length} of 4 policy options were not assessed: \${missing.join(', ').replaceAll('_', ' ')}. The comparison is narrower than the appraisal method asks for; read it as incomplete on those grounds.\`);
  }
  if (stage === ASSURANCE_STAGE) {
    // DIVERGENCE: the top-up above has already asked again for anything absent, so
    // what reaches here is a remit that failed twice. \`requireMajority\` is this
    // codebase's existing statement of the judgement — a fixed library is only a
    // guarantee if most of it ran, and the absences are named either way — and it
    // is what stages 7 and 9 have always used for the same shape of rule.
    requireMajority(output, ASSURANCE_CATEGORIES, (a) => String(a.data.category), 'challenge remit', fault.last);
  }
  if (stage === SYNTHESIS_STAGE || stage === ASSURED_SYNTHESIS_STAGE) {`],
    [`    const responded = new Set(responses.map((a) => String(a.data.challengeId)));
    const missing = challenges.filter((a) => !responded.has(a.id));
    if (missing.length) throw new PolicyError('coverage', \`\${missing.length} independent challenge\${missing.length === 1 ? ' has' : 's have'} no response in the revised assessment.\`);
    const summaries = output.artefacts.filter((a) => a.kind === 'review_summary');
    if (summaries.length !== 1) throw new PolicyError('coverage', 'The revised assessment must contain exactly one review summary.');`,
     `    const responded = new Set(responses.map((a) => String(a.data.challengeId)));
    const missing = challenges.filter((a) => !responded.has(a.id));
    /**
     * DIVERGENCE: THE RULE THAT COST THE LIVE RUN ITS DAY.
     *
     * Nine attempts, five or six of seven challenges answered every time, and a
     * complete nineteen-finding assured report discarded on each — see the top-up
     * comment in the single-call branch above, which now asks once for exactly
     * what is absent before this decides anything.
     *
     * What remains is the judgement itself, and it takes the shape every other
     * fixed library in this file uses: a majority is the guarantee, a shortfall is
     * a named limit. A report answering six of seven challenges is a report with
     * one open objection, which is what \`unresolvedMaterialChallenges\` below is
     * for; one answering two is a report that did not do the job.
     */
    // \`challenges.length &&\` because \`0 * 2 >= 0\` is true: a stage 17 handed no
    // challenges at all would otherwise throw "0 of 0 have no response". The rule
    // it replaces was vacuously safe there, and stage 16's own floor makes this
    // unreachable in an ordinary run — but a re-seeded or hand-built one is not
    // an ordinary run, and this is the gate that must not fail for nothing.
    if (challenges.length && missing.length * 2 >= challenges.length) throw new PolicyError('coverage', \`\${missing.length} of \${challenges.length} independent challenge\${challenges.length === 1 ? '' : 's'} \${missing.length === 1 ? 'has' : 'have'} no response in the revised assessment.\`);
    if (missing.length) output.warnings.push(\`\${missing.length} of \${challenges.length} independent challenges were not assessed: \${missing.slice(0, 6).map((a) => String(a.data.category).replaceAll('_', ' ')).join(', ')}\${missing.length > 6 ? \`, and \${missing.length - 6} more\` : ''}. They have no response in the revised assessment, after the model was asked a second time for them, so those objections stand unanswered rather than resolved.\`);
    const summaries = output.artefacts.filter((a) => a.kind === 'review_summary');
    if (summaries.length !== 1) throw new PolicyError('coverage', 'The revised assessment must contain exactly one review summary.');`],
  ],
};

/** Apply one file's phase-16 pairs in order, refusing to pass if an anchor moved. */
function phase16(rel, source) {
  let out = source;
  for (const [from, to] of PHASE16[rel]) {
    if (!out.includes(from)) throw new Error(`${rel}: a phase-16 anchor moved — see docs/phase-16.md`);
    out = out.replace(from, to);
  }
  return out;
}

/**
 * The integration suite's own safety guard, shared by every file that carries it.
 *
 * Extracted rather than duplicated: `provider.integration.test.ts` needs this AND
 * the repair-threshold pairs below, and a destructive-test guard copied into two
 * places is one that can be corrected in only one of them.
 */
const localTestGuard = (s) =>
  s.replace(
    /^const local = process\.env\.POLICY_LOCAL_TESTS === '1' && \/\^postgres.*$/m,
    `// DIVERGENCE: upstream keys this off DATABASE_URL naming its isolated
// Postgres. Here the throwaway database is a temp directory this suite created.
const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\\/db$/.test(process.env.POLICY_DATA_DIR ?? '');`
  );

const REPAIR_ASK_PROVIDER = [
    [`function callTimeoutMs(provider: string): number {
  return provider === 'codex' ? SLOW_PROVIDER_TIMEOUT_MS : CALL_TIMEOUT_MS;
}

/** Repair is worth a call when the response was mostly, or entirely, unusable. */
function needsRepair(kept: number, rejected: Rejection[]): boolean {
  if (!rejected.length) return false;
  return kept === 0 || rejected.length >= Math.max(3, Math.ceil(kept / 2));
}

/**
 * What the reader commissioned: a Codex model id, a reasoning effort — either of`,
     `function callTimeoutMs(provider: string): number {
  return provider === 'codex' ? SLOW_PROVIDER_TIMEOUT_MS : CALL_TIMEOUT_MS;
}

/**
 * Repair is worth a call when the response was mostly, or entirely, unusable —
 * and ONE ask is worth it whenever anything was rejected at all.
 *
 * The floor of three was the whole of the rule for a fan-out, and it never fired
 * for the case that actually happens. Measured on the "best start in life" run,
 * 2026-09-20: decomposition rejected artefacts on 27 of its units, and 20 of
 * those were a single artefact or two against ~22 kept. \`Math.max(3, …)\` meant
 * none of them was re-asked, so 23 of the 49 refusals were dropped without the
 * model ever being told what was wrong with them.
 *
 * A rejection is lost work, and \`repairPrompt\` names exactly which ids broke
 * which rule — the cheapest correction available. The bound is the point: a
 * handful gets ONE round, where a mostly-unusable response still gets two.
 * Phase 16's rule — ask once for exactly what was missing, then degrade rather
 * than throw — is the shape being copied. See the divergence in sync-core.mjs.
 */
function needsRepair(kept: number, rejected: Rejection[], round: number): boolean {
  if (!rejected.length) return false;
  if (kept === 0 || rejected.length >= Math.max(3, Math.ceil(kept / 2))) return true;
  return round === 0;
}

/**
 * What the reader commissioned: a Codex model id, a reasoning effort — either of`],
    [`        accepted.push(...round1.artefacts);
        warnings.push(...round1.warnings);
        await db.update(policyModelCalls).set({ status: 'completed', output: sealed ? null : output, usage: llmCalls, provider: llmCalls.at(-1)?.provider ?? null, model: llmCalls.at(-1)?.model ?? result.model, completedAt: new Date() }).where(eq(policyModelCalls.id, call.id));

        if (!needsRepair(round1.artefacts.length, rejected) || round === REPAIR_ROUNDS) {
          // An empty reply is an ANSWER, not a fault, and not evidence of a dead
          // provider — see \`isLegitimateSilence\`, which is where the rule lives.
          if (isLegitimateSilence(accepted.length, rejected, !!lastError)) return { artefacts: [], warnings };
          if (!accepted.length) throw lastError ?? new PolicyError(rejected[0]?.code ?? 'contract', rejected[0]?.reason ?? 'The model returned nothing this stage could use.');`,
     `        accepted.push(...round1.artefacts);
        warnings.push(...round1.warnings);
        await db.update(policyModelCalls).set({ status: 'completed', output: sealed ? null : output, usage: llmCalls, provider: llmCalls.at(-1)?.provider ?? null, model: llmCalls.at(-1)?.model ?? result.model, completedAt: new Date() }).where(eq(policyModelCalls.id, call.id));

        if (!needsRepair(round1.artefacts.length, rejected, round) || round === REPAIR_ROUNDS) {
          // An empty reply is an ANSWER, not a fault, and not evidence of a dead
          // provider — see \`isLegitimateSilence\`, which is where the rule lives.
          if (isLegitimateSilence(accepted.length, rejected, !!lastError)) return { artefacts: [], warnings };
          if (!accepted.length) throw lastError ?? new PolicyError(rejected[0]?.code ?? 'contract', rejected[0]?.reason ?? 'The model returned nothing this stage could use.');`],
];

const REPAIR_ASK_TEST = [
    [`      const [stage] = await db.select().from(policyStages).where(eq(policyStages.analysisId, a.id)).orderBy(asc(policyStages.ordinal)).limit(1);
      const prior = (await ingest(bytes, 'fixture.txt', 'text/plain')).artefacts;
      const input = { stage: 1, artefacts: prior, idPrefix: 's1_cached_' };
      const [firstExecution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const partial = await modelCaller(firstExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      expect(partial.artefacts).toHaveLength(3);

      const [retryExecution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const repaired = await modelCaller(retryExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      expect(repaired.artefacts).toHaveLength(4);
      expect(repaired.artefacts.some((item) => item.id === 's1_cached_objective_repaired')).toBe(true);
      expect(mock.count - before).toBe(2);
      const retryCalls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, retryExecution.id));
      expect(retryCalls).toMatchObject([{ callKey: 'cached#repair1', status: 'completed' }]);
    } finally {
      mock.repairable = false;`,
     `      const [stage] = await db.select().from(policyStages).where(eq(policyStages.analysisId, a.id)).orderBy(asc(policyStages.ordinal)).limit(1);
      const prior = (await ingest(bytes, 'fixture.txt', 'text/plain')).artefacts;
      const input = { stage: 1, artefacts: prior, idPrefix: 's1_cached_' };
      const [firstExecution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      // DIVERGENCE: the fresh call REPAIRS now. One artefact of four is rejected,
      // and the old floor of three meant a lone rejection was never re-asked —
      // this call used to return the incomplete three. It asks once and gets the
      // fourth back. See the divergence note in sync-core.mjs.
      const partial = await modelCaller(firstExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      expect(partial.artefacts).toHaveLength(4);
      // ONE round, not two: the second round is what a mostly-unusable response
      // gets, and this response was mostly fine.
      const firstCalls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, firstExecution.id)).orderBy(asc(policyModelCalls.startedAt));
      expect(firstCalls.map((c) => c.callKey)).toEqual(['cached', 'cached#repair1']);

      const [retryExecution] = await db.insert(policyExecutions).values({ stageId: stage.id, runId: stage.runId! }).returning();
      const repaired = await modelCaller(retryExecution.id, stage.runId!, new AbortController().signal, prior)(1, 'cached', input);
      expect(repaired.artefacts).toHaveLength(4);
      expect(repaired.artefacts.some((item) => item.id === 's1_cached_objective_repaired')).toBe(true);
      // Three: the fresh call's round 0 and its repair, then the replay's repair.
      // The replay still has something to fix because round 0's stored output is
      // what the cache lookup finds, and that is the reply with the bad member.
      expect(mock.count - before).toBe(3);
      const retryCalls = await db.select().from(policyModelCalls).where(eq(policyModelCalls.executionId, retryExecution.id));
      expect(retryCalls).toMatchObject([{ callKey: 'cached#repair1', status: 'completed' }]);
    } finally {
      mock.repairable = false;`],
];

const SUMMARY_GATE = [
    [`    // an ordinary run, and this is the gate that must not fail for nothing.
    if (challenges.length && missing.length * 2 >= challenges.length) throw new PolicyError('coverage', \`\${missing.length} of \${challenges.length} independent challenge\${challenges.length === 1 ? '' : 's'} \${missing.length === 1 ? 'has' : 'have'} no response in the revised assessment.\`);
    if (missing.length) output.warnings.push(\`\${missing.length} of \${challenges.length} independent challenges were not assessed: \${missing.slice(0, 6).map((a) => String(a.data.category).replaceAll('_', ' ')).join(', ')}\${missing.length > 6 ? \`, and \${missing.length - 6} more\` : ''}. They have no response in the revised assessment, after the model was asked a second time for them, so those objections stand unanswered rather than resolved.\`);
    const summaries = output.artefacts.filter((a) => a.kind === 'review_summary');
    if (summaries.length !== 1) throw new PolicyError('coverage', 'The revised assessment must contain exactly one review summary.');
    const issueIds = new Set(challenges.filter((a) => a.data.finding === 'issue').map((a) => a.id));
    const accepted = responses.filter((a) => issueIds.has(String(a.data.challengeId)) && ['accepted', 'partly_accepted'].includes(String(a.data.disposition))).length;
    const unresolved = responses.filter((a) => issueIds.has(String(a.data.challengeId)) && a.data.disposition === 'unresolved');
    const material = unresolved.filter((response) => input.artefacts.find((a) => a.id === response.data.challengeId)?.data.materiality === 'high').length;`,
     `    // an ordinary run, and this is the gate that must not fail for nothing.
    if (challenges.length && missing.length * 2 >= challenges.length) throw new PolicyError('coverage', \`\${missing.length} of \${challenges.length} independent challenge\${challenges.length === 1 ? '' : 's'} \${missing.length === 1 ? 'has' : 'have'} no response in the revised assessment.\`);
    if (missing.length) output.warnings.push(\`\${missing.length} of \${challenges.length} independent challenges were not assessed: \${missing.slice(0, 6).map((a) => String(a.data.category).replaceAll('_', ' ')).join(', ')}\${missing.length > 6 ? \`, and \${missing.length - 6} more\` : ''}. They have no response in the revised assessment, after the model was asked a second time for them, so those objections stand unanswered rather than resolved.\`);
    const summaries = output.artefacts.filter((a) => a.kind === 'review_summary');
    if (!summaries.length) throw new PolicyError('coverage', 'The revised assessment must contain a review summary, and this one has none.');
    /*
     * MORE THAN ONE IS NOT A SHORTFALL. IT IS THE CORRECTION ARRIVING TWICE.
     *
     * A corrective round answers with a whole revised assessment, its summing-up
     * included, and \`provider.ts\` accumulates the rounds — so a stage 17 that
     * needed any repair at all arrived here with two, and this rule threw. Asking
     * again could only add a third, which makes it a gate no retry can pass: the
     * corrective action is what breaks it.
     *
     * Measured on the "best start in life" run, 2026-09-20: \`main\`, \`main#repair1\`
     * and \`main#repair2\` wrote one each, three attempts failed identically, and a
     * run that had finished seventeen of eighteen stages was recorded as failed
     * for it.
     *
     * The last is the revised one; the earlier rounds are what it revises. So
     * keep it, drop what it supersedes, and say so — the same shape as the
     * challenge rule above, which phase 16 converted and left this line behind.
     */
    if (summaries.length > 1) {
      const superseded = new Set(summaries.slice(0, -1).map((a) => a.id));
      output.artefacts = output.artefacts.filter((a) => !superseded.has(a.id));
      output.warnings.push(\`The revised assessment came back with \${summaries.length} review summaries, one per corrective round. The last is kept; the earlier \${superseded.size} \${superseded.size === 1 ? 'is' : 'are'} discarded as superseded.\`);
    }
    const issueIds = new Set(challenges.filter((a) => a.data.finding === 'issue').map((a) => a.id));
    const accepted = responses.filter((a) => issueIds.has(String(a.data.challengeId)) && ['accepted', 'partly_accepted'].includes(String(a.data.disposition))).length;
    const unresolved = responses.filter((a) => issueIds.has(String(a.data.challengeId)) && a.data.disposition === 'unresolved');
    const material = unresolved.filter((response) => input.artefacts.find((a) => a.id === response.data.challengeId)?.data.materiality === 'high').length;`],
];

/*
 * THE DEADLINE A CALL IS JUDGED AGAINST, when the pipeline cannot name the
 * provider.
 *
 * `callTimeoutMs` switches on the pipeline's own `ModelProvider` union —
 * 'openrouter' or 'codex' — which records what an assessment was RUN ON and
 * knows nothing about this fork's provider registry. Anything else falls to the
 * else branch and gets OpenRouter's 180 seconds. Measured on an Azure
 * deployment: 237s at stage one, and calls over 301s. Every one was killed at
 * 180 and reported as the model being too slow, which was true of the deadline
 * and false about the model.
 *
 * Upstream's rule is left intact underneath, so an install that registers
 * nothing behaves exactly as upstream does. See
 * `src/lib/server/models/call-deadline.ts`.
 */
const PROVIDER_CALL_DEADLINE = [
  [
    `import { resolveResearchDeepModel } from '$lib/server/models/workload-settings';`,
    `import { resolveResearchDeepModel } from '$lib/server/models/workload-settings';
import { registeredCallTimeoutMs } from '$lib/server/models/call-deadline';`,
  ],
  [
    `function callTimeoutMs(provider: string): number {
  return provider === 'codex' ? SLOW_PROVIDER_TIMEOUT_MS : CALL_TIMEOUT_MS;
}`,
    `function callTimeoutMs(provider: string): number {
  // FORK DIVERGENCE. \`provider\` is the pipeline's own union — 'openrouter' or
  // 'codex' — and this fork can be configured to call services it cannot name,
  // which then fall to the else branch and are judged against OpenRouter's 180
  // seconds. Measured on an Azure deployment: 237s at stage one, and over 301s.
  // The active provider registers its own deadline; absent, upstream's rule
  // stands exactly as written. See $lib/server/models/call-deadline.
  const registered = registeredCallTimeoutMs();
  if (registered !== null) return registered;
  return provider === 'codex' ? SLOW_PROVIDER_TIMEOUT_MS : CALL_TIMEOUT_MS;
}`,
  ],
];

/*
 * THE AUTHOR'S OWN DOMAIN, OUT OF THE ARTEFACTS A DEPARTMENT WILL READ.
 *
 * Two copied files carried it and both put it in front of a reader: the offline
 * pack said "Produced by strangeramblings.com" at the bottom of every
 * assessment, and `safeSourceUrl` refused that domain as a citation. Neither is
 * wrong upstream, where the tool IS that site. Both are wrong in somebody
 * else's tenant, where the first prints a stranger's personal domain on a
 * government document and the second refuses a site nobody there has heard of
 * while happily citing the deployment's own hostname — which is what the rule
 * was for.
 *
 * `$lib/server/identity` answers both questions about THIS install.
 */
const IDENTITY_CONTRACTS = [
  [
    `import { z } from 'zod';`,
    `import { isSelfHost } from '$lib/server/identity';
import { z } from 'zod';`,
  ],
  [
    `    if (!u.hostname.includes('.') || /(^localhost$|\\.local$|\\.internal$|strangeramblings\\.com$)/i.test(u.hostname) || /^[\\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return null;`,
    `    // FORK DIVERGENCE: "the site" is whichever host THIS install is served
    // under, asked of \`$lib/server/identity\`, rather than the author's own
    // domain hard-coded. A department's deployment has never heard of that one
    // and does have a hostname of its own worth refusing.
    if (!u.hostname.includes('.') || /(^localhost$|\\.local$|\\.internal$)/i.test(u.hostname) || isSelfHost(u.hostname) || /^[\\d.]+$/.test(u.hostname) || u.hostname.includes(':')) return null;`,
  ],
];

const IDENTITY_BUNDLE = [
  [
    `import { createHash } from 'node:crypto';`,
    `import { producerName } from '$lib/server/identity';
import { createHash } from 'node:crypto';`,
  ],
  [
    `  Produced by strangeramblings.com. Nothing in this pack reports back: it makes`,
    `  Produced by \${producerName()}. Nothing in this pack reports back: it makes`,
  ],
];

const IDENTITY_GUARDS = [
  [
    `    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://127.0.0.1/', 'http://metadata.internal/', 'https://user:pw@public.example/', 'https://strangeramblings.com/admin', 'https://localhost/'])
      expect(safeSourceUrl(url)).toBeNull();
    expect(safeSourceUrl('https://www.gov.uk/guidance')).toBe('https://www.gov.uk/guidance');
  });`,
    `    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'http://127.0.0.1/', 'http://metadata.internal/', 'https://user:pw@public.example/', 'https://localhost/'])
      expect(safeSourceUrl(url)).toBeNull();
    expect(safeSourceUrl('https://www.gov.uk/guidance')).toBe('https://www.gov.uk/guidance');
  });

  /*
   * FORK DIVERGENCE. Upstream refuses \`strangeramblings.com\` by name, because
   * upstream IS that site and a citation pointing back at it is the assessment
   * citing itself. This fork asks the same question of whatever host the
   * install is actually served under, so a department's deployment refuses its
   * own hostname and has no opinion about anybody else's.
   */
  it('refuses a citation that points back at this install', () => {
    const before = process.env.POLICY_HOSTNAME;
    try {
      process.env.POLICY_HOSTNAME = 'policy.example.gov.uk';
      expect(safeSourceUrl('https://policy.example.gov.uk/admin')).toBeNull();
      expect(safeSourceUrl('https://reports.policy.example.gov.uk/x')).toBeNull();
      // And somebody else's site is still a perfectly good source.
      expect(safeSourceUrl('https://www.gov.uk/guidance')).toBe('https://www.gov.uk/guidance');
      // An install that names no hostname loses only a check it never needed:
      // a citation cannot point at a service nobody can reach.
      delete process.env.POLICY_HOSTNAME;
      expect(safeSourceUrl('https://policy.example.gov.uk/admin')).toBe('https://policy.example.gov.uk/admin');
    } finally {
      if (before === undefined) delete process.env.POLICY_HOSTNAME;
      else process.env.POLICY_HOSTNAME = before;
    }
  });`,
  ],
];

const DIVERGENCES = {
  // ── The exposure ramp had no values, so every mark painted black ─────────
  //
  // `BAND_FILL` is `var(--accent)` and three `color-mix()` steps off it, and
  // NEITHER custom property is defined anywhere in this build — `app.scss`
  // declares none and there is no tokens file. It is consumed in exactly one
  // place, `ExposurePlot.tsx`, so the `fill` was invalid and every circle fell
  // back to black: the band encoding on that plot did nothing at all, and had
  // done nothing since phase 8.
  //
  // The four values come from the phase 14 prototype and clear the system's own
  // floor: ΔE 15 against the accent, and 16.2 between adjacent steps under
  // protanopia, deuteranopia and tritanopia alike. `--error` was the obvious
  // pick for `severe` and scores 6.8, below the floor; teal reaches 10.2; a warm
  // ramp puts its middle step 8.8 from the error red, which in a product where
  // red means FAILED is the worse collision. Magenta is the one unused hue that
  // clears both, at 16.0.
  //
  // It holds on one condition worth writing down: NO STATUS COLOUR EVER ENTERS A
  // PLOT FRAME. Status is a worded tag outside the drawing; the ramp owns the
  // inside of it.
  //
  // A divergence rather than a hand edit because `view.ts` is copied, and an
  // edit to a copied file is silently reverted by the next sync. If upstream
  // ever gives these properties real values, this `.replace()` stops matching
  // and throws — which is the point.
  // ── The prompt cache reached three more fan-outs ─────────────────────────
  //
  // `orderedContext` exists because a prompt cache matches an exact leading
  // PREFIX, and it was wired into three of the nine fan-out sites. Measured on
  // the live run (36ebca37, 419 calls, 61.3M tokens): the wired stages cached
  // 67.5% and 85.1% of their input; the four that skip it cached 225,792 of
  // 10,116,528 — 2.2% — leaving 9.89M uncached input tokens, 42% of the run's
  // whole uncached input. Stage 7 read 3,584 of 2,373,405 from cache, stage 9
  // 1,792 of 1,899,464, stage 10 10,752 of 4,374,911, stage 16 209,664 of
  // 1,468,748.
  //
  // The two causes are the ones the function's own comment names. Stages 7, 9
  // and 16 hand every call an IDENTICAL context that is over `FIT_LIMIT`, so
  // `provider.ts` shed ~372,000 characters per call independently and landed
  // somewhere slightly different each time. Stage 10 orders shared-first already
  // and then defeats itself with a `protect` set naming the actor being written
  // about — exactly the failure stage 14 was rewritten to fix.
  //
  // THE FIX IS UPSTREAM'S OWN, APPLIED FOUR MORE TIMES. Stage 10 takes stage
  // 14's shape: the subject comes out of the shared block and goes in as the
  // call's own, where it is appended after the shared bytes and never shed. The
  // three whose context is entirely shared have nowhere to put their essentials,
  // so `orderedContext` gains an optional `protect` — and the distinction that
  // makes that safe is the one the original comment draws: a set that is
  // IDENTICAL on every call is one decision taken once, while a set that varies
  // per call is what moved the boundary 122 times across 144 calls.
  //
  // Concurrency bounds the prize: with six lanes the first batch can never hit,
  // so this recovers roughly half of the 9.89M rather than all of it.
  //
  // A divergence rather than a hand edit because `pipeline.ts` is copied. If
  // upstream wires these itself, or moves any of the four, a `.replace()` here
  // stops matching and the sync throws instead of quietly dropping the fix.
  'src/lib/policy-analysis/pipeline.ts': (s) => {
    let out = s.replace(
      '  const orderedContext = (shared: Artefact[], own: Artefact[], key: string, owns: Artefact[][]): Artefact[] => {',
      '  const orderedContext = (shared: Artefact[], own: Artefact[], key: string, owns: Artefact[][], protect: Set<string> = new Set()): Artefact[] => {',
    );
    out = out.replace(
      `      // \`protect\` is deliberately EMPTY. What a call is for lives in \`own\`,
      // which is appended after this block and never shed by it — so nothing a
      // call depends on can be lost to a decision taken once for every call.
      const result = fitToBudget(shared, (artefacts) => ({ artefacts }), FIT_LIMIT - allowance, new Set());`,
      `      // \`protect\` DEFAULTS TO EMPTY: what a call is for lives in \`own\`, which is
      // appended after this block and never shed by it. A fan-out whose context
      // is ENTIRELY shared has nowhere else to put its essentials, so it may pass
      // a set — one that is identical on every call, which is a single decision
      // and cannot move the shedding boundary between calls the way a per-call
      // set does. See the divergence note in scripts/sync-core.mjs.
      const result = fitToBudget(shared, (artefacts) => ({ artefacts }), FIT_LIMIT - allowance, protect);`,
    );
    // Stages 7 and 9 — interaction patterns and scenarios.
    out = out.replace(
      "    await fanOut((stage === 7 ? PATTERNS : SCENARIOS).map((key) => ({ key, context, describe:",
      `    // ONE FIT FOR THE WHOLE FAN-OUT: every call here is handed the identical
    // context, and both stages cached 0.2% without it. See sync-core.mjs.
    await fanOut((stage === 7 ? PATTERNS : SCENARIOS).map((key) => ({ key, context: orderedContext(context, [], stage === 7 ? 'patterns' : 'scenarios', [[]], new Set(hypotheses)), describe:`,
    );
    // Stage 10 — the exploitation fan-out, given stage 14's shape.
    out = out.replace(
      `    await fanOut(ranked.slice(0, limits.actors).map((actor) => ({
      key: actor.id,
      context: [...base, ...profiles.filter((p) => p.data.actorId === actor.id)],`,
      `    // STAGE 14'S SHAPE: the actor and its profiles come OUT of the shared block
    // and go in as this call's own, so a per-call \`protect\` can no longer move
    // the shedding boundary. See sync-core.mjs.
    const chosen = ranked.slice(0, limits.actors);
    const playOwns = chosen.map((actor) => [
      ...base.filter((a) => a.id === actor.id),
      ...profiles.filter((p) => p.data.actorId === actor.id),
    ]);
    await fanOut(chosen.map((actor, i) => ({
      key: actor.id,
      context: orderedContext(base.filter((a) => a.id !== actor.id), playOwns[i], 'plays', playOwns, new Set(hypotheses)),`,
    );
    // Stage 16 — the assurance challenges.
    out = out.replace(
      `    await fanOut(ASSURANCE_CATEGORIES.map((category) => ({
      key: category,
      context,
      describe: \`\${category.replaceAll('_', ' ')} challenge\`,
      extra: { targetCategory: category, protect: [...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses] },`,
      `    // The report itself, which every challenge must see whatever its remit, and
    // which is the same list for all seven — so it is protected once in the
    // shared fit rather than seven times at the boundary. See sync-core.mjs.
    const assured = [...context.filter((a) => ['finding', 'recommendation', 'causal_chain', 'option_appraisal', 'evaluation_plan', 'evidence'].includes(a.kind)).map((a) => a.id), ...hypotheses];
    await fanOut(ASSURANCE_CATEGORIES.map((category) => ({
      key: category,
      context: orderedContext(context, [], 'assurance', [[]], new Set(assured)),
      describe: \`\${category.replaceAll('_', ' ')} challenge\`,
      extra: { targetCategory: category, protect: assured },`,
    );
    if (out === s) throw new Error('pipeline.ts: the fan-out sites moved');
    // PHASE 16, applied after the cache wiring above because two of its anchors
    // are that wiring's own output.
    out = phase16('src/lib/policy-analysis/pipeline.ts', out);
    /*
     * A SURPLUS SUMMING-UP IS THE CORRECTION ARRIVING TWICE, not a shortfall.
     *
     * Applied AFTER phase16 because the line it replaces is phase16's own. A
     * corrective round answers with a whole revised assessment, summary included,
     * and `provider.ts` accumulates the rounds — so a stage 17 that needed any
     * repair arrived with two and "exactly one" threw. Asking again could only
     * add a third: a gate no retry can pass. Measured on the "best start in life"
     * run, 2026-09-20, which lost seventeen finished stages to it.
     */
    for (const [from, to] of SUMMARY_GATE) {
      if (!out.includes(from)) throw new Error('pipeline.ts: the review-summary gate anchor moved');
      out = out.replace(from, to);
    }
    return out;
  },

  // PHASE 16 — narrow a mis-typed hypothesis list rather than discarding the
  // artefact that carries it. See the header above.
  'src/lib/policy-analysis/validation.ts': (s) => phase16('src/lib/policy-analysis/validation.ts', s),

  // PHASE 16 — the stage 15 and 17 instructions learn what `coverageGap` means,
  // without which a targeted second call is just the same call again.
  'src/lib/policy-analysis/prompts.ts': (s) => phase16('src/lib/policy-analysis/prompts.ts', s),

  'src/lib/policy-analysis/view.ts': (source) =>
    source.replace(
      `export const BAND_FILL: Record<Band, string> = {
  severe: 'var(--accent)',
  significant: 'color-mix(in oklab, var(--accent) 60%, var(--bg))',
  moderate: 'color-mix(in oklab, var(--accent) 32%, var(--bg))',
  limited: 'color-mix(in oklab, var(--accent) 15%, var(--bg))',
};`,
      `export const BAND_FILL: Record<Band, string> = {
  severe: '#55163a',
  significant: '#ac2f6e',
  moderate: '#d48cb0',
  limited: '#f0d5e3',
};

/**
 * Ink that stays legible on each step. The two light steps sit below 3:1
 * against the page, so they never carry meaning alone — every mark is outlined
 * in \`text\`, sized by band, and captioned with the band's word.
 */
export const BAND_INK: Record<Band, string> = {
  severe: '#ffffff',
  significant: '#ffffff',
  moderate: '#4a1230',
  limited: '#4a1230',
};`,
    ),

  // ── Research without a Tavily account ────────────────────────────────────
  //
  // `research.ts` imports its search engine directly, so an install with no
  // `TAVILY_API_KEY` plans its research questions and answers NONE of them.
  // Measured on 2026-09-19: twelve questions, zero sources, and twelve
  // "Research unavailable … authority, freshness and jurisdiction remain
  // unverified" warnings carried forward into every stage that would have cited
  // external evidence.
  //
  // The Codex bridge has served `/v1/grounded/chat/completions` throughout — the
  // same call with web search on, against the subscription already being paid
  // for. So this fork routes `search`/`extract` through its own module, which
  // prefers Tavily wherever a key exists and falls back to the active provider's
  // grounded client otherwise.
  //
  // ONE LINE, DELIBERATELY. Everything decided lives in fork-written code
  // (`$lib/server/web-search`), which keeps the substitution trivial to
  // re-apply and means an upstream change to the research STAGE does not
  // collide with our choice of search ENGINE.
  // Upstream's own test mocks the module `research.ts` imports. Change that
  // import and the mock stops intercepting, so all eight retrieval tests call a
  // real search. Same one-line substitution, applied to the test, so upstream's
  // assertions keep running against the fork's wiring rather than being skipped:
  // they are the tests that prove instant-then-advanced escalation, bounded full
  // reads and the refusal of unsafe links, and none of that changed.
  'src/lib/policy-analysis/research.test.ts': (source) =>
    source
      .replace(
        "vi.mock('$lib/deepdive/tavily', () => ({ search: vi.fn(), extract: vi.fn() }));",
        "vi.mock('$lib/server/web-search', () => ({ search: vi.fn(), extract: vi.fn() }));",
      )
      .replace(
        "import { search, extract } from '$lib/deepdive/tavily';",
        "import { search, extract } from '$lib/server/web-search';",
      ),

  'src/lib/policy-analysis/server/research.ts': (source) =>
    source.replace(
      "import { search, extract } from '$lib/deepdive/tavily';",
      "import { search, extract } from '$lib/server/web-search';",
    ),

  // ── The redactor, and an upstream leak ───────────────────────────────────
  //
  // TWO UPSTREAM BUGS, both found by a security review of this fork's share UI
  // on 2026-09-19 and both worth reporting back.
  //
  // FIRST: `persona_link` is not withheld. Stage 13 mints those artefacts and
  // their `data` carries the MERGED standing dossier — `traits` updated from
  // priors, `continuity` ("what this assessment adds to what was already held")
  // and `divergence` ("where this policy's evidence CONTRADICTS the standing
  // dossier"). Those priors come from the owner's OTHER assessments via
  // `priorsFor`, which is the one thing `share.ts`'s own header says must never
  // travel. The file contradicts itself about it: `WITHHELD_STAGES` withholds
  // stage 13's WARNINGS on exactly that ground while its OUTPUT goes in full.
  // Measured here: 10 such artefacts in a shared copy of a real assessment.
  //
  // SECOND: the `fromId`/`toId` pruning is a no-op — both branches of the
  // ternary return the same value, where the two lines above it prune `refs`
  // and `sourceId` correctly. It leaks withheld identifiers rather than
  // content, and it means the function does not make the guarantee it claims.
  'src/lib/policy-analysis/share.ts': (s) => {
    const kinds = "export const WITHHELD_KINDS = ['passage', 'cross_policy'] as const;";
    if (!s.includes(kinds)) throw new Error('share.ts: WITHHELD_KINDS moved');
    let out = s.replace(
      kinds,
      `// DIVERGENCE: \`persona_link\` is withheld too. Its data carries the merged
// standing dossier — traits, continuity and divergence — drawn from the owner's
// OTHER assessments, which is the thing this module's own header says must not
// leave the account. Upstream withholds stage 13's warnings on that ground and
// ships its output.
export const WITHHELD_KINDS = ['passage', 'cross_policy', 'persona_link'] as const;`,
    );
    // Two plain replaces rather than one regex: the pair sits on adjacent lines
    // and a pattern spanning them is a pattern that breaks on reindentation.
    for (const field of ['fromId', 'toId']) {
      const was = `${field}: a.${field} && alive.has(a.${field}) ? a.${field} : a.${field},`;
      if (!out.includes(was)) throw new Error(`share.ts: the ${field} pruning moved, or was fixed upstream`);
      out = out.replace(was, `${field}: a.${field} && alive.has(a.${field}) ? a.${field} : null,`);
    }
    return out;
  },

  // The test pins the list it is asserting, so the divergence above needs it.
  // Everything else in the file derives from `WITHHELD_KINDS` and adapts.
  'src/lib/policy-analysis/share.test.ts': (s) => {
    const pin = "expect([...WITHHELD_KINDS]).toEqual(['passage', 'cross_policy']);";
    if (!s.includes(pin)) throw new Error('share.test.ts: the WITHHELD_KINDS assertion moved');
    return s.replace(pin, "expect([...WITHHELD_KINDS]).toEqual(['passage', 'cross_policy', 'persona_link']);");
  },

  // ── The offline pack ─────────────────────────────────────────────────────
  //
  // The pack embeds the fonts the SITE's design system sets text in — Archivo
  // Black, DM Sans, JetBrains Mono — because without them its headlines fall
  // back to Impact. This build sets text in Helvetica Neue and Arial, which are
  // on the reader's machine already, and it is not licensed to ship GDS
  // Transport. So the pack carries NO font files at all, which is both correct
  // and the same promise `scripts/a11y.mjs` enforces on the web build.
  // The author's own domain, out of the citation rule and into a question about
  // whichever host THIS install is served under. See `$lib/server/identity`.
  'src/lib/policy-analysis/contracts.ts': (s) => {
    let out = s;
    for (const [from, to] of IDENTITY_CONTRACTS) {
      if (!out.includes(from)) throw new Error('contracts.ts: an identity anchor moved');
      out = out.replace(from, to);
    }
    return out;
  },
  'src/lib/policy-analysis/guards.test.ts': (s) => {
    let out = s;
    for (const [from, to] of IDENTITY_GUARDS) {
      if (!out.includes(from)) throw new Error('guards.test.ts: the citation case moved');
      out = out.replace(from, to);
    }
    return out;
  },

  'src/lib/policy-analysis/server/bundle.ts': (s) => {
    /*
     * AND THE README DOES NOT PROMISE A DRILL-DOWN.
     *
     * "the same grids, drill-downs and stress test as the live page" is simply
     * false of a pack: `OfflineApp` passes no `linkTo`, so every artefact name
     * renders as plain text — deliberately, and its own comment says so. The pack
     * does now carry the paper itself as a readable section, which is the thing a
     * reader with no network cannot get any other way, so the sentence says that
     * instead of naming a feature that is not there.
     */
    let out = s.replace(
      'the same grids, drill-downs and stress test as the live page.',
      `the same grids and stress test as the live page, and the policy document
  itself at the end, so the report can be checked against its source.`
    );
    if (out === s) throw new Error('bundle.ts: the README blurb moved');

    const from = out.match(/const FACES: \{ file: string; family: string; weight: string \}\[\] = \[[\s\S]*?\n\];/);
    if (!from) throw new Error('bundle.ts: the FACES list moved');
    out = out.replace(
      from[0],
      `// DIVERGENCE: no embedded faces. This build sets text in the stack GOV.UK
// itself specifies off GOV.UK — Helvetica Neue and Arial — which every reader
// already has, and it may not ship GDS Transport. An empty list means the pack
// carries no font bytes and renders identically offline.
const FACES: { file: string; family: string; weight: string }[] = [];`
    );

    // AND THE AUTHOR'S DOMAIN OFF THE BOTTOM OF EVERY PACK.
    for (const [from2, to] of IDENTITY_BUNDLE) {
      if (!out.includes(from2)) throw new Error('bundle.ts: an identity anchor moved');
      out = out.replace(from2, to);
    }
    return out;
  },

  // The pack's page needs GOV.UK's shell classes or it renders on the wrong
  // background with the wrong scroll behaviour — version 6 emits no bare `body`
  // rule at all (phase 0). And the generator string named the site.
  'src/lib/policy-analysis/offline/html.ts': (s) => {
    let out = s.replace(
      '<html lang="en">',
      '<html lang="en-GB" class="govuk-template">'
    );
    out = out.replace('<body>', '<body class="govuk-template__body">');
    out = out.replace(
      'strangeramblings.com policy assessment — offline pack v',
      'Policy Red Team — offline pack v'
    );
    if (out === s) throw new Error('html.ts: the shell moved');
    return out;
  },

  // Its test asserted three embedded faces and a --font-display token, both of
  // which belong to the site's design system. The equivalent assertion here is
  // the stronger one: that NO font travels in the pack.
  'src/lib/policy-analysis/offline/pack.test.ts': (s) => {
    const from = s.match(/    expect\(shell\.css\)\.toContain\('--font-display'\);[\s\S]*?expect\(shell\.fontCss\.match\(\/url\\\(data:font\\\/woff2;base64,\/g\)\)\.toHaveLength\(3\);/);
    if (!from) throw new Error('pack.test.ts: the font assertions moved');
    return s.replace(
      from[0],
      `    // DIVERGENCE: upstream embeds three faces because its headlines fall back
    // to Impact without them. This build sets text in Helvetica Neue and Arial,
    // which the reader already has, and may not ship GDS Transport — so the
    // assertion is the opposite one, and it is a licensing guarantee as much as
    // a rendering one.
    expect(shell.fontCss).toBe('');
    expect(shell.css).not.toContain('GDS Transport');`
    );
  },

  // ── The integration suite ────────────────────────────────────────────────
  //
  // Upstream guards these destructive tests with a regex over DATABASE_URL,
  // refusing to run unless it names its isolated Postgres on port 15435. This
  // build has no connection string, so the same promise is kept by requiring the
  // data directory to be one tests/setup-integration.ts made under the system
  // temp directory. The guard is REPLACED, never removed: these tests purge and
  // delete, and pointing them at a real install must stay hard.
  ...Object.fromEntries(
    [
      'persistence.integration.test.ts',
      'personas.integration.test.ts',
      'sealed.integration.test.ts',
    ].map((name) => [`src/lib/policy-analysis/${name}`, localTestGuard]),
  ),

  // ── A lone rejection is now re-asked, once ───────────────────────────────
  //
  // `needsRepair` refused to spend a call unless three artefacts were rejected,
  // or half of what the reply kept. On a fan-out neither ever happens: measured
  // on the "best start in life" run, 2026-09-20, decomposition rejected on 27 of
  // its units and 20 of those were one artefact or two against ~22 kept, so 23 of
  // the 49 refusals were dropped without the model being told anything.
  //
  // A rejection is lost work and `repairPrompt` already names which ids broke
  // which rule. The bound is what keeps this from being a blanket retry: a
  // handful gets ONE round, a mostly-unusable reply still gets two — phase 16's
  // shape, ask once for exactly what was missing, then degrade.
  //
  // The test moves with it: its fresh call used to return the incomplete three.
  'src/lib/policy-analysis/server/provider.ts': (s) => {
    let out = s;
    for (const [from, to] of REPAIR_ASK_PROVIDER) {
      if (!out.includes(from)) throw new Error('server/provider.ts: a repair-threshold anchor moved');
      out = out.replace(from, to);
    }
    for (const [from, to] of PROVIDER_CALL_DEADLINE) {
      if (!out.includes(from)) throw new Error('server/provider.ts: a call-deadline anchor moved');
      out = out.replace(from, to);
    }
    return out;
  },
  'src/lib/policy-analysis/provider.integration.test.ts': (s) => {
    let out = localTestGuard(s);
    for (const [from, to] of REPAIR_ASK_TEST) {
      if (!out.includes(from)) throw new Error('provider.integration.test.ts: a repair-threshold anchor moved');
      out = out.replace(from, to);
    }
    return out;
  },

  // parseSubject is pure and lives in peek.ts here; the rest of upstream's
  // peek.svelte.ts is a Svelte rune store that phase 4 replaces.
  // Two of the four persistence cases drive a browser against a running preview,
  // which phase 4 builds. The first is entirely browser-driven and is skipped;
  // the second only ENDS in the browser, so its block is wrapped and every
  // database assertion around it still runs.
  'src/lib/policy-analysis/persistence.integration.test.ts': (s) => {
    let out = s.replace(
      /^const local = process\.env\.POLICY_LOCAL_TESTS === '1' && \/\^postgres.*$/m,
      `const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\\/db$/.test(process.env.POLICY_DATA_DIR ?? '');
/** Browser cases need a running preview to point at. Phase 4. */
const preview = Boolean(process.env.POLICY_PREVIEW_ORIGIN);`
    );
    out = out.replace(
      "  it('creates via browser upload,",
      "  it.skipIf(!preview)('creates via browser upload,"
    );
    const block = out.match(
      /^    const browser = await chromium\.launch\(\{ headless: true \}\);\n    try \{\n[\s\S]*?\n    \} finally \{ await browser\.close\(\); \}$/m
    );
    if (!block) throw new Error('persistence: the second browser block moved');
    const indented = block[0].split('\n').map((l) => (l ? `  ${l}` : l)).join('\n');
    out = out.replace(block[0], `    if (preview) {\n${indented}\n    }`);
    return out;
  },
  // THE MODEL PICKER. Upstream validates a commissioned model against
  // CODEX_MODELS, because on the site the picker offers subscription-funded
  // Codex models. This build reaches OpenRouter and nothing else, so it checks
  // the OpenRouter catalogue instead and asks for that provider's effort levels.
  // Without this the picker is inert: every submission degrades to null. Two
  // lines, and the reason is in docs/phase-1.md.
  'src/lib/policy-analysis/server/ingest.ts': (s) => {
    let out = s.replace(
      "import { CODEX_MODELS, toCodexModelId } from '$lib/server/models/codex-catalogue';",
      "import { isOfferedModel } from '$lib/server/models/catalogue';"
    );
    out = out.replace(
      "  const model = CODEX_MODELS.some((m) => toCodexModelId(m.slug) === askedModel) ? askedModel : null;",
      "  const model = isOfferedModel(askedModel) ? askedModel : null;"
    );
    out = out.replace(
      "  const offered = thinkingLevelsFor('codex', model);",
      "  const offered = thinkingLevelsFor('openrouter', model);"
    );
    if (out === s) throw new Error('ingest.ts: the commission block moved');
    return out;
  },
  'src/lib/policy-analysis/dashboard-shaping.test.ts': (s) =>
    s.replace("from './peek.svelte'", "from './peek'"),
  // The commissioned-model case asserts against CODEX_MODELS, which is empty
  // here. Skipped with its reasoning, not rewritten. Phase 4 restores it.
  // UPSTREAM BUG, fixed here. census.ts lists TWELVE probes and says so in its
  // own header — policy_passes was added in b2e2c06 — but this assertion and the
  // test's name still say eleven, because upstream's integration suite needs a
  // Docker Postgres and is not run in CI. Reported in docs/phase-2.md.
  'src/lib/policy-analysis/sealed.integration.test.ts': (s) =>
    s
      .replace(
        /^const local = process\.env\.POLICY_LOCAL_TESTS === '1' && \/\^postgres.*$/m,
        `const local = process.env.POLICY_LOCAL_TESTS === '1'
  && /policy-test-[^/]+\\/db$/.test(process.env.POLICY_DATA_DIR ?? '');`
      )
      .replace("purges to eleven zeroes", "purges to twelve zeroes")
      .replace("expect(probes).toHaveLength(11);", "expect(probes).toHaveLength(12);"),
  // The commissioned-model case, translated rather than skipped. Phase 1 could
  // not: the catalogue was empty and every assertion was about Codex. Now that
  // ingest.ts checks the OpenRouter catalogue, each case has a direct equivalent
  // — including the last one, because `max` is a Codex-only effort level and so
  // is still "an effort this model will not take".
  'src/lib/policy-analysis/pipeline.test.ts': (s) => {
    const replacements = [
      [
        "    const asked = base(); asked.set('model', 'codex/gpt-5.6-luna'); asked.set('thinkingLevel', 'high');\n" +
        "    expect(await read(asked)).toMatchObject({ model: 'codex/gpt-5.6-luna', thinkingLevel: 'high' });",
        "    // DIVERGENCE: OpenRouter ids, because this build has no Codex bridge and\n" +
        "    // its catalogue is src/lib/server/models/catalogue.ts. Same assertions.\n" +
        "    const asked = base(); asked.set('model', 'anthropic/claude-sonnet-4.5'); asked.set('thinkingLevel', 'high');\n" +
        "    expect(await read(asked)).toMatchObject({ model: 'anthropic/claude-sonnet-4.5', thinkingLevel: 'high' });",
      ],
      [
        "    const unknown = base(); unknown.set('model', 'codex/gpt-9-nonesuch');",
        "    const unknown = base(); unknown.set('model', 'openai/gpt-9-nonesuch');",
      ],
      [
        "    // `max` is per-model on Codex: gpt-5.5 answers it with a 400 rather than\n" +
        "    // with less thinking, so it must never reach the bridge.\n" +
        "    const tooDeep = base(); tooDeep.set('model', 'codex/gpt-5.5'); tooDeep.set('thinkingLevel', 'max');\n" +
        "    expect(await read(tooDeep)).toMatchObject({ model: 'codex/gpt-5.5', thinkingLevel: null });",
        "    // `max` and `xhigh` are Codex-only levels; OpenRouter offers off/low/medium/high.\n" +
        "    // So this is still the same case: a real model, an effort it will not take,\n" +
        "    // and the model kept while the effort falls back rather than the submission failing.\n" +
        "    const tooDeep = base(); tooDeep.set('model', 'deepseek/deepseek-v4-flash'); tooDeep.set('thinkingLevel', 'max');\n" +
        "    expect(await read(tooDeep)).toMatchObject({ model: 'deepseek/deepseek-v4-flash', thinkingLevel: null });",
      ],
    ];
    let out = s;
    for (const [from, to] of replacements) {
      if (!out.includes(from)) throw new Error('pipeline.test.ts: the commission case moved');
      out = out.replace(from, to);
    }
    return out;
  },
};

const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const mode = process.argv.includes('--check') ? 'check' : 'sync';
const commitFlag = process.argv.indexOf('--commit');
const { files, missing } = await resolveAll(manifest);

if (missing.length) {
  console.log('gone from upstream (manifest is stale):');
  for (const m of missing) console.log('  ', m);
}

const changedUpstream = [];
const editedHere = [];
const absent = [];
/** A recorded divergence whose anchors no longer match upstream. */
const brokenDivergence = [];
let identical = 0;
let expected = 0;

for (const rel of files) {
  const up = await readFile(path.join(UPSTREAM, rel)).catch(() => null);
  const here = await readFile(path.join(ROOT, rel)).catch(() => null);
  const baseline = manifest.hashes?.[rel];
  if (!up) { absent.push(rel); continue; }
  if (!here) { changedUpstream.push(rel); continue; }
  if (hash(up) === hash(here)) { identical++; continue; }
  // Both exist and differ. The baseline hash says which side moved.
  //
  // A DIVERGENT FILE IS CHECKED BY APPLYING ITS DIVERGENCE, not by being
  // excused from the comparison. This used to `continue` on the mere presence
  // of a recorded divergence, on the reasoning that such a file is expected to
  // differ and flagging it would fail --check forever. True, and it left the
  // gate blind for the nineteen files that need it most: a hand edit to
  // `pipeline.ts` or `provider.ts` — exactly what AGENTS.md says is silently
  // reverted by the next sync — passed as "diverging as recorded".
  //
  // The right question is not "is this file allowed to differ" but "is what is
  // here what the recorded divergence produces". That is the same proof
  // AGENTS.md asks for by hand after writing one, so it may as well be the
  // gate.
  const divergence = DIVERGENCES[rel];
  if (divergence) {
    let produced;
    try {
      produced = divergence(up.toString('utf8'));
    } catch (err) {
      // An anchor that no longer matches throws by design — that is how you
      // find out upstream moved the code you were patching. Report it as a
      // problem rather than letting it pass as expected.
      brokenDivergence.push(`${rel} — ${err.message}`);
      continue;
    }
    if (hash(Buffer.from(produced, 'utf8')) === hash(here)) { expected++; continue; }
    editedHere.push(`${rel} — the working tree is not what its divergence produces`);
    continue;
  }
  if (baseline && hash(here) === baseline) changedUpstream.push(rel);
  else if (baseline && hash(up) === baseline) editedHere.push(rel);
  else changedUpstream.push(rel);
}

if (mode === 'check') {
  console.log(
    `\n${files.length} verbatim files, ${identical} identical to upstream` +
      (expected ? `, ${expected} diverging as recorded` : '')
  );
  const report = (label, list) => {
    if (!list.length) return;
    console.log(`\n${label} (${list.length}):`);
    for (const f of list) console.log('  ', f);
  };
  report('changed upstream — re-copy with `node scripts/sync-core.mjs`', changedUpstream);
  report('edited here — a deliberate divergence, or a mistake', editedHere);
  report('a recorded divergence no longer applies — upstream moved the code it patches', brokenDivergence);
  report('not copied yet', absent);
  process.exit(changedUpstream.length || editedHere.length || brokenDivergence.length ? 1 : 0);
}

const hashes = {};
for (const rel of files) {
  const from = path.join(UPSTREAM, rel);
  const to = path.join(ROOT, rel);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
  hashes[rel] = hash(await readFile(from));
}
// Re-apply the recorded divergences. A copy that silently reverted them would
// make `docs/upstream.json` a description of something that is not true five
// seconds after it is written.
for (const [rel, note] of Object.entries(manifest.divergences ?? {})) {
  const edit = DIVERGENCES[rel];
  if (!edit) throw new Error(`docs/upstream.json records a divergence for ${rel} with no matching edit in sync-core.mjs`);
  const file = path.join(ROOT, rel);
  const before = await readFile(file, 'utf8');
  const after = edit(before);
  if (after === before) throw new Error(`divergence for ${rel} did not apply — upstream may have changed it: ${note}`);
  await writeFile(file, after);
  console.log(`  re-applied divergence: ${rel}`);
}

manifest.hashes = hashes;
manifest.copiedAt = new Date().toISOString().slice(0, 10);
if (commitFlag !== -1) manifest.commit = process.argv[commitFlag + 1];
await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`copied ${files.length} files from ${UPSTREAM} @ ${manifest.commit}`);
