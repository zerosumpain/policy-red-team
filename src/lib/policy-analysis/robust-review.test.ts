import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSURANCE_CATEGORIES, ASSURED_SYNTHESIS_STAGE, PERSONA_STAGE, STAGES, SYNTHESIS_STAGE, artefact, type Artefact } from './contracts';
import { executeStage } from './pipeline';
import { ingest } from './server/ingest';
import { stageBudgetMs } from './server/worker';
import { confidenceJudgement, findingsBySection, recommendations } from './view';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

async function through(stage: number): Promise<Artefact[]> {
  const all = (await ingest(readFileSync('tests/fixtures/policy-analysis/policy.txt'), 'policy.txt', 'text/plain')).artefacts;
  const signal = new AbortController().signal;
  for (let ordinal = 1; ordinal <= stage; ordinal++) {
    const result = await executeStage(
      { stage: ordinal, title: 'Synthetic policy', jurisdiction: 'England', policyArea: 'Services', context: null, artefacts: all },
      { model: async (...args) => fixtureModel(...args), research: async () => ({ artefacts: [], warnings: [] }), signal },
    );
    all.push(...result.artefacts);
  }
  return all;
}

describe('expanded review compatibility', () => {
  it('does not move any persisted legacy ordinal', () => {
    expect(STAGES.slice(0, 14)).toEqual([
      'Document ingestion', 'Document decomposition', 'Entity resolution', 'Policy knowledge graph',
      'Actor and incentive profiles', 'Targeted research', 'Evidence matrix', 'Interaction models',
      'Automated policy tests', 'Adversarial scenarios and sensitivity', 'Exploitation playbook',
      'Cross-policy exposure', 'Synthesis', 'Actor persona library',
    ]);
    expect(SYNTHESIS_STAGE).toBe(12);
    expect(PERSONA_STAGE).toBe(13);
    expect(ASSURED_SYNTHESIS_STAGE).toBe(17);
  });

  it('budgets causal fan-out and every independent challenge call', () => {
    const mechanisms = Array.from({ length: 9 }, (_, i) => ({ kind: 'mechanism', id: `m${i}` }));
    expect(stageBudgetMs(14, mechanisms)).toBeGreaterThan(stageBudgetMs(14, mechanisms.slice(0, 1)));
    expect(stageBudgetMs(16, [])).toBe(20 * 60_000 + ASSURANCE_CATEGORIES.length * 3 * 60_000);
  });
});

describe('the revised report replaces the initial report without deleting its trail', () => {
  it('shows assured findings and recommendations when both revisions exist', () => {
    const initial = artefact('s12_initial', 'finding', 'Initial', 'Initial answer.', { section: 'executive_assessment', resultIds: ['r'], hypothesisIds: ['h'], revision: 'initial' });
    const assured = artefact('s17_assured', 'finding', 'Assured', 'Revised answer.', { section: 'executive_assessment', resultIds: ['r'], hypothesisIds: ['h'], revision: 'assured', judgement: 'supported_with_limits' });
    const initialRec = artefact('s12_rec', 'recommendation', 'Initial rec', 'Initial.', { findingIds: ['s12_initial'], revision: 'initial' });
    const assuredRec = artefact('s17_rec', 'recommendation', 'Revised rec', 'Revised.', { findingIds: ['s17_assured'], revision: 'assured' });
    expect(findingsBySection([initial, assured])[0].items.map((a) => a.id)).toEqual(['s17_assured']);
    expect(recommendations([initialRec, assuredRec]).map((a) => a.id)).toEqual(['s17_rec']);
  });

  it('renders qualitative standing rather than a probability', () => {
    const explicit = artefact('x', 'finding', 'x', 'x', { judgement: 'contested' }, { confidence: 0.99 });
    const quoted = artefact('q', 'claim', 'q', 'q', {}, { origin: 'extracted_fact', sourceQuote: 'q', confidence: 0.99 });
    expect(confidenceJudgement(explicit)).toBe('Contested');
    expect(confidenceJudgement(quoted)).toBe('Documented in the paper');
  });

  it('computes decision use from unresolved high-materiality challenge responses', async () => {
    const all = await through(16);
    const model = async (...args: Parameters<typeof fixtureModel>) => {
      const result = fixtureModel(...args);
      const response = result.artefacts.find((a) => a.kind === 'assurance_response' && all.find((x) => x.id === a.data.challengeId)?.data.materiality === 'high');
      if (response) response.data.disposition = 'unresolved';
      return result;
    };
    const result = await executeStage(
      { stage: 17, title: 'Synthetic policy', jurisdiction: 'England', policyArea: 'Services', context: null, artefacts: all },
      { model, research: async () => ({ artefacts: [], warnings: [] }), signal: new AbortController().signal },
    );
    const summary = result.artefacts.find((a) => a.kind === 'review_summary')!;
    expect(summary.data.decisionUse).toBe('exploratory');
    expect(summary.data.openChallenges).toBe(1);
    expect(summary.data.unresolvedMaterialChallenges).toBe(1);
  });
});
