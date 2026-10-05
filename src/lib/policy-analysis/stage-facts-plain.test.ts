// Phase 23: the pipeline's own plain-English check is machine state, never an
// "open question" about the paper (see stage-facts.ts).
import { describe, expect, it } from 'vitest';
import { factLabel, stageFacts } from './stage-facts';
import { PLAIN_CHECK } from './plain';

describe('a plain-English check in the stage strip', () => {
  it('is its own kind, counted from its leading figure', () => {
    const facts = stageFacts([`${PLAIN_CHECK} 3 items put an identifier in a sentence where a reader needs words.`, 'The paper does not say who funds it.']);
    expect(facts.map((f) => f.kind)).toEqual(['plain_check', 'open']);
    expect(factLabel(facts[0])).toBe('3 items not yet in plain words');
  });
});
