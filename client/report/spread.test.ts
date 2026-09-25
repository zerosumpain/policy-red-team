// What the exposure strip is allowed to claim, against the run it was drawn for.
//
// The fixture is the exposure and band of all 47 plays on assessment 36ebca37,
// to four decimals. The caption this produces is a statement about the
// assessment printed under a figure, so it is asserted here rather than read off
// a screenshot: if a re-scored run makes the severe cut a real break instead of a
// 0.0039 hairline, the sentence has to change with it and this is what notices.
import { describe, expect, it } from 'vitest';
import type { Band } from '$lib/policy-analysis/view';
import { bandCuts, bandSpans, exposureSpread, type SpreadPlay } from './spread';

const RUN: [number, string][] = [
  [0.0495, 'limited'], [0.1928, 'limited'], [0.3184, 'moderate'], [0.33, 'moderate'],
  [0.3652, 'moderate'], [0.3823, 'moderate'], [0.429, 'moderate'], [0.4472, 'moderate'],
  [0.4579, 'moderate'], [0.5426, 'significant'], [0.5751, 'significant'],
  [0.5897, 'significant'], [0.6326, 'significant'], [0.6421, 'significant'],
  [0.6539, 'significant'], [0.6671, 'significant'], [0.6724, 'significant'],
  [0.6727, 'significant'], [0.6754, 'significant'], [0.6763, 'significant'],
  [0.6784, 'significant'], [0.6785, 'significant'], [0.6902, 'significant'],
  [0.6905, 'significant'], [0.6929, 'significant'], [0.6965, 'significant'],
  [0.6968, 'significant'], [0.7007, 'severe'], [0.7015, 'severe'], [0.7024, 'severe'],
  [0.7054, 'severe'], [0.7153, 'severe'], [0.7219, 'severe'], [0.7261, 'severe'],
  [0.7269, 'severe'], [0.731, 'severe'], [0.7316, 'severe'], [0.7377, 'severe'],
  [0.7386, 'severe'], [0.7388, 'severe'], [0.7388, 'severe'], [0.7458, 'severe'],
  [0.747, 'severe'], [0.7517, 'severe'], [0.7521, 'severe'], [0.7607, 'severe'],
  [0.7693, 'severe'],
];

const plays: SpreadPlay[] = RUN.map(([exposure, band], i) => ({
  id: `s11_play_${i}`,
  label: `Play ${i}`,
  exposure,
  band: band as Band,
}));

describe('the cuts the strip draws', () => {
  it('takes them from the scorer rather than from a list typed into a figure', () => {
    expect(bandCuts()).toEqual([0.7, 0.5, 0.3]);
  });
});

describe('what each band actually spans', () => {
  it('reports the run of exposures inside every band, in band order', () => {
    expect(bandSpans(plays).map((s) => [s.band, s.count, s.low, s.high])).toEqual([
      ['severe', 20, 0.7007, 0.7693],
      ['significant', 18, 0.5426, 0.6968],
      ['moderate', 7, 0.3184, 0.4579],
      ['limited', 2, 0.0495, 0.1928],
    ]);
  });

  it('gives each band the stretch of the axis it owns, which is not the stretch its plays cover', () => {
    // Severe owns 0.70 to 1.00 and its plays reach 0.7693 — the empty top
    // quarter is a real property of this assessment and the strip draws it.
    expect(bandSpans(plays).map((s) => [s.band, s.from, s.to])).toEqual([
      ['severe', 0.7, 1],
      ['significant', 0.5, 0.7],
      ['moderate', 0.3, 0.5],
      ['limited', 0, 0.3],
    ]);
  });

  it('says nothing about a band with no plays in it rather than reporting a zero', () => {
    const only = plays.filter((p) => p.band === 'severe');
    const limited = bandSpans(only).find((s) => s.band === 'limited');
    expect(limited).toEqual({ band: 'limited', label: 'Limited', count: 0, low: null, high: null, from: 0, to: 0.3 });
  });
});

describe('the caption under the strip', () => {
  it('states the cluster and the real daylight at each cut, from the plays', () => {
    expect(exposureSpread(plays).caption).toBe(
      '38 of the 47 ways to beat it sit between 0.54 and 0.77 — 23% of the scale. '
      + 'The cuts are not alike: the scores either side of 0.70 are 0.0039 apart, '
      + 'either side of 0.50 are 0.0847 apart, either side of 0.30 are 0.1256 apart.',
    );
  });

  it('names and counts each stretch between the cuts, for the axis', () => {
    expect(exposureSpread(plays).regions).toEqual([
      { label: 'Severe 20', from: 0.7, to: 1 },
      { label: 'Significant 18', from: 0.5, to: 0.7 },
      { label: 'Moderate 7', from: 0.3, to: 0.5 },
      { label: 'Limited 2', from: 0, to: 0.3 },
    ]);
  });

  it('leaves out a cut nothing sits below, instead of printing a gap of zero', () => {
    const severe = plays.filter((p) => p.band === 'severe');
    const caption = exposureSpread(severe).caption;
    expect(caption).not.toContain('0.50');
    expect(caption).not.toContain('0.30');
  });

  it('draws every play on the 0 to 1 scale the score is defined on', () => {
    const { values } = exposureSpread(plays);
    expect(values).toHaveLength(47);
    expect(values[0]).toEqual({ id: 's11_play_0', label: 'Play 0', value: 0.0495 });
  });
});
