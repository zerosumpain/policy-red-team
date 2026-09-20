// The shape of a policy graph, and the decision that follows from it.
//
// The star fixture below is built to the proportions measured on a real
// assessment — hundreds of bodies each pointing at one piece of machinery, a
// handful pointing at each other — because that shape is the reason this build
// draws two bar charts and a list instead of a node-link map. If a change ever
// makes an empty bodies-against-bodies grid look drawable again, this is what
// says so.
import { describe, expect, it } from 'vitest';
import { artefact, RELATIONS, type Artefact } from '$lib/policy-analysis/contracts';
import { network } from '$lib/policy-analysis/network';
import { adjacency, MIN_GRID_EDGES } from '$lib/policy-analysis/matrix';
import { barShares, degreeRows, depthOf, egoOf, insightPopulations, kindColour, kindLabel, originSplit, sharedTail, shapeOf } from './relationships';

const actor = (id: string) => artefact(id, 'actor', `Body ${id}`, 'A body.', { entityType: 'department' });
const mechanism = (id: string) => artefact(id, 'mechanism', `Machinery ${id}`, 'Machinery.', {});
type Relation = (typeof RELATIONS)[number];
const edge = (id: string, from: string, to: string, relation: Relation = 'funds'): Artefact =>
  artefact(id, 'edge', `Edge ${id}`, 'A stated relationship.', {}, { fromId: from, toId: to, relation });

/** Many bodies, one piece of machinery each, and a few pointing at one another. */
function star(bodies: number, betweenBodies: number) {
  const items: Artefact[] = [];
  for (let i = 0; i < bodies; i++) {
    items.push(actor(`a${i}`), mechanism(`m${i}`), edge(`e${i}`, `a${i}`, `m${i}`));
  }
  for (let i = 0; i < betweenBodies; i++) {
    items.push(edge(`x${i}`, `a${i}`, `a${(i + 1) % bodies}`, 'reports_to'));
  }
  return network(items);
}

describe('the shape of the graph', () => {
  it('counts relationships by the kind of thing at each end, commonest first', () => {
    const net = star(40, 3);
    const { rows, total } = shapeOf(net);
    expect(total).toBe(43);
    expect(rows.map((r) => [r.key, r.count])).toEqual([['actor>mechanism', 40], ['actor>actor', 3]]);
    expect(rows.reduce((sum, r) => sum + r.share, 0)).toBeCloseTo(1, 10);
  });

  it('is the reason a bodies-against-bodies grid is not drawn on a star', () => {
    // The finding this whole section is shaped by: a strategy written as
    // beneficiaries and machinery has no mesh between its bodies, and the grid
    // says so itself rather than drawing an empty frame.
    const net = star(40, 3);
    const grid = adjacency(net);
    expect(grid.legible).toBe(false);
    expect(grid.placeable).toBe(3);
    expect(grid.total).toBe(43);
    expect(3).toBeLessThan(MIN_GRID_EDGES);

    // Given a real mesh it draws. The floor is about the DATA, not a refusal.
    const meshed = star(40, 12);
    expect(adjacency(meshed).legible).toBe(true);
  });

  it('pins the grid contract the bodies-against-bodies table is drawn from', () => {
    // `rows[i][j]` is the relationship FROM `bodies[i]` TO `bodies[j]`, and a
    // cell's `ids` are the relationships while `relations` are the vocabulary
    // used on them. The table renders a count per cell and the paragraph above
    // it quotes `placeable`; those two have to be counting the same thing.
    const items: Artefact[] = [];
    for (let i = 0; i < 6; i++) items.push(actor(`a${i}`));
    for (let i = 0; i < 6; i++) items.push(edge(`e${i}`, `a${i}`, `a${(i + 1) % 6}`, 'funds'));
    // One pair carrying two relationships of the same type.
    items.push(edge('extra', 'a0', 'a1', 'funds'));
    const grid = adjacency(network(items));
    expect(grid.legible).toBe(true);

    const from = grid.bodies.findIndex((b) => b.id === 'a0');
    const to = grid.bodies.findIndex((b) => b.id === 'a1');
    const cell = grid.rows[from][to];
    expect(cell).not.toBeNull();
    expect(cell?.ids).toHaveLength(2);
    // Two relationships, ONE relation type — the number the table used to print.
    expect(cell?.relations).toHaveLength(1);
    // And the reverse direction is empty, so the halves of the diagonal mean something.
    expect(grid.rows[to][from]).toBeNull();

    // Every cell's `ids` across the grid sum to what the caption claims is shown.
    const drawn = grid.rows.flat().reduce((n, c) => n + (c?.ids.length ?? 0), 0);
    expect(drawn).toBe(grid.shown);
  });

  it('has no rows and no NaN share for a graph with no relationships at all', () => {
    const empty = network([actor('a1'), mechanism('m1')]);
    expect(shapeOf(empty)).toEqual({ rows: [], total: 0 });
  });

  it('folds a kind the vocabulary has gained since into `other` rather than dropping it', () => {
    expect(kindLabel('actor')).toBe('Bodies');
    expect(kindLabel('some_new_kind')).toBe(kindLabel('other'));
    expect(kindColour('some_new_kind')).toBe(kindColour('other'));
  });
});

