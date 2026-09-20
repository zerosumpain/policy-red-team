// The three readings "What it suggests" takes off the four recommendations, and
// the case each of them is on the page for.
//
// The figures in the last test of each block are the real ones from the Post-16
// run (assessment 36ebca37): 47 mentions over 26 distinct groups, 35 of the 47
// plays reached, and three of six earlier recommendations cited by nobody.
import { describe, expect, it } from 'vitest';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { beneficiaryTally, challengeRound, coverageByBand } from './recommend-view';

const rec = (id: string, data: Record<string, unknown> = {}, refs: string[] = []): Artefact => ({
  id,
  kind: 'recommendation',
  label: `${id} label`,
  statement: `${id} statement`,
  origin: 'structural_inference',
  confidence: null,
  refs,
  sourceId: null,
  sourceQuote: null,
  page: null,
  section: null,
  startOffset: null,
  endOffset: null,
  url: null,
  fromId: null,
  toId: null,
  relation: null,
  temporal: null,
  data,
});

describe('beneficiaryTally', () => {
  it('counts a group on both sides on one row, so a double count is visible rather than averaged', () => {
    const tally = beneficiaryTally([
      rec('a', { beneficiaries: ['employers', 'learners'], burdenBearers: ['employers'] }),
      rec('b', { beneficiaries: ['employers'], burdenBearers: ['employers', 'providers'] }),
    ]);
    expect(tally.drawn).toEqual([{ label: 'employers', gains: 2, bears: 2 }]);
    expect(tally.singles).toEqual([
      { label: 'learners', gains: 1, bears: 0 },
      { label: 'providers', gains: 0, bears: 1 },
    ]);
    expect(tally.mentions).toBe(6);
  });

  it('does not merge two names the assessment wrote differently', () => {
    // The refusal is the point: merging "Government" into "Government
    // departments" would be the tool asserting an identity the assessment did
    // not, in the one figure whose whole subject is who is being named.
    const tally = beneficiaryTally([
      rec('a', { burdenBearers: ['Government'] }),
      rec('b', { burdenBearers: ['Government departments'] }),
    ], 1);
    expect(tally.drawn.map((row) => row.label)).toEqual(['Government', 'Government departments']);
  });

  it('counts one recommendation once for a group it names twice in one array', () => {
    const tally = beneficiaryTally([rec('a', { beneficiaries: ['providers', 'providers'] })], 1);
    expect(tally.drawn).toEqual([{ label: 'providers', gains: 1, bears: 0 }]);
    // The mention count is of what was written, which is two.
    expect(tally.mentions).toBe(2);
  });

  it('orders by the longer of the two bars, so the group named most often leads', () => {
    const tally = beneficiaryTally([
      rec('a', { beneficiaries: ['x'], burdenBearers: ['y', 'z'] }),
      rec('b', { beneficiaries: ['x'], burdenBearers: ['y'] }),
      rec('c', { burdenBearers: ['y'] }),
    ], 2);
    expect(tally.drawn.map((row) => `${row.label} ${row.gains}/${row.bears}`)).toEqual(['y 0/3', 'x 2/0']);
  });

  it('is empty for a report whose recommendations name nobody', () => {
    expect(beneficiaryTally([rec('a')])).toEqual({ drawn: [], singles: [], mentions: 0 });
  });
});

describe('coverageByBand', () => {
  const plays = [
    { id: 'p1', band: 'severe' }, { id: 'p2', band: 'severe' },
    { id: 'p3', band: 'significant' }, { id: 'p4', band: 'limited' },
  ];

  it('counts each recommendation by band and names what none of them reaches', () => {
    const coverage = coverageByBand([
      { id: 'r1', label: 'One', playIds: ['p1', 'p3'] },
      { id: 'r2', label: 'Two', playIds: ['p1'] },
    ], plays);
    expect(coverage.bands).toEqual(['severe', 'significant', 'limited']);
    expect(coverage.totals).toEqual({ severe: 2, significant: 1, limited: 1 });
    expect(coverage.rows[0]).toEqual({ id: 'r1', label: 'One', counts: { severe: 1, significant: 1, limited: 0 }, total: 2 });
    expect(coverage.rows[1].total).toBe(1);
    expect(coverage.none).toEqual({ counts: { severe: 1, significant: 0, limited: 1 }, total: 2, playIds: ['p2', 'p4'] });
    expect(coverage.reached).toBe(2);
    expect(coverage.plays).toBe(4);
  });

  it('counts a play answered twice in both rows and once in the union', () => {
    // Rows that summed to the number of plays would be the arithmetic saying
    // two recommendations answer twice as much as they do.
    const coverage = coverageByBand([
      { id: 'r1', label: 'One', playIds: ['p1'] },
      { id: 'r2', label: 'Two', playIds: ['p1'] },
    ], plays);
    expect(coverage.rows.map((row) => row.total)).toEqual([1, 1]);
    expect(coverage.reached).toBe(1);
    expect(coverage.none.total).toBe(3);
  });

  it('drops a band no play is in, rather than drawing an empty column', () => {
    const coverage = coverageByBand([], [{ id: 'p1', band: 'moderate' }]);
    expect(coverage.bands).toEqual(['moderate']);
    expect(coverage.none.total).toBe(1);
  });

  it('ignores a play id the reach names that the play list does not hold', () => {
    const coverage = coverageByBand([{ id: 'r1', label: 'One', playIds: ['p1', 'gone'] }], plays);
    expect(coverage.rows[0].total).toBe(1);
  });
});

describe('challengeRound', () => {
  it('names the earlier recommendations no assured one cites', () => {
    const initial = [rec('i1'), rec('i2'), rec('i3')];
    const assured = [rec('a1', {}, ['i1', 'test_authority']), rec('a2', {}, ['i2'])];
    const round = challengeRound([...initial, ...assured], assured);
    expect(round).toEqual({ assured: 2, earlier: 3, dropped: [initial[2]] });
  });

  it('reports nothing dropped where the challenge rewrote every one of them', () => {
    const assured = [rec('a1', {}, ['i1'])];
    expect(challengeRound([rec('i1'), ...assured], assured).dropped).toEqual([]);
  });
});
