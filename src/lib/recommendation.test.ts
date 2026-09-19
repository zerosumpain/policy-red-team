import { describe, expect, it } from 'vitest';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { linkRecommendation } from './recommendation';

/**
 * A miniature of the real shape: a recommendation naming two findings, findings
 * naming checks and assumptions, and four plays that reach it by four different
 * routes — one named outright, one through a shared assumption, one through a
 * shared mechanism, and one that is simply unrelated.
 */
const a = (id: string, kind: string, extra: Partial<Artefact> = {}): Artefact => ({
  id,
  kind,
  label: id,
  statement: '',
  origin: 'stated_in_document',
  refs: [],
  data: {},
  ...extra,
} as Artefact);

const SET: Artefact[] = [
  a('rec_1', 'recommendation', {
    refs: ['find_1', 'find_2', 'test_authority', 'assume_loose'],
    data: { findingIds: ['find_1', 'find_2'] },
  }),
  a('find_1', 'finding', { refs: ['test_authority', 'assume_shared', 'play_named'] }),
  a('find_2', 'finding', { refs: ['mech_shared', 'assume_shared'] }),
  a('test_authority', 'test', {}),
  a('assume_shared', 'assumption', {}),
  a('assume_loose', 'assumption', {}),
  a('assume_other', 'assumption', {}),
  a('mech_shared', 'mechanism', {}),
  a('mech_other', 'mechanism', {}),

  a('play_named', 'exploit', { data: { preconditions: ['assume_other'], targets: ['mech_other'] } }),
  a('play_assumption', 'exploit', { data: { preconditions: ['assume_shared'], targets: ['mech_other'] } }),
  a('play_mechanism', 'exploit', { data: { preconditions: ['assume_other'], targets: ['mech_shared'] } }),
  a('play_unrelated', 'exploit', { data: { preconditions: ['assume_other'], targets: ['mech_other'] } }),
];

describe('what a recommendation bears on', () => {
  const links = linkRecommendation(SET[0], SET);

  it('resolves the findings it answers, and only findings', () => {
    expect(links.findings.map((f) => f.id)).toEqual(['find_1', 'find_2']);
  });

  it('resolves the structural checks it cites — a recommendation’s risk anchor', () => {
    expect(links.checks.map((c) => c.id)).toEqual(['test_authority']);
  });

  it('files a play its findings cite as NAMED, whatever else it also matches', () => {
    // `play_named` also shares nothing else; the point is that the strongest
    // available link wins rather than the first one tested.
    expect(links.plays.find((p) => p.id === 'play_named')?.tier).toBe('named');
  });

  it('files a play through a shared assumption, and records which one', () => {
    const found = links.plays.find((p) => p.id === 'play_assumption');
    expect(found?.tier).toBe('assumption');
    expect(found?.via).toEqual(['assume_shared']);
  });

  it('files a play through a shared mechanism', () => {
    expect(links.plays.find((p) => p.id === 'play_mechanism')?.tier).toBe('mechanism');
  });

  it('leaves an unrelated play out entirely', () => {
    // THE WHOLE POINT. A transitive walk reached 44 of 47 plays on the real run;
    // a join that cannot exclude anything is not a join.
    expect(links.plays.map((p) => p.id)).not.toContain('play_unrelated');
  });

  it('orders by strength of link, so the claim leads and the leads follow', () => {
    expect(links.plays.map((p) => p.tier)).toEqual(['named', 'assumption', 'mechanism']);
  });

  it('counts each tier for the sentences that state the rule', () => {
    expect(links.counts).toEqual({ named: 1, assumption: 1, mechanism: 1 });
  });

  it('does not treat an assumption the recommendation itself cites as a finding’s', () => {
    // `assume_loose` is on the recommendation's own refs, so a play resting on
    // it IS legitimately linked — but through the recommendation, not through a
    // finding. The set is deliberately union-ed; this asserts the union holds.
    const withLoose = [...SET, a('play_loose', 'exploit', { data: { preconditions: ['assume_loose'] } })];
    const again = linkRecommendation(SET[0], withLoose);
    expect(again.plays.find((p) => p.id === 'play_loose')?.tier).toBe('assumption');
  });
});
