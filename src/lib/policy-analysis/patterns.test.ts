// Phase 19 workstream A — plays grouped into patterns, ranked against each other.
//
// On the one completed real run 38 of 47 plays sat between 0.54 and 0.77 and
// about two thirds fell into four archetypes by label. These cases pin that the
// grouping reads the model's own words the way a reader would, and that the
// ranking separates what the score did not.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from './contracts';
import { scoreExploits } from './exposure';
import { GRID_MECHANISMS, patternBrief, patternGrid, patternOf, percentiles, playPatterns, playStanding, unansweredPlays } from './patterns';

const mechanism = (i: number) => artefact(`s1_${i}_mech`, 'mechanism', `Mechanism ${i}`, 'Machinery.', { intervention: 'i', implementation: 'x', notes: 'n' });
const actor = (i: number) => artefact(`s2_${i}_actor`, 'actor', `Body ${i}`, 'A body.', { entityType: 'provider' });
const play = (id: string, label: string, actorId: string, targets: string[], f = 0.6, extra: Record<string, unknown> = {}) =>
  artefact(id, 'exploit', label, 'A play.', {
    actorId, play: '', legality: 'compliant', targets, preconditions: ['a'], incentive: f, ease: f, impact: f, concealment: f, ...extra,
  });

describe('a play is filed under the pattern its own words name', () => {
  it.each([
    ['Visible compliance with the reporting duty', 'minimal_compliance'],
    ['Tick-box sign-off of the new standard', 'minimal_compliance'],
    ['Cream-skimming the most job-ready learners', 'selective_take_up'],
    ['Selective take-up of the easiest cases', 'selective_take_up'],
    ['Withholding outcome data from the department', 'information_control'],
    ['Re-basing the completion measure', 'relabelling'],
    ['Relabelling existing provision as new', 'relabelling'],
    ['Running down the clock on the consultation window', 'timing'],
    ['Shifting cost onto colleges', 'cost_shifting'],
  ])('%s → %s', (label, expected) => {
    expect(patternOf({ label, data: {} })).toBe(expected);
  });

  it('lets the label decide when the prose mentions a measure in passing', () => {
    // Nearly every play's prose mentions a measure. A play NAMED as visible
    // compliance is a compliance play, which is why the label weighs three times.
    expect(patternOf({ label: 'Visible compliance', data: { play: 'Report against the measure, the target and the indicator.' } })).toBe('minimal_compliance');
  });

  it('matches at the start of a word, so a stem cannot fire inside another word', () => {
    // "rent" once sat in the funding cues and filed every "current" and "parent" play there.
    expect(patternOf({ label: 'Current parent arrangements persist', data: {} })).toBe('other');
  });

  it('files a play whose words name no pattern as "other" rather than forcing it', () => {
    expect(patternOf({ label: 'An unusual manoeuvre', data: { play: 'Something the checklist never imagined.' } })).toBe('other');
  });
});

