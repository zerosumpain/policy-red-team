// The stage-17 key-judgement floor is decided on what the stage KEEPS.
//
// `executeStage` re-triages the whole assembled stage at the end, and that pass
// can still drop an artefact the per-response triage let through — a judgement
// whose cited finding falls in the settle, say. A floor checked before it
// reports "the report leads with one" over a report that leads with none. The
// final triage is swapped here for one that drops every judgement, so the only
// thing under test is where the floor sits.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, type Artefact, type StageInput } from './contracts';
import { stageFacts } from './stage-facts';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

const drop = { judgements: false };
vi.mock('./validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./validation')>();
  return {
    ...actual,
    triageArtefacts: (...args: Parameters<typeof actual.triageArtefacts>) => {
      const result = actual.triageArtefacts(...args);
      if (!drop.judgements) return result;
      return { ...result, artefacts: result.artefacts.filter((a) => a.kind !== 'key_judgement') };
    },
  };
});

const { executeStage } = await import('./pipeline');
const { ingest } = await import('./server/ingest');

const signal = new AbortController().signal;
const research = async () => ({ artefacts: [], warnings: [] });
const none = async () => [];
const base = (stage: number, artefacts: Artefact[]): StageInput =>
  ({ stage, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts });

describe('the key-judgement floor is applied after the final triage', () => {
  it('says the report has none when the final triage took the last one', async () => {
    const all = (await ingest(readFileSync('tests/fixtures/policy-analysis/policy.txt'), 'policy.txt', 'text/plain')).artefacts;
    for (let stage = 1; stage <= ASSURANCE_STAGE; stage++) {
      const r = await executeStage(base(stage, all), { model: async (...a) => fixtureModel(...a), research, signal, neighbours: none, personas: none });
      all.push(...r.artefacts);
    }
    drop.judgements = true;
    const result = await executeStage(base(ASSURED_SYNTHESIS_STAGE, all), { model: async (...a) => fixtureModel(...a), research, signal, neighbours: none, personas: none });
    expect(result.artefacts.filter((a) => a.kind === 'key_judgement')).toHaveLength(0);
    const gap = stageFacts(result.warnings).find((f) => f.kind === 'not_covered' && f.detail.join(' ').includes('key judgement'));
    expect(gap).toMatchObject({ count: 1, of: 1 });
  });
});
