// What a library can say that one assessment cannot.
//
// The cases below are the shapes a real library takes: a body met once (where a
// dossier adds nothing the assessment did not already say), met twice agreeing,
// and met twice disagreeing — which is the only one of the three worth opening
// the page for.
import { describe, expect, it } from 'vitest';
import type { PersonaObservation, PersonaTrait } from '$lib/policy-analysis/personas';
import { agreed, contested, dossier } from './persona-view';

const trait = (key: string, value: string): PersonaTrait =>
  ({ key, label: key.replace(/([a-z])([A-Z])/g, '$1 $2'), value, origin: 'structural_inference', confidence: null });

const sighting = (over: Partial<PersonaObservation>): PersonaObservation => ({
  id: over.id ?? `o-${Math.random()}`,
  personaId: 'p1',
  kind: 'assessment',
  analysisId: 'a1',
  analysisTitle: 'A paper',
  actorId: 's2_actor',
  traits: [],
  plays: [],
  sources: [],
  note: null,
  observedAt: '2026-09-01T00:00:00.000Z',
  ...over,
});

describe('a body met more than once', () => {
  it('names the trait two papers disagree about, and where each said it', () => {
    // The whole reason a library exists: "accountable for delivery" in one
    // paper and "a delivery partner" in the next is a finding about the papers.
    const observations = [
      sighting({ analysisTitle: 'Best start', traits: [trait('accountableTo', 'Accountable for delivery'), trait('formalRole', 'Commissioner')] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Post-16 skills', observedAt: '2026-09-10T00:00:00.000Z',
                 traits: [trait('accountableTo', 'A delivery partner'), trait('formalRole', 'Commissioner')] }),
    ];
    const out = dossier(observations);
    expect(out.contested.map((c) => c.key)).toEqual(['accountableTo']);
    expect(out.contested[0].readings.map((r) => r.value)).toEqual(['A delivery partner', 'Accountable for delivery']);
    expect(out.contested[0].readings[0].where).toEqual(['Post-16 skills']);
    // The ORIGIN travels with the reading: "the document said X" and "a model
    // inferred Y" are not two equal readings of the same thing.
    expect(out.contested[0].readings[0].origin).toBe('structural_inference');
  });

  it('does not call a trait contested when the wording only differs in whitespace', () => {
    const observations = [
      sighting({ traits: [trait('accountableTo', 'Accountable  for\n delivery')] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Another', traits: [trait('accountableTo', 'Accountable for delivery')] }),
    ];
    expect(dossier(observations).contested).toEqual([]);
  });

  it('puts the reading two papers share above the one only this paper offers', () => {
    const observations = [
      sighting({ analysisTitle: 'One', traits: [trait('capacity', 'Stretched')] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Two', traits: [trait('capacity', 'Sufficient')] }),
      sighting({ analysisId: 'a3', analysisTitle: 'Three', traits: [trait('capacity', 'Sufficient')] }),
    ];
    const [row] = dossier(observations).contested;
    expect(row.readings[0]).toMatchObject({ value: 'Sufficient', where: ['Two', 'Three'] });
    expect(row.readings[1]).toMatchObject({ value: 'Stretched', where: ['One'] });
  });

  it('has nothing contested for a body met once, however much it says', () => {
    const only = sighting({ traits: [trait('accountableTo', 'Accountable for delivery'), trait('capacity', 'Stretched')] });
    expect(dossier([only]).contested).toEqual([]);
    expect(dossier([only]).sightings).toHaveLength(1);
  });

  it('ignores an empty trait rather than reporting it as a disagreement', () => {
    const observations = [
      sighting({ traits: [trait('capacity', 'Stretched')] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Another', traits: [trait('capacity', '   ')] }),
    ];
    expect(dossier(observations).contested).toEqual([]);
  });
});

describe('two observations from ONE paper', () => {
  // `applyPersonaLinks` keys on (personaId, analysisId, actorId), so two actors
  // in one assessment that resolve to the same body make two rows for one paper.
  const twoActors = [
    sighting({ id: 'o1', analysisId: 'a1', analysisTitle: 'One paper', actorId: 's2_a', traits: [trait('capacity', 'Stretched')] }),
    sighting({ id: 'o2', analysisId: 'a1', analysisTitle: 'One paper', actorId: 's2_b', traits: [trait('capacity', 'Sufficient')] }),
  ];

  it('names that paper once, not twice', () => {
    const [row] = dossier(twoActors).contested;
    expect(row.readings.every((r) => r.where.length === 1)).toBe(true);
    expect(row.readings.flatMap((r) => r.where)).toEqual(['One paper', 'One paper']);
  });

  it('does not let one paper contradicting itself outrank two papers agreeing', () => {
    const mixed = [
      ...twoActors,
      sighting({ id: 'o3', analysisId: 'a2', analysisTitle: 'Two', traits: [trait('role', 'Commissioner')] }),
      sighting({ id: 'o4', analysisId: 'a3', analysisTitle: 'Three', traits: [trait('role', 'Commissioner')] }),
    ];
    const out = dossier(mixed);
    // Two real papers agreeing on `role` is agreement, not a disagreement.
    expect(out.contested.map((c) => c.key)).toEqual(['capacity']);
    expect(out.agreed.map((a) => a.key)).toEqual(['role']);
    expect(out.agreed[0].where).toEqual(['Two', 'Three']);
  });

  it('gives every sighting a key of its own, so two rows from one paper do not collide', () => {
    expect(dossier(twoActors).sightings.map((s) => s.id)).toEqual(['o1', 'o2']);
  });
});

describe('claiming the papers agree', () => {
  it('is only claimed where two papers recorded the SAME trait and matched', () => {
    const out = dossier([
      sighting({ analysisTitle: 'One', traits: [trait('capacity', 'Stretched')] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Two', traits: [trait('capacity', 'Stretched')] }),
    ]);
    expect(out.contested).toEqual([]);
    expect(out.agreed).toEqual([{ key: 'capacity', label: 'capacity', value: 'Stretched', where: ['One', 'Two'] }]);
  });

  it('is NOT claimed when two papers recorded disjoint traits', () => {
    // Nothing contested is not agreement, and the page was making that claim.
    const out = dossier([
      sighting({ analysisTitle: 'One', traits: [trait('capacity', 'Stretched')] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Two', traits: [trait('resources', 'Unfunded')] }),
    ]);
    expect(out.contested).toEqual([]);
    expect(out.agreed).toEqual([]);
  });

  it('is NOT claimed when the papers recorded no traits at all', () => {
    const out = dossier([
      sighting({ analysisTitle: 'One' }),
      sighting({ analysisId: 'a2', analysisTitle: 'Two' }),
    ]);
    expect(out.agreed).toEqual([]);
    expect(agreed([])).toEqual([]);
  });

  it('is NOT claimed on one paper saying something twice', () => {
    const out = dossier([
      sighting({ id: 'o1', analysisId: 'a1', analysisTitle: 'One', traits: [trait('capacity', 'Stretched')] }),
      sighting({ id: 'o2', analysisId: 'a1', analysisTitle: 'One', traits: [trait('capacity', 'Stretched')] }),
    ]);
    expect(out.agreed).toEqual([]);
  });
});

describe('the plays a body could run', () => {
  it('ranks across every paper, worst band first, and says which paper found each', () => {
    // A body's exposure is not a per-assessment fact to a reader deciding
    // whether to worry about it.
    const observations = [
      sighting({ analysisTitle: 'One', plays: [{ label: 'Quiet non-compliance', band: 'limited', exposure: 0.2, legality: 'compliant' }] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Two', plays: [
        { label: 'Metric gaming', band: 'severe', exposure: 0.8, legality: 'compliant' },
        { label: 'Delay and blame', band: 'moderate', exposure: 0.5, legality: 'grey' },
      ] }),
    ];
    const out = dossier(observations);
    expect(out.plays.map((p) => p.band)).toEqual(['severe', 'moderate', 'limited']);
    expect(out.plays[0].from).toBe('Two');
    expect(out.plays[0].analysisId).toBe('a2');
  });

  it('puts a band the vocabulary has gained since at the end rather than the front', () => {
    const observations = [sighting({ plays: [
      { label: 'Unknown band', band: 'catastrophic', exposure: 0.9, legality: 'breach' },
      { label: 'Known band', band: 'moderate', exposure: 0.1, legality: 'compliant' },
    ] })];
    expect(dossier(observations).plays.map((p) => p.label)).toEqual(['Known band', 'Unknown band']);
  });

  it('ranks a band the model happened to capitalise, rather than demoting it', () => {
    // `playsFor` stores whatever was written. A "Severe" ranked as an unknown
    // word sank to the bottom of a table captioned "worst first".
    const observations = [sighting({ plays: [
      { label: 'Mild', band: 'limited', exposure: 0.1, legality: 'compliant' },
      { label: 'Shouty', band: 'Severe', exposure: 0.9, legality: 'breach' },
    ] })];
    expect(dossier(observations).plays.map((p) => p.label)).toEqual(['Shouty', 'Mild']);
  });
});

describe('ordering and the rows that carry no date', () => {
  it('leads with the most recent sighting', () => {
    const out = dossier([
      sighting({ analysisTitle: 'Older', observedAt: '2026-01-01T00:00:00.000Z' }),
      sighting({ analysisId: 'a2', analysisTitle: 'Newer', observedAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    expect(out.sightings.map((s) => s.title)).toEqual(['Newer', 'Older']);
  });

  it('sorts an undated row LAST, not first', () => {
    // A null `observedAt` is a row written before the column was populated, not
    // a row from the beginning of time.
    const out = dossier([
      sighting({ analysisTitle: 'Undated', observedAt: null }),
      sighting({ analysisId: 'a2', analysisTitle: 'Dated', observedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    expect(out.sightings.map((s) => s.title)).toEqual(['Dated', 'Undated']);
  });

  it('names an assessment that is no longer in this install rather than showing a blank', () => {
    const out = dossier([sighting({ analysisId: null, analysisTitle: null })]);
    expect(out.sightings[0].title).toBe('An assessment no longer in this install');
  });
});

describe('reader-commissioned research', () => {
  it('is kept apart from what the assessments said', () => {
    // A persona is CONTEXT, never evidence, and research is a third thing
    // again: public sources the reader asked for, not a paper's conclusion.
    const out = dossier([
      sighting({ analysisTitle: 'A paper', traits: [trait('capacity', 'Stretched')] }),
      sighting({ id: 'r1', kind: 'research', analysisId: null, analysisTitle: null, note: 'Two sources found.',
                 traits: [trait('capacity', 'Funded to 2028')],
                 sources: [{ url: 'https://example.gov.uk/a', title: 'A source', quality: 'official' }] }),
    ]);
    expect(out.sightings).toHaveLength(1);
    expect(out.research).toHaveLength(1);
    expect(out.research[0].sources[0].title).toBe('A source');
    // And a research reading never makes a trait look contested BETWEEN PAPERS.
    expect(out.contested).toEqual([]);
  });
});

describe('nothing at all', () => {
  it('returns empty everything rather than throwing', () => {
    expect(dossier([])).toEqual({ sightings: [], research: [], plays: [], contested: [], agreed: [] });
    expect(contested([])).toEqual([]);
  });
});

describe('phase 19: papers are compared on what travels, and counted by document', () => {
  it('does not call two papers’ different budgets and deadlines a disagreement about the body', () => {
    // Measured: dossiers carried "£523 million ... by 2028", so every paper that
    // named its own figure read as contradicting every other.
    const out = dossier([
      sighting({ analysisTitle: 'One', traits: [trait('resources', 'Funds councils. Committed £523 million by 2028.')] }),
      sighting({ analysisId: 'a2', analysisTitle: 'Two', traits: [trait('resources', 'Funds councils. Committed £40 million from April 2026.')] }),
    ]);
    expect(out.contested).toEqual([]);
    expect(out.agreed).toEqual([{ key: 'resources', label: 'resources', value: 'Funds councils.', where: ['One', 'Two'] }]);
  });

  it('does not claim agreement between two runs of the same document', () => {
    const out = dossier([
      sighting({ id: 'o1', analysisId: 'a1', analysisTitle: 'Draft', documentSha: 'abc', traits: [trait('capacity', 'Stretched')] }),
      sighting({ id: 'o2', analysisId: 'a2', analysisTitle: 'Draft, run again', documentSha: 'abc', traits: [trait('capacity', 'Stretched')] }),
    ]);
    expect(out.agreed).toEqual([]);
  });
});
