/**
 * WHERE AN ARTEFACT CAME FROM — walked all the way back to the paper.
 *
 * The report tells you that a body could run a play, and that the play rests on
 * an assumption. It does not tell you that the assumption was read off one
 * sentence on page 14, which is the question a policy professional actually asks
 * when they disagree with a finding: *says who?* Every artefact carries `refs`,
 * every stage cites the stage below it, and the bottom of that ladder is a
 * passage holding the paper's own wording. So the chain is already in the data
 * and nothing here needs a database — it needs a walk.
 *
 * PURE, AND IN `$lib` RATHER THAN IN THE PAGE, for the reason the rest of the
 * view layer is: a graph walk with cycle handling and two caps is the kind of
 * thing that is wrong in a way no screenshot reveals, so it is written where a
 * test can drive it. `view.ts` would have been the natural home, but that file
 * is copied verbatim from upstream and adding to it would show up as drift
 * every time `npm run sync:check` runs. This is ours.
 *
 * WHY THE CAPS. An assessment of a long paper holds a couple of thousand
 * artefacts and synthesis cites broadly, so a walk from a top-level finding can
 * reach most of the graph. A page listing eight hundred ancestors answers
 * nothing. Both caps are reported rather than silently applied: a chain that
 * stopped early says so, because "rests on nothing further" and "we stopped
 * looking" are different facts and only one of them is about the policy.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import { stageOfId } from '$lib/policy-analysis/view';

/**
 * The paper's own wording, as this artefact carries it.
 *
 * TWO FIELDS, ONE MEANING, and reading only one of them was a bug this feature
 * had until the first real chain was drawn. An INGESTED PASSAGE *is* the
 * document's text and carries it in `statement`; everything downstream quotes a
 * span of one into `sourceQuote`. Filtering the chain on `sourceQuote` alone
 * therefore terminated at the claims and never reached the paper — the one thing
 * the walk exists to find.
 */
export function paperWording(artefact: Artefact): string | null {
  const value = artefact.kind === 'passage' ? artefact.statement : artefact.sourceQuote;
  // Trimmed for the EMPTINESS TEST only; the original is what is returned,
  // because the point of this field is that it reads as the document has it.
  return value && value.trim() ? value : null;
}

/** One step back. `depth` 1 is what the artefact cites directly. */
export type Hop = { depth: number; items: Artefact[] };

export type Provenance = {
  /** Ancestors by distance, shallowest first. An artefact appears once, at its shortest path. */
  hops: Hop[];
  /**
   * The terminus: everything reachable that quotes the paper directly.
   *
   * This is the payoff of the whole walk. It is ordered by page so it reads as
   * a route through the document rather than a route through the pipeline.
   */
  sources: Artefact[];
  /** How many distinct ancestors were reached, across every hop. */
  reached: number;
  /**
   * WHY the walk stopped short, or null if it exhausted the graph.
   *
   * Not a boolean. The page has to explain itself, and "the list would have been
   * too long" and "the ladder is deeper than we followed" are different
   * sentences — a single flag meant saying the first when the second was true.
   */
  stoppedBy: 'depth' | 'nodes' | null;
  /**
   * Refs naming something that is not in this list.
   *
   * A shared copy has had artefacts redacted out from under the refs that name
   * them, so the chain thins rather than breaks. Counting them is what lets the
   * page distinguish "this rests on nothing" from "what this rests on is not in
   * this copy" — which, said the wrong way round, is a false statement about the
   * assessment.
   */
  unresolved: number;
};

/**
 * Eight steps and three hundred ancestors.
 *
 * The pipeline is eighteen stages but the citation ladder is much shorter than
 * that — synthesis cites results, results cite claims, claims cite passages — so
 * eight is generous rather than tight, and a chain that needs more than eight is
 * one no reader is going to follow anyway.
 */
export const MAX_DEPTH = 8;
export const MAX_NODES = 300;

/** How many things cite this one. Twelve is upstream's cap and the same argument applies: a list is a list, not an inventory. */
export const MAX_CITED_BY = 12;

/**
 * Which stage minted an artefact.
 *
 * `stageOfId` reads it off the `s<n>_` namespace, which is right for everything
 * the model writes and WRONG for everything the pipeline computes: the twelve
 * structural checks are minted as `test_adaptability` and so on, carry no
 * prefix, and therefore read as stage 0 — telling a reader that a check was
 * produced during document ingestion. The server already sends the true figure
 * per row, so a caller that has it passes it in and a caller that has not falls
 * back to the id.
 */
export type StageOf = (id: string) => number;

