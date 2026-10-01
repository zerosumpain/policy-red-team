// THE ROUTE TABLE IN ONE MODULE, and the two directions it has to agree in.
//
// A slug that maps to a move which maps back to a different slug is a link
// that lands on the wrong page and says nothing; a `from` that is followed
// wherever it points is an open redirect. Both are cheaper to assert here than
// to find in a browser.
import { describe, expect, it } from 'vitest';
import { MOVES, moveOfSlug, returnLabel, returnTo, viewPath } from './moves';

const ID = '44dd5420-820a-4b99-88ff-c1a978c04559';

describe('the view slugs', () => {
  it('maps every view to its own page and back', () => {
    for (const entry of MOVES.filter((m) => m.id !== 'overview')) {
      const path = viewPath(ID, entry.id);
      expect(moveOfSlug(path.split('/').pop())).toBe(entry.id);
    }
    expect(viewPath(ID, 'overview')).toBe(`/assessments/${ID}`);
    expect(moveOfSlug('')).toBeNull();
    expect(moveOfSlug('verdict')).toBeNull();
  });

  it('puts a section and the carried query on the page', () => {
    expect(viewPath(ID, 'threats', 'weights', 'sel=band:severe')).toBe(`/assessments/${ID}/threats/weights?sel=band:severe`);
    // The Summary has no sections: a section on it is dropped, never a path nobody routes.
    expect(viewPath(ID, 'overview', 'weights')).toBe(`/assessments/${ID}`);
    expect(viewPath(ID, 'use')).toBe(`/assessments/${ID}/use`);
  });
});

describe('the way back from an item', () => {
  it('follows a path inside this assessment as written', () => {
    const from = `/assessments/${ID}/causes/network?sel=mechanism:s5_001`;
    expect(returnTo(ID, from)).toBe(from);
    expect(returnLabel(ID, from)).toBe('Back to Causes');
  });

  it('reads the pre-phase-21 query shape and keeps its selection', () => {
    expect(returnTo(ID, 'move=threats&sel=band:severe')).toBe(`/assessments/${ID}/threats?sel=band%3Asevere`);
    expect(returnTo(ID, 'sel=band:severe')).toBe(`/assessments/${ID}?sel=band%3Asevere`);
    expect(returnLabel(ID, 'move=actors')).toBe('Back to Who is involved');
  });

  it('never leaves the assessment', () => {
    for (const from of ['//evil.example/x', '/admin', '/assessments/other-id/threats', 'https://evil.example']) {
      expect(returnTo(ID, from).startsWith(`/assessments/${ID}`)).toBe(true);
    }
    expect(returnTo(ID, '')).toBe(`/assessments/${ID}`);
    expect(returnLabel(ID, '')).toBe('Back to the assessment');
  });
});
