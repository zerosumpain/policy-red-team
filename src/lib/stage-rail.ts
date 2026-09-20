/**
 * WHERE AN ARTEFACT SITS ON THE RUN'S EIGHTEEN-STAGE SCALE, AND WHAT THE WALK
 * BACK TOUCHES ON IT.
 *
 * The drill cites a stage number 33 times on one page — once in the meta line
 * under the h1 and once beside every item in the provenance ladder — on a scale
 * it never drew. `StageRail` draws it; this is the arithmetic behind the marks.
 *
 * PURE, AND IN `$lib` RATHER THAN IN THE PAGE, for the same reason
 * `provenance.ts` is: three of the four rules below are wrong in a way no
 * screenshot reveals, and one of them is wrong only when a figure exceeds a cap.
 * `view.ts` would be the natural home and is copied verbatim from upstream, so
 * adding to it would read as drift on every `npm run sync:check`. This is ours.
 *
 * THE FOUR RULES:
 *
 * 1. THE CITING SET IS BUILT FROM THE WHOLE INVENTORY, NEVER FROM `citedBy()`.
 *    That function caps its `items` at `MAX_CITED_BY = 12` and reports the true
 *    figure separately in `total`, so a set derived from the items silently
 *    under-reports the moment more than twelve things cite the artefact — which
 *    is the common case for a mechanism or an assumption, and invisible on any
 *    artefact with eleven.
 * 2. A PASS ORDINAL IS NOT ON THE SCALE. A pass owns `PASS_BASE * n + k`, an
 *    ordinal in the hundreds, so it is excluded from every set rather than
 *    marked at a cell that does not exist.
 * 3. A CELL IS A STAGE, NOT A STAGE THAT PRODUCED SOMETHING. Ordinal 11 —
 *    "Cross-policy exposure" — produced zero artefacts on the live run, and a
 *    rail built only from stages with output would renumber every stage after
 *    it. Nothing here filters on an artefact count; that is the rail's job and
 *    it iterates the stage names.
 * 4. A RUNG WITH NOTHING ON THE SCALE REPORTS `null`, not stage 1. A rung made
 *    entirely of pass artefacts has no span, and defaulting it to zero would
 *    draw a band over the document ingestion stage it never touched.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import { isPassStage } from '$lib/policy-analysis/contracts';
import type { StageOf } from './provenance';

/** One rung of the provenance walk, reduced to what the rail draws. */
export type Rung = {
  depth: number;
  count: number;
  /** Zero-based stage ordinals; both null where the rung holds nothing on the scale. */
  low: number | null;
  high: number | null;
};

export type StageMarks = {
  /** Ordinals the chain back from the artefact reaches. */
  sources: Set<number>;
  /** Ordinals of everything in the inventory that cites it — uncapped. */
  citing: Set<number>;
  rungs: Rung[];
};

export function stageMarks({ artefactId, all, hops, chainSources, stageOf, stageCount }: {
  artefactId: string;
  /** The whole inventory. The citing set is one pass over it. */
  all: Artefact[];
  hops: { depth: number; items: Artefact[] }[];
  /** The passages and quotations at the foot of the ladder. */
  chainSources: Artefact[];
  stageOf: StageOf;
  /** `STAGES.length`. An ordinal outside it is not on the rail. */
  stageCount: number;
}): StageMarks {
  const onScale = (ordinal: number) => Number.isFinite(ordinal)
    && !isPassStage(ordinal)
    && ordinal >= 0
    && ordinal < stageCount;

  const sources = new Set<number>();
  for (const hop of hops) {
    for (const item of hop.items) {
      const at = stageOf(item.id);
      if (onScale(at)) sources.add(at);
    }
  }
  for (const source of chainSources) {
    const at = stageOf(source.id);
    if (onScale(at)) sources.add(at);
  }

  const citing = new Set<number>();
  for (const other of all) {
    if (!(other.refs ?? []).includes(artefactId)) continue;
    const at = stageOf(other.id);
    if (onScale(at)) citing.add(at);
  }

  const rungs: Rung[] = hops.map((hop) => {
    const ordinals = hop.items.map((item) => stageOf(item.id)).filter(onScale);
    return {
      depth: hop.depth,
      // The COUNT is the rung's true length, not the number of items that
      // happened to land on the scale: the rung's own heading prints it, and a
      // band whose label disagreed with the heading above it would be worse
      // than no band.
      count: hop.items.length,
      low: ordinals.length ? Math.min(...ordinals) : null,
      high: ordinals.length ? Math.max(...ordinals) : null,
    };
  });

  return { sources, citing, rungs };
}

/** "stage 5" or "stages 2 to 5", in displayed numbering. Null for an empty set. */
export function stageSpan(ordinals: ReadonlySet<number>): string | null {
  if (!ordinals.size) return null;
  const low = Math.min(...ordinals);
  const high = Math.max(...ordinals);
  return low === high ? `stage ${low + 1}` : `stages ${low + 1} to ${high + 1}`;
}
