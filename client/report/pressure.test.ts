// What Move 4's body table is allowed to claim, against the defect it was built
// to fix.
//
// The shape of the fixture is the shape of the bug. `interplay()` ranks the
// targets, keeps the worst twelve and then derives its actor list from the
// surviving links, so a body whose every play is aimed below the cap disappears
// from a table headed "how far each body reaches" while appearing in the table
// below it — on the real assessment that was UK Research and Innovation at five
// plays and Independent training providers at three. Here the same situation is
// built at a scale a reader of the test can hold: four bodies, five targets, and
// one body aimed only at the quietest of them.
import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import type { ActorView, Band } from '$lib/policy-analysis/view';
import { cleanBodies, funnel, kindCounts, pressureBoard, type PressurePlay } from './pressure';

const play = (
  id: string,
  exposure: number,
  band: Band,
  legality: string,
  actor: string,
  targetIds: string[],
): PressurePlay => ({
  id,
  exposure,
  band,
  legality,
  actor: { id: `actor_${actor}`, label: actor, entityType: actor === 'Government' ? 'concept' : 'agency' },
  targetIds,
});

const KINDS: Record<string, string> = {
  m1: 'mechanism', m2: 'mechanism', m3: 'mechanism', c1: 'claim', q1: 'assumption',
};
const lookup = (id: string) => (KINDS[id] ? { label: id.toUpperCase(), kind: KINDS[id] } : null);

const PLAYS: PressurePlay[] = [
  play('p1', 0.80, 'severe', 'compliant', 'Government', ['m1', 'm2', 'c1']),
  play('p2', 0.70, 'severe', 'grey', 'Government', ['m1']),
  play('p3', 0.60, 'significant', 'compliant', 'Skills England', ['m1', 'm2']),
  play('p4', 0.40, 'moderate', 'compliant', 'Ofsted', ['m2', 'm3']),
  // The body the cap loses: both its plays are aimed at the quietest targets.
  play('p5', 0.65, 'significant', 'compliant', 'Jobcentre Plus', ['q1']),
  play('p6', 0.30, 'moderate', 'grey', 'Jobcentre Plus', ['q1', 'm3']),
];

describe('the targets, ranked', () => {
  const board = pressureBoard(PLAYS, lookup);

  it('ranks by pressure and states what the pressure is a sum of', () => {
    expect(board.targets.map((t) => [t.label, Number(t.pressure.toFixed(2))])).toEqual([
      ['M1', 2.1], ['M2', 1.8], ['Q1', 0.95], ['C1', 0.8], ['M3', 0.7],
    ]);
  });

  it('carries the kind of thing each target is, which the table prints under its name', () => {
    expect(board.targets.map((t) => t.kind)).toEqual(['mechanism', 'mechanism', 'assumption', 'claim', 'mechanism']);
  });

  it('splits the pressure by band as SUMMED EXPOSURE, not as a count of plays', () => {
    // M1 is two severe plays at 0.80 and 0.70 and one significant at 0.60. By
    // count the severe share would be two thirds; by exposure it is 1.50 of
    // 2.10, and the bar's length is a sum of exposure.
    const m1 = board.targets[0];
    expect(m1.split).toEqual([
      { band: 'severe', exposure: 1.5 },
      { band: 'significant', exposure: 0.6 },
    ]);
    expect(m1.split.reduce((n, s) => n + s.exposure, 0)).toBeCloseTo(m1.pressure, 10);
  });

  it('names a target whose artefact has left the assessment rather than dropping the link', () => {
    const gone = pressureBoard([play('p7', 0.5, 'significant', 'compliant', 'Government', ['nope'])], lookup);
    expect(gone.targets[0].label).toBe('A target no longer in the assessment');
    expect(gone.targets[0].kind).toBe('unknown');
  });
});

