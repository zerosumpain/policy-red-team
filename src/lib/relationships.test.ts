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
import { bars, barsHeight, EGO_BOX, EGO_ROW, egoLayout, egoOf, kindColour, kindLabel, shapeOf } from './relationships';

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

describe('ego layout', () => {
  /** Everything the drawing puts on the canvas, against the box it declares. */
  const fits = (inCount: number, outCount: number) => {
    const { height, centreY, left, right } = egoLayout(inCount, outCount);
    const spokes = [...left, ...right];
    return {
      box: centreY - EGO_BOX / 2 >= 0 && centreY + EGO_BOX / 2 <= height,
      // Each spoke carries a second line 17 below its centre — the relation,
      // set under the name.
      labels: spokes.every((y) => y - 8 >= 0 && y + 17 <= height),
    };
  };

  it('leaves room for the subject box, which is taller than a row', () => {
    // THE DEFECT THIS PINS: one row per spoke and nothing else gave a body with
    // a single relationship a 30-unit picture holding a 40-unit box, and SVG
    // clipped the subject off its own diagram. 183 of 267 bodies on a real
    // assessment have one relationship or none.
    for (const [i, o] of [[0, 0], [0, 1], [1, 0], [1, 1], [3, 1], [0, 6], [2, 6], [8, 8]]) {
      const check = fits(i, o);
      expect(`${i}x${o} box ${check.box}`).toBe(`${i}x${o} box true`);
      expect(`${i}x${o} labels ${check.labels}`).toBe(`${i}x${o} labels true`);
    }
    expect(egoLayout(0, 0).height).toBeGreaterThanOrEqual(EGO_BOX);
  });

  it('centres the subject against the taller side, so the asymmetry is the picture', () => {
    // A body with nothing pointing at it is the reading this drawing exists for.
    const lopsided = egoLayout(0, 6);
    expect(lopsided.left).toEqual([]);
    expect(lopsided.right).toHaveLength(6);
    expect(lopsided.centreY).toBe(lopsided.height / 2);
  });

  it('centres the shorter side within the taller, rather than starting both at the top', () => {
    const { left, right } = egoLayout(2, 6);
    expect(right).toHaveLength(6);
    // The two incoming spokes sit either side of the middle of the six.
    expect(left).toHaveLength(2);
    expect(left[0]).toBeCloseTo(right[2], 6);
    expect(left[1]).toBeCloseTo(right[3], 6);
  });

  it('never collapses to a zero-height box when an entity has no relationships', () => {
    const empty = egoLayout(0, 0);
    expect(empty.height).toBeGreaterThan(0);
    expect(empty.left).toEqual([]);
    expect(empty.right).toEqual([]);
  });
});

describe('bar geometry', () => {
  it('is proportional to the largest bar, which fills the box', () => {
    const [big, half, none] = bars([100, 50, 0], 400);
    expect(big.length).toBe(400);
    expect(half.length).toBe(200);
    expect(none.length).toBe(0);
    expect(half.y).toBeGreaterThan(big.y);
  });

  it('draws zero-length bars rather than dividing by a zero peak', () => {
    expect(bars([0, 0], 400).map((b) => b.length)).toEqual([0, 0]);
    expect(bars([], 400)).toEqual([]);
    expect(barsHeight(0)).toBe(0);
  });
});
