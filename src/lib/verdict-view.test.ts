// The band-by-legality cross-tab, against the shape the real run has.
//
// The live assessment is 47 plays: severe 13 compliant / 7 grey, significant
// 9 / 9, moderate 6 / 1, limited 2 / 0, and not one breach. The fixture below
// reproduces exactly that, so a change that quietly re-orders an axis or drops
// a zero shows up as a failure against the numbers on the page rather than
// against numbers invented for the test.
import { describe, expect, it } from 'vitest';
import { bandLegality, legalityReading, type LegalityPlay } from './verdict-view';

const rows = (band: LegalityPlay['band'], legality: string, n: number): LegalityPlay[] =>
  Array.from({ length: n }, () => ({ band, legality }));

/** The real run, as the two fields this module reads. */
const post16 = (): LegalityPlay[] => [
  ...rows('severe', 'compliant', 13), ...rows('severe', 'grey', 7),
  ...rows('significant', 'compliant', 9), ...rows('significant', 'grey', 9),
  ...rows('moderate', 'compliant', 6), ...rows('moderate', 'grey', 1),
  ...rows('limited', 'compliant', 2),
];

describe('bandLegality', () => {
  it('counts the real run the way the payload does', () => {
    const tab = bandLegality(post16());
    expect(tab.total).toBe(47);
    expect(tab.breaches).toBe(0);
    expect(tab.rows.map((r) => [r.legality, r.count])).toEqual([['compliant', 30], ['grey', 17]]);
    expect(tab.bands.map((b) => b.count)).toEqual([20, 18, 7, 2]);
  });

  it('splits the worst band, which is the finding the report never printed', () => {
    const tab = bandLegality(post16());
    expect(tab.worst).toEqual({ band: 'severe', label: 'Severe', total: 20, compliant: 13 });
  });

  it('orders both axes by the vocabulary, not by count', () => {
    // Grey outnumbers compliant here; the row order must not follow it.
    const tab = bandLegality([...rows('limited', 'grey', 5), ...rows('severe', 'compliant', 1)]);
    expect(tab.rows.map((r) => r.legality)).toEqual(['compliant', 'grey']);
    expect(tab.bands.map((b) => b.band)).toEqual(['severe', 'significant', 'moderate', 'limited']);
  });

  it('drops a legality value nothing falls into, and keeps one the enum has never heard of', () => {
    const tab = bandLegality([...rows('severe', 'compliant', 2), ...rows('severe', 'disputed', 1)]);
    expect(tab.rows.map((r) => r.label)).toEqual(['Inside the rules', 'disputed']);
    expect(tab.columns.map((c) => c.count)).toEqual([2, 1]);
    // The counts still add up to the run, which is the reason an unknown value
    // is carried rather than discarded.
    expect(tab.rows.reduce((n, r) => n + r.count, 0)).toBe(tab.total);
  });

  it('is empty, not broken, on a run with no plays', () => {
    const tab = bandLegality([]);
    expect(tab.rows).toEqual([]);
    expect(tab.worst).toBeNull();
    expect(legalityReading(tab)).toEqual([]);
  });
});

describe('legalityReading', () => {
  it('says nothing breaks a rule only when nothing does', () => {
    expect(legalityReading(bandLegality(post16()))[0]).toBe('Not one of the 47 plays breaks a rule.');
  });

  it('counts the breaches when there are some', () => {
    const tab = bandLegality([...rows('severe', 'breach', 3), ...rows('severe', 'compliant', 1)]);
    expect(legalityReading(tab)[0]).toBe('3 of the 4 plays would break a rule; the other 1 would not.');
  });

  it('puts the enforcement consequence on the worst band, not on the whole run', () => {
    expect(legalityReading(bandLegality(post16()))[1]).toBe(
      '13 of the 20 severe plays are things nobody is forbidden to do, so enforcement is not the answer to them.',
    );
  });

  it('drops the consequence when the worst band is entirely outside the rules', () => {
    const tab = bandLegality([...rows('severe', 'breach', 4), ...rows('limited', 'compliant', 2)]);
    expect(legalityReading(tab)).toHaveLength(1);
  });
});
