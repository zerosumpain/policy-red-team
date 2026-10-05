// Phase 23, T4 — fewer corrective rounds, by saying the broken rules first.
//
// Replayed from the stored replies of the Best Start and Post-16 runs: the
// decomposition replies broke the claim-category enum, the "no edges here"
// rule and the assumption-link rule most; the final review broke the
// "hypotheses its results rest on" rule and cited challenges by guessed ids.
// Each block below is the change for one of those, and the key-judgement
// floor that came out of the same replay.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, KEY_JUDGEMENT_FLOOR, SYNTHESIS_STAGE, artefact, dataSchemas, type Artefact, type StageInput } from './contracts';
import { systemPrompt } from './prompts';
import { reaches, triageOutput } from './validation';
import { executeStage, RESULT_ASSUMPTIONS_CAP, resultAssumptions } from './pipeline';
import { ingest } from './server/ingest';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

const signal = new AbortController().signal;
const research = async () => ({ artefacts: [], warnings: [] });
const none = async () => [];
const base = (stage: number, artefacts: Artefact[]): StageInput =>
  ({ stage, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts });

let cached: Artefact[] | null = null;
async function inventory(through = ASSURANCE_STAGE): Promise<Artefact[]> {
  if (cached && through === ASSURANCE_STAGE) return structuredClone(cached);
  const all = (await ingest(readFileSync('tests/fixtures/policy-analysis/policy.txt'), 'policy.txt', 'text/plain')).artefacts;
  for (let stage = 1; stage <= through; stage++) {
    const r = await executeStage(base(stage, all), { model: async (...a) => fixtureModel(...a), research, signal, neighbours: none, personas: none });
    all.push(...r.artefacts);
  }
  if (through === ASSURANCE_STAGE) cached = structuredClone(all);
  return all;
}

describe('the rules replies broke most are in the first instruction', () => {
  it('decomposition is told the claim categories, that an intervention is a mechanism, and that edges come later', () => {
    const prompt = systemPrompt(1);
    expect(prompt).toContain(`exactly one of: ${dataSchemas.claim.shape.category.options.join(', ')}`);
    expect(prompt).toContain('There is no "intervention" or "implementation" category');
    expect(prompt).toContain('Return no edge artefacts at this stage');
    expect(prompt).toContain('one unbroken span of THIS passage');
  });

  it('the indexed contract is NOT told to copy a quote it is told not to write', () => {
    const prompt = systemPrompt(1, null, 'indexed');
    expect(prompt).toContain('There is no "intervention" or "implementation" category');
    expect(prompt).not.toContain('one unbroken span of THIS passage');
  });

  it('synthesis and the final review are told where a finding\'s hypotheses must come from', () => {
    for (const stage of [SYNTHESIS_STAGE, ASSURED_SYNTHESIS_STAGE]) expect(systemPrompt(stage)).toContain('"resultAssumptions" lists');
    expect(systemPrompt(ASSURED_SYNTHESIS_STAGE)).toContain('never compose one');
    // A restatement runs the stage-17 contract, rules and all.
    expect(systemPrompt(101, 'restatement')).toContain('"resultAssumptions" lists');
  });

  it('the final review is asked for five key judgements, three at the least', () => {
    const prompt = systemPrompt(ASSURED_SYNTHESIS_STAGE);
    expect(prompt).toContain('Lead the report with 5 key_judgement artefacts');
    expect(prompt).toContain(`${KEY_JUDGEMENT_FLOOR} is the fewest`);
  });
});

describe('resultAssumptions — the hint the corrective round gave, sent first', () => {
  it('lists, per result, only assumptions the validator would accept as reached', async () => {
    const all = await inventory();
    const lists = resultAssumptions(all, all);
    const byId = new Map(all.map((a) => [a.id, a]));
    expect(Object.keys(lists).length).toBeGreaterThan(0);
    for (const [result, assumptions] of Object.entries(lists)) {
      expect(assumptions.length).toBeLessThanOrEqual(RESULT_ASSUMPTIONS_CAP);
      for (const id of assumptions) {
        expect(byId.get(id)?.kind).toBe('assumption');
        expect(reaches(result, id, byId)).toBe(true);
      }
    }
  });

  it('rides on the final review\'s call after the artefacts, so the cached prefix is untouched', async () => {
    const all = await inventory();
    const sent: Record<string, unknown>[] = [];
    await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), {
      model: async (stage, key, input) => { sent.push(input as Record<string, unknown>); return fixtureModel(stage, key, input); },
      research, signal, neighbours: none, personas: none,
    });
    const main = sent[0];
    expect(main.resultAssumptions).toBeTruthy();
    const keys = Object.keys(main);
    expect(keys.indexOf('resultAssumptions')).toBeGreaterThan(keys.indexOf('artefacts'));
  });
});