describe("one entity's own relationships", () => {
  it('splits what it asserts from what is asserted about it', () => {
    const net = network([
      actor('a'), actor('b'), mechanism('m'),
      edge('e1', 'a', 'm'), edge('e2', 'b', 'a', 'reports_to'),
    ]);
    const ego = egoOf(net, 'a');
    expect(ego.node?.label).toBe('Body a');
    expect(ego.out.map((e) => e.toId)).toEqual(['m']);
    expect(ego.in.map((e) => e.fromId)).toEqual(['b']);
  });

  it('counts a self-relationship once, on the side that asserts it', () => {
    // Read independently, `a → a` landed in both directions: the entity was
    // drawn on both sides of its own map and listed twice beneath it.
    const net = network([actor('a'), edge('loop', 'a', 'a', 'depends_on')]);
    const ego = egoOf(net, 'a');
    expect(ego.out.map((e) => e.artefact.id)).toEqual(['loop']);
    expect(ego.in).toEqual([]);
  });

  it('returns an empty ego for something that is not in the graph at all', () => {
    // Most artefacts are not: a finding, a play and a passage have no edges.
    const net = network([actor('a'), mechanism('m'), edge('e1', 'a', 'm')]);
    expect(egoOf(net, 's12_1_finding')).toEqual({ node: null, out: [], in: [] });
  });
});


describe('bar geometry', () => {
  it('is proportional to the largest bar, which fills the track', () => {
    expect(barShares([100, 50, 0])).toEqual([100, 50, 0]);
  });

  it('draws zero-length bars rather than dividing by a zero peak', () => {
    expect(barShares([0, 0])).toEqual([0, 0]);
    expect(barShares([])).toEqual([]);
  });
});

describe('how much of the reading the paper actually said', () => {
  it('splits relationships into read and inferred, and counts the ones that name a page', () => {
    // The live run is 21 read against 85 inferred with 50 naming a page. The
    // fixture is the same shape at a size a reader of this test can hold.
    const net = network([
      actor('a'), mechanism('m1'), mechanism('m2'), mechanism('m3'),
      { ...edge('e1', 'a', 'm1', 'funds'), origin: 'extracted_fact', page: 4 },
      { ...edge('e2', 'a', 'm2', 'has_authority_over'), origin: 'structural_inference' },
      { ...edge('e3', 'a', 'm3', 'has_authority_over'), origin: 'behavioural_hypothesis', page: 9 },
    ]);
    const split = originSplit(net);
    expect(split).toMatchObject({ total: 3, read: 1, inferred: 2, withPage: 2 });
    // The cross-tab is the finding: a family can be entirely inferred while the
    // chart above it invites a reader to weigh it against one that is not.
    expect(split.byFamily.authority).toEqual({ read: 0, inferred: 2 });
    expect(split.byFamily.money).toEqual({ read: 1, inferred: 0 });
  });

  it('treats every origin that is not `extracted_fact` as inferred', () => {
    // Seven origins in the contract, one question a reader is asking. If a new
    // origin is added upstream it lands on the honest side of that question.
    const net = network([
      actor('a'), mechanism('m'),
      { ...edge('e', 'a', 'm'), origin: 'normative_judgement' },
    ]);
    expect(originSplit(net)).toMatchObject({ read: 0, inferred: 1 });
  });
});