describe('patterns are ranked against each other, not on the absolute score', () => {
  const bodies = Array.from({ length: 6 }, (_, i) => actor(i));
  const machinery = Array.from({ length: 4 }, (_, i) => mechanism(i));
  const build = (shift: number) => scoreExploits([
    // Six bodies can do the minimum that shows, across three mechanisms.
    ...bodies.map((b, i) => play(`s10_${i}_compliance`, 'Visible compliance', b.id, [machinery[i % 3].id], 0.6 + shift)),
    // One body can cream-skim, a little worse, against one mechanism.
    play('s10_9_skim', 'Cream-skimming learners', bodies[0].id, [machinery[3].id], 0.65 + shift),
    // Two bodies can withhold data, mildly.
    play('s10_7_data', 'Withholding data', bodies[1].id, [machinery[0].id], 0.55 + shift),
    play('s10_8_data', 'Withholding data', bodies[2].id, [machinery[0].id], 0.55 + shift),
  ]);

  it('groups the plays, and says who could run each pattern and what it is aimed at', () => {
    const patterns = playPatterns([...bodies, ...machinery, ...build(0)]);
    const compliance = patterns.find((p) => p.key === 'minimal_compliance')!;
    expect(compliance.plays).toHaveLength(6);
    expect(compliance.bodies).toHaveLength(6);
    expect(compliance.mechanisms.map((m) => m.id).sort()).toEqual([machinery[0].id, machinery[1].id, machinery[2].id].sort());
    expect(compliance.compliant).toBe(6);
  });

  it('puts a pattern many bodies share above a single sharper play, and gives every pattern its own rank', () => {
    const patterns = playPatterns([...bodies, ...machinery, ...build(0)]);
    expect(patterns[0].key).toBe('minimal_compliance');
    expect(patterns[0].tier).toBe('leading');
    expect(patterns.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(patterns[0].standing).toBe(1);
    expect(patterns.at(-1)!.standing).toBe(0);
  });

  it('ranks the same way however high or low the scores bunch', () => {
    // The real run's problem: everything between 0.54 and 0.77. A relative rank
    // is the same whether the bunch sits at 0.5 or 0.7.
    const low = playPatterns([...bodies, ...machinery, ...build(-0.1)]).map((p) => p.key);
    const high = playPatterns([...bodies, ...machinery, ...build(0.1)]).map((p) => p.key);
    expect(low).toEqual(high);
  });

  it('gives each play a place in the run, and ties share one', () => {
    const plays = build(0);
    const standing = playStanding(plays);
    expect(standing.get('s10_9_skim')).toMatchObject({ rank: 1, of: 9 });
    expect(standing.get('s10_0_compliance')!.rank).toBe(standing.get('s10_5_compliance')!.rank);
    expect(standing.get('s10_7_data')!.tier).toBe('trailing');
  });

  it('computes percentiles with ties as halves', () => {
    expect(percentiles([1, 2, 3])).toEqual([0, 0.5, 1]);
    expect(percentiles([2, 2])).toEqual([0.5, 0.5]);
    expect(percentiles([5])).toEqual([1]);
  });
});

describe('the pattern × mechanism grid', () => {
  it('holds the worst exposure per cell, counts the tail, and counts plays aimed at no mechanism', () => {
    const machinery = Array.from({ length: GRID_MECHANISMS + 2 }, (_, i) => mechanism(i));
    const claim = artefact('s1_0_claim', 'claim', 'A measure', 'A measure.', { category: 'measure', notes: 'n' });
    const plays = scoreExploits([
      ...machinery.map((m, i) => play(`s10_${String(i).padStart(2, '0')}_c`, 'Visible compliance', 's2_0_actor', [m.id], 0.5 + i / 100)),
      play('s10_90_c', 'Visible compliance', 's2_1_actor', [machinery[0].id], 0.9),
      play('s10_91_m', 'Gaming the target', 's2_1_actor', [claim.id], 0.7),
    ]);
    const grid = patternGrid([...machinery, claim, actor(0), actor(1), ...plays]);
    expect(grid.mechanisms).toHaveLength(GRID_MECHANISMS);
    expect(grid.hiddenMechanisms).toBe(2);
    expect(grid.offGrid).toBe(1);
    const hot = grid.cells.find((c) => c.mechanismId === machinery[0].id)!;
    expect(hot.worst).toBeCloseTo(0.9, 5);
    expect(hot.plays).toHaveLength(2);
    expect(hot.relative).toBe(1);
  });
});

describe('a severe play no recommendation answers', () => {
  const body = actor(0);
  const mech = mechanism(0);
  const [severe, answered] = scoreExploits([
    play('s10_0_a', 'Visible compliance', body.id, [mech.id], 0.9),
    play('s10_1_b', 'Cream-skimming', body.id, [mech.id], 0.9),
  ]);
  const finding = artefact('s12_0_f', 'finding', 'Exploitation', 'The worst plays.', { section: 'exploitation', resultIds: [answered.id] }, { refs: [answered.id] });
  const rec = artefact('s12_1_r', 'recommendation', 'Close it', 'Do this.', { findingIds: [finding.id] }, { refs: [finding.id] });

  it('is answered through the finding a recommendation cites, and unanswered otherwise', () => {
    const all: Artefact[] = [body, mech, severe, answered, finding, rec];
    expect(unansweredPlays(all).map((a) => a.id)).toEqual([severe.id]);
  });

  it('is handed to a model call as ids it can cite, beside the ranked patterns', () => {
    const brief = patternBrief([body, mech, severe, answered, finding, rec])!;
    expect(brief.unansweredSeverePlays).toEqual([severe.id]);
    expect(brief.patterns.map((p) => p.rank)).toEqual([1, 2]);
    expect(patternBrief([body, mech])).toBeNull();
  });
});
