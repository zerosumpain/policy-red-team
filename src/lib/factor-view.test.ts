// The factor profile, and the ties the copied core cannot report.
//
// On the real run three of the four factors tie at the top — incentive 0.82 on
// two plays, ease 0.90 on two, concealment 0.86 on two, impact 0.72 on one —
// so "worst on this" is arbitrary three times out of four unless the tie is
// said. That is what these tests are mostly about.
import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import { plays } from '$lib/policy-analysis/view';
import { factorReading, factorRows } from './factor-view';

const play = (id: string, f: { incentive: number; ease: number; impact: number; concealment: number }) =>
  artefact(id, 'exploit', `Play ${id}`, 'Something an actor could do.', { ...f, band: 'severe', exposure: 0.7, legality: 'compliant' });

/** Two plays tied on concealment, one clear worst on impact. */
const world = () => plays([
  play('p1', { incentive: 0.8, ease: 0.6, impact: 0.2, concealment: 0.86 }),
  play('p2', { incentive: 0.4, ease: 0.6, impact: 0.7, concealment: 0.86 }),
  play('p3', { incentive: 0.6, ease: 0.9, impact: 0.3, concealment: 0.1 }),
]);

describe('factorRows', () => {
  it('keeps the four judgements in the vocabulary’s order', () => {
    expect(factorRows(world()).map((row) => row.key)).toEqual(['incentive', 'ease', 'impact', 'concealment']);
  });

  it('carries the mean the copied core computes, untouched', () => {
    const rows = factorRows(world());
    expect(rows.find((r) => r.key === 'ease')?.mean).toBeCloseTo(0.7, 10);
    expect(rows.find((r) => r.key === 'impact')?.mean).toBeCloseTo(0.4, 10);
  });

  it('COUNTS THE OTHER PLAYS AT THE SAME PEAK, which is the thing `top` alone hides', () => {
    const rows = factorRows(world());
    expect(rows.find((r) => r.key === 'concealment')).toMatchObject({ peak: 0.86, sharing: 1 });
    // A clear worst shares with nobody.
    expect(rows.find((r) => r.key === 'impact')).toMatchObject({ peak: 0.7, sharing: 0 });
  });

  it('carries the slider gloss, so the figure and the weighting control say the same thing', () => {
    expect(factorRows(world()).find((r) => r.key === 'ease')?.gloss)
      .toBe('How little effort, capability or cost it takes');
  });

  it('is empty, not broken, on a run with no plays', () => {
    expect(factorRows([]).every((row) => row.top === null && row.sharing === 0)).toBe(true);
    expect(factorReading(factorRows([]), 0)).toBe('');
  });
});

describe('factorReading', () => {
  it('names the highest and the lowest, and says what the numbers are means of', () => {
    expect(factorReading(factorRows(world()), 3)).toBe(
      'Highest on ease at 0.70, lowest on impact at 0.40 — read those two against the lines above '
      + "them for what this playbook is made of. Each figure is the plain mean across all 3 plays; a play's "
      + 'own exposure is the geometric mean of its four, so it is a magnitude rather than a score.',
    );
  });

  it('refuses to invent a shape where all four judgements average the same', () => {
    const flat = plays([play('p1', { incentive: 0.5, ease: 0.5, impact: 0.5, concealment: 0.5 })]);
    expect(factorReading(factorRows(flat), 1)).toMatch(/^All four judgements average 0\.50\./);
  });
});