export function provenance(
  id: string,
  all: Artefact[],
  { maxDepth = MAX_DEPTH, maxNodes = MAX_NODES, stageOf = stageOfId }: { maxDepth?: number; maxNodes?: number; stageOf?: StageOf } = {},
): Provenance {
  const byId = new Map(all.map((a) => [a.id, a]));
  const subject = byId.get(id);
  if (!subject) return { hops: [], sources: [], reached: 0, stoppedBy: null, unresolved: 0 };

  // The subject is seen from the start, so a graph that cites its way back round
  // to it terminates instead of listing the artefact as its own ancestor.
  const seen = new Set<string>([id]);
  const hops: Hop[] = [];
  let frontier = subject.refs;
  let stoppedBy: 'depth' | 'nodes' | null = null;
  let reached = 0;
  let unresolved = 0;

  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const items: Artefact[] = [];
    const next: string[] = [];
    for (const ref of frontier) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      // A ref naming something not in this list is not a fault: a shared copy
      // has had artefacts redacted out of it by design. It is COUNTED rather
      // than ignored, because a chain that thinned to nothing and a chain that
      // was always empty are different things to say.
      const artefact = byId.get(ref);
      if (!artefact) { unresolved++; continue; }
      if (reached >= maxNodes) { stoppedBy = 'nodes'; break; }
      items.push(artefact);
      reached++;
      next.push(...artefact.refs);
    }
    if (items.length) hops.push({ depth, items: order(items, stageOf) });
    if (stoppedBy) break;
    frontier = next;
    // RESOLVABLE refs only. An unresolvable one beyond the depth cap is a
    // redaction, which is already reported as `unresolved`; counting it here
    // would put "the chain goes further than this" on a page where it does not.
    if (depth === maxDepth && next.some((ref) => !seen.has(ref) && byId.has(ref))) stoppedBy = 'depth';
  }

  // Ordered by where they sit in the DOCUMENT, not by where they sit in the
  // pipeline: this section is the reader checking the assessment against the
  // paper, and they read the paper front to back.
  const sources = subsume(hops.flatMap((hop) => hop.items).filter((a) => paperWording(a)))
    .sort((a, b) => (a.page ?? Infinity) - (b.page ?? Infinity) || a.label.localeCompare(b.label));

  return { hops, sources, reached, stoppedBy, unresolved };
}

/**
 * What cites this — the direction `refs` cannot answer.
 *
 * A reader looking at an assumption wants to know what falls over if it is
 * wrong, and that is every artefact holding its id, which no artefact records
 * about itself.
 */
export function citedBy(id: string, all: Artefact[], limit = MAX_CITED_BY, stageOf: StageOf = stageOfId): { items: Artefact[]; total: number } {
  const items = all.filter((a) => a.id !== id && a.refs.includes(id));
  return { items: order(items, stageOf).slice(0, limit), total: items.length };
}

/**
 * Drop a quotation the chain already carries in full.
 *
 * A claim's `sourceQuote` is a span of the passage it was read from, so a chain
 * holding both shows the reader the same sentence twice and implies two
 * independent groundings where there is one.
 *
 * A PASSAGE IS NEVER DROPPED. The first version of this rule was plain string
 * containment in either direction, and a policy paper repeats itself — an annex
 * restating a sentence from page 14 swallowed page 14, and the reader silently
 * lost a citation from the one section this whole feature exists to produce.
 * A passage is a PLACE in the document; two of them saying the same thing are
 * two citations, not one.
 *
 * So the rule models the actual relationship: a quotation was taken OUT of a
 * passage, and is redundant only when that passage is here too. In a shared copy
 * the passages have been redacted and nothing covers the quotations, which is
 * why this is a filter over what is present rather than an assumption about
 * what must be.
 */
function subsume(candidates: Artefact[]): Artefact[] {
  const flat = (v: string) => v.replace(/\s+/g, ' ').trim().toLowerCase();
  const text = new Map(candidates.map((a) => [a, flat(paperWording(a) ?? '')]));
  const passages = candidates.filter((a) => a.kind === 'passage').map((a) => text.get(a) as string);

  const kept: Artefact[] = [];
  const already = new Set<string>();
  for (const candidate of candidates) {
    const own = text.get(candidate) as string;
    if (candidate.kind === 'passage') { kept.push(candidate); continue; }
    if (passages.some((passage) => passage.includes(own))) continue;
    // Several claims read off one sentence quote it identically. `includes`
    // with a strict length test never catches that, which was the commonest
    // duplicate of the lot.
    if (already.has(own)) continue;
    already.add(own);
    kept.push(candidate);
  }

  // And a quotation wholly inside a longer quotation, now the passages that
  // would have covered both are known not to be here.
  return kept.filter((a) => a.kind === 'passage' || !kept.some((other) => {
    if (other === a || other.kind === 'passage') return false;
    const mine = text.get(a) as string;
    const theirs = text.get(other) as string;
    return theirs.length > mine.length && theirs.includes(mine);
  }));
}

/** Latest stage first, then alphabetical — the order the pipeline built them in, reversed. */
function order(items: Artefact[], stageOf: StageOf): Artefact[] {
  return [...items].sort((a, b) => stageOf(b.id) - stageOf(a.id) || a.label.localeCompare(b.label));
}

