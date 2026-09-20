/**
 * WHAT THE PAPER'S MACHINERY IS MADE OF — the arithmetic behind Move 2's head.
 *
 * `relationships.ts` states the rule this file follows: "a chart whose
 * arithmetic lives in its own JSX cannot be tested, and the one thing that must
 * never happen to a bar chart is a bar of the wrong length." Move 2's lead broke
 * that twice over. Its bars were built in the component, and they were wrong in
 * two directions at once: `if (!id) continue` dropped the plays citing no
 * mechanism, and reading only a play's FIRST mechanism ref hid every mechanism
 * that is some play's second reference.
 *
 * Measured on assessment 36ebca37 (47 exploit artefacts, 151 mechanism
 * artefacts): the first-ref join finds 22 mechanisms and accounts for 42 plays;
 * the every-ref join finds 41 mechanisms and 96 mechanism-play pairs, with the
 * same 5 plays citing no mechanism at all. Nineteen pieces of machinery the
 * playbook actually rests on had no bar and could not be selected.
 *
 * NOTHING HERE KNOWS WHAT A COMPONENT IS. Everything takes artefacts and returns
 * counts or ids, so the same figures serve the chart, the census row and the
 * chain rail without any of the three re-deriving them.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';
import type { Play } from '$lib/policy-analysis/view';
import { edgesOf } from '$lib/policy-analysis/network';

/** One bar: a mechanism id and every play that cites it. */
export type MechanismRow = { id: string; plays: Play[] };

export type MechanismChart = {
  rows: MechanismRow[];
  /** Plays citing no mechanism at all — the five the old chart dropped silently. */
  orphans: Play[];
  /** Mechanism-play pairs, which is what the bar lengths sum to. */
  pairs: number;
};

/**
 * Every mechanism a play cites gets a bar, and the plays that cite none are kept.
 *
 * `cites` IS SUPPLIED BY THE CALLER, and that is the point rather than a
 * convenience. The report already owns one definition of "the mechanisms this
 * play cites" — `mechanismsOf` in `client/report/selection.ts`, which is also
 * what a mechanism selection filters by. A second copy of that three-line ref
 * walk here would be a second answer to the same question, and the chart
 * disagreeing with the list underneath it is the exact defect this replaces.
 *
 * Sorted by play count, then by label order via the caller's row order: the tie
 * at two plays is fourteen mechanisms wide on this run, so a stable sort matters
 * more than a tiebreak nobody can read off the page.
 */
export function mechanismChart(list: Play[], cites: (play: Play) => string[]): MechanismChart {
  const byMechanism = new Map<string, Play[]>();
  const orphans: Play[] = [];
  let pairs = 0;
  for (const play of list) {
    const ids = cites(play);
    if (!ids.length) {
      orphans.push(play);
      continue;
    }
    for (const id of ids) {
      const found = byMechanism.get(id);
      if (found) found.push(play);
      else byMechanism.set(id, [play]);
      pairs += 1;
    }
  }
  const rows = [...byMechanism.entries()].map(([id, plays]) => ({ id, plays }));
  // `sort` is stable in every engine this runs in, so equal counts keep the
  // order the plays put them in rather than being shuffled on each render.
  rows.sort((a, b) => b.plays.length - a.plays.length);
  return { rows, orphans, pairs };
}

/**
 * THE ASSUMPTIONS A MECHANISM RESTS ON, counted both ways it is stated.
 *
 * An assumption names the machinery it is about in its own `refs`, and a causal
 * chain names both a mechanism and the assumptions that chain runs through. The
 * two routes give very different answers and neither alone is the paper's claim:
 * on the real run the direct route reaches 143 of the 151 mechanisms and the
 * chain route reaches all 151, and the Sector Based Work Academy Programme has
 * ZERO direct assumptions and ten through its chains. A figure built on the
 * direct route alone would have printed "five plays and nothing the paper has to
 * assume" about a mechanism resting on ten unestablished things.
 *
 * So it is the union, and the caption that prints the number has to say so —
 * "directly or through one of its causal chains" — because a reader comparing 30
 * against 4 deserves to know which join produced them.
 */
