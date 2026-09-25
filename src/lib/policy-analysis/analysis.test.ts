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
import { artefact, ASSURANCE_CATEGORIES, ASSURANCE_STAGE, ASSURED_SYNTHESIS_STAGE, DEEP_CHAINS, SYNTHESIS_STAGE, THEORY_STAGE, type Artefact, type StageInput } from './contracts';
import { scoreExploits } from './exposure';
import { systemPrompt } from './prompts';
import { assessmentMarkdown } from './report-doc';
import { stageFacts } from './stage-facts';
import { triageArtefacts } from './validation';
import { precedentOf } from './view';
import { deepChainMechanisms, executeStage } from './pipeline';
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

describe('the theory of change is one programme model and deep chains where the policy is attacked', () => {
  const passage = artefact('passage_0001', 'passage', 'Page 1', 'The Council is accountable for delivery.', { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', confidence: 1, startOffset: 0, endOffset: 40 });
  const mechanisms = Array.from({ length: 20 }, (_, i) => artefact(`s1_${String(i).padStart(3, '0')}_mech`, 'mechanism', `Mechanism ${i}`, 'Machinery.', { intervention: 'i', implementation: 'x', notes: 'n' }, { refs: [passage.id] }));
  const assumption = artefact('s1_000_assumption', 'assumption', 'Capacity', 'Capacity is assumed.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, notes: 'n' }, { refs: [passage.id, mechanisms[0].id] });
  // Plays aimed at mechanisms 19, 18 (twice) and 17: the red team's targets, not the first in id order.
  const aim = (id: string, target: string) => artefact(id, 'exploit', 'Visible compliance', 'A play.', { actorId: 's2_x', targets: [target], preconditions: [assumption.id] }, { refs: [assumption.id] });
  const plays = [aim('s10_000_a', mechanisms[18].id), aim('s10_001_b', mechanisms[18].id), aim('s10_002_c', mechanisms[19].id), aim('s10_003_d', mechanisms[17].id)];
  const edge = artefact('s3_000_edge', 'edge', 'Runs', 'x', { notes: 'n' }, { fromId: 's2_x', toId: mechanisms[5].id, relation: 'delivers', temporal: 'proposed', refs: [] });
  const all = [passage, ...mechanisms, assumption, ...plays, edge];

  const chainFor = (prefix: string, mechanismId: string, judgement = 'contested') => artefact(`${prefix}chain`, 'causal_chain', 'Chain', 'A chain.', {
    mechanismId, inputs: [], activities: ['a'], outputs: ['o'], outcomes: ['u'], impacts: [], causalMechanisms: ['c'], assumptions: [assumption.id],
    alternativeExplanations: ['e'], negativePathways: ['n'], indicators: [], evidenceLimits: 'l', judgement, weakestLink: 'Capacity.',
  }, { refs: [mechanismId, assumption.id] });
  const logic = (prefix: string) => artefact(`${prefix}logic`, 'logic_model', 'Programme', 'The programme.', {
    inputs: [], activities: ['a'], outputs: ['o'], outcomes: ['u'], impacts: [], mechanismIds: [mechanisms[18].id], assumptions: [assumption.id], weakestLink: 'Capacity.', evidenceLimits: 'l', judgement: 'provisional',
  }, { refs: [mechanisms[18].id, assumption.id] });
  const stub = (sent: Record<string, unknown>[] = []) => async (_s: number, _k: string, raw: unknown) => {
    const input = raw as { idPrefix: string; targetMechanismId?: string | null; programmeModel?: boolean };
    sent.push(input as Record<string, unknown>);
    return { artefacts: [input.programmeModel ? logic(input.idPrefix) : chainFor(input.idPrefix, String(input.targetMechanismId))], warnings: [] };
  };

  it('chooses the mechanisms the most plays are aimed at, then the best connected', () => {
    const { selected } = deepChainMechanisms(all);
    expect(selected).toHaveLength(DEEP_CHAINS);
    expect(selected.slice(0, 4).map((m) => m.label)).toEqual(['Mechanism 18', 'Mechanism 17', 'Mechanism 19', 'Mechanism 5']);
  });

  it('makes one programme call and DEEP_CHAINS deep calls, each handed the plays aimed at it', async () => {
    const sent: Record<string, unknown>[] = [];
    const result = await executeStage(base(THEORY_STAGE, all), { model: stub(sent), research, signal });
    expect(sent).toHaveLength(DEEP_CHAINS + 1);
    expect(sent.filter((s) => s.programmeModel)).toHaveLength(1);
    const deep18 = sent.find((s) => s.targetMechanismId === mechanisms[18].id)!;
    expect((deep18.artefacts as Artefact[]).filter((a) => a.kind === 'exploit').map((a) => a.id)).toEqual(['s10_000_a', 's10_001_b']);
    expect(result.artefacts.filter((a) => a.kind === 'logic_model')).toHaveLength(1);
    expect(result.artefacts.filter((a) => a.kind === 'causal_chain')).toHaveLength(DEEP_CHAINS);
    // The scope is said once, and filed as a limit of the run, not an open question.
    const facts = stageFacts(result.warnings);
    expect(facts.map((f) => f.kind)).toEqual(['not_covered']);
    expect(facts[0]).toMatchObject({ count: 12, of: 20 });
  });

  it('counts its floor against the chosen mechanisms, not all of them', async () => {
    // Eight chains for twenty mechanisms would have failed the old floor, which
    // demanded a chain for most of ALL mechanisms. Five of eight passes.
    const chosen = new Set(deepChainMechanisms(all).selected.slice(0, 5).map((m) => m.id));
    const partial = async (s: number, k: string, raw: unknown) => {
      const input = raw as { targetMechanismId?: string | null; programmeModel?: boolean };
      if (!input.programmeModel && !chosen.has(String(input.targetMechanismId))) return { artefacts: [], warnings: [] };
      return stub()(s, k, raw);
    };
    const result = await executeStage(base(THEORY_STAGE, all), { model: partial, research, signal });
    expect(stageFacts(result.warnings).find((f) => f.kind === 'not_covered')!.detail.join(' ')).toContain('3 of 8 mechanisms chosen for a deep chain were not assessed');
    // Four of eight is not a majority, and still fails.
    const fewer = new Set([...chosen].slice(0, 4));
    const thin = async (s: number, k: string, raw: unknown) => {
      const input = raw as { targetMechanismId?: string | null; programmeModel?: boolean };
      if (!input.programmeModel && !fewer.has(String(input.targetMechanismId))) return { artefacts: [], warnings: [] };
      return stub()(s, k, raw);
    };
    await expect(executeStage(base(THEORY_STAGE, all), { model: thin, research, signal })).rejects.toThrow(/4 of 8 mechanisms chosen/);
  });

  it('tells the model what earns each judgement, and to name the weakest link', () => {
    const prompt = systemPrompt(THEORY_STAGE);
    expect(prompt).toContain('do not default to provisional');
    expect(prompt).toContain('weakestLink');
    expect(prompt).toContain('programmeModel');
    for (const judgement of ['well_supported', 'supported_with_limits', 'contested', 'provisional', 'unknown']) expect(prompt).toContain(`- ${judgement}: `);
  });

  it('refuses a logic model that names no real mechanism, and narrows one that names a wrong one', () => {
    const bad = logic('s14_000_');
    bad.data.mechanismIds = [assumption.id];
    expect(triageArtefacts({ artefacts: [bad], warnings: [] }, THEORY_STAGE, all).rejected[0]?.code).toBe('reference');
    const mixed = logic('s14_001_');
    mixed.data.mechanismIds = [assumption.id, mechanisms[3].id];
    const kept = triageArtefacts({ artefacts: [mixed], warnings: [] }, THEORY_STAGE, all).artefacts[0];
    expect(kept.data.mechanismIds).toEqual([mechanisms[3].id]);
    expect(kept.refs).toContain(mechanisms[3].id);
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
