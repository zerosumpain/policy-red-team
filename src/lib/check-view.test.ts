// The counterpart ledger, against the shape the real run has.
//
// Twelve deterministic checks: three high risk, two moderate, seven that could
// not decide — and on the live assessment every one of those seven tests a
// relation the paper states zero times, while all five that decided rest on one
// it states 43, 13 or 9 times. That correspondence is the finding the section
// was withholding, so it is what the fixture reproduces.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { checkLedger, relationTally } from './check-view';

const RESULTS = ['high_risk', 'moderate_risk', 'low_risk', 'indeterminate'] as const;

const check = (id: string, trigger: string, counterpart: string, result: string): Artefact =>
  artefact(id, 'test', `Check ${id}`, 'What the walk found.', {
    result,
    rule: `${trigger} requires a corresponding ${counterpart}; absent trigger = indeterminate; missing counterpart = moderate review risk; matched = low structural risk.`,
    reasoning: 'Reasoning.',
    mitigation: 'Do the thing that would close it.',
  });

const edges = (relation: string, n: number) => Array.from({ length: n }, () => ({ relation }));

/** Two decided checks on stated relations, two stuck on relations nobody states. */
const world = () => ({
  checks: [
    check('t1', 'is_accountable_for', 'has_authority_over', 'high_risk'),
    check('t2', 'bears_cost_of', 'receives_benefit_from', 'moderate_risk'),
    check('t3', 'delivers', 'can_adapt', 'indeterminate'),
    check('t4', 'can_veto', 'is_accountable_for', 'indeterminate'),
  ],
  graph: [...edges('is_accountable_for', 43), ...edges('bears_cost_of', 13), ...edges('has_authority_over', 9)],
});

describe('relationTally', () => {
  it('counts a relation once per edge and nothing for one the graph never states', () => {
    const tally = relationTally(world().graph);
    expect(tally.get('is_accountable_for')).toBe(43);
    expect(tally.get('delivers')).toBeUndefined();
  });
});

describe('checkLedger', () => {
  it('parses the two relations out of the rule and counts each in the graph', () => {
    const { rows } = checkLedger(world().checks, world().graph, RESULTS);
    expect(rows[0].trigger).toEqual({ relation: 'is_accountable_for', count: 43 });
    expect(rows[0].counterpart).toEqual({ relation: 'has_authority_over', count: 9 });
    expect(rows[2].trigger).toEqual({ relation: 'delivers', count: 0 });
  });

  it('marks a check as never stated only when it is stuck AND its trigger is absent', () => {
    const { rows } = checkLedger(world().checks, world().graph, RESULTS);
    expect(rows.map((row) => row.neverStated)).toEqual([false, false, true, true]);
  });

  it('does NOT mark a stuck check whose trigger the paper does state', () => {
    // A check can be indeterminate for a reason other than an absent trigger,
    // and saying "the paper never states it" would then be false.
    const stuck = check('t5', 'is_accountable_for', 'funds', 'indeterminate');
    const { rows } = checkLedger([stuck], world().graph, RESULTS);
    expect(rows[0].neverStated).toBe(false);
  });

  it('draws every relation bar against the graph’s own busiest relation', () => {
    expect(checkLedger(world().checks, world().graph, RESULTS).peak).toBe(43);
    // Never zero: a graph with no edges must not make every bar a division by nothing.
    expect(checkLedger(world().checks, [], RESULTS).peak).toBe(1);
  });

  it('keeps a result nothing scored, because "no check passed" is the reading', () => {
    const { counts } = checkLedger(world().checks, world().graph, RESULTS);
    expect(counts).toEqual([
      { key: 'high_risk', count: 1 },
      { key: 'moderate_risk', count: 1 },
      { key: 'low_risk', count: 0 },
      { key: 'indeterminate', count: 2 },
    ]);
  });

  it('counts a result the vocabulary has never heard of, after the ones it has', () => {
    const odd = check('t6', 'funds', 'supports', 'escalated');
    const { counts } = checkLedger([...world().checks, odd], world().graph, RESULTS);
    expect(counts.at(-1)).toEqual({ key: 'escalated', count: 1 });
  });

  it('states the finding once, and states it differently when it is a different finding', () => {
    expect(checkLedger(world().checks, world().graph, RESULTS).reading)
      .toBe('2 of the 4 checks could not run: the paper never states the relations they test.');

    const mixed = [...world().checks, check('t5', 'is_accountable_for', 'funds', 'indeterminate')];
    expect(checkLedger(mixed, world().graph, RESULTS).reading)
      .toBe('3 of the 5 checks could not decide, 2 of them because the paper never states the relation they test.');

    // Nothing stuck, nothing to say.
    expect(checkLedger([world().checks[0]], world().graph, RESULTS).reading).toBeNull();
  });

  it('says a gap in this run is the run’s, never that the paper is silent', () => {
    // Phase 19: the paper stated 39 measures and the graph linked none. That
    // check is an extraction gap, and "the paper never states it" would be false.
    const gap = { ...check('t8', 'is_accountable_for', 'is_measured_by', 'indeterminate') };
    gap.data = { ...gap.data, basis: 'extraction_gap', extracted: { relation: 'is_measured_by', what: 'measures', count: 39 } };
    const delivered = { ...check('t9', 'delivers', 'can_adapt', 'indeterminate') };
    delivered.data = { ...delivered.data, basis: 'extraction_gap', extracted: { relation: 'delivers', what: 'mechanisms', count: 12 } };
    const { rows, reading } = checkLedger([...world().checks, gap, delivered], world().graph, RESULTS);
    expect(rows.map((row) => [row.extractionGap, row.neverStated])).toEqual([
      [false, false], [false, false], [false, true], [false, true], [true, false], [true, false],
    ]);
    expect(reading).toBe('4 of the 6 checks could not decide: 2 because the paper never states the relation they test; 2 because this run did not link what the paper does state — a limit of this run, not of the paper.');
  });

  it('gives up cleanly on a rule it does not recognise', () => {
    const odd = artefact('t7', 'test', 'Odd', 'Statement.', { result: 'indeterminate', rule: 'Something else entirely.' });
    const { rows } = checkLedger([odd], world().graph, RESULTS);
    expect(rows[0].trigger).toBeNull();
    expect(rows[0].counterpart).toBeNull();
    // Unparsed means unexplained: it must not be claimed as "never stated".
    expect(rows[0].neverStated).toBe(false);
  });
});
