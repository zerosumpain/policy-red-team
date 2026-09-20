// The arithmetic behind Move 2's head, against the shape of the real run.
//
// The fixture is deliberately small and deliberately awkward in the four ways
// assessment 36ebca37 is awkward, because those four are what the live chart got
// wrong: a play citing no mechanism at all (5 of 47 on the run), a play citing
// several (31 of 47), a mechanism that is only ever some play's SECOND reference
// (19 of the 41 on the run), and a mechanism whose assumptions exist only
// through a causal chain (8 of the 151, including the Sector Based Work Academy
// Programme, which has ten and would have read as zero).
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import type { Play } from '$lib/policy-analysis/view';
import {
  assumptionsFor, chainFunnel, chainsFor, claimCensus, machineryCensus, mechanismChart,
} from './mechanisms';

const mechanism = (id: string) => artefact(id, 'mechanism', `Machinery ${id}`, 'Machinery.', {});
const assumption = (id: string, refs: string[]) =>
  artefact(id, 'assumption', `Assumption ${id}`, 'Something that has to hold.', {}, { refs });
const chain = (id: string, refs: string[], declared?: string[]) =>
  artefact(id, 'causal_chain', `Chain ${id}`, '', declared ? { assumptions: declared } : {}, { refs });
const edge = (id: string, from: string, to: string, relation: Artefact['relation']) =>
  artefact(id, 'edge', `Edge ${id}`, 'A stated relationship.', {}, { fromId: from, toId: to, relation });
const claim = (id: string, category: string) =>
  artefact(id, 'claim', `Claim ${id}`, 'The paper asserts something.', { category });

/** A play is only ever read here for its artefact's `refs`, so the rest is filler. */
const play = (id: string, refs: string[]): Play => ({
  artefact: artefact(id, 'exploit', `Play ${id}`, 'A way to beat it.', { band: 'severe' }, { refs }),
  actor: null,
  band: 'severe',
  exposure: 0.5,
  factors: [],
});

const MECHANISM_IDS = new Set(['m1', 'm2', 'm3']);
/** The report's own join, as `mechanismsOf` in client/report/selection.ts states it. */
const cites = (p: Play) => [...new Set(p.artefact.refs.filter((ref) => MECHANISM_IDS.has(ref)))];

describe('the mechanism chart', () => {
  it('gives a bar to every mechanism a play cites, not only the first', () => {
    // m2 is never a first reference — under the old join it had no bar at all.
    const { rows } = mechanismChart([play('p1', ['m1', 'm2']), play('p2', ['m1'])], cites);
    expect(rows.map((r) => [r.id, r.plays.length])).toEqual([['m1', 2], ['m2', 1]]);
  });

  it('keeps the plays that cite no mechanism instead of dropping them', () => {
    const { rows, orphans } = mechanismChart([play('p1', ['m1']), play('p2', ['passage_1'])], cites);
    expect(rows).toHaveLength(1);
    expect(orphans.map((p) => p.artefact.id)).toEqual(['p2']);
  });

  it('counts mechanism-play pairs, which is what the bars sum to and the plays do not', () => {
    // Two plays, three bars, three pairs: the denominator sentence exists
    // because this number is bigger than the number of plays and must say so.
    const { pairs, orphans } = mechanismChart([play('p1', ['m1', 'm2']), play('p2', ['m3'])], cites);
    expect(pairs).toBe(3);
    expect(orphans).toHaveLength(0);
  });

  it('counts a repeated reference once, so a bar cannot double its own play', () => {
    const { rows, pairs } = mechanismChart([play('p1', ['m1', 'm1'])], cites);
    expect(rows[0].plays).toHaveLength(1);
    expect(pairs).toBe(1);
  });

  it('orders by play count, longest bar first', () => {
    const { rows } = mechanismChart(
      [play('p1', ['m3']), play('p2', ['m1']), play('p3', ['m1'])],
      cites,
    );
    expect(rows.map((r) => r.id)).toEqual(['m1', 'm3']);
  });
});

describe('the assumptions a mechanism rests on', () => {
  const artefacts: Artefact[] = [
    mechanism('m1'), mechanism('m2'),
    assumption('a1', ['m1']),
    assumption('a2', []),
    assumption('a3', []),
    chain('c1', ['m2', 'a2'], ['a3']),
  ];

  it('unions the direct route with the chain route', () => {
    const union = assumptionsFor(artefacts, MECHANISM_IDS);
    expect([...(union.get('m1') ?? [])]).toEqual(['a1']);
    // m2 has no assumption pointing at it and is not therefore unassumed: the
    // chain naming it names two, which is the case that made the union the rule.
    expect([...(union.get('m2') ?? [])].sort()).toEqual(['a2', 'a3']);
  });

  it('counts an assumption cited by a chain both ways only once', () => {
    const both = [...artefacts, chain('c2', ['m1', 'a1'], ['a1'])];
    expect(assumptionsFor(both, MECHANISM_IDS).get('m1')?.size).toBe(1);
  });

  it('ignores a declared assumption id that is not an assumption in the run', () => {
    const dangling = [...artefacts, chain('c3', ['m1'], ['gone'])];
    expect(assumptionsFor(dangling, MECHANISM_IDS).get('m1')?.size).toBe(1);
  });
});

