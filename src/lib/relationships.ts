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
 * The categorical ramp, in govuk-frontend 6.5's palette rather than the site's.
 *
 * `GRAPH_KIND` carries the LABELS and the ordering, and they are kept — the two
 * builds should call the same things by the same names. Its hues are the Strange
 * Ramblings ramp, which belongs to a dark dashboard; these are the same five
 * roles in the GOV.UK palette.
 *
 * THESE ARE GRAPHICAL-OBJECT COLOURS, NOT TEXT COLOURS, and the difference was
 * a real defect. An earlier version of this comment claimed all five clear
 * 4.5:1 on white; `#b58840` is **3.20:1**, so the ego map's subject box — filled
 * with it and lettered in white — failed WCAG 1.4.3 on the commonest map there
 * is, and axe cannot see it because it will not resolve an SVG `<text>` against
 * a sibling `<rect>` fill. Nothing is lettered on these any more: they are used
 * as a border or a fill behind BLACK text, where the bar is 21:1 and the colour
 * only has to clear 1.4.11's 3:1 as a graphical object. All five do.
 */
/*
 * PINNED TO THE VERSION THIS BUILD COMPILES AGAINST, which the comment above did
 * not used to name. These were v4/v5 values — #4c2c92, #b58840, #00703c,
 * #d4351c, #505a5f — and govuk-frontend 6.5 ships purple #54319f, brown #99704a,
 * green #0f7a52, red #ca3535 and black tint-25 #484949, so every one of the five
 * was a near-miss against the colour the framework was drawing next to it: the
 * app's own green is #0f7a52 while a `claim` box beside it was #00703c, and the
 * page's `.prt-meta` is #484949 while an `other` box was #505a5f.
 *
 * Headroom rather than a fix: brown goes from 3.20:1 to 4.40:1 on white, which
 * widens a margin the old value already cleared. These are still borders on
 * white, and the contrast note above is still the rule they have to meet.
 */
export const GRAPH_COLOUR: Record<string, string> = {
  actor: '#54319f',
  mechanism: '#99704a',
  claim: '#0f7a52',
  assumption: '#ca3535',
  other: '#484949',
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
    // A SELF-RELATIONSHIP IS COUNTED ONCE, on the side that asserts it. Reading
    // both ends independently put it in `out` and in `in`, so the entity was
    // drawn on both sides of its own map and listed twice in the table beneath.
    // `matrix.ts` excludes `fromId === toId` everywhere; this is the derivation
    // that did not.
    in: net.edges.filter((e) => e.toId === id && e.fromId !== id),
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
/** The subject's own box. It is drawn centred, so the picture can never be shorter than it. */
export const EGO_BOX = 40;
/** Room below the last spoke for its second line — the relation, set under the name. */
export const EGO_TAIL = 22;

/**
 * Where the spokes of an ego picture sit.
 *
 * The one reading this drawing exists for is the ASYMMETRY — a body with
 * eighteen outgoing duties and nothing incoming is visible in a second and takes
 * a paragraph to say. So the two sides are laid out independently and the
 * subject is centred against the taller of them, rather than each side being
 * centred on its own, which would hide exactly that.
 *
 * THE BOX HAS TO FIT. The first version sized the picture at one row per spoke
 * and nothing else, so a body with a single relationship — 183 of 267 on a real
 * assessment have one or none — got a 30-unit viewBox holding a 40-unit box
 * centred in it, and SVG clipped the subject off its own diagram top and bottom.
 * The last spoke's second line was clipped at every count for the same reason.
 * The height now carries both.
 */
export function egoLayout(inCount: number, outCount: number): {
  height: number;
  centreY: number;
  left: number[];
  right: number[];
} {
  const rows = Math.max(inCount, outCount, 1);
  const height = Math.max(rows * EGO_ROW + EGO_TAIL, EGO_BOX);
  const centreY = height / 2;
  // The shorter side is centred within the taller, and both sit against the top
  // of the row band — whose own offset is whatever the box needed.
  const top = (height - EGO_TAIL - rows * EGO_ROW) / 2;
  const at = (count: number) =>
    Array.from({ length: count }, (_, i) => top + (i + 0.5) * EGO_ROW + ((rows - count) * EGO_ROW) / 2);
  return { height, centreY, left: at(inCount), right: at(outCount) };
}
