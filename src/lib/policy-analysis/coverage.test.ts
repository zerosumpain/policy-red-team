// Phase 16 — a gate that asks again, and a play that survives its bookkeeping.
//
// Every case here is one of the two ways assessment 36ebca37 — the Post-16
// Education and Skills run of 19 September 2026 — wasted its day.
//
// Stage 17 failed NINE consecutive times on "N independent challenges have no
// response in the revised assessment", each attempt replaying the same cached
// `main` call and spending its two repair rounds on artefacts triage had
// rejected rather than on the responses that were missing. 498 of the run's 623
// minutes went that way, and the thing that finally unblocked it was a change of
// model. A complete nineteen-finding assured report was thrown away each time.
//
// And of 41 refusal warnings on the same run, the largest single class — ten of
// them, all at stage 10 — is "An exploitation play must depend on assumptions,
// not on other kinds of artefact". 47 plays survived of 73 written.
//
// FORK-WRITTEN, deliberately. `pipeline.test.ts` and `resilience.test.ts` are
// verbatim copies of upstream's; a new case in one of those is another
// divergence for `scripts/sync-core.mjs` to carry. Anything absent from
// `docs/upstream.json` is this build's own and needs no such bookkeeping.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artefact, ASSURANCE_CATEGORIES, ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, APPRAISAL_STAGE, type Artefact, type StageInput } from './contracts';
import { PolicyError, triageArtefacts } from './validation';
import { executeStage } from './pipeline';
import { ingest } from './server/ingest';
import { stageFacts } from './stage-facts';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

const signal = new AbortController().signal;
const research = async () => ({ artefacts: [], warnings: [] });
const none = async () => [];
const base = (stage: number, artefacts: Artefact[]): StageInput =>
  ({ stage, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts });

/**
 * Everything stages 16 and 17 are handed, built by running the pipeline on the
 * fixture model. Slow enough to be worth doing once and sharing.
 */
let cached: Artefact[] | null = null;
async function inventory(): Promise<Artefact[]> {
  if (cached) return structuredClone(cached);
  const fixture = readFileSync('tests/fixtures/policy-analysis/policy.txt');
  const all = (await ingest(fixture, 'policy.txt', 'text/plain')).artefacts;
  for (let stage = 1; stage <= ASSURANCE_STAGE; stage++) {
    const r = await executeStage(base(stage, all), {
      model: async (...a) => fixtureModel(...a), research, signal, neighbours: none, personas: none,
    });
    all.push(...r.artefacts);
  }
  cached = structuredClone(all);
  return all;
}

/**
 * `inventory()` runs stages 1 to 16, so it already holds stage 15's own output —
 * and the fixture derives its identifiers from `idPrefix`, so re-running the
 * stage over that inventory makes every row a duplicate of itself. A stage under
 * test is handed everything EXCEPT what it is about to produce.
 */
const without = (all: Artefact[], stage: number) => all.filter((a) => !a.id.startsWith(`s${stage}_`));

/** The fixture model, with some of what it produced taken back out. */
const withhold = (drop: (a: Artefact, input: StageInput & { targetCategory?: string }) => boolean) =>
  async (...args: Parameters<typeof fixtureModel>) => {
    const out = fixtureModel(...args);
    const input = args[2] as StageInput & { targetCategory?: string };
    return { ...out, artefacts: out.artefacts.filter((a) => !drop(a, input)) };
  };

