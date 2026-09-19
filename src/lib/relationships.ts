/**
 * THE SHAPE OF THE POLICY GRAPH — and why this build does not draw it as a map.
 *
 * Upstream renders the relationship graph as a live 3D force layout. That is not
 * portable here, and after measuring it, it should not be: a node-link picture
 * of a policy graph draws almost none of it.
 *
 * MEASURED on the Best Start in Life assessment — 452 stated relationships
 * across 420 entities, the same inventory `reference_policy_graph_is_a_star`
 * records:
 *
 *   actor → mechanism   359      top 10 bodies carry 23% of outgoing edges
 *   actor → claim        47      top 10 targets carry 18% of incoming
 *   actor → actor        32      183 of 267 bodies have out-degree 1 or 0
 *   mechanism → actor    14
 *
 * A bodies-against-machinery picture of the busiest ends places **10 of 452**
 * edges at 8×10 and 43 at 20×26 — by which size it is no longer legible anyway.
 * The distribution is flat, not heavy-tailed: this is a very wide, very shallow
 * star, hundreds of bodies each pointing at one or two pieces of machinery. So
 * the whole-graph picture would be a hairball that flatters the extraction, and
 * the honest figures are the ones below: WHERE the relationships run, and WHAT
 * KIND they are. `matrix.ts` reached the same conclusion for the bodies-against-
 * bodies grid and encodes it as `legible`.
 *
 * A node-link picture IS legible around ONE entity, which is what `egoOf` is
 * for: what points at this body and what it points at, drawn where the graph is
 * small enough to draw.
 *
 * Everything here is pure and works on `network()`'s output, so the two pictures
 * and the tables beneath them cannot disagree about what is in the graph.
 */
import { GRAPH_KIND, kindSlot } from '$lib/policy-analysis/graph3d';
import type { Edge, EntityNode, Network } from '$lib/policy-analysis/network';

/**
 * The categorical ramp, in GOV.UK's palette rather than the site's.
 *
 * `GRAPH_KIND` carries the LABELS and the ordering, and they are kept — the two
 * builds should call the same things by the same names. Its hues are the Strange
 * Ramblings ramp, which belongs to a dark dashboard; these are the same five
 * roles in the GOV.UK palette, all of them at or above 4.5:1 on white so a
 * swatch beside black text passes without a second colour.
 */
export const GRAPH_COLOUR: Record<string, string> = {
  actor: '#4c2c92',
  mechanism: '#b58840',
  claim: '#00703c',
  assumption: '#d4351c',
  other: '#505a5f',
};

export const kindLabel = (kind: string): string => GRAPH_KIND[kindSlot(kind)].label;
export const kindColour = (kind: string): string => GRAPH_COLOUR[kindSlot(kind)] ?? GRAPH_COLOUR.other;

/** One ordered pair of kinds, and how many relationships run that way. */
export type ShapeRow = {
  key: string;
  fromKind: string;
  toKind: string;
  count: number;
  /** Of every relationship in the graph, as a fraction. */
  share: number;
};

/**
 * Where the relationships actually run, by the kind of thing at each end.
 *
 * THE ONE FIGURE THAT IS ALWAYS TRUE of a policy graph, and the one a reader
 * most needs before believing anything else on the page: a strategy written as
 * beneficiaries and machinery has no mesh between its bodies, and an empty
 * bodies-against-bodies grid is that finding rather than a broken chart.
 */
export function shapeOf(net: Network): { rows: ShapeRow[]; total: number } {
  const kindOf = new Map(net.nodes.map((n) => [n.id, kindSlot(n.kind)]));
  const counts = new Map<string, number>();
  for (const edge of net.edges) {
    const from = kindOf.get(edge.fromId) ?? 'other';
    const to = kindOf.get(edge.toId) ?? 'other';
    const key = `${from}>${to}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = net.edges.length;
  const rows = [...counts]
    .map(([key, count]) => {
      const [fromKind, toKind] = key.split('>');
      return { key, fromKind, toKind, count, share: total ? count / total : 0 };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { rows, total };
}

/**
 * One entity's own relationships — what it points at, and what points at it.
 *
 * The direction is the whole reading. A body with eighteen outgoing duties and
 * nothing incoming is a body the paper has handed work to without wiring
 * anything back, which is one of the faults `network()`'s insights names in
 * prose; this is the same fact, for the one entity the reader has opened.
 */
export type Ego = {
  node: EntityNode | null;
  /** Relationships this one asserts about something else. */
  out: Edge[];
  /** Relationships something else asserts about this one. */
  in: Edge[];
};

export function egoOf(net: Network, id: string): Ego {
  return {
    node: net.nodes.find((n) => n.id === id) ?? null,
    out: net.edges.filter((e) => e.fromId === id),
    in: net.edges.filter((e) => e.toId === id),
  };
}

/** Node labels by id, for drawing the far end of an edge. */
export function labelIndex(net: Network): Map<string, EntityNode> {
  return new Map(net.nodes.map((n) => [n.id, n]));
}

/**
 * Geometry for a horizontal bar chart, as fractions of the box.
 *
 * Returned rather than computed in the markup for the reason `plotPoints` is:
 * a chart whose arithmetic lives in its JSX cannot be tested, and the one thing
 * that must never happen to a bar chart is a bar that is the wrong length.
 */
export const BAR_HEIGHT = 34;
export const BAR_GAP = 8;

export function bars(values: number[], width: number): { y: number; length: number; height: number }[] {
  const peak = Math.max(0, ...values);
  return values.map((value, i) => ({
    y: i * (BAR_HEIGHT + BAR_GAP),
    // A zero peak means every bar is zero; a zero-length bar is the honest
    // drawing of that, and dividing by it is not.
    length: peak > 0 ? Math.max(0, (value / peak) * width) : 0,
    height: BAR_HEIGHT,
  }));
}

export const barsHeight = (count: number) => Math.max(0, count * (BAR_HEIGHT + BAR_GAP) - BAR_GAP);

/**
 * How many spokes an ego picture draws before it stops being a picture.
 *
 * Eight a side is two more than the busiest end of a real assessment needs on
 * all but a handful of bodies, and past that the labels collide. The remainder
 * is counted and the table carries all of it.
 */
export const EGO_SPOKES = 8;
export const EGO_ROW = 30;

/**
 * Where the spokes of an ego picture sit.
 *
 * The one reading this drawing exists for is the ASYMMETRY — a body with
 * eighteen outgoing duties and nothing incoming is visible in a second and takes
 * a paragraph to say. So the two sides are laid out independently and the
 * subject is centred against the taller of them, rather than each side being
 * centred on its own, which would hide exactly that.
 */
export function egoLayout(inCount: number, outCount: number): {
  height: number;
  centreY: number;
  left: number[];
  right: number[];
} {
  const rows = Math.max(inCount, outCount, 1);
  const height = rows * EGO_ROW;
  const at = (count: number) => Array.from({ length: count }, (_, i) => (i + 0.5) * EGO_ROW + ((rows - count) * EGO_ROW) / 2);
  return { height, centreY: height / 2, left: at(inCount), right: at(outCount) };
}
