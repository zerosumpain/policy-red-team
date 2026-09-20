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
import { isBody, type Edge, type EntityNode, type Network } from '$lib/policy-analysis/network';

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

/**
 * THE HALF OF A `Network` THESE TWO ACTUALLY READ.
 *
 * `network()` returns nodes and edges plus the family panels and the eight
 * structural insights — including the duplicate-body union-find — and neither of
 * the functions below touches any of that. Taking the narrower type lets a caller
 * that only wants an ego map build only what an ego map needs: `edgesOf` and
 * `nodesOf` are 0.8ms on a real assessment against 43ms for the whole pipeline.
 *
 * A `Network` still satisfies it, so nothing that already had one has to change.
 */
export type Graph = Pick<Network, 'nodes' | 'edges'>;

export function egoOf(net: Graph, id: string): Ego {
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
export function labelIndex(net: Graph): Map<string, EntityNode> {
  return new Map(net.nodes.map((n) => [n.id, n]));
}

/**
 * A bar's length as a percentage of the longest bar in its own set.
 *
 * THIS REPLACED A SET OF SVG COORDINATES. `bars()` returned a `y`, a `length`
 * in user units and a fixed 34-unit `height`, because the chart was an SVG in a
 * 960-unit viewBox — and that viewBox is why the two charts in Move 2 fell back
 * to a table below 641px: `<text fontSize="15">` resolves in user units, so the
 * labels came out at about 7px when the drawing was pinned to its 460px floor.
 * The chart is HTML now and a percentage is the only number it needs; the
 * heights are the stylesheet's business, which is where they can respond to the
 * reader's own type size.
 *
 * Still computed here rather than in the markup, for the reason `figures.ts`
 * gives: the one thing that must never happen to a bar chart is a bar of the
 * wrong length, and a length written inline in JSX cannot be asserted.
 */
export function barShares(values: number[]): number[] {
  const peak = Math.max(0, ...values);
  // A zero peak means every bar is zero. Zero-length bars are the honest
  // drawing of that, and dividing by it is not.
  return values.map((value) => (peak > 0 ? Math.min(100, Math.max(0, (value / peak) * 100)) : 0));
}

/**
 * HOW MUCH OF THIS READING THE PAPER ACTUALLY SAID.
 *
 * Move 2 opened with "The paper states 106 relationships", which presents every
 * edge as something the document asserted. Measured on the live run: 21 of the
 * 106 carry `origin: 'extracted_fact'` and 85 carry `structural_inference`, so
 * four in five were reasoned out of the paper's structure rather than lifted
 * from its words. The cross-tab is sharper still — all 9 Authority
 * relationships are inferred and none is read — and Authority is the family the
 * section's own standfirst invites a reader to weigh against Money.
 *
 * `extracted_fact` IS THE ONLY ORIGIN THAT COUNTS AS READ, and the rest are
 * folded together deliberately. The seven origins in the contract distinguish
 * how a thing was reasoned; a reader of this sentence is asking one question —
 * did the document say this, or did the model work it out — and seven buckets
 * answer it worse than two. Nothing is hidden: the artefact page prints the
 * origin in full for every edge.
 */
export type OriginSplit = {
  total: number;
  /** Lifted from the paper's own words. */
  read: number;
  /** Everything else: reasoned from the paper's structure. */
  inferred: number;
  /** Relationships that name a page of the document. */
  withPage: number;
  byFamily: Record<string, { read: number; inferred: number }>;
};

export function originSplit(net: Graph): OriginSplit {
  const split: OriginSplit = { total: net.edges.length, read: 0, inferred: 0, withPage: 0, byFamily: {} };
  for (const edge of net.edges) {
    const wasRead = edge.artefact.origin === 'extracted_fact';
    if (wasRead) split.read++; else split.inferred++;
    if (typeof edge.artefact.page === 'number') split.withPage++;
    const key = edge.family ?? 'unfamilied';
    const family = (split.byFamily[key] ??= { read: 0, inferred: 0 });
    if (wasRead) family.read++; else family.inferred++;
  }
  return split;
}

/**
 * HOW DEEP THE WIRING GOES — the star, as a figure rather than as a claim.
 *
 * The file's own header says a policy graph is "a very wide, very shallow star"
 * and the section says 95% of relationships run body-to-machinery, and until
 * now neither was drawn. Measured on the live run: of 120 entities, 46 only ever
 * point at something, 73 are only ever pointed at, and exactly ONE — Universities
 * — is at both ends of an arrow. There are 0 reciprocal pairs among the 106
 * relationships and 21 two-step paths in the whole graph, every one of them
 * through that single entity. The degree distribution is the flat tail the header
 * describes: 81 entities with one relationship, 22 with two, and a tail of nine
 * steps ending at 10.
 *
 * `degree`, `out` and `in` are already on `EntityNode` from `nodesOf()`, so
 * nothing here recomputes them; the two-hop walk is the only real work and it is
 * indexed by `fromId` rather than run as the O(E²) pair scan the finding
 * proposed — 106 edges against a bucket each, not 11,236 comparisons.
 */
export type Depth = {
  total: number;
  /** Points at something and nothing points back. */
  outOnly: number;
  /** Pointed at, points at nothing. */
  inOnly: number;
  both: number;
  /** In the node list but at neither end of an edge — impossible from `nodesOf`, kept because a caller may pass a hand-built graph. */
  isolated: number;
  /** The entities at both ends, which on a star is the whole two-hop story. */
  bothNodes: EntityNode[];
  /** The long tail: how many entities hold one relationship, two, three… Ascending. */
  degrees: { degree: number; count: number }[];
  /** Paths of exactly two relationships, excluding a step straight back. */
  twoHop: number;
};

export function depthOf(net: Graph): Depth {
  const depth: Depth = {
    total: net.nodes.length, outOnly: 0, inOnly: 0, both: 0, isolated: 0,
    bothNodes: [], degrees: [], twoHop: 0,
  };
  const histogram = new Map<number, number>();
  for (const node of net.nodes) {
    if (node.out > 0 && node.in > 0) { depth.both++; depth.bothNodes.push(node); }
    else if (node.out > 0) depth.outOnly++;
    else if (node.in > 0) depth.inOnly++;
    else depth.isolated++;
    histogram.set(node.degree, (histogram.get(node.degree) ?? 0) + 1);
  }
  depth.degrees = [...histogram].map(([degree, count]) => ({ degree, count })).sort((a, b) => a.degree - b.degree);

  const byFrom = new Map<string, Edge[]>();
  for (const edge of net.edges) {
    const list = byFrom.get(edge.fromId);
    if (list) list.push(edge); else byFrom.set(edge.fromId, [edge]);
  }
  for (const first of net.edges) {
    for (const second of byFrom.get(first.toId) ?? []) {
      // A → B → A is the same relationship read backwards, not a path through
      // the paper, and counting it would make every reciprocal pair look like
      // depth. There are no reciprocal pairs on this run, so the guard is for
      // the assessment that has one.
      if (second.toId !== first.fromId) depth.twoHop++;
    }
  }
  return depth;
}

/** One insight subject's degree split, for a figure that draws the direction instead of spelling it. */
export type DegreeRow = { id: string; label: string; out: number; in: number; degree: number };

/**
 * The numbers behind "10 relationships — 7 out, 3 in", as numbers.
 *
 * `insights()` formats that sentence into `subject.note` in the tracked core,
 * thirty times over on this run, and a bar cannot be drawn from a sentence.
 * Parsing the note back out would be the wrong fix twice — it would break the
 * day the wording changes, and the values are already on the node index. This
 * joins `subject.id` to `net.nodes` and returns what a diverging bar needs.
 *
 * A SUBJECT THAT IS NOT A NODE IS DROPPED, and that is load-bearing: the
 * `one-way` insight's subjects are EDGE ids ("s3_043_edge_009"), so a caller
 * that fed it here would get five silent zero-rows rather than an error.
 */
export function degreeRows(net: Graph, subjects: { id: string; label: string }[]): DegreeRow[] {
  const index = labelIndex(net);
  return subjects.flatMap((subject) => {
    const node = index.get(subject.id);
    if (!node) return [];
    return [{ id: subject.id, label: subject.label, out: node.out, in: node.in, degree: node.degree }];
  });
}

/**
 * WHAT A CAPPED INSIGHT LIST IS CAPPED OUT OF.
 *
 * Three of the seven insights show fewer subjects than the population they are
 * drawn from, and the page stated the cap as if it were the population. The
 * `one-way` branch finds 55 distinct ordered pairs on this run, `INSIGHT_CAP`
 * cuts them to 8 and the component shows 5 under the words "The other 3" — so 47
 * pairs disappeared with nothing on the page saying they exist. The two
 * load-bearing insights are a deliberate top-5 over 47 bodies and 73 pieces of
 * machinery, and neither denominator appeared anywhere.
 *
 * ONLY THE THREE THAT ARE KNOWABLY LARGER. Rebuilding all eight derivations here
 * would fork the tracked core's arithmetic into a second copy that can disagree
 * with it; the other four insights already show every subject they found.
 */
export function insightPopulations(net: Graph): Record<string, number> {
  const pairs = new Set(net.edges.map((e) => `${e.fromId}|${e.toId}`));
  const oneWay = new Set(
    net.edges
      .filter((e) => (e.family === 'authority' || e.family === 'money') && !pairs.has(`${e.toId}|${e.fromId}`))
      .map((e) => `${e.fromId}|${e.toId}`),
  );
  const bodies = net.nodes.filter(isBody).length;
  return {
    'one-way': oneWay.size,
    'load-bearing': bodies,
    'load-bearing-machinery': net.nodes.length - bodies,
  };
}

/**
 * THE CLAUSE EVERY ROW OF AN INSIGHT REPEATS.
 *
 * `insights()` writes a sentence per subject in the tracked core, and two of
 * the seven blocks write nearly the same one every time. "Carries duties the
 * paper never wires up" ends all five of its notes with "; nothing in the paper
 * points back at it", and "Carries a cost, gains nothing the paper names" gives
 * all three of its subjects the identical five words. Thirty rows of a
 * key/value column, a third of them saying one thing repeatedly, is most of why
 * "What the connections show" measured 2,990px.
 *
 * ONLY AT A CLAUSE BOUNDARY. The longest common suffix of two arbitrary
 * sentences is usually a fragment — "ed at it", "n paper" — and lifting one of
 * those into a shared line would be nonsense set in a smaller type. A shared
 * tail counts only if it starts after a "; ", which is the separator
 * `insights()` actually uses between the per-subject part of a note and the
 * part that is the same every time.
 */
export function sharedTail(notes: string[]): string {
  if (notes.length < 2) return '';
  let tail = notes[0];
  for (const note of notes.slice(1)) {
    let shared = 0;
    while (shared < tail.length && shared < note.length && tail[tail.length - 1 - shared] === note[note.length - 1 - shared]) shared++;
    tail = tail.slice(tail.length - shared);
  }
  const boundary = tail.indexOf('; ');
  return boundary === -1 ? '' : tail.slice(boundary + 2);
}