describe('a challenge cited by a guessed identifier', () => {
  // Each challenge rests on a passage, so the response that answers it has a
  // path to the paper and only the identifier is under test.
  const passage = artefact('passage_0001', 'passage', 'Page 1', 'The council delivers the programme.', {}, { origin: 'extracted_fact' });
  const challenge = (id: string) => artefact(id, 'assurance_challenge', 'Challenge', 'A challenge.', { category: 'causality', finding: 'issue', materiality: 'medium', targetIds: [], challenge: 'x', testApplied: 'x', evidence: 'x', resolutionNeeded: 'x' }, { refs: [passage.id] });
  const response = (challengeId: string) => artefact('s17_main_assurance_response_001', 'assurance_response', 'Response', 'A response.', {
    challengeId, disposition: 'accepted', response: 'Done.', changes: 'Qualified.', remainingLimit: 'None.',
  }, { refs: [challengeId] });

  it('is refiled to the one challenge its step wrote — the Best Start run\'s 29 refusals', () => {
    const prior = [passage, challenge('s16_002_assurance_001'), challenge('s16_003_assurance_challenge_001')];
    const triaged = triageOutput({ artefacts: [response('s16_003_assurance_001')], warnings: [] }, ASSURED_SYNTHESIS_STAGE, prior);
    expect(triaged.rejected).toEqual([]);
    expect(triaged.artefacts[0].data.challengeId).toBe('s16_003_assurance_challenge_001');
    expect(triaged.artefacts[0].refs).toEqual(['s16_003_assurance_challenge_001']);
  });

  it('is refused as before when the slot is ambiguous or empty', () => {
    const prior = [passage, challenge('s16_003_assurance_challenge_001'), challenge('s16_003_assurance_challenge_002')];
    expect(triageOutput({ artefacts: [response('s16_003_assurance_001')], warnings: [] }, ASSURED_SYNTHESIS_STAGE, prior).rejected).toHaveLength(1);
    expect(triageOutput({ artefacts: [response('s16_009_assurance_001')], warnings: [] }, ASSURED_SYNTHESIS_STAGE, prior).rejected).toHaveLength(1);
  });

  it('is left alone at any other stage', () => {
    const prior = [passage, challenge('s16_003_assurance_challenge_001')];
    const row = artefact('s12_main_finding_001', 'finding', 'F', 'F.', { section: 'summary' }, { refs: ['s16_003_assurance_001'] });
    const triaged = triageOutput({ artefacts: [row], warnings: [] }, SYNTHESIS_STAGE, prior);
    expect(triaged.artefacts.flatMap((a) => a.refs)).not.toContain('s16_003_assurance_challenge_001');
  });
});

describe('the key-judgement floor', () => {
  it('asks again below the floor, names what was written, and ranks the additions after it', async () => {
    const all = await inventory();
    const asked: Record<string, unknown>[] = [];
    const model = async (stage: number, key: string, input: unknown) => {
      asked.push(input as Record<string, unknown>);
      const out = fixtureModel(stage, key, input);
      if (key !== 'topup') {
        // The first ask comes back with ONE judgement.
        const kept = out.artefacts.filter((a) => a.kind === 'key_judgement').slice(0, 1);
        return { ...out, artefacts: [...out.artefacts.filter((a) => a.kind !== 'key_judgement'), ...kept] };
      }
      // The second numbers its own from 1, as a model left to itself would.
      const first = out.artefacts.find((a) => a.kind === 'key_judgement') ?? fixtureModel(stage, 'main', { ...(input as object), coverageGap: undefined, keyJudgementsWritten: undefined }).artefacts.find((a) => a.kind === 'key_judgement')!;
      const added = { ...structuredClone(first), id: `${(input as { idPrefix: string }).idPrefix}judgement_extra`, statement: 'A second judgement, added by the top-up.', data: { ...first.data, rank: 1 } };
      return { ...out, artefacts: [...out.artefacts.filter((a) => a.kind !== 'key_judgement'), added] };
    };
    const result = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model, research, signal, neighbours: none, personas: none });
    const topup = asked.find((input) => Array.isArray(input.coverageGap))!;
    expect(topup.coverageGap).toContain('key_judgements');
    expect(topup.keyJudgementsWritten).toHaveLength(1);
    const judgements = result.artefacts.filter((a) => a.kind === 'key_judgement').sort((a, b) => Number(a.data.rank) - Number(b.data.rank));
    expect(judgements.map((a) => a.data.rank)).toEqual([1, 2]);
    // The first ask's rank 1 survives: the addition joined it rather than replacing it.
    expect(judgements[1].statement).toBe('A second judgement, added by the top-up.');
  });

  it('does not ask again at or above the floor', async () => {
    const all = await inventory();
    const keys: string[] = [];
    const model = async (stage: number, key: string, input: unknown) => {
      keys.push(key);
      const out = fixtureModel(stage, key, input);
      const one = out.artefacts.find((a) => a.kind === 'key_judgement');
      if (!one) return out;
      const more = Array.from({ length: KEY_JUDGEMENT_FLOOR - 1 }, (_, i) => ({ ...structuredClone(one), id: `${one.id}_more${i}`, data: { ...one.data, rank: i + 2 } }));
      return { ...out, artefacts: [...out.artefacts.filter((a) => a.kind !== 'key_judgement'), one, ...more] };
    };
    const result = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model, research, signal, neighbours: none, personas: none });
    expect(keys).not.toContain('topup');
    expect(result.artefacts.filter((a) => a.kind === 'key_judgement')).toHaveLength(KEY_JUDGEMENT_FLOOR);
  });
});
