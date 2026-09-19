import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import { describeSelection, filterPlays, isEmptyUnder, mechanismIdsOf, mechanismOf, narrowExcept } from './selection';
import type { Play } from '$lib/policy-analysis/view';

/**
 * THE SELECTION IS THE WHOLE IDEA, so it is the thing most worth a test.
 *
 * A filter that survives a tab change is exactly the kind of thing that breaks
 * silently: nothing throws, the view simply shows the wrong set, and a reader
 * comparing two moves draws a conclusion from a list that was never narrowed.
 */
const mech = (id: string) =>
  artefact(id, 'mechanism', `Mechanism ${id}`, 'x', { intervention: 'i', implementation: 'x', notes: 'n' }, { refs: [] });

const play = (id: string, band: Play['band'], actorId: string | null, refs: string[]): Play => ({
  artefact: artefact(id, 'exploit', `Play ${id}`, 'x', {}, { refs }),
  actor: actorId ? artefact(actorId, 'actor', `Actor ${actorId}`, 'x', {}, { refs: [] }) : null,
  band,
  exposure: 0.5,
  factors: [],
});

const mechanisms = [mech('m1'), mech('m2')];
const ids = mechanismIdsOf(mechanisms);
const list = [
  play('p1', 'severe', 'a1', ['m1', 'as1']),
  play('p2', 'moderate', 'a1', ['m2']),
  play('p3', 'severe', 'a2', ['m1']),
  play('p4', 'limited', null, []),
];

describe('narrowing every view to one object', () => {
  it('filters by band', () => {
    expect(filterPlays(list, { kind: 'band', id: 'severe' }, ids).map((p) => p.artefact.id)).toEqual(['p1', 'p3']);
  });

  it('filters by the body positioned to run it', () => {
    expect(filterPlays(list, { kind: 'actor', id: 'a1', label: 'A' }, ids).map((p) => p.artefact.id)).toEqual(['p1', 'p2']);
  });

  it('filters by mechanism, found among refs rather than by position', () => {
    // `refs` carries assumptions and actors too — p1 cites an assumption first.
    expect(filterPlays(list, { kind: 'mechanism', id: 'm1', label: 'M' }, ids).map((p) => p.artefact.id)).toEqual(['p1', 'p3']);
  });

  it('returns the SAME array when nothing is selected', () => {
    // Identity, so a view can tell "unfiltered" from "filtered to everything"
    // without re-deriving the predicate.
    expect(filterPlays(list, null, ids)).toBe(list);
  });

  it('says when a selection narrows to nothing, rather than rendering a blank', () => {
    expect(isEmptyUnder(list, { kind: 'actor', id: 'nobody', label: 'X' }, ids)).toBe(true);
    expect(isEmptyUnder(list, { kind: 'band', id: 'severe' }, ids)).toBe(false);
    // No selection is never "empty" — that is just the whole report.
    expect(isEmptyUnder([], null, ids)).toBe(false);
  });
});

describe('finding the mechanism a play hangs off', () => {
  it('ignores refs that are not mechanisms', () => {
    expect(mechanismOf(list[0], ids)).toBe('m1');
    expect(mechanismOf(list[3], ids)).toBeNull();
  });
});

describe('saying what is selected, in words', () => {
  it('states the unfiltered case as an invitation, not a blank', () => {
    expect(describeSelection(null)).toMatch(/Select a band, a mechanism or a body/);
  });

  it('names the object rather than showing a bare chip', () => {
    expect(describeSelection({ kind: 'mechanism', id: 'm1', label: 'A market monitoring function' }))
      .toBe('Showing what follows from “A market monitoring function”.');
    expect(describeSelection({ kind: 'actor', id: 'a1', label: 'Ofsted' })).toContain('Ofsted');
    expect(describeSelection({ kind: 'band', id: 'severe' })).toContain('severe');
  });
});

describe('a picker never narrows by its own kind', () => {
  it('keeps every band visible when a band is selected', () => {
    // Otherwise picking "severe" leaves no way to pick "moderate" without
    // clearing first — the interaction the carried selection exists to avoid.
    const narrowed = narrowExcept(list, { kind: 'band', id: 'severe' }, ids, 'band');
    expect(narrowed).toBe(list);
  });

  it('but narrows by the other two kinds', () => {
    const byActor = narrowExcept(list, { kind: 'actor', id: 'a1', label: 'A' }, ids, 'band');
    expect(byActor.map((p) => p.artefact.id)).toEqual(['p1', 'p2']);
  });

  it('counts a mechanism’s plays under a band selection', () => {
    // "Showing severe exposure only" must not leave a mechanism claiming six
    // plays when only one of them is severe.
    const severe = narrowExcept(list, { kind: 'band', id: 'severe' }, ids, 'mechanism');
    expect(severe.map((p) => p.artefact.id)).toEqual(['p1', 'p3']);
  });
});