describe('the chains that name a mechanism', () => {
  const artefacts: Artefact[] = [
    mechanism('m1'),
    assumption('a1', []), assumption('a2', []),
    artefact('f1', 'finding', 'A conclusion', 'It concludes.', {}),
    artefact('cl1', 'claim', 'A claim', 'It claims.', { category: 'objective' }),
    artefact('pg1', 'passage', 'A passage', 'The paper says.', {}),
    chain('c1', ['m1', 'a1', 'f1']),
    chain('c2', ['m1', 'a1', 'a2', 'cl1', 'pg1']),
  ];

  it('sorts a mechanism\'s chains by how much each one assumes', () => {
    const views = chainsFor(artefacts, MECHANISM_IDS).get('m1') ?? [];
    expect(views.map((v) => v.artefact.id)).toEqual(['c2', 'c1']);
  });

  it('resolves each end separately, because most chains are missing one', () => {
    const [richest, other] = chainsFor(artefacts, MECHANISM_IDS).get('m1') ?? [];
    expect(richest.produces).toEqual(['cl1']);
    expect(richest.passages).toEqual(['pg1']);
    // 30 of the run's 150 chains name no passage: an empty end is a real state
    // and the caller draws the ends that exist rather than a box with a hole.
    expect(other.passages).toEqual([]);
    expect(other.produces).toEqual(['f1']);
  });
});

describe('the machinery census', () => {
  const artefacts: Artefact[] = [
    mechanism('m1'), mechanism('m2'), mechanism('m3'),
    artefact('actor1', 'actor', 'A body', 'A body.', {}),
    edge('e1', 'actor1', 'm1', 'is_accountable_for'),
    edge('e2', 'actor1', 'm2', 'receives_benefit_from'),
    // The wrong way round on purpose: machinery accountable FOR something is
    // not machinery somebody runs, and only the incoming end says who runs it.
    edge('e3', 'm3', 'actor1', 'is_accountable_for'),
  ];
  const list = [play('p1', ['m1', 'm2']), play('p2', ['m2']), play('p3', [])];

  it('counts an operator only where something points AT the machinery', () => {
    expect(machineryCensus(artefacts, list, MECHANISM_IDS, cites).withOperator).toBe(1);
  });

  it('counts machinery in no stated relationship at all', () => {
    // m1, m2 and m3 are all ends of an edge here; a fourth is not.
    const withIdle = [...artefacts, mechanism('m4')];
    const ids = new Set([...MECHANISM_IDS, 'm4']);
    expect(machineryCensus(withIdle, list, ids, cites).unconnected).toBe(1);
  });

  it('counts a play as resting on unoperated machinery only when NONE of its mechanisms has an operator', () => {
    const census = machineryCensus(artefacts, list, MECHANISM_IDS, cites);
    expect(census.playsOnMechanism).toBe(2);
    // p1 cites m1, which has an operator, so it is not one of these; p2 cites
    // only m2, which nobody is stated to run.
    expect(census.playsOnUnoperated).toBe(1);
  });

  it('ignores an edge whose far end is not in the run', () => {
    const dangling = [...artefacts, edge('e4', 'ghost', 'm2', 'is_accountable_for')];
    expect(machineryCensus(dangling, list, MECHANISM_IDS, cites).withOperator).toBe(1);
  });
});

describe('what the paper asserts', () => {
  it('counts claims by category, largest first, with the total they are out of', () => {
    const artefacts = [claim('c1', 'objective'), claim('c2', 'objective'), claim('c3', 'dependency')];
    expect(claimCensus(artefacts)).toEqual({
      rows: [{ key: 'objective', count: 2 }, { key: 'dependency', count: 1 }],
      total: 3,
    });
  });

  it('keeps a claim with no category rather than losing it out of the total', () => {
    const artefacts = [claim('c1', 'objective'), artefact('c2', 'claim', 'Bare', 'No category.', {})];
    const { rows, total } = claimCensus(artefacts);
    expect(total).toBe(2);
    expect(rows.find((r) => r.key === 'uncategorised')?.count).toBe(1);
  });
});

describe('the chain funnel', () => {
  it('counts citations rather than distinct assumptions, and distinct conclusions', () => {
    const artefacts: Artefact[] = [
      mechanism('m1'), mechanism('m2'),
      assumption('a1', []), assumption('a2', []),
      artefact('f1', 'finding', 'A conclusion', 'It concludes.', {}),
      chain('c1', ['m1', 'a1', 'f1']),
      chain('c2', ['m2', 'a1', 'a2', 'f1']),
    ];
    expect(chainFunnel(artefacts, MECHANISM_IDS)).toEqual({
      mechanisms: 2,
      chains: 2,
      // a1 is cited by both chains and counts twice: the figure is how much work
      // the chains do, not how many distinct things they rest on.
      assumptionCitations: 3,
      conclusions: 1,
    });
  });
});
