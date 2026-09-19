import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { byReason, humaniseReason, parseRefusal } from './warnings';

/**
 * TESTED AGAINST THE REAL WARNINGS, because a parser of free prose tested only
 * against prose the author invented is a parser tested against its own
 * assumptions.
 *
 * `warnings.fixture.json` is all 256 warnings from assessment 36ebca37 — the
 * Post-16 Education and Skills run of 2026-09-19 — as `[stage, text]` pairs.
 * The counts asserted below are that run's actual arithmetic.
 */
const REAL: [number, string][] = JSON.parse(
  readFileSync(new URL('./warnings.fixture.json', import.meta.url), 'utf8'),
);

describe('the reason roll-up, which stage-facts does not do', () => {
  const warnings = REAL.map(([, text]) => text);

  it('accounts for every refused artefact the copied parser counts', () => {
    // `stage-facts.ts` counts 148 discarded items across both shapes; the ones
    // carrying a REASON are the subset this file rolls up. It must never exceed
    // that total — a roll-up bigger than the count means double-counting.
    const rolled = byReason(warnings).reduce((n, r) => n + r.count, 0);
    expect(rolled).toBeGreaterThan(0);
    expect(rolled).toBeLessThanOrEqual(148);
  });

  it('orders by size, because the largest reason is the finding', () => {
    const rolled = byReason(warnings);
    expect(rolled[0].count).toBeGreaterThanOrEqual(rolled[rolled.length - 1].count);
  });

  it('reads a refusal into its count, reason and ids', () => {
    const r = parseRefusal('2 model outputs were discarded and are not part of this assessment — An artefact of kind “edge” does not belong to this stage. Affected: s1_001_edge_001, s1_002_edge_004');
    expect(r).toEqual({
      count: 2,
      reason: 'An artefact of kind “edge” does not belong to this stage',
      affected: 's1_001_edge_001, s1_002_edge_004',
    });
  });

  it('returns null for a sentence of a different shape', () => {
    expect(parseRefusal('The paper does not say who holds the budget.')).toBeNull();
    expect(parseRefusal('4 items referred to something that is not in this assessment')).toBeNull();
  });
});

describe('making zod legible without hiding it', () => {
  it('turns a thirteen-option enum into a sentence', () => {
    // THE REAL SENTENCE, not the bare inner string: the pipeline wraps it, and
    // an anchored pattern matched nothing it actually writes.
    const raw = 'An artefact did not match its stage contract (claim data.category: Invalid option: expected one of "objective"|"problem"|"mechanism"|"a"|"b"|"c"|"d"|"e"|"f"|"g"|"h"|"i"|"j")';
    expect(humaniseReason(raw)).toBe('Claims filed under a category the contract does not define — not one of the 13 values it allows');
  });

  it('names the kind a stage was not supposed to write', () => {
    expect(humaniseReason('An artefact of kind “edge” does not belong to this stage'))
      .toBe('Edges produced by a stage that does not write them');
  });

  it('leaves a reason it cannot improve exactly as it was', () => {
    // Never replace the contract's own words with a worse guess.
    expect(humaniseReason('Something entirely unexpected')).toBe('Something entirely unexpected');
  });
});
