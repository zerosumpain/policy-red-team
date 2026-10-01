// Phase 22 — the rival explanation, and the door's cap on a snippet's grade.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSURANCE_CATEGORIES, ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, artefact } from './contracts';
import { executeStage } from './pipeline';
import { systemPrompt } from './prompts';
import { ingest } from './server/ingest';
import { triageArtefacts } from './validation';
import { rivalExplanations } from '$lib/assurance-view';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

const passage = artefact('passage_0001', 'passage', 'Page 3', 'Hubs will widen access in every council.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact' });
const finding = artefact('s12_000_finding', 'finding', 'Hubs widen access', 'f', { section: 'mechanisms', resultIds: ['t'], hypothesisIds: ['h'], revision: 'initial' }, { refs: [passage.id] });
const prior = [passage, finding];
const challenge = (category: string, over: Record<string, unknown> = {}) => artefact('s16_011_challenge', 'assurance_challenge', 'Another story fits', 'c', {
  category, finding: 'issue', materiality: 'high', targetIds: [finding.id], challenge: 'c', testApplied: 't', evidence: 'e', resolutionNeeded: 'r', ...over,
}, { refs: [finding.id] });

describe('a rival explanation must say what the rival is, and how to tell', () => {
  it('keeps one with both', () => {
    const triaged = triageArtefacts({ artefacts: [challenge('rival_explanation', { rival: 'Access was rising anyway.', discriminators: ['Councils outside the programme rise as fast: favours the rival.'] })], warnings: [] }, ASSURANCE_STAGE, prior);
    expect(triaged.rejected).toHaveLength(0);
  });

  it('refuses one with no rival, or nothing to tell them apart', () => {
    for (const over of [{ discriminators: ['x'] }, { rival: 'Access was rising anyway.' }, { rival: '  ', discriminators: ['x'] }, { rival: 'r', discriminators: [] }]) {
      const triaged = triageArtefacts({ artefacts: [challenge('rival_explanation', over)], warnings: [] }, ASSURANCE_STAGE, prior);
      expect(triaged.rejected[0], JSON.stringify(over)).toMatchObject({ code: 'contract', reason: expect.stringContaining('rival explanation') });
    }
  });

  it('asks nothing new of any other category', () => {
    const triaged = triageArtefacts({ artefacts: [challenge('omission')], warnings: [] }, ASSURANCE_STAGE, prior);
    expect(triaged.rejected).toHaveLength(0);
  });

  it('is in the remit list, the challenge prompt and the synthesis prompt', () => {
    expect(ASSURANCE_CATEGORIES).toContain('rival_explanation');
    expect(systemPrompt(ASSURANCE_STAGE)).toMatch(/rival_explanation: the strongest competing explanation/);
    expect(systemPrompt(ASSURANCE_STAGE)).toMatch(/RIVAL EXPLANATION/);
    expect(systemPrompt(ASSURED_SYNTHESIS_STAGE)).toMatch(/A rival_explanation challenge must be weighed explicitly/);
    expect(systemPrompt(ASSURED_SYNTHESIS_STAGE)).toMatch(/the disposition is unresolved — that is a proper answer/);
  });
});

describe('the challenge stage asks for it and the synthesis answers it', () => {
  it('fans out one unit per category, the rival included, and the fixture answers it as unresolved', async () => {
    const all = (await ingest(readFileSync('tests/fixtures/policy-analysis/policy.txt'), 'policy.txt', 'text/plain')).artefacts;
    const signal = new AbortController().signal;
    const asked: string[] = [];
    for (let stage = 1; stage <= ASSURED_SYNTHESIS_STAGE; stage++) {
      const result = await executeStage(
        { stage, title: 'Synthetic policy', jurisdiction: 'England', policyArea: 'Services', context: null, artefacts: all },
        {
          model: async (...args) => {
            const input = args[2] as { targetCategory?: string | null };
            if (args[0] === ASSURANCE_STAGE && input.targetCategory) asked.push(input.targetCategory);
            return fixtureModel(...args);
          },
          research: async () => ({ artefacts: [], warnings: [] }),
          signal,
        },
      );
      all.push(...result.artefacts);
    }
    expect(asked.sort()).toEqual([...ASSURANCE_CATEGORIES].sort());
    const [rival] = rivalExplanations(all);
    expect(rival.rival).toMatch(/^Councils already wanted to widen access/);
    expect(rival.discriminators).toHaveLength(2);
    expect(rival.about.map((a) => a.kind)).toEqual(['finding']);
    expect(rival.response).toMatchObject({ disposition: 'unresolved', remainingLimit: expect.stringMatching(/would settle it/) });
  }, 60_000);

  it('shows nothing for a run before the remit existed', () => {
    expect(rivalExplanations([...prior, challenge('omission')])).toEqual([]);
  });
});
