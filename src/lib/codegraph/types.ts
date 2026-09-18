/**
 * THE INTEL NETWORK'S NODE AND EDGE SHAPES — the subset the 3D view reads.
 *
 * Vendored from SR-Main (`src/lib/codegraph/types.ts`), which carries the full
 * payload types for an intel graph with communities, PageRank, brokerage and
 * source categories. `NetworkGraph3D` reads these two interfaces and nothing
 * else, so these two are what came across.
 *
 * Nothing in this repo PRODUCES one of these from its own data: the policy
 * graph is artefacts, and `$lib/policy-analysis/graph3d.ts` maps them into this
 * shape for the view. Keeping the shape identical rather than narrowing it to
 * what a policy assessment happens to fill means the vendored component can be
 * re-copied from SR-Main without an edit, which is the only thing that keeps a
 * 1,500-line transplant honest.
 */
export interface NetNode {
  id: string;
  name: string;
  type: string;
  typeId: string;
  icon: string;
  color: string;
  summary: string | null;
  confirmed: boolean;
  confidence: string;
  noteCount: number;
  degree: number;
  importance: number;
  betweenness: number;
  brokerage: number;
  community: number;
  hops: number | null;
  /** Category slugs. The policy feed puts the artefact's KIND here. */
  categories: string[];
  /** Observed surface forms — searched alongside the name. */
  aliases: string[];
  /** What asserted this entity. The policy feed puts the artefact's origin here. */
  sources: string[];
  /** Evidence view only — true when this node IS a source note, not an entity. */
  evidence?: boolean;
  /** 0..1 staleness weight — 1 is current, the floor is old but not gone. */
  recency: number;
  /** 0..1 — confidence discounted by age. The policy feed sends the artefact's own. */
  relevance?: number;
}

export interface NetEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string | null;
  strength: string;
  confidence: string;
  crossCommunity: boolean;
  /** Continuous 0..1 weight; `strength` is the display bucket derived from it. */
  weight: number;
  /** 0..1 staleness weight for this edge. */
  recency: number;
  /** The note source that asserted this edge, if known. Not an endpoint. */
  sourceKind: string | null;
  /** Inside the recency window. False for everything when no window is set. */
  recent?: boolean;
}