describe('the bodies, uncapped', () => {
  const board = pressureBoard(PLAYS, lookup);

  it('keeps a body whose every play is aimed below the worst targets', () => {
    // This is the defect: rank the targets, keep the worst three, and Jobcentre
    // Plus is aimed at none of them — Q1 is third here only because the fixture
    // is five targets deep rather than ninety-nine.
    expect(board.bodies.map((b) => b.label)).toContain('Jobcentre Plus');
    expect(board.bodies.find((b) => b.label === 'Jobcentre Plus')?.plays).toBe(2);
  });

  it('counts a body\'s plays off its plays and its reach off its links', () => {
    expect(board.bodies.map((b) => [b.label, b.plays, b.reach])).toEqual([
      ['Government', 2, 3],
      ['Jobcentre Plus', 2, 2],
      ['Skills England', 1, 2],
      ['Ofsted', 1, 2],
    ]);
  });

  it('takes the worst play\'s own band rather than re-thresholding the figure', () => {
    const gov = board.bodies[0];
    expect(gov.worst).toBe(0.80);
    expect(gov.worstBand).toBe('severe');
  });

  it('counts legality per body, which no table in the move used to show', () => {
    expect(board.bodies.map((b) => [b.label, b.compliant, b.grey])).toEqual([
      ['Government', 1, 1],
      ['Jobcentre Plus', 1, 1],
      ['Skills England', 1, 0],
      ['Ofsted', 1, 0],
    ]);
  });

  it('finds the bodies with no grey-area play at all', () => {
    expect(cleanBodies(board.bodies).map((b) => b.label)).toEqual(['Skills England', 'Ofsted']);
  });

  it('drops a play with no body rather than inventing one', () => {
    const orphan: PressurePlay = { id: 'p8', exposure: 0.9, band: 'severe', legality: 'compliant', actor: null, targetIds: ['m1'] };
    expect(pressureBoard([orphan], lookup).bodies).toEqual([]);
  });
});

describe('a composition, counted rather than typed', () => {
  it('groups by kind, largest first', () => {
    expect(kindCounts(pressureBoard(PLAYS, lookup).targets)).toEqual([
      { kind: 'mechanism', count: 3 },
      { kind: 'assumption', count: 1 },
      { kind: 'claim', count: 1 },
    ]);
  });

  it('names the ungrouped rather than leaving a blank in the sentence', () => {
    expect(kindCounts([{ kind: '' }])).toEqual([{ kind: 'unclassified', count: 1 }]);
  });
});

describe('the funnel', () => {
  // A BOARD ROW IS A CANDIDATE, NOT A BODY. "Employers" appears 25 times on the
  // real run and one of those rows carries the profile; a count of rows would
  // report the paper as having named 171 bodies and profiled 55 of them, which
  // is the sentence the page used to print.
  const view = (id: string, label: string, profiled: boolean, plays: number): ActorView => ({
    actor: artefact(id, 'actor', label, '', { entityType: 'agency' }),
    profile: profiled ? artefact(`${id}_p`, 'profile', label, '', { actorId: id }) : null,
    plays: Array.from({ length: plays }, () => ({
      artefact: artefact(`${id}_x`, 'exploit', 'A play', '', {}),
      actor: null, band: 'severe' as Band, exposure: 0.8, factors: [],
    })),
    worst: plays ? 0.8 : 0,
  });

  const board: ActorView[] = [
    view('a1', 'Skills England', true, 2),
    view('a2', 'Skills England', false, 0),
    view('a3', 'Skills England', false, 0),
    view('a4', 'Ofsted', true, 0),
    view('a5', 'A body nobody profiled', false, 0),
  ];

  it('counts names, and reports the rows only as duplicates', () => {
    const counts = funnel(board);
    expect(counts.rows).toBe(5);
    expect(counts.names).toBe(3);
    expect(counts.duplicates).toBe(2);
    expect(counts.active).toBe(1);
  });

  it('separates a body profiled and idle from one the paper never profiled', () => {
    const counts = funnel(board);
    expect(counts.idle.map((b) => b.label)).toEqual(['Ofsted']);
    expect(counts.idleUnprofiled).toBe(1);
  });

  it('does not call a name idle when another of its rows runs a play', () => {
    // The two silent "Skills England" rows are the same body as the active one.
    expect(funnel(board).idle.some((b) => b.label === 'Skills England')).toBe(false);
  });
});