describe('a coverage gap is asked about before it is fatal', () => {
  it('asks again for the challenge responses the revised report left out', async () => {
    const all = await inventory();
    const challenges = all.filter((a) => a.kind === 'assurance_challenge');
    expect(challenges.length).toBe(ASSURANCE_CATEGORIES.length);

    // The live failure: the first call answers all but one challenge. Before
    // this phase that threw, the cached reply made every retry deterministic,
    // and nine attempts reached the same place.
    const keys: string[] = [];
    let first = true;
    const model = async (...args: Parameters<typeof fixtureModel>) => {
      keys.push(args[1]);
      const out = fixtureModel(...args);
      if (!first) return out;
      first = false;
      const omitted = challenges[0].id;
      return { ...out, artefacts: out.artefacts.filter((a) => !(a.kind === 'assurance_response' && a.data.challengeId === omitted)) };
    };

    const result = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model, research, signal, neighbours: none, personas: none });
    // It asked a second time, under a key of its own so the response cache
    // cannot replay the omission.
    expect(keys).toHaveLength(2);
    expect(keys[1]).not.toBe(keys[0]);
    const responses = result.artefacts.filter((a) => a.kind === 'assurance_response');
    expect(new Set(responses.map((a) => a.data.challengeId)).size).toBe(challenges.length);
    // A gap the second ask CLOSED is not a limit, so it writes no warning: the
    // stage is complete, and the warning channel is carried into every later
    // call and counted on the report's account of what the run discarded.
    expect(result.warnings.join(' ')).not.toContain('not assessed');
  });

  it('re-dispatches the units of a fan-out that produced nothing', async () => {
    const all = await inventory();
    const skip = ASSURANCE_CATEGORIES[2];
    const keys: string[] = [];
    let refused = true;
    const model = async (...args: Parameters<typeof fixtureModel>) => {
      keys.push(args[1]);
      const input = args[2] as StageInput & { targetCategory?: string };
      // The category answers emptily once, then answers properly — a silent unit,
      // which is the shape a fan-out gap actually takes.
      if (input.targetCategory === skip && refused) { refused = false; return { artefacts: [], warnings: [] }; }
      return fixtureModel(...args);
    };
    const result = await executeStage(base(ASSURANCE_STAGE, all.filter((a) => a.kind !== 'assurance_challenge')), { model, research, signal, neighbours: none, personas: none });
    expect(keys.filter((k) => k === skip)).toHaveLength(2);
    const covered = new Set(result.artefacts.filter((a) => a.kind === 'assurance_challenge').map((a) => a.data.category));
    expect(covered.size).toBe(ASSURANCE_CATEGORIES.length);
  });

  it('takes only the missing rows when the second call restates the whole report', async () => {
    // The fixture model ignores `coverageGap` and returns everything, which is
    // exactly what a real model that skims the instruction would do. Nothing
    // catches it on its own: the top-up's identifiers carry their own slot, so a
    // restated report collides with nothing and lands as a duplicate set of
    // findings under a SECOND review summary — and the rule below then fails a
    // stage that was one response short.
    const all = await inventory();
    const omitted = all.filter((a) => a.kind === 'assurance_challenge')[0].id;
    let first = true;
    const model = async (...args: Parameters<typeof fixtureModel>) => {
      const out = fixtureModel(...args);
      if (!first) return out;
      first = false;
      return { ...out, artefacts: out.artefacts.filter((a) => !(a.kind === 'assurance_response' && a.data.challengeId === omitted)) };
    };
    const result = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model, research, signal, neighbours: none, personas: none });
    expect(result.artefacts.filter((a) => a.kind === 'review_summary')).toHaveLength(1);
    const responses = result.artefacts.filter((a) => a.kind === 'assurance_response');
    expect(responses).toHaveLength(ASSURANCE_CATEGORIES.length);
    expect(result.warnings.join(' ')).toContain('already holds');
  });

  it('asks only once, because the gap that ended the live run was deterministic', async () => {
    const all = await inventory();
    const omitted = all.filter((a) => a.kind === 'assurance_challenge')[0].id;
    const keys: string[] = [];
    const model = async (...args: Parameters<typeof fixtureModel>) => {
      keys.push(args[1]);
      const out = fixtureModel(...args);
      return { ...out, artefacts: out.artefacts.filter((a) => !(a.kind === 'assurance_response' && a.data.challengeId === omitted)) };
    };
    const result = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model, research, signal, neighbours: none, personas: none });
    // Two calls, not nine: one ask, one top-up, then the gate decides.
    expect(keys).toHaveLength(2);
    expect(result.warnings.join(' ')).toContain('no response');
    expect(result.warnings.join(' ')).toContain('asked a second time');
  });
});