describe('how deep the wiring goes', () => {
  it('counts the entities at one end of an arrow only, which on a star is nearly all of them', () => {
    // 40 bodies each pointing at their own piece of machinery, plus one body
    // pointing at another: the second body is the only entity at both ends,
    // which is the live run's shape (119 of 120 at one end only).
    const net = star(40, 1);
    const depth = depthOf(net);
    expect(depth.total).toBe(80);
    expect(depth.both).toBe(1);
    expect(depth.bothNodes.map((n) => n.id)).toEqual(['a1']);
    expect(depth.outOnly + depth.inOnly + depth.both + depth.isolated).toBe(depth.total);
  });

  it('counts two-step paths and refuses to count a step straight back as one', () => {
    // A → B → C is depth. A → B → A is one relationship read backwards, and
    // counting it would make every reciprocal pair look like a chain.
    const chain = network([actor('a'), actor('b'), mechanism('c'), edge('e1', 'a', 'b', 'funds'), edge('e2', 'b', 'c')]);
    expect(depthOf(chain).twoHop).toBe(1);

    const both = network([actor('a'), actor('b'), edge('e1', 'a', 'b', 'funds'), edge('e2', 'b', 'a', 'funds')]);
    expect(depthOf(both).twoHop).toBe(0);
  });

  it('reports the degree tail ascending, which is what makes it a tail', () => {
    const net = star(3, 0);
    // Six entities, every one of them holding exactly one relationship.
    expect(depthOf(net).degrees).toEqual([{ degree: 1, count: 6 }]);
  });
});

describe('the numbers behind an insight row', () => {
  it('joins a subject to its node and returns the direction split as numbers', () => {
    const net = network([actor('a'), mechanism('m1'), mechanism('m2'), edge('e1', 'a', 'm1'), edge('e2', 'a', 'm2')]);
    expect(degreeRows(net, [{ id: 'a', label: 'Body a' }])).toEqual([{ id: 'a', label: 'Body a', out: 2, in: 0, degree: 2 }]);
  });

  it('drops a subject that is not a node, because the one-way insight names edges', () => {
    // `insights()` sets the one-way subjects' ids to the EDGE's. Fed here they
    // would otherwise draw as rows of two zeroes.
    const net = network([actor('a'), mechanism('m'), edge('e1', 'a', 'm')]);
    expect(degreeRows(net, [{ id: 'e1', label: 'Body a → Machinery m' }])).toEqual([]);
  });

  it('states the population a capped insight list was capped out of', () => {
    const net = star(6, 2);
    const populations = insightPopulations(net);
    // `star` wires every body to its own machinery with `funds` — the money
    // family — so every one of those pairs is one-way authority or money.
    expect(populations['one-way']).toBe(6);
    expect(populations['load-bearing']).toBe(6);
    expect(populations['load-bearing-machinery']).toBe(6);
  });
});

describe('the clause every insight row repeats', () => {
  it('lifts the shared tail out of notes that differ only in their prefix', () => {
    // The live "Carries duties the paper never wires up" block, verbatim.
    expect(sharedTail([
      '9 duties attributed; nothing in the paper points back at it',
      '6 duties attributed, all from pages 17–71; nothing in the paper points back at it',
      '3 duties attributed, all from pages 33–67; nothing in the paper points back at it',
    ])).toBe('nothing in the paper points back at it');
  });

  it('refuses a shared suffix that is not a clause', () => {
    // "s and applicants" is a real common suffix of these two and is not a
    // sentence. Without the boundary rule it would be printed as one.
    expect(sharedTail(['Students and applicants', 'Learners and applicants'])).toBe('');
  });

  it('has nothing to lift from a single row', () => {
    expect(sharedTail(['bears a cost; no benefit recorded'])).toBe('');
  });
});
