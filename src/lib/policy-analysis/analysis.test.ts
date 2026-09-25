// Phase 19 workstream A — a report that says something.
//
// Measured on the one completed real assessment (`36ebca37`, Post-16): the
// headline was generic and hedged, none of the 19 final findings named a play,
// the challenge pushed toward hedging, the play ranking did not discriminate,
// 150 of 150 theory-of-change chains were "provisional", and 46 of 47 plays had
// no precedent. Each block below is the pipeline half of one of those fixes;
// the pure views have their own files.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, SYNTHESIS_STAGE, type Artefact, type StageInput } from './contracts';
import { executeStage } from './pipeline';
import { ingest } from './server/ingest';
import { fixtureModel } from '../../../tests/fixtures/policy-analysis/model';

const signal = new AbortController().signal;
const research = async () => ({ artefacts: [], warnings: [] });
const none = async () => [];
const base = (stage: number, artefacts: Artefact[]): StageInput =>
  ({ stage, title: 'Synthetic policy', jurisdiction: null, policyArea: null, context: null, artefacts });

let cached: Artefact[] | null = null;
/** Stages 1 to 16 on the fixture model, run once and shared. */
async function inventory(): Promise<Artefact[]> {
  if (cached) return structuredClone(cached);
  const fixture = readFileSync('tests/fixtures/policy-analysis/policy.txt');
  const all = (await ingest(fixture, 'policy.txt', 'text/plain')).artefacts;
  for (let stage = 1; stage <= ASSURANCE_STAGE; stage++) {
    const r = await executeStage(base(stage, all), { model: async (...a) => fixtureModel(...a), research, signal, neighbours: none, personas: none });
    all.push(...r.artefacts);
  }
  cached = structuredClone(all);
  return all;
}
const without = (all: Artefact[], stage: number) => all.filter((a) => !a.id.startsWith(`s${stage}_`));

/** The fixture model, recording what each call was sent. */
const recording = () => {
  const sent: Record<string, unknown>[] = [];
  const model = async (...args: Parameters<typeof fixtureModel>) => {
    sent.push(args[2] as Record<string, unknown>);
    return fixtureModel(...args);
  };
  return { sent, model };
};

describe('the stages that write about the plays are handed them as ranked patterns', () => {
  it.each([SYNTHESIS_STAGE, ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE])('stage %i', async (stage) => {
    const all = await inventory();
    const { sent, model } = recording();
    await executeStage(base(stage, without(all, stage)), { model, research, signal, neighbours: none, personas: none });
    const brief = sent[0].playPatterns as { patterns: { pattern: string; rank: number; sharpestPlays: string[] }[] };
    expect(brief.patterns.length).toBeGreaterThan(0);
    expect(brief.patterns[0].rank).toBe(1);
    const plays = new Set(all.filter((a) => a.kind === 'exploit').map((a) => a.id));
    expect(brief.patterns.flatMap((p) => p.sharpestPlays).every((id) => plays.has(id))).toBe(true);
    // After the artefacts, so the cached prefix of the call is unchanged.
    const keys = Object.keys(sent[0]);
    expect(keys.indexOf('playPatterns')).toBeGreaterThan(keys.indexOf('artefacts'));
  });

  it('and the stages that do not are not', async () => {
    const all = await inventory();
    const { sent, model } = recording();
    await executeStage(base(9, without(all, 9)), { model, research, signal, neighbours: none, personas: none });
    expect(sent.every((payload) => !('playPatterns' in payload))).toBe(true);
  });
});