describe('a gate that is still short degrades instead of ending the run', () => {
  it('finishes a revised report that answered all but one challenge', async () => {
    const all = await inventory();
    const omitted = all.filter((a) => a.kind === 'assurance_challenge')[0].id;
    const model = withhold((a) => a.kind === 'assurance_response' && a.data.challengeId === omitted);
    const result = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model, research, signal, neighbours: none, personas: none });
    // Nineteen sections of work is nineteen sections of work.
    expect(result.artefacts.filter((a) => a.kind === 'finding').length).toBeGreaterThan(10);
    expect(result.artefacts.some((a) => a.kind === 'review_summary')).toBe(true);
    expect(result.warnings.join(' ')).toContain('1 of 7 independent challenges were not assessed');
  });

  it('still refuses a revised report that answered a minority of them', async () => {
    const all = await inventory();
    const challenges = all.filter((a) => a.kind === 'assurance_challenge');
    const answered = new Set(challenges.slice(0, 2).map((a) => a.id));
    const model = withhold((a) => a.kind === 'assurance_response' && !answered.has(String(a.data.challengeId)));
    await expect(executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model, research, signal, neighbours: none, personas: none }))
      .rejects.toThrow(/independent challenge/);
  });

  it('finishes an appraisal missing a counterfactual option, and refuses one missing the policy', async () => {
    const all = await inventory();
    const spare = await executeStage(base(APPRAISAL_STAGE, without(all, APPRAISAL_STAGE)), {
      model: withhold((a) => a.kind === 'option_appraisal' && a.data.optionType === 'alternative'),
      research, signal, neighbours: none, personas: none,
    });
    expect(spare.artefacts.some((a) => a.kind === 'evaluation_plan')).toBe(true);
    expect(spare.warnings.join(' ')).toContain('1 of 4 policy options were not assessed: alternative');

    await expect(executeStage(base(APPRAISAL_STAGE, without(all, APPRAISAL_STAGE)), {
      model: withhold((a) => a.kind === 'option_appraisal' && a.data.optionType === 'proposed_policy'),
      research, signal, neighbours: none, personas: none,
    })).rejects.toThrow(/proposed policy/);
  });
});

