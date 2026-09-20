// What the five tabs are allowed to claim about how big each move is.
//
// The first case is assessment 36ebca37 as the payload actually shapes it, so a
// re-scored run that changes a figure fails here rather than printing a stale
// size on the spine. Three of the five numbers a reviewer proposed for these
// strings were counts of raw artefacts rather than of what the panel renders —
// 32 finding artefacts against the 19 assured ones the write-up draws, 151
// mechanism artefacts against the 41 that generate a play, 171 candidate board
// rows against the 12 distinct bodies that run one — so the fixture is named
// after the view that produced each number.
import { describe, expect, it } from 'vitest';
import { moveCounts, type MoveSizes } from './tabcounts';

/** Assessment 36ebca37, measured against `?view=report` on 2026-09-20. */
const RUN: MoveSizes = {
  findings: 19, // findingsBySection(): 19 sections, one assured finding each
  suggestions: 4, // recommendations(): 4 of 10 carry revision 'assured'
  mechanisms: 41, // mechanismChart(): 41 of 151 are cited by at least one play
  relationships: 106, // network().edges
  plays: 47,
  severe: 20, // bandCounts()[0]
  bodies: 12, // distinct names on the actor board that run a play
  targets: 99, // interplay(): 12 drawn + 87 hidden
  limits: 270, // every stage warning
};

describe('moveCounts', () => {
  it('sizes the five moves of the real run', () => {
    expect(moveCounts(RUN)).toEqual({
      verdict: '19 findings · 4 suggestions',
      causality: '41 mechanisms · 106 relationships',
      threats: '47 plays · 20 severe',
      actors: '12 bodies · 99 targets',
      provenance: '270 limits recorded',
    });
  });

  it('says body, not bodys, and keeps the singular of everything else', () => {
    const one = moveCounts({
      findings: 1, suggestions: 1, mechanisms: 1, relationships: 1,
      plays: 1, severe: 1, bodies: 1, targets: 1, limits: 1,
    });
    expect(one.verdict).toBe('1 finding · 1 suggestion');
    expect(one.causality).toBe('1 mechanism · 1 relationship');
    expect(one.actors).toBe('1 body · 1 target');
    expect(one.provenance).toBe('1 limit recorded');
  });

  it('drops a clause that would print a zero, and the whole phrase when both are', () => {
    const none = moveCounts({ ...RUN, suggestions: 0, severe: 0, limits: 0 });
    // A run that produced no recommendations must not advertise "0 suggestions"
    // in the one control every reader of the report passes through.
    expect(none.verdict).toBe('19 findings');
    expect(none.threats).toBe('47 plays');
    expect(none.provenance).toBeUndefined();

    const empty = moveCounts({
      findings: 0, suggestions: 0, mechanisms: 0, relationships: 0,
      plays: 0, severe: 0, bodies: 0, targets: 0, limits: 0,
    });
    expect(Object.values(empty).every((value) => value === undefined)).toBe(true);
  });

  it('groups a four-figure count, because 1270 limits is read as a year', () => {
    expect(moveCounts({ ...RUN, limits: 1270 }).provenance).toBe('1,270 limits recorded');
  });
});
