/**
 * WHAT A RECOMMENDATION WOULD ACTUALLY BEAR ON.
 *
 * A recommendation reads "Assign explicit responsibility, authority, resources
 * and measurement to each intervention before full-scale implementation" and
 * the obvious next question is: which of the forty-seven plays does that close,
 * and whose behaviour changes? The record answers it — but only partly, and the
 * interesting work here was finding out how partly.
 *
 * THE OBVIOUS JOIN IS WORTHLESS, and it was measured before being discarded. A
 * transitive walk out from a recommendation reaches 44 of 47 plays at two hops
 * and all 47 at three, on every one of the six recommendations in the Post-16
 * run. "This bears on 44 of the 47 ways to beat the policy" is not a finding;
 * it is what a densely-cited graph looks like from any starting point, and
 * printing it would be the tool manufacturing a connection it cannot support.
 *
 * SO THE LINKS ARE TIERED BY HOW THEY WERE MADE, and each tier says its own
 * rule on the page:
 *
 *  - NAMED: the play is cited by one of the findings this recommendation
 *    answers. The assessment made this link itself. 0–11 per recommendation.
 *  - SHARED ASSUMPTION: the play needs an assumption those findings also rest
 *    on, so the same thing being wrong moves both. 17–28 per recommendation.
 *  - SHARED MECHANISM: the play targets a mechanism those findings name.
 *
 * The first tier is a claim. The others are leads, counted honestly, and a
 * reader is told which is which rather than being handed one undifferentiated
 * list whose weakest member sets its real value.
 *
 * NOTHING HERE WALKS MORE THAN TWO EDGES — recommendation to finding, finding
 * to what it cites. That bound is the reason the counts mean anything.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';

export type Tier = 'named' | 'assumption' | 'mechanism';

export type LinkedPlay = { id: string; tier: Tier; via: string[] };

export type RecommendationLinks = {
  /** The findings it answers, resolved. */
  findings: Artefact[];
  /** The structural checks it cites, resolved — a recommendation's risk anchor. */
  checks: Artefact[];
  /** Plays, strongest link first. */
  plays: LinkedPlay[];
  /** How many of each tier, for the sentences on the page. */
  counts: Record<Tier, number>;
};

const listOf = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((v) => String(v)) : [];

/**
 * The join, bounded at two edges.
 *
 * `findingIds` is the recommendation's own statement of what it answers, and is
 * preferred over its raw `refs` because `refs` also carries the checks and a
 * couple of assumptions — all of them wanted, none of them findings.
 */
export function linkRecommendation(
  recommendation: Artefact,
  artefacts: Artefact[],
): RecommendationLinks {
  const byId = new Map(artefacts.map((a) => [a.id, a]));
  const resolve = (id: string) => byId.get(id) ?? null;

  const findings = [...new Set([...listOf(recommendation.data.findingIds), ...(recommendation.refs ?? [])])]
    .map(resolve)
    .filter((a): a is Artefact => !!a && a.kind === 'finding');

  const checks = (recommendation.refs ?? [])
    .map(resolve)
    .filter((a): a is Artefact => !!a && a.kind === 'test');

  // Everything those findings name, one edge out. Not two: at two the set is
  // most of the assessment and every play matches it.
  const named = new Set<string>();
  for (const finding of findings) for (const ref of finding.refs ?? []) named.add(ref);
  for (const ref of recommendation.refs ?? []) named.add(ref);

  const assumptions = new Set([...named].filter((id) => resolve(id)?.kind === 'assumption'));
  const mechanisms = new Set([...named].filter((id) => resolve(id)?.kind === 'mechanism'));

  const plays: LinkedPlay[] = [];
  for (const play of artefacts) {
    if (play.kind !== 'exploit') continue;
    if (named.has(play.id)) {
      plays.push({ id: play.id, tier: 'named', via: [] });
      continue;
    }
    const preconditions = listOf(play.data.preconditions).filter((id) => assumptions.has(id));
    if (preconditions.length) {
      plays.push({ id: play.id, tier: 'assumption', via: preconditions });
      continue;
    }
    const targets = listOf(play.data.targets).filter((id) => mechanisms.has(id));
    if (targets.length) plays.push({ id: play.id, tier: 'mechanism', via: targets });
  }

  const order: Tier[] = ['named', 'assumption', 'mechanism'];
  plays.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));

  return {
    findings,
    checks,
    plays,
    counts: {
      named: plays.filter((p) => p.tier === 'named').length,
      assumption: plays.filter((p) => p.tier === 'assumption').length,
      mechanism: plays.filter((p) => p.tier === 'mechanism').length,
    },
  };
}

/** How each tier reads on the page. One sentence, stating the rule it used. */
export const TIER_RULE: Record<Tier, string> = {
  named: 'Cited by a finding this answers — the assessment made this link itself.',
  assumption: 'Needs an assumption those findings also rest on, so the same thing being wrong moves both.',
  mechanism: 'Targets a mechanism those findings name.',
};

export const TIER_LABEL: Record<Tier, string> = {
  named: 'Named in the findings this answers',
  assumption: 'Rests on the same assumption',
  mechanism: 'Targets the same mechanism',
};