describe('what a top-up is allowed to bring back with it', () => {
  it('keeps the new assumption the one missing option rests on', async () => {
    // The contract makes this the OBEDIENT case, not an edge one: stage 15 may
    // write an `assumption` (STAGE_KINDS) and `option_appraisal.assumptions` is
    // min(1), so a call asked for one missing option may have to mint the
    // hypothesis it rests on. Admitting only the option strands that assumption —
    // and `semanticFault` folds a cited assumption into refs, so the option would
    // then be dropped for leaning on something absent: the one thing that was
    // missing, deleted, under a warning saying the stage already held it.
    const all = await inventory();
    let first = true;
    const model = async (...args: Parameters<typeof fixtureModel>) => {
      const out = fixtureModel(...args);
      if (first) {
        first = false;
        return { ...out, artefacts: out.artefacts.filter((a) => !(a.kind === 'option_appraisal' && a.data.optionType === 'alternative')) };
      }
      // The top-up, obeying the instruction exactly: the missing option and the
      // new hypothesis it depends on, and nothing else.
      const prefix = (args[2] as { idPrefix: string }).idPrefix;
      const chain = all.find((a) => a.kind === 'causal_chain')!;
      const mechanism = all.find((a) => a.kind === 'mechanism')!;
      const minted = artefact(`${prefix}assumption`, 'assumption', 'Fresh hypothesis', 'The alternative assumes spare capacity.', { importance: 0.7, uncertainty: 0.7, consequence: 0.7, notes: 'Minted by the second call.' }, { refs: [mechanism.id] });
      const option = out.artefacts.find((a) => a.kind === 'option_appraisal' && a.data.optionType === 'alternative')!;
      return { artefacts: [minted, { ...option, data: { ...option.data, assumptions: [minted.id] }, refs: [chain.id, minted.id] }], warnings: [] };
    };
    const result = await executeStage(base(APPRAISAL_STAGE, without(all, APPRAISAL_STAGE)), { model, research, signal, neighbours: none, personas: none });
    const types = result.artefacts.filter((a) => a.kind === 'option_appraisal').map((a) => a.data.optionType);
    expect(types).toContain('alternative');
    expect(result.artefacts.some((a) => a.kind === 'assumption')).toBe(true);
    expect(result.warnings.join(' ')).not.toContain('not assessed');
    expect(result.warnings.join(' ')).not.toContain('already holds');
  });

  it('does not let a failed top-up relabel the stage, or report the gap twice', async () => {
    // `attempt` routes a failure through `gap`, which sets `fault.last` — and the
    // appraisal rule throws `fault.last?.code ?? 'coverage'` while worker.ts
    // treats `timeout` as a code not worth retrying. A bonus call running out of
    // time would therefore cost the stage two of its three attempts.
    const all = await inventory();
    let first = true;
    const model = async (...args: Parameters<typeof fixtureModel>) => {
      const out = fixtureModel(...args);
      if (!first) throw new PolicyError('timeout', 'The model ran out of time.');
      first = false;
      return { ...out, artefacts: out.artefacts.filter((a) => !(a.kind === 'option_appraisal' && a.data.optionType === 'alternative')) };
    };
    const result = await executeStage(base(APPRAISAL_STAGE, without(all, APPRAISAL_STAGE)), { model, research, signal, neighbours: none, personas: none });
    // The soft gap degrades as it should, and says so exactly once.
    const facts = stageFacts(result.warnings);
    expect(facts.find((f) => f.kind === 'not_covered')).toMatchObject({ count: 1, of: 4 });
    expect(facts.some((f) => f.kind === 'unavailable')).toBe(false);

    // And when the gap IS load-bearing, the stage still fails as a coverage
    // failure — which the worker retries — rather than as the top-up's timeout.
    let firstAgain = true;
    const fatal = async (...args: Parameters<typeof fixtureModel>) => {
      const out = fixtureModel(...args);
      if (!firstAgain) throw new PolicyError('timeout', 'The model ran out of time.');
      firstAgain = false;
      return { ...out, artefacts: out.artefacts.filter((a) => a.kind !== 'evaluation_plan') };
    };
    await expect(executeStage(base(APPRAISAL_STAGE, without(all, APPRAISAL_STAGE)), { model: fatal, research, signal, neighbours: none, personas: none }))
      .rejects.toMatchObject({ code: 'coverage' });
  });

  it('refuses a stage 17 handed no challenges at all rather than failing on nothing', async () => {
    // `0 * 2 >= 0` is true, so an unguarded majority floor reports "0 of 0 have
    // no response" on a stage that did everything asked of it.
    // The stage still fails — the fixture's review summary cites the challenges,
    // so with none it has no provenance and is quarantined for that. What must
    // not happen is this rule reporting a shortfall against an empty library.
    const all = (await inventory()).filter((a) => a.kind !== 'assurance_challenge');
    await expect(executeStage(base(ASSURED_SYNTHESIS_STAGE, all), {
      model: async (...a) => fixtureModel(...a), research, signal, neighbours: none, personas: none,
    })).rejects.toThrow(/review summary/);
    await expect(executeStage(base(ASSURED_SYNTHESIS_STAGE, all), {
      model: async (...a) => fixtureModel(...a), research, signal, neighbours: none, personas: none,
    })).rejects.not.toThrow(/0 of 0/);
  });
});

describe('the report counts a degraded gate as a gap, not as an open question', () => {
  // `stage-facts.ts` is what the report's own account of what the run discarded
  // reads, and anything its rules do not recognise is filed as an open QUESTION —
  // a different claim from "not covered", and the mis-filing its own header warns
  // about: a thing the RUN failed to do, presented as a thing the paper failed to
  // say. So the two warnings this phase adds are phrased in the sentence it
  // parses, including `requireMajority`'s plural for a count of one.
  it('files an unanswered challenge and a missing option as counted limits', async () => {
    const all = await inventory();
    const omitted = all.filter((a) => a.kind === 'assurance_challenge')[0].id;
    const revised = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), {
      model: withhold((a) => a.kind === 'assurance_response' && a.data.challengeId === omitted),
      research, signal, neighbours: none, personas: none,
    });
    const challengeGap = stageFacts(revised.warnings).find((f) => f.kind === 'not_covered');
    expect(challengeGap).toBeDefined();
    expect(challengeGap!.count).toBe(1);
    expect(challengeGap!.of).toBe(ASSURANCE_CATEGORIES.length);
    expect(stageFacts(revised.warnings).some((f) => f.kind === 'open')).toBe(false);

    const appraisal = await executeStage(base(APPRAISAL_STAGE, without(all, APPRAISAL_STAGE)), {
      model: withhold((a) => a.kind === 'option_appraisal' && a.data.optionType === 'alternative'),
      research, signal, neighbours: none, personas: none,
    });
    const optionGap = stageFacts(appraisal.warnings).find((f) => f.kind === 'not_covered');
    expect(optionGap).toMatchObject({ count: 1, of: 4 });
  });
});

