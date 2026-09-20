// The geometry of the three shared figures, against the shape of the real run.
//
// The fixture below is the exposure of the 47 plays on assessment 36ebca37 to
// four decimals, because the whole argument for drawing a strip at all is a
// property of THIS distribution: four bands that are drawn as four equal tiers
// and are nothing of the kind — a 0.0039 hairline at the severe cut, a 0.0847
// break at the significant one, and four fifths of the plays inside a quarter of
// the scale. If a change ever makes the strip's caption stop saying that, this
// is what says so.
import { describe, expect, it } from 'vitest';
import { cluster, divergePeak, divergeShares, strip, type StripValue } from './figures';

const EXPOSURES = [
  0.0495, 0.1928, 0.3184, 0.33, 0.3652, 0.3823, 0.429, 0.4472, 0.4579, 0.5426,
  0.5751, 0.5897, 0.6326, 0.6421, 0.6539, 0.6671, 0.6724, 0.6727, 0.6754, 0.6763,
  0.6784, 0.6785, 0.6902, 0.6905, 0.6929, 0.6965, 0.6968, 0.7007, 0.7015, 0.7024,
  0.7054, 0.7153, 0.7219, 0.7261, 0.7269, 0.731, 0.7316, 0.7377, 0.7386, 0.7388,
  0.7388, 0.7458, 0.747, 0.7517, 0.7521, 0.7607, 0.7693,
];

const values = (list: number[]): StripValue[] =>
  list.map((value, i) => ({ id: `p${i}`, label: `Play ${i}`, value }));

describe('a distribution strip', () => {
  it('places a value at its fraction of the stated axis, not of its own range', () => {
    const { ticks } = strip(values([0.25, 0.5, 1]));
    expect(ticks.map((t) => t.at)).toEqual([0.25, 0.5, 1]);
  });

  it('clamps a value outside the axis rather than drawing it off the end', () => {
    const { ticks } = strip(values([-1, 2]), { min: 0, max: 1 });
    expect(ticks.map((t) => t.at)).toEqual([0, 1]);
  });

  it('draws a run of identical values as one position rather than dividing by a zero span', () => {
    const { ticks } = strip(values([3, 3, 3]), { min: 3, max: 3 });
    expect(ticks.map((t) => t.at)).toEqual([0, 0, 0]);
  });

  it('measures the real daylight either side of each band cut', () => {
    const { cuts } = strip(values(EXPOSURES), { cuts: [0.7, 0.5, 0.3] });
    expect(cuts.map((c) => c.at)).toEqual([0.7, 0.5, 0.3]);
    // The severe cut is a hairline: the last significant play and the first
    // severe one are four thousandths apart.
    expect(cuts[0].below).toBe(0.6968);
    expect(cuts[0].above).toBe(0.7007);
    expect(cuts[0].gap).toBeCloseTo(0.0039, 6);
    // The significant cut is a real break, twenty times wider.
    expect(cuts[1].gap).toBeCloseTo(0.0847, 6);
    expect(cuts[2].gap).toBeCloseTo(0.1256, 6);
  });

  it('reports no gap where a cut has nothing on one side of it', () => {
    const { cuts } = strip(values([0.8, 0.9]), { cuts: [0.5] });
    expect(cuts[0].below).toBeNull();
    expect(cuts[0].gap).toBeNull();
  });
});

describe('the cluster a distribution actually sits in', () => {
  it('finds the narrowest window holding four fifths of the values', () => {
    const found = cluster(EXPOSURES);
    expect(found).toEqual({ count: 38, of: 47, low: 0.5426, high: 0.7693, width: expect.closeTo(0.2267, 6) });
  });

  it('narrows as the share does, because the question is how tight the middle is', () => {
    expect(cluster(EXPOSURES, 0.7)?.count).toBe(33);
    expect(cluster(EXPOSURES, 0.7)?.low).toBe(0.6539);
  });

  it('has nothing to say about nothing', () => {
    expect(cluster([])).toBeNull();
  });
});

describe('a two-direction row', () => {
  const rows = [
    { left: 7, right: 3 },
    { left: 9, right: 0 },
    { left: 0, right: 6 },
  ];

  it('takes one peak from the largest half anywhere in the set', () => {
    expect(divergePeak(rows)).toBe(9);
  });

  it('draws both halves of every row against that one peak', () => {
    const shares = divergeShares(rows);
    expect(shares[0].left).toBeCloseTo((7 / 9) * 100, 10);
    expect(shares[0].right).toBeCloseTo((3 / 9) * 100, 10);
    expect(shares[1].left).toBe(100);
    expect(shares[1].right).toBe(0);
  });

  it('keeps a shared scale when the peak is handed in, so two blocks stay comparable', () => {
    const shares = divergeShares([{ left: 3, right: 0 }], 9);
    expect(shares[0].left).toBeCloseTo((3 / 9) * 100, 10);
  });

  it('draws nothing rather than NaN when every count is zero', () => {
    expect(divergeShares([{ left: 0, right: 0 }])).toEqual([{ left: 0, right: 0 }]);
  });
});
