// The players-by-pattern grid, and the one count taken off a sentence.
//
// `applicability` strings below are the verbatim openings of the ten models on
// assessment 36ebca37. They are here because the count printed above the grid —
// "8 of 10 patterns are judged weakly or indeterminately applicable" — is a
// claim about prose, and the only defensible way to make one is a rule the
// reader can apply to the same text: does it start with the word "weak".
import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import { modelIncidence, weaklyApplicable } from './games';

const model = (id: string, pattern: string, players: string[], applicability = '') =>
  artefact(id, 'model', `${pattern} model`, '', { pattern, players, applicability });

const LABELS: Record<string, string> = {
  gov: 'Government',
  se: 'Skills England',
  hep: 'Higher education providers',
  ofs: 'Office for Students',
};
const label = (id: string) => LABELS[id] ?? null;

const MODELS = [
  model('m1', 'principal_agent', ['gov', 'se', 'hep']),
  model('m2', 'metric_gaming', ['gov', 'se']),
  model('m3', 'regulatory_capture', ['gov', 'ofs', 'hep']),
  model('m4', 'coordination', ['gov']),
];

describe('who plays in which game', () => {
  const grid = modelIncidence(MODELS, label);

  it('orders bodies by how many patterns name them', () => {
    expect(grid.bodies.map((b) => [b.label, b.count])).toEqual([
      ['Government', 4],
      ['Higher education providers', 2],
      ['Skills England', 2],
      ['Office for Students', 1],
    ]);
  });

  it('merges the candidate records of one name into one row', () => {
    // On the live run "Higher education providers" is cited six times as one
    // actor id and once as a second candidate record of the same name. Two rows
    // reading 6 and 1 would be a fact about the resolver drawn as a fact about
    // the policy.
    const split = modelIncidence([
      model('n1', 'principal_agent', ['hep', 'hep_dup']),
      model('n2', 'metric_gaming', ['hep_dup']),
    ], (id) => (id.startsWith('hep') ? 'Higher education providers' : null));
    expect(split.bodies).toEqual([
      { key: 'higher education providers', label: 'Higher education providers', ids: ['hep_dup', 'hep'], count: 2 },
    ]);
  });

  it('answers the cell question both ways round', () => {
    expect(grid.plays('government', 'm4')).toBe(true);
    expect(grid.plays('office for students', 'm4')).toBe(false);
  });

  it('counts a player named twice in one model once', () => {
    const twice = modelIncidence([model('m5', 'coalition_formation', ['gov', 'gov'])], label);
    expect(twice.bodies).toEqual([{ key: 'government', label: 'Government', ids: ['gov'], count: 1 }]);
  });

  it('drops a player id that no longer resolves rather than heading a row with it', () => {
    const stale = modelIncidence([model('m6', 'bargaining_veto', ['gov', 's2_gone'])], label);
    expect(stale.bodies.map((b) => b.key)).toEqual(['government']);
  });

  it('counts the tail the caption names', () => {
    expect(grid.tail(3)).toBe(3);
    expect(grid.tail(1)).toBe(1);
  });
});

describe('how well the pattern fits', () => {
  it('counts only what OPENS with the word, because the rest is prose', () => {
    const live = [
      model('a', 'principal_agent', [], 'Moderate but indeterminate. Applicability is supported by explicit accountability relationships.'),
      model('b', 'collective_action', [], 'The pattern is applicable because the supplied relationships show actors depending on one another.'),
      model('c', 'coordination', [], 'Weak to indeterminate. The mechanism and assumptions clearly involve interdependence.'),
      model('d', 'metric_gaming', [], 'Weak or indeterminate. The model is structurally relevant.'),
      model('e', 'regulatory_capture', [], 'Weak/indeterminate. The structural signature is partly present.'),
      model('f', 'bargaining_veto', [], 'Weak to moderate and partly indeterminate. Applicability is supported by provider autonomy.'),
    ];
    expect(weaklyApplicable(live)).toBe(4);
  });

  it('does not count a sentence that merely contains the word', () => {
    expect(weaklyApplicable([
      model('g', 'coordination', [], 'The evidence of coordination is weak in places but the pattern holds.'),
    ])).toBe(0);
  });
});