describe('a play keeps the preconditions that are real', () => {
  const source = artefact('passage_0001', 'passage', 'Page 1', 'The Council is accountable for delivery and bears implementation costs.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1, startOffset: 0, endOffset: 80 });
  const actor = { ...artefact('s2_000_actor', 'actor', 'Council', 'A body named in the policy.', { entityType: 'local_authority', aliases: [], mentions: ['passage_0001'], ambiguity: '', dates: [], parent: null }), origin: 'extracted_fact' as const, sourceId: source.id, sourceQuote: 'The Council is accountable for delivery', refs: [source.id] };
  const mechanism = { ...artefact('s1_000_mechanism', 'mechanism', 'Shared access', 'A change the paper proposes.', { intervention: 'Shared access', implementation: 'Council delivery', notes: 'n' }), origin: 'extracted_fact' as const, sourceId: source.id, sourceQuote: 'bears implementation costs', refs: [source.id] };
  const assumption = artefact('s1_000_assumption', 'assumption', 'Capacity', 'Sufficient capacity is assumed.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'n' }, { refs: [source.id, mechanism.id] });
  const profile = artefact('s4_000_profile', 'profile', 'Council profile', 'A profile.', { actorId: actor.id }, { refs: [actor.id] });
  const prior = [source, actor, mechanism, assumption, profile];

  const play = (preconditions: string[]) => artefact('s10_000_exploit', 'exploit', 'A play', 'Report against the measure without changing practice.', {
    actorId: actor.id, motivation: 'Avoids cost.', play: 'Report against the measure.', legality: 'compliant', targets: [mechanism.id],
    preconditions, payoff: 'Retains discretion.', costToPolicy: 'The objective is not delivered.', incentive: 0.6, ease: 0.6, impact: 0.6, concealment: 0.6,
    earlyWarning: 'The measure improves while complaints do not.', counter: 'Add an independent check.', precedent: 'None identified.',
  }, { refs: [profile.id, mechanism.id, assumption.id], confidence: 0.5 });

  it('keeps a play that named a mechanism alongside a real assumption', () => {
    // The live class: every id resolves, one of them is not an assumption, and
    // the whole play went in the bin for it.
    const triaged = triageArtefacts({ artefacts: [play([assumption.id, mechanism.id])], warnings: [] }, 10, prior);
    expect(triaged.rejected).toHaveLength(0);
    expect(triaged.artefacts[0].data.preconditions).toEqual([assumption.id]);
    expect(triaged.warnings.join(' ')).toContain('precondition');
  });

  it('still refuses a play that rests on nothing that is an assumption', () => {
    // `preconditions` is min(1). A play resting on no hypothesis is not a play.
    const triaged = triageArtefacts({ artefacts: [play([mechanism.id])], warnings: [] }, 10, prior);
    expect(triaged.artefacts).toHaveLength(0);
    expect(triaged.rejected[0].code).toBe('hypothesis');
  });

  it('narrows the same way for an interaction model', async () => {
    const all = await inventory();
    const model = all.find((a) => a.kind === 'model')!;
    const assumptions = all.filter((a) => a.kind === 'assumption');
    const claim = all.find((a) => a.kind === 'claim')!;
    const broken = structuredClone(model);
    broken.data.assumptions = [assumptions[0].id, claim.id];
    broken.refs = [...new Set([...broken.refs, assumptions[0].id, claim.id])];
    const triaged = triageArtefacts({ artefacts: [broken], warnings: [] }, 7, all.filter((a) => a.id !== model.id));
    expect(triaged.rejected).toHaveLength(0);
    expect(triaged.artefacts[0].data.assumptions).toEqual([assumptions[0].id]);
  });
});