export function assumptionsFor(artefacts: Artefact[], mechanismIds: Set<string>): Map<string, Set<string>> {
  const assumptionIds = new Set(artefacts.filter((a) => a.kind === 'assumption').map((a) => a.id));
  const union = new Map<string, Set<string>>();
  const add = (mechanismId: string, assumptionId: string) => {
    const found = union.get(mechanismId);
    if (found) found.add(assumptionId);
    else union.set(mechanismId, new Set([assumptionId]));
  };

  for (const artefact of artefacts) {
    if (artefact.kind !== 'assumption') continue;
    for (const ref of artefact.refs) if (mechanismIds.has(ref)) add(ref, artefact.id);
  }

  for (const chain of artefacts) {
    if (chain.kind !== 'causal_chain') continue;
    const mechanisms = chain.refs.filter((ref) => mechanismIds.has(ref));
    if (!mechanisms.length) continue;
    for (const assumption of chainAssumptions(chain, assumptionIds)) {
      for (const mechanism of mechanisms) add(mechanism, assumption);
    }
  }
  return union;
}

/**
 * The assumptions one chain runs through, from both places it records them.
 *
 * `stubForReport` blanks a causal chain's statement on the report path and
 * deliberately keeps `refs` and `data.assumptions` — 710 of the run's assumption
 * citations are in the first and 635 in the second, and they overlap rather than
 * partition, so it is a union and not a sum.
 */
function chainAssumptions(chain: Artefact, assumptionIds: Set<string>): Set<string> {
  const cited = new Set<string>();
  for (const ref of chain.refs) if (assumptionIds.has(ref)) cited.add(ref);
  const declared = chain.data?.assumptions;
  if (Array.isArray(declared)) {
    for (const ref of declared) if (typeof ref === 'string' && assumptionIds.has(ref)) cited.add(ref);
  }
  return cited;
}

/** One causal chain, resolved to the ends a reader can be shown. */
export type MechanismChainView = {
  artefact: Artefact;
  /** What has to hold, most-cited chain first. */
  assumptions: string[];
  /** What it is claimed to produce: the claims and findings the chain names. */
  produces: string[];
  /** The passage it came from, where the chain names one. */
  passages: string[];
};

/**
 * THE CHAINS THAT NAME A MECHANISM, ordered by how much they assume.
 *
 * All 150 chains on the run name at least one mechanism and every one of the 151
 * mechanisms is named by at least one chain, so this is never empty for a
 * selected mechanism — but the median is ONE chain and the maximum is six, which
 * is why the caller draws the first and lists the rest rather than drawing a
 * rail per chain.
 *
 * Only 120 of the 150 name a passage and only 65 name a finding, so a view built
 * on "passage → mechanism → assumptions → finding" would have a hole in it on
 * more than half of them. Each end is returned as its own list and the caller
 * draws the ends that exist.
 */
export function chainsFor(artefacts: Artefact[], mechanismIds: Set<string>): Map<string, MechanismChainView[]> {
  const kindOf = new Map(artefacts.map((a) => [a.id, a.kind]));
  const assumptionIds = new Set(artefacts.filter((a) => a.kind === 'assumption').map((a) => a.id));
  const byMechanism = new Map<string, MechanismChainView[]>();

  for (const chain of artefacts) {
    if (chain.kind !== 'causal_chain') continue;
    const mechanisms = chain.refs.filter((ref) => mechanismIds.has(ref));
    if (!mechanisms.length) continue;
    const view: MechanismChainView = {
      artefact: chain,
      assumptions: [...chainAssumptions(chain, assumptionIds)],
      produces: chain.refs.filter((ref) => kindOf.get(ref) === 'claim' || kindOf.get(ref) === 'finding'),
      passages: chain.refs.filter((ref) => kindOf.get(ref) === 'passage'),
    };
    for (const mechanism of mechanisms) {
      const found = byMechanism.get(mechanism);
      if (found) found.push(view);
      else byMechanism.set(mechanism, [view]);
    }
  }

  for (const views of byMechanism.values()) views.sort((a, b) => b.assumptions.length - a.assumptions.length);
  return byMechanism;
}

export type MachineryCensus = {
  /** Mechanism artefacts in the run. */
  named: number;
  /** Mechanisms at least one play cites. */
  generating: number;
  /** Mechanisms something is accountable for, or has authority over. */
  withOperator: number;
  /** Mechanisms that are not an end of any resolved relationship. */
  unconnected: number;
  /** Plays citing at least one mechanism. */
  playsOnMechanism: number;
  /** Plays every one of whose mechanisms has no stated operator. */
  playsOnUnoperated: number;
};

/**
 * HOW MUCH OF THE MACHINERY HAS SOMEBODY STATED TO RUN IT.
 *
 * The glossary already tells the reader to ask this — STRUCTURE_TERMS, term
 * 'mechanism': "Read whether the mechanism names who operates it. A mechanism
 * with no operator is the commonest gap in a policy paper." Nothing in the
 * report computed it. On the real run 40 of the 151 are the `toId` of an
 * `is_accountable_for` or `has_authority_over` edge, 71 are an end of any edge
 * at all, and 111 have no stated operator.
 *
 * AN OPERATOR IS THE INCOMING END, not either end. `mechanism is_accountable_for
 * X` would be the machinery being held to account for something else, which is a
 * different sentence; only `X is_accountable_for mechanism` says who runs it.
 */
