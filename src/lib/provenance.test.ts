// The walk, driven over graphs built to break it.
//
// Every case here is a shape a real assessment produces. Synthesis cites
// broadly, so the same claim is reached by several routes; the entity resolution
// stage writes edges that point both ways, so cycles exist; a shared copy has
// had artefacts redacted out from under the refs that name them. A walk that
// handles none of those hangs the page rather than rendering it wrong, which is
// why this is tested away from React.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { citedBy, MAX_CITED_BY, paperWording, provenance } from './provenance';

const node = (id: string, refs: string[] = [], over: Partial<Artefact> = {}): Artefact =>
  artefact(id, 'claim', `Label ${id}`, `Statement ${id}`, {}, { refs, ...over });

const quote = (id: string, page: number, refs: string[] = []): Artefact =>
  artefact(id, 'passage', `Passage ${id}`, `Statement ${id}`, {}, { refs, page, sourceQuote: `The paper says ${id}.`, origin: 'extracted_fact' });

describe('the provenance chain', () => {
  it('walks a ladder back to the paper, one hop per rung', () => {
    const all = [
      node('s12_1_finding', ['s10_1_exploit']),
      node('s10_1_exploit', ['s1_1_claim']),
      node('s1_1_claim', ['m1_passage_0001']),
      quote('m1_passage_0001', 14),
    ];
    const chain = provenance('s12_1_finding', all);

    expect(chain.hops.map((h) => h.depth)).toEqual([1, 2, 3]);
    expect(chain.hops.map((h) => h.items.map((a) => a.id))).toEqual([['s10_1_exploit'], ['s1_1_claim'], ['m1_passage_0001']]);
    expect(chain.reached).toBe(3);
    expect(chain.stoppedBy).toBeNull();
    // The terminus, which is the whole point: the reader can go and read page 14.
    expect(chain.sources.map((a) => a.id)).toEqual(['m1_passage_0001']);
  });

  it('places an artefact reached two ways at its SHORTEST distance, once', () => {
    // Synthesis citing both a play and the claim under it is the ordinary case,
    // not a pathological one. Listing the claim at depth 1 and again at depth 2
    // would make the same evidence look like two independent supports.
    const all = [
      node('top', ['mid', 'shared']),
      node('mid', ['shared']),
      node('shared', []),
    ];
    const chain = provenance('top', all);
    expect(chain.hops.map((h) => h.items.map((a) => a.id))).toEqual([['mid', 'shared']]);
    expect(chain.reached).toBe(2);
  });

  it('terminates on a cycle, and never lists the artefact as its own ancestor', () => {
    const all = [node('a', ['b']), node('b', ['c']), node('c', ['a', 'b'])];
    const chain = provenance('a', all);
    expect(chain.hops.flatMap((h) => h.items.map((i) => i.id))).toEqual(['b', 'c']);
    expect(chain.stoppedBy).toBeNull();
  });

  it('thins rather than breaks when a ref names something that is not here', () => {
    // A shared copy has had the passages redacted out of it by design. The chain
    // should show what survived, not throw on the first missing id.
    const all = [node('a', ['gone', 'b']), node('b', [])];
    const chain = provenance('a', all);
    expect(chain.hops[0].items.map((i) => i.id)).toEqual(['b']);
    expect(chain.reached).toBe(1);
  });

  it('says WHY it stopped early, because the page has to explain itself', () => {
    // "Rests on nothing else", "the ladder is deeper than we followed" and "the
    // list would have been too long" are three different sentences, and a single
    // boolean made the page say the wrong one.
    const all = [node('a', ['b']), node('b', ['c']), node('c', ['d']), node('d', [])];
    expect(provenance('a', all, { maxDepth: 2 }).stoppedBy).toBe('depth');
    expect(provenance('a', all, { maxNodes: 2 }).stoppedBy).toBe('nodes');
    expect(provenance('a', all, { maxNodes: 2 }).reached).toBe(2);
    expect(provenance('a', all).stoppedBy).toBeNull();
  });

  it('does not claim the chain goes further when what is beyond the cap was redacted', () => {
    // The walk thins on an unresolvable ref everywhere else; the depth check has
    // to apply the same rule, or a shared copy is told there is more to see.
    // Two rungs followed, and what lies past the second is a redaction.
    const redacted = [node('a', ['b']), node('b', ['c']), node('c', ['gone'])];
    expect(provenance('a', redacted, { maxDepth: 2 }).stoppedBy).toBeNull();
    // The same shape, with something really there past the cap.
    expect(provenance('a', [...redacted, node('gone', [])], { maxDepth: 2 }).stoppedBy).toBe('depth');
  });

  it('counts the refs that resolved to nothing, so an emptied chain is not reported as an empty one', () => {
    const chain = provenance('a', [node('a', ['gone1', 'gone2'])]);
    expect(chain.hops).toHaveLength(0);
    expect(chain.reached).toBe(0);
    expect(chain.unresolved).toBe(2);
    expect(provenance('a', [node('a', ['b']), node('b', [])]).unresolved).toBe(0);
  });

  it('orders the sources by where they sit in the paper, not in the pipeline', () => {
    const all = [
      node('top', ['late', 'early']),
      quote('late', 40),
      quote('early', 3),
    ];
    expect(provenance('top', all).sources.map((a) => a.page)).toEqual([3, 40]);
  });

  it('reaches the passages themselves, which carry the paper in `statement` and not in `sourceQuote`', () => {
    // The bug this pins: filtering the terminus on `sourceQuote` alone stops at
    // the claims and never reaches the document, which is the one thing the walk
    // exists to find.
    const passage = artefact('m1_passage_0001', 'passage', 'Section 2 · passage 4', 'The Council is accountable for delivery and bears implementation costs.', {}, { page: 7, origin: 'extracted_fact' });
    const all = [node('s1_1_claim', [passage.id]), passage];
    expect(provenance('s1_1_claim', all).sources.map((a) => a.id)).toEqual([passage.id]);
    expect(paperWording(passage)).toContain('accountable for delivery');
  });

  it('shows a sentence once, keeping the passage over the quotation taken out of it', () => {
    const passage = artefact('m1_passage_0001', 'passage', 'Passage', 'The Council is accountable for delivery and bears implementation costs.', {}, { page: 7 });
    const claim = artefact('s1_1_claim', 'claim', 'Claim', 'Statement', {}, { refs: [passage.id], sourceQuote: 'The Council is accountable for delivery' });
    const chain = provenance('s12_1_finding', [node('s12_1_finding', [claim.id]), claim, passage]);
    expect(chain.sources.map((a) => a.id)).toEqual([passage.id]);
  });

  it('shows a sentence once when the quotation is the WHOLE passage, not merely part of it', () => {
    // The commonest duplicate of the lot, and a strict length test never caught
    // it: `quotes.ts` stores the document's own wording for the span, so a claim
    // reading a one-sentence passage carries it byte for byte.
    const line = 'The Council is accountable for delivery and bears implementation costs.';
    const passage = artefact('m1_passage_0014', 'passage', 'Passage', line, {}, { page: 14 });
    const claim = artefact('s1_1_claim', 'claim', 'Claim', 'Statement', {}, { refs: [passage.id], sourceQuote: line });
    const chain = provenance('s12_1_finding', [node('s12_1_finding', [claim.id]), claim, passage]);
    expect(chain.sources.map((a) => a.id)).toEqual([passage.id]);
  });

  it('shows one sentence once when several claims were read off it', () => {
    const line = 'The Council is accountable for delivery.';
    const claims = [1, 2, 3].map((n) =>
      artefact(`s1_${n}_claim`, 'claim', `Claim ${n}`, 'Statement', {}, { refs: ['m1_passage_0014'], sourceQuote: line }));
    const chain = provenance('top', [node('top', claims.map((c) => c.id)), ...claims]);
    expect(chain.sources).toHaveLength(1);
  });

  it('NEVER drops a passage, even when a longer one repeats its wording', () => {
    // A policy paper repeats itself. An annex restating a sentence used to
    // swallow the page it was restating, and the reader lost a citation from the
    // one section this whole feature exists to produce.
    const early = artefact('m1_passage_0014', 'passage', 'Passage 14', 'The Council is accountable for delivery.', {}, { page: 14 });
    const annex = artefact('m1_passage_0061', 'passage', 'Passage 61', 'Annex B repeats it: The Council is accountable for delivery. Costs fall to the authority.', {}, { page: 61 });
    const chain = provenance('top', [node('top', [early.id, annex.id]), early, annex]);
    expect(chain.sources.map((a) => a.page)).toEqual([14, 61]);
  });

  it('keeps the quotation when the passage it came from has been redacted away', () => {
    // A shared copy withholds the document. The quotations are then the only
    // trace of it left, and dropping them would leave the chain ungrounded.
    const claim = artefact('s1_1_claim', 'claim', 'Claim', 'Statement', {}, { refs: ['m1_passage_0001'], sourceQuote: 'The Council is accountable for delivery' });
    const chain = provenance('s12_1_finding', [node('s12_1_finding', [claim.id]), claim]);
    expect(chain.sources.map((a) => a.id)).toEqual([claim.id]);
  });

  it('returns an empty chain for an id that is not in the list', () => {
    expect(provenance('nobody', [node('a')])).toEqual({ hops: [], sources: [], reached: 0, stoppedBy: null, unresolved: 0 });
  });
});

describe('what cites it', () => {
  it('finds the artefacts holding this id, and excludes the artefact itself', () => {
    const all = [node('a', ['a', 'target']), node('b', ['target']), node('target', [])];
    const { items, total } = citedBy('target', all);
    expect(items.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(total).toBe(2);
  });

  it('caps the list but reports the true total', () => {
    const all = [node('target', []), ...Array.from({ length: 20 }, (_, i) => node(`c${i}`, ['target']))];
    const { items, total } = citedBy('target', all);
    expect(items).toHaveLength(MAX_CITED_BY);
    expect(total).toBe(20);
  });
});
