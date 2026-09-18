/**
 * THE POLICY GRAPH, AS THE INTEL 3D VIEW UNDERSTANDS IT.
 *
 * PURE. `NetworkGraph3D` is SR-Main's spatial graph — a live d3-force-3d layout
 * with dragging, hover, raycasting and camera framing already solved — and it
 * colours nodes by a given category map when told to. So this feed does not
 * draw its own spheres: it hands that component a `NetNode`/`NetEdge` graph
 * whose one category per node is the artefact's KIND, with a colour per kind.
 * One 3D view, two feeds — the same arrangement `$lib/jkai/context-panel/
 * graph3d.ts` uses in SR-Main for the thread map.
 *
 * IT MAPS `network()`, NOT THE ARTEFACTS. `edgesOf`/`nodesOf` already decide
 * what a relationship IS here — both ends must resolve, a dangling end is a
 * reference — and step 03's "How they connect" reads the same derivation. Two
 * pictures of one graph on one page must not disagree about what is in it, and
 * the only way to guarantee that is to have one derivation.
 *
 * Colours are literals, not `var(--fs-cat-*)`: WebGL cannot read a CSS custom
 * property. They are the site's validated categorical ramp, and the legend
 * beside the scene prints the same swatch so the picture is readable by someone
 * who has never seen the ramp.
 */
import type { Artefact } from './contracts';
import type { NetEdge, NetNode } from '$lib/codegraph/types';
import { RELATION_FAMILIES, type RelationFamilyKey } from './glossary';
import type { Network } from './network';

/**
 * THE KINDS A POLICY GRAPH'S ENDS ACTUALLY ARE, in the order the legend draws
 * them: who, what they set up, what it asserts, what it takes for granted.
 *
 * `other` is not a bucket for tidiness — it is where a kind the contract gains
 * later lands, visibly, rather than being dropped from the picture and leaving
 * a reader to wonder why the count beneath disagrees with what is on screen.
 */
export const GRAPH_KIND: Record<string, { label: string; colour: string; order: number }> = {
  actor: { label: 'Bodies', colour: '#7a5aa6', order: 0 },
  mechanism: { label: 'Machinery', colour: '#b4632e', order: 1 },
  claim: { label: 'What the paper claims', colour: '#3a8658', order: 2 },
  assumption: { label: 'What it assumes', colour: '#8a2d3a', order: 3 },
  other: { label: 'Other', colour: '#6b625a', order: 4 },
};

export const GRAPH_KINDS = Object.keys(GRAPH_KIND).sort((a, b) => GRAPH_KIND[a].order - GRAPH_KIND[b].order);

/** The kind a node is drawn as — anything the legend has no swatch for is `other`. */
export const kindSlot = (kind: string): string => (kind in GRAPH_KIND && kind !== 'other' ? kind : 'other');

export type PolicyNetGraph = {
  nodes: NetNode[];
  edges: NetEdge[];
  /** kind → colour, for `colourBy="category"`. */
  categoryColours: Map<string, string>;
  /** How many nodes of each kind are ON SCREEN. */
  counts: Record<string, number>;
  /** Entities left off the picture by the cap, and the total before it. */
  omitted: number;
  total: number;
  /** Relationships with both ends on screen, and the total. */
  drawnEdges: number;
  totalEdges: number;
};

/**
 * How many entities the picture may hold.
 *
 * The 2D modal this replaces drew thirty, which is a legible number of labelled
 * boxes on a plane and a thin slice of a policy graph — a 20-page paper yields
 * a few hundred. A force layout in three dimensions stays readable far past
 * that because depth does the separating, so the cap is here to protect the
 * frame rate rather than the composition. Whatever it leaves off is COUNTED
 * below the scene and every relationship is still listed in full beside it.
 */
export const GRAPH_NODE_CAP = 180;

/**
 * The intel view sizes a sphere as `5 + sqrt(importance) * 20` and names one
 * above radius 10, on PageRank values running roughly 0.001–0.05. Degree is
 * mapped into that range rather than 0..1 — at 1.0 every sphere is a 25-unit
 * ball and the picture is a pile of balls — so the bodies the policy runs
 * through are the ones that earn a name.
 */
