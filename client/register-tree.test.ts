import { describe, expect, it } from 'vitest';
import type { RegisterNode, RegisterTree } from './api';
import { arrangeRoots, descendantCounts, pageOf, searchTree } from './register-tree';

const node = (id: string, name: string, over: Partial<RegisterNode> = {}): RegisterNode => ({
  id, name, kind: 'organisation', status: 'confirmed', partOf: null, kindOf: null, partOfPath: [], kindOfPath: [],
  whatItIs: null, notActorReason: null, aliases: [], body: null, papers: 1, analyses: [], capacities: {}, dossier: false,
  plays: 0, worstBand: null, rollup: { partOf: { plays: 0, worstBand: null }, kindOf: { plays: 0, worstBand: null } }, proposedIn: null, ...over,
});

// Government ⊃ DfE ⊃ Secretary of State; a lone council; a programme run by nobody.
const entries = [
  node('gov', 'Government'),
  node('dfe', 'Department for Education', { partOf: 'gov', aliases: ['DfE'] }),
  node('sos', 'Secretary of State for Education', { kind: 'office_or_role', partOf: 'dfe' }),
  node('council', 'Barchester Council', { papers: 3 }),
  node('prog', 'Shared access programme', { kind: 'not_an_actor' }),
];
const tree: RegisterTree = {
  entries,
  partOf: { roots: ['council', 'gov', 'prog'], children: { gov: ['dfe'], dfe: ['sos'] } },
  kindOf: { roots: entries.map((e) => e.id), children: {} },
  counts: { actors: 4, proposed: 0, notActors: 1, groups: 0 },
  readOnly: false,
};

describe('the master list as a tree', () => {
  it('counts everything beneath an actor, at any depth', () => {
    const below = descendantCounts(tree, 'partOf');
    expect(below.get('gov')).toBe(2);
    expect(below.get('dfe')).toBe(1);
  });

  it('cuts a loop rather than hanging', () => {
    const looped = { ...tree, partOf: { roots: [], children: { a: ['b'], b: ['a'] } } };
    expect(() => descendantCounts(looped, 'partOf')).not.toThrow();
  });

  it('puts the biggest structure first and sets context that is not an actor apart', () => {
    expect(arrangeRoots(tree, 'partOf')).toEqual({ roots: ['gov', 'council'], context: ['prog'] });
    // With no structure, the most-seen leads.
    expect(arrangeRoots(tree, 'kindOf').roots[0]).toBe('council');
  });

  it('finds an actor by another name and shows it where it sits', () => {
    const found = searchTree(tree, 'partOf', 'dfe');
    expect([...found.matches]).toEqual(['dfe']);
    expect([...found.visible!].sort()).toEqual(['dfe', 'gov']);
    expect([...found.open]).toEqual(['gov']);
    expect(searchTree(tree, 'partOf', '  ').visible).toBeNull();
  });

  it('pages a list, clamping a page that is out of range', () => {
    expect(pageOf([1, 2, 3, 4, 5], 2, 2)).toEqual({ items: [3, 4], page: 2, pages: 3 });
    expect(pageOf([1, 2, 3], 9, 2)).toEqual({ items: [3], page: 2, pages: 2 });
    expect(pageOf([], 1, 10)).toEqual({ items: [], page: 1, pages: 1 });
  });
});
