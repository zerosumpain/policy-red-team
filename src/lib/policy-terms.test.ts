// Phase 23 — the paper's own names, defined from the run's own `whatItIs`.
import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import { MAX_TERMS, policyTerms, splitTerms, termFinder } from './policy-terms';
import { plainLines, type Brief } from './brief';

const mechanism = (id: string, label: string, whatItIs?: string) => artefact(id, 'mechanism', label, 'x', { intervention: 'x', implementation: 'y', notes: 'z', ...(whatItIs ? { whatItIs } : {}) });

describe('the glossary', () => {
  it('defines a part of the policy and a resolved body, and nothing without a definition', () => {
    const terms = policyTerms([
      mechanism('s1_a', 'Family Hubs', 'Local centres where parents of young children get help in one place.'),
      mechanism('s1_b', 'The core offer'),
      artefact('s2_main_actor_001', 'actor', 'Best Start Family Service', 'x', { whatItIs: 'The new name for the local services families use before school.' }),
      // A stage-1 mention is the same body seen once, and is not defined twice.
      artefact('s1_000_013', 'actor', 'Best Start Family Service', 'x', { whatItIs: 'A mention.' }),
    ]);
    expect(terms.map((t) => t.term)).toEqual(['Best Start Family Service', 'Family Hubs']);
  });

  it('is empty on an older run, so every page reads as before', () => {
    expect(policyTerms([mechanism('s1_a', 'Family Hubs')])).toEqual([]);
    expect(splitTerms('Family Hubs open late.', termFinder([]))).toEqual(['Family Hubs open late.']);
  });

  it('caps a model-produced list', () => {
    const many = Array.from({ length: MAX_TERMS + 20 }, (_, i) => mechanism(`s1_${i}`, `Programme number ${i}`, 'A programme.'));
    expect(policyTerms(many)).toHaveLength(MAX_TERMS);
  });

  it('marks the first mention of each term, longest name first, whole words only', () => {
    const finder = termFinder(policyTerms([
      mechanism('s1_a', 'Family Hubs', 'Local centres.'),
      mechanism('s1_b', 'Family Hubs network', 'All the centres together.'),
    ]));
    const pieces = splitTerms('The Family Hubs network grows; family hubs open late; Family Hubsville does not count.', finder);
    const terms = pieces.filter((p) => typeof p !== 'string').map((p) => (p as { text: string }).text);
    expect(terms).toEqual(['Family Hubs network', 'family hubs']);
    expect(pieces.map((p) => (typeof p === 'string' ? p : p.text)).join('')).toBe('The Family Hubs network grows; family hubs open late; Family Hubsville does not count.');
  });
});

describe('what this report says, in plain words', () => {
  const play = (id: string, goesWrong?: string) => artefact(id, 'exploit', id, 'x', goesWrong ? { plain: { who: 'a', does: 'b', goesWrong, likeWhen: null, whyItMatters: 'c' } } : {});
  const brief = (plays: ReturnType<typeof play>[]) => ({ items: plays.map((artefact) => ({ play: { artefact } })) } as unknown as Brief);

  it('leads with the brief’s plays, then the worst of the rest, three at most, never the same line twice', () => {
    const a = play('a', 'A parent waits.');
    const b = play('b', 'A child misses a place.');
    const c = play('c', 'A parent waits.');
    const d = play('d', 'A teacher fills in two forms.');
    const e = play('e', 'A nursery closes.');
    expect(plainLines(brief([b, a]), [a, c, d, e]).map((l) => l.text)).toEqual(['A child misses a place.', 'A parent waits.', 'A teacher fills in two forms.']);
  });

  it('is empty on an older run, and the card is not drawn', () => {
    expect(plainLines(brief([play('a')]), [play('b')])).toEqual([]);
  });
});
