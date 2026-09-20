// The shaping behind Move 3's scenario section, against the shape of the real run.
//
// The fixture is awkward in the two ways assessment 36ebca37 is awkward, because
// both are what the section has to get right: every one of its eight chains is
// longer than the six effects `scenarioBeats` draws (7, 7, 7, 8, 8, 7, 7, 7), and
// its `affectedOutcomes` are references rather than text — 100 of them resolving
// to 44 distinct mechanisms and claims.
import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import { openingSentence, scenarioTotals, scenarioViews, segmentBeats } from './scenario-view';

const actor = (id: string, label: string) => artefact(id, 'actor', label, 'A body.', {});
const mechanism = (id: string) => artefact(id, 'mechanism', `Machinery ${id}`, 'Machinery.', {});

const scenario = (id: string, key: string, effects: number, outcomes: string[], firstActor: string) =>
  artefact(id, 'scenario', `${key} scenario`, 'It could go like this.', {
    scenario: key,
    changedConditions: 'The first thing changes. The second thing also changes, at length.',
    strategy: 'The body moves.',
    firstActor,
    downstreamEffects: Array.from({ length: effects }, (_, i) => `Effect ${i + 1}.`),
    affectedOutcomes: outcomes,
    detectability: 'It would show up late.',
    correction: 'Publish the baseline.',
    weaknesses: ['It assumes one cause.', 'It has no timing.'],
    sensitivity: ['If the assumption holds, it weakens.'],
  });

const world = [
  actor('a1', 'Government'),
  mechanism('m1'),
  mechanism('m2'),
  scenario('sc1', 'minimum_compliance', 7, ['m1', 'm2'], 'a1'),
  scenario('sc2', 'limited_capacity', 8, ['m2', 'gone'], 'a1'),
  scenario('sc3', 'leadership_change', 3, [], 'missing'),
];

describe('opening sentence', () => {
  it('cuts at a full stop followed by a capital', () => {
    expect(openingSentence('One thing changes. Another does too.')).toBe('One thing changes.');
  });

  // The rule `summarise()` gives: an abbreviation is not a sentence end, because
  // what follows it is not a capital.
  it('does not cut at an abbreviation', () => {
    expect(openingSentence('Funding for e.g. placements is short.')).toBe('Funding for e.g. placements is short.');
  });

  it('keeps a paragraph with no boundary whole', () => {
    expect(openingSentence('  Capacity is below what delivery needs  ')).toBe('Capacity is below what delivery needs');
  });

  it('survives a missing field', () => {
    expect(openingSentence('')).toBe('');
  });
});

describe('the scenario views', () => {
  const views = scenarioViews(world);

  it('is one per scenario artefact, in record order', () => {
    expect(views.map((v) => v.key)).toEqual(['minimum_compliance', 'limited_capacity', 'leadership_change']);
  });

  // The cap is the point of the section's overflow line: on the real run every
  // chain overruns it, so a component that only handled the 8-effect case would
  // drop six more effects without saying so.
  it('counts what the six-effect cap drops, without restating the cap', () => {
    expect(views.map((v) => [v.effects, v.beats.filter((b) => b.key.startsWith('effect-')).length, v.hidden]))
      .toEqual([[7, 6, 1], [8, 6, 2], [3, 3, 0]]);
  });

  // "Which in turn" comes back five times per scenario, which is right as prose
  // and wrong as a bold label repeated forty times down one section.
  it('draws the effect run as one segment, keeping every beat and its position', () => {
    const rows = views[0].segments;
    expect(rows.map((r) => r.kind)).toEqual(['beat', 'beat', 'effects', 'beat', 'beat', 'beat', 'beat', 'beat']);
    const effects = rows[2];
    expect(effects.kind === 'effects' && effects.label).toBe('And then');
    expect(effects.kind === 'effects' && effects.beats.map((b) => b.key))
      .toEqual(['effect-0', 'effect-1', 'effect-2', 'effect-3', 'effect-4', 'effect-5']);
  });

  it('gives a scenario with no effects no effects segment', () => {
    expect(segmentBeats([{ key: 'condition', label: 'The condition changes', body: 'It changes.', refs: [] }]))
      .toEqual([{ kind: 'beat', key: 'condition', label: 'The condition changes', beat: { key: 'condition', label: 'The condition changes', body: 'It changes.', refs: [] } }]);
  });

  it('resolves the first mover, and tolerates one it cannot find', () => {
    expect(views[0].firstActor?.label).toBe('Government');
    expect(views[2].firstActor).toBeNull();
  });

  it('resolves what the chain lands on and drops a reference to nothing', () => {
    expect(views[1].outcomes.map((a) => a.id)).toEqual(['m2']);
    expect(views[2].outcomes).toEqual([]);
  });

  it('takes the gist from the first sentence of the changed conditions', () => {
    expect(views[0].gist).toBe('The first thing changes.');
  });
});

describe('the scenario totals', () => {
  // 100 references to 44 things is the shape on the real run, and the sentence
  // over the section says both — so the distinct count has to be distinct.
  it('counts references once each', () => {
    const totals = scenarioTotals(scenarioViews(world));
    expect(totals).toEqual({ scenarios: 3, effects: 18, hidden: 3, outcomes: 2 });
  });

  it('says nothing rather than something wrong when there are no scenarios', () => {
    expect(scenarioTotals(scenarioViews([actor('a1', 'Government')])))
      .toEqual({ scenarios: 0, effects: 0, hidden: 0, outcomes: 0 });
  });
});