export function machineryCensus(
  artefacts: Artefact[],
  list: Play[],
  mechanismIds: Set<string>,
  cites: (play: Play) => string[],
): MachineryCensus {
  const edges = edgesOf(artefacts);
  const touched = new Set<string>();
  const operated = new Set<string>();
  for (const edge of edges) {
    if (mechanismIds.has(edge.fromId)) touched.add(edge.fromId);
    if (mechanismIds.has(edge.toId)) touched.add(edge.toId);
    if (edge.relation !== 'is_accountable_for' && edge.relation !== 'has_authority_over') continue;
    if (mechanismIds.has(edge.toId)) operated.add(edge.toId);
  }

  const generating = new Set<string>();
  let playsOnMechanism = 0;
  let playsOnUnoperated = 0;
  for (const play of list) {
    const ids = cites(play);
    if (!ids.length) continue;
    playsOnMechanism += 1;
    for (const id of ids) generating.add(id);
    if (!ids.some((id) => operated.has(id))) playsOnUnoperated += 1;
  }

  return {
    named: mechanismIds.size,
    generating: generating.size,
    withOperator: operated.size,
    unconnected: mechanismIds.size - touched.size,
    playsOnMechanism,
    playsOnUnoperated,
  };
}

/** One category of claim, and how many of them the decomposition wrote. */
export type ClaimCategory = { key: string; count: number };

/**
 * WHAT THE PAPER ASSERTS, sorted into the categories the run already gave it.
 *
 * The decomposition read 72 passages and wrote 536 claims, each carrying exactly
 * two keys: `notes` and `category`. Nothing in the report has ever read the
 * category. It answers the most basic question anyone asks about a policy paper
 * — how much of it is objectives against how much is decision rights — and on
 * this run it answers it as 132 objectives against 15 decision rights and 11
 * dependencies, which is the same conclusion the responsibility–authority and
 * accountability–resource checks reach by another route.
 */
export function claimCensus(artefacts: Artefact[]): { rows: ClaimCategory[]; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const artefact of artefacts) {
    if (artefact.kind !== 'claim') continue;
    total += 1;
    const category = typeof artefact.data?.category === 'string' && artefact.data.category
      ? artefact.data.category
      : 'uncategorised';
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const rows = [...counts.entries()].map(([key, count]) => ({ key, count }));
  rows.sort((a, b) => b.count - a.count);
  return { rows, total };
}

export type ChainFunnel = {
  mechanisms: number;
  chains: number;
  /** Assumption citations across every chain — citations, not distinct assumptions. */
  assumptionCitations: number;
  /** Distinct findings the chains reach. */
  conclusions: number;
};

/**
 * THE SHAPE OF THE PAPER'S CAUSAL READING, in three figures.
 *
 * 151 pieces of machinery, 150 chains citing 710 assumptions between them, and
 * eight conclusions at the far end. The narrowing at the last step is the
 * finding: everything the run inferred about how this policy is meant to work
 * lands on eight of the thirty-two findings it wrote.
 *
 * CITATIONS, NOT DISTINCT ASSUMPTIONS, and the label has to say so. A chain
 * citing an assumption twice over its two routes is one citation here, but two
 * chains citing the same assumption are two — which is the honest count of how
 * much work the chains do, and not a count of things.
 */
export function chainFunnel(artefacts: Artefact[], mechanismIds: Set<string>): ChainFunnel {
  const assumptionIds = new Set(artefacts.filter((a) => a.kind === 'assumption').map((a) => a.id));
  const findingIds = new Set(artefacts.filter((a) => a.kind === 'finding').map((a) => a.id));
  const mechanismsReached = new Set<string>();
  const conclusions = new Set<string>();
  let chains = 0;
  let assumptionCitations = 0;
  for (const chain of artefacts) {
    if (chain.kind !== 'causal_chain') continue;
    chains += 1;
    for (const ref of chain.refs) {
      if (mechanismIds.has(ref)) mechanismsReached.add(ref);
      if (findingIds.has(ref)) conclusions.add(ref);
    }
    assumptionCitations += chainAssumptions(chain, assumptionIds).size;
  }
  return {
    mechanisms: mechanismsReached.size,
    chains,
    assumptionCitations,
    conclusions: conclusions.size,
  };
}
