import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import {
  describeSelection, filterPlays, isEmptyUnder, mechanismIdsOf, mechanismOf, mechanismsOf,
  narrowExcept, nothingUnder, parseSelection,
} from './selection';
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

  it('filters by mechanism on MEMBERSHIP, not on the play’s first mechanism', () => {
    /*
     * THE DEFECT: this read `mechanismOf(p) === id`, so a mechanism that is
     * never any play's first reference narrowed every view to nothing — while
     * the chart that offers it as a bar counts with `mechanismsOf` and drew it
     * with plays against it. Measured on the Post-16 run: 41 mechanisms carry a
     * bar over 96 pairs, and only 42 plays have a first ref at all, so pressing
     * a bar reading "3 plays" could empty Threats and Actors.
     *
     * `p7` cites m1 first and m2 second, which is the case the two rules
     * disagree about.
     */
    const both = play('p7', 'severe', 'a3', ['m1', 'm2']);
    const withBoth = [...list, both];
    expect(filterPlays(withBoth, { kind: 'mechanism', id: 'm2', label: 'M' }, ids).map((p) => p.artefact.id))
      .toEqual(['p2', 'p7']);
    // And the first-ref reading still works, so nothing that used to match stops.
    expect(filterPlays(withBoth, { kind: 'mechanism', id: 'm1', label: 'M' }, ids).map((p) => p.artefact.id))
      .toEqual(['p1', 'p3', 'p7']);
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

describe('the mechanisms a play cites, all of them', () => {
  it('returns every mechanism in refs, not only the first', () => {
    // `mechanismOf` answers "which one does it hang off"; coverage needs all of
    // them. On the real run 14 plays cite two mechanisms, 11 cite three and 6
    // cite four, so a first-ref count attributes 42 citations where the run
    // recorded 108.
    const both = play('p5', 'severe', 'a1', ['as1', 'm2', 'a1', 'm1']);
    expect(mechanismsOf(both, ids)).toEqual(['m2', 'm1']);
  });

  it('keeps the play’s own order and never repeats an id', () => {
    expect(mechanismsOf(play('p6', 'severe', null, ['m1', 'm1', 'm2']), ids)).toEqual(['m1', 'm2']);
  });

  it('returns an empty array for a play that cites none', () => {
    expect(mechanismsOf(list[3], ids)).toEqual([]);
  });
});

describe('a selection in a URL resolves to the right KIND of thing', () => {
  const artefacts = [
    ...mechanisms,
    artefact('a1', 'actor', 'Ofsted', 'x', {}, { refs: [] }),
    artefact('x1', 'exploit', 'Selective specialisation', 'x', {}, { refs: [] }),
  ];

  it('resolves a mechanism id to a mechanism', () => {
    expect(parseSelection('mechanism:m1', artefacts)).toEqual({ kind: 'mechanism', id: 'm1', label: 'Mechanism m1' });
  });

  it('refuses a PLAY id dressed as a mechanism', () => {
    // Loaded live as `?sel=mechanism:s10_000_exploit_001`, this rendered the
    // banner "Showing what follows from “Selective specialisation…”" — a play's
    // label presented as a mechanism — over two lists narrowed to nothing.
    expect(parseSelection('mechanism:x1', artefacts)).toBeNull();
    expect(parseSelection('actor:m1', artefacts)).toBeNull();
  });

  it('still refuses an id that is not in the run at all', () => {
    expect(parseSelection('mechanism:nothing', artefacts)).toBeNull();
    expect(parseSelection('band:enormous', artefacts)).toBeNull();
  });
});

describe('saying why a list is empty, in the banner’s own verbs', () => {
  it('names the band, the mechanism or the body', () => {
    expect(nothingUnder({ kind: 'band', id: 'limited' })).toBe('No play here has limited exposure.');
    expect(nothingUnder({ kind: 'mechanism', id: 'm1', label: 'Parliamentary presentation' }))
      .toBe('No play here follows from “Parliamentary presentation”.');
    expect(nothingUnder({ kind: 'actor', id: 'a1', label: 'Ofsted' })).toContain('positioned to run');
  });

  it('says nothing when nothing is selected', () => {
    expect(nothingUnder(null)).toBe('');
  });
});

describe('the two play lists narrow by a band, which they did not', () => {
  it('filterPlays honours a band where narrowExcept(…, “band”) cancels it', () => {
    // THE DEFECT: both leads called `narrowExcept(list, selection, ids, 'band' as
    // never)`, which returns the list UNFILTERED under a band selection. Live at
    // ?sel=band:limited — two limited plays in the run — the heading read "Read
    // these first, under this selection" over three severe cards.
    const band = { kind: 'band', id: 'limited' } as const;
    expect(narrowExcept(list, band, ids, 'band')).toBe(list);
    expect(filterPlays(list, band, ids).map((p) => p.artefact.id)).toEqual(['p4']);
  });
});