export function importanceOf(degree: number, peak: number): number {
  const share = peak > 0 ? Math.max(0, Math.min(1, degree / peak)) : 0;
  return 0.015 + 0.16 * share;
}

/**
 * A relation's weight, which the view turns into line width and link distance.
 *
 * A family is a coarse but honest signal: authority and accountability are the
 * relations a policy hangs on, information and resourcing are supporting, and a
 * relation the vocabulary has since gained has no family at all. Nothing here
 * invents a strength the assessment did not state.
 */
const FAMILY_WEIGHT: Record<RelationFamilyKey, number> = {} as Record<RelationFamilyKey, number>;
for (const [i, family] of RELATION_FAMILIES.entries()) {
  // Evenly spread over 0.45–0.95 in the canonical family order, so the ramp is
  // a property of the vocabulary rather than a table to keep in step with it.
  FAMILY_WEIGHT[family.key] = 0.95 - (i / Math.max(1, RELATION_FAMILIES.length - 1)) * 0.5;
}

const bucket = (weight: number) => (weight >= 0.8 ? 'strong' : weight >= 0.6 ? 'moderate' : 'weak');

/** Build the graph the 3D view draws. */
export function toPolicyNetGraph(net: Network, artefacts: Artefact[] = []): PolicyNetGraph {
  const kindById = new Map(artefacts.map((a) => [a.id, a.kind]));
  const statementById = new Map(artefacts.map((a) => [a.id, a.statement]));
  const originById = new Map(artefacts.map((a) => [a.id, a.origin]));

  // Busiest first, so the cap keeps the entities the policy runs THROUGH.
  const ranked = [...net.nodes].sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label));
  const shown = ranked.slice(0, GRAPH_NODE_CAP);
  const onScreen = new Set(shown.map((n) => n.id));
  const peak = Math.max(1, ...shown.map((n) => n.degree));

  const counts: Record<string, number> = Object.fromEntries(GRAPH_KINDS.map((k) => [k, 0]));
  const nodes: NetNode[] = shown.map((n) => {
    const slot = kindSlot(kindById.get(n.id) ?? n.kind);
    counts[slot] += 1;
    return {
      id: n.id,
      name: n.label,
      type: n.entityType || slot,
      typeId: slot,
      icon: '',
      color: GRAPH_KIND[slot].colour,
      summary: statementById.get(n.id) ?? null,
      confirmed: true,
      confidence: 'stated',
      noteCount: n.degree,
      degree: n.degree,
      importance: importanceOf(n.degree, peak),
      betweenness: 0,
      brokerage: 0,
      // The class index, so the view's own bookkeeping has a stable integer and
      // `explode` can ease the kinds apart along their own directions.
      community: GRAPH_KIND[slot].order,
      hops: null,
      categories: [slot],
      aliases: [],
      sources: [originById.get(n.id) ?? 'structural_inference'],
      // Nothing in a policy assessment decays: every artefact was produced by
      // one run of one paper, so there is no staleness to encode and every node
      // is drawn at full strength.
      recency: 1,
      relevance: 1,
    };
  });

  const edges: NetEdge[] = net.edges
    .filter((e) => onScreen.has(e.fromId) && onScreen.has(e.toId))
    .map((e) => {
      const weight = e.family ? FAMILY_WEIGHT[e.family] : 0.4;
      return {
        id: e.artefact.id,
        source: e.fromId,
        target: e.toId,
        type: e.relation,
        label: e.relation.replaceAll('_', ' '),
        strength: bucket(weight),
        confidence: 'stated',
        // Kinds are the communities here, so an edge between two kinds IS the
        // cross-community case — which is most of them, and exactly the reading
        // worth emphasising: a body wired to a mechanism.
        crossCommunity:
          (kindSlot(kindById.get(e.fromId) ?? '') || '') !== (kindSlot(kindById.get(e.toId) ?? '') || ''),
        weight,
        recency: 1,
        sourceKind: e.artefact.origin,
        recent: true,
      };
    });

  return {
    nodes,
    edges,
    categoryColours: new Map(GRAPH_KINDS.map((k) => [k, GRAPH_KIND[k].colour])),
    counts,
    omitted: Math.max(0, ranked.length - shown.length),
    total: ranked.length,
    drawnEdges: edges.length,
    totalEdges: net.edges.length,
  };
}
