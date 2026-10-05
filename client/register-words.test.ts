import { describe, expect, it } from 'vitest';
import { ACTOR_KINDS, CAPACITIES, NOT_ACTOR_REASONS } from '$lib/policy-analysis/contracts';
import { CAPACITY_WORDS, KIND_CHOICES, KIND_WORDS, NOT_ACTOR_WORDS, capacitySentence, pathSentence } from './register-words';

describe('the master list in the reader’s words', () => {
  it('has a word for every kind, capacity and reason the server can send', () => {
    for (const kind of [...ACTOR_KINDS, 'not_an_actor']) expect(KIND_WORDS[kind]).toBeTruthy();
    expect(KIND_CHOICES.map((k) => k.value)).toEqual([...ACTOR_KINDS]);
    for (const capacity of CAPACITIES) expect(CAPACITY_WORDS[capacity]).toBeTruthy();
    for (const reason of NOT_ACTOR_REASONS) expect(NOT_ACTOR_WORDS[reason]).toBeTruthy();
  });

  it('says the capacities across papers as a sentence, most-seen first and "only named" last', () => {
    expect(capacitySentence({ regulates: 1, funds: 2 })).toBe('funds in 2 papers, regulates in 1');
    expect(capacitySentence({ named_only: 3, delivers: 1 })).toBe('delivers in 1 paper, is only named in 3');
    expect(capacitySentence({})).toBeNull();
    expect(capacitySentence(undefined)).toBeNull();
    const many = Object.fromEntries(CAPACITIES.map((c, i) => [c, i + 1]));
    expect(capacitySentence(many)).toMatch(/, and 6 more$/);
  });

  it('reads a breadcrumb nearest first', () => {
    expect(pathSentence(['Department for Education', 'Government'], 'partOf')).toBe('part of Department for Education, part of Government');
    expect(pathSentence([], 'kindOf')).toBeNull();
  });
});
