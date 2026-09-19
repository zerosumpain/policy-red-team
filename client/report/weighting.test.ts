import { describe, expect, it } from 'vitest';
import { exposureOf } from '$lib/policy-analysis/exposure';
import { FACTOR_KEYS, type Play } from '$lib/policy-analysis/view';
import { artefact } from '$lib/policy-analysis/contracts';
import { EQUAL, isEqual, weightedExposure } from './weighting';

/**
 * THE RE-RANKING MUST REPRODUCE THE ASSESSMENT AT EQUAL WEIGHTS.
 *
 * If it does not, the "your order" figure and the assessment's own figure are
 * two different arithmetics printed side by side on the same play, and a reader
 * comparing them is comparing this file's bug with the pipeline's answer.
 * The spec asks for four decimal places across all 47 plays; this asserts it
 * across a grid that includes the awkward cases.
 */
const play = (factors: Record<string, number>): Play => ({
  artefact: artefact('p', 'exploit', 'Play', 'x', {}, { refs: [] }),
  actor: null,
  band: 'severe',
  exposure: 0,
  factors: FACTOR_KEYS.map((key) => ({ key, value: factors[key] ?? 0 })),
});

const GRID: Record<string, number>[] = [
  { incentive: 0.9, ease: 0.8, impact: 0.7, concealment: 0.6 },
  { incentive: 0.1, ease: 0.1, impact: 0.1, concealment: 0.1 },  // below the floor
  { incentive: 0, ease: 0.9, impact: 0.9, concealment: 0.9 },    // a zero factor
  { incentive: 1, ease: 1, impact: 1, concealment: 1 },
  { incentive: 0.42, ease: 0.17, impact: 0.93, concealment: 0.05 },
  { incentive: 1.4, ease: -0.2, impact: 0.5, concealment: 0.5 }, // out of range
];

describe('equal weights reproduce the pipeline exactly', () => {
  it.each(GRID)('matches exposureOf to four decimal places for %j', (factors) => {
    expect(weightedExposure(play(factors), EQUAL)).toBeCloseTo(exposureOf(factors), 4);
  });
});

describe('the floor, which is not symmetric', () => {
  it('floors concealment at 0.15 but not incentive', () => {
    // A play nobody would notice is not made harmless by being noticeable;
    // a play nobody is motivated to run really is harmless.
    const unnoticed = weightedExposure(play({ incentive: 0.9, ease: 0.9, impact: 0.9, concealment: 0 }), EQUAL);
    const unmotivated = weightedExposure(play({ incentive: 0, ease: 0.9, impact: 0.9, concealment: 0.9 }), EQUAL);
    expect(unnoticed).toBeGreaterThan(0);
    expect(unmotivated).toBe(0);
  });
});

describe('re-weighting', () => {
  it('changes the order without changing the assessment’s own figure', () => {
    const easy = play({ incentive: 0.2, ease: 0.95, impact: 0.3, concealment: 0.3 });
    const damaging = play({ incentive: 0.3, ease: 0.2, impact: 0.95, concealment: 0.3 });
    const byEase = weightedExposure(easy, { ...EQUAL, ease: 3 }) > weightedExposure(damaging, { ...EQUAL, ease: 3 });
    const byImpact = weightedExposure(damaging, { ...EQUAL, impact: 3 }) > weightedExposure(easy, { ...EQUAL, impact: 3 });
    expect(byEase).toBe(true);
    expect(byImpact).toBe(true);
  });

  it('drops a factor weighted to zero rather than taking every play to zero', () => {
    const p = play({ incentive: 0.5, ease: 0.5, impact: 0.5, concealment: 0.5 });
    expect(weightedExposure(p, { ...EQUAL, impact: 0 })).toBeCloseTo(0.5, 6);
  });

  it('knows when it is not re-weighting', () => {
    expect(isEqual(EQUAL)).toBe(true);
    expect(isEqual({ ...EQUAL, ease: 2 })).toBe(false);
  });
});
