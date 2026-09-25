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
import { artefact, ASSURANCE_CATEGORIES, ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, SYNTHESIS_STAGE, type Artefact, type StageInput } from './contracts';
import { scoreExploits } from './exposure';
import { systemPrompt } from './prompts';
import { assessmentMarkdown } from './report-doc';
import { stageFacts } from './stage-facts';
import { triageArtefacts } from './validation';
import { precedentOf } from './view';
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

describe('a precedent from recall is allowed, and labelled as not checked', () => {
  const source = artefact('passage_0001', 'passage', 'Page 1', 'The Council is accountable for delivery and bears implementation costs.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1, startOffset: 0, endOffset: 80 });
  const actor = { ...artefact('s2_000_actor', 'actor', 'Council', 'A body.', { entityType: 'local_authority', aliases: [], mentions: ['passage_0001'], ambiguity: '', dates: [], parent: null }), origin: 'extracted_fact' as const, sourceId: source.id, sourceQuote: 'The Council is accountable for delivery', refs: [source.id] };
  const mechanism = { ...artefact('s1_000_mechanism', 'mechanism', 'Shared access', 'A change.', { intervention: 'Shared access', implementation: 'Council delivery', notes: 'n' }), origin: 'extracted_fact' as const, sourceId: source.id, sourceQuote: 'bears implementation costs', refs: [source.id] };
  const assumption = artefact('s1_000_assumption', 'assumption', 'Capacity', 'Capacity is assumed.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'n' }, { refs: [source.id, mechanism.id] });
  const evidence = artefact('s6_000_evidence', 'evidence', 'Evidence', 'What a source shows.', { claimId: null, mechanismId: mechanism.id, actorId: null, assumptionId: null, sourceId: source.id, evidenceType: 't', result: 'supports', sourceQuality: 'q', relevance: 'r', freshness: 'f', dispute: 'd' }, { refs: [source.id, mechanism.id] });
  const prior = [source, actor, mechanism, assumption, evidence];
  const play = (precedent: string, precedentBasis: string, refs = [mechanism.id, assumption.id]) => artefact('s10_000_exploit', 'exploit', 'Visible compliance', 'A play.', {
    actorId: actor.id, motivation: 'm', play: 'p', legality: 'compliant', targets: [mechanism.id], preconditions: [assumption.id], payoff: 'p', costToPolicy: 'c',
    incentive: 0.6, ease: 0.6, impact: 0.6, concealment: 0.6, earlyWarning: 'e', counter: 'c', precedent, precedentBasis,
  }, { refs });

  it('keeps a recalled precedent as recall, and the view says it was not checked', () => {
    const triaged = triageArtefacts({ artefacts: [play('Colleges re-based completion rates after the 2011 reforms.', 'unverified_recall')], warnings: [] }, 10, prior);
    expect(triaged.rejected).toHaveLength(0);
    expect(precedentOf(triaged.artefacts[0])).toMatchObject({ basis: 'unverified_recall', checked: false, label: expect.stringContaining('not checked') });
  });

  it('keeps a precedent as evidence only when the play cites the evidence', () => {
    const backed = triageArtefacts({ artefacts: [play('A documented case.', 'external_evidence', [mechanism.id, assumption.id, evidence.id])], warnings: [] }, 10, prior);
    expect(precedentOf(backed.artefacts[0]).checked).toBe(true);
    const claimed = triageArtefacts({ artefacts: [play('A case it says is documented.', 'external_evidence')], warnings: [] }, 10, prior);
    expect(claimed.artefacts[0].data.precedentBasis).toBe('unverified_recall');
    // Filed as a dropped reference with the item kept — never as an open question.
    expect(stageFacts(claimed.warnings).map((f) => f.kind)).toEqual(['reference_dropped']);
  });

  it('removes a link from the precedent whatever the basis says', () => {
    const triaged = triageArtefacts({ artefacts: [play('A council did this (https://example.org/report.pdf) in 2019.', 'external_evidence', [mechanism.id, assumption.id, evidence.id])], warnings: [] }, 10, prior);
    expect(triaged.artefacts[0].data.precedent).toBe('A council did this in 2019.');
    expect(triaged.artefacts[0].data.precedentBasis).toBe('unverified_recall');
  });

  it('says so in the Word export', () => {
    const [scored] = scoreExploits([play('Colleges re-based completion rates.', 'unverified_recall')]);
    const doc = assessmentMarkdown([actor, mechanism, scored], { title: 'T' });
    expect(doc).toContain('Where it has happened before.** Colleges re-based completion rates.');
    expect(doc).toContain('not checked');
  });
});

describe('the challenge looks for a useless report as hard as for a wrong one', () => {
  it('sends a remit for each of the four new failures, with equal weight', () => {
    const prompt = systemPrompt(ASSURANCE_STAGE);
    for (const category of ['generic', 'actionability', 'sharpest_play', 'unanswered_play']) {
      expect(ASSURANCE_CATEGORIES).toContain(category);
      expect(prompt).toContain(`- ${category}: `);
    }
    expect(prompt).toContain('equal weight');
    expect(prompt).toContain('Hedging is not a fix');
  });

  it('runs every remit as its own call', async () => {
    const all = await inventory();
    const { sent, model } = recording();
    const result = await executeStage(base(ASSURANCE_STAGE, without(all, ASSURANCE_STAGE)), { model, research, signal, neighbours: none, personas: none });
    expect(sent.map((s) => s.targetCategory)).toEqual([...ASSURANCE_CATEGORIES]);
    expect(new Set(result.artefacts.map((a) => a.data.category)).size).toBe(ASSURANCE_CATEGORIES.length);
  });
});
