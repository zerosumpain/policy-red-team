import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { discardWarning, type Rejection } from '$lib/policy-analysis/validation';
import { affectedInWords, groupRefused, kindPhrase, parseAffected, placeOf, stageOnePlaces, stepPhrase, type Named } from './refused';

/**
 * AGAINST THE LIVE RUN'S OWN SENTENCES. Each string below is copied verbatim
 * from the Best Start run (44dd5420, 25 September 2026) — what the method page
 * printed as a column of ids — and the page numbers asserted are that run's
 * real ones: slot 000 is page 3 and slot 014 is page 17, because step 1 skipped
 * pages 1 and 2 before it handed out a slot.
 */
const LIVE = {
  slot000: 'An extracted assertion could not be located in the policy text. Affected: s1_000_009 (claim), s1_000_010 (claim).',
  slot014: 'Affected: s1_014_claim_002 (claim).',
  edges: 's1_030_edge_001 (edge), s1_030_edge_002 (edge).',
  profiles: 's4_025_profile_001 (profile), s4_025_profile_002 (profile), s4_025_profile_003 (profile), s4_025_profile_004 (profile), s4_025_profile_005 (profile), s4_025_profile_006 (profile), and 2 more.',
  recs: 's12_main_recommendation_002 (recommendation), s12_main_recommendation_003 (recommendation), s12_main_recommendation_004 (recommendation), s12_main_recommendation_006 (recommendation).',
};
const tail = (text: string) => text.slice(text.indexOf('Affected:') + 'Affected:'.length);

const policyText = (n: number) => `Page ${n} of the paper. ${'Families will be able to reach help through a hub in every area, and councils will run them. '.repeat(3)}`;
const page = (n: number, text = policyText(n)): Artefact =>
  artefact(`passage_${String(n).padStart(4, '0')}`, 'passage', `Page ${n} · passage ${n}`, text, { documentHash: 'a'.repeat(64) }, { origin: 'extracted_fact', page: n });
/** A kept step-1 item: cites its passage exactly as the live run's do. */
const kept = (id: string, n: number): Artefact =>
  artefact(id, 'claim', `kept on page ${n}`, 'x', {}, { origin: 'extracted_fact', page: n, sourceId: `passage_${String(n).padStart(4, '0')}`, refs: [`passage_${String(n).padStart(4, '0')}`] });

/** The live run's front: page 1 too short, page 2 a contents list, then policy. */
const contents = page(2, ['Contents', ...Array.from({ length: 8 }, (_, i) => `Chapter ${i + 1} ${i * 4 + 3}`)].join('\n'));
const passages = [page(1, 'Best Start\nCP 1'), contents, ...Array.from({ length: 18 }, (_, i) => page(i + 3))];

describe('reading what a discard named', () => {
  it('reads the shape every run before phase 21 wrote', () => {
    expect(parseAffected(tail(LIVE.slot000))).toEqual({
      items: [
        { id: 's1_000_009', kind: 'claim', label: null, quote: null },
        { id: 's1_000_010', kind: 'claim', label: null, quote: null },
      ],
      more: 0,
    });
    expect(parseAffected(LIVE.profiles)).toMatchObject({ more: 2 });
    expect(parseAffected(LIVE.profiles).items).toHaveLength(6);
  });

  it('reads the phase 21 shape, commas and brackets inside the words included', () => {
    const parsed = parseAffected(' s1_014_claim_002 (claim: “Hubs (in every area), open to all”; quoting “every family feels valued, and confident”), s1_014_claim_005 (claim: “Councils run them”), and 3 more.');
    expect(parsed.more).toBe(3);
    expect(parsed.items).toEqual([
      { id: 's1_014_claim_002', kind: 'claim', label: 'Hubs (in every area), open to all', quote: 'every family feels valued, and confident' },
      { id: 's1_014_claim_005', kind: 'claim', label: 'Councils run them', quote: null },
    ]);
  });

  it('reads the bare comma lists older runs and upstream wrote, telling ids from labels', () => {
    expect(parseAffected('s1_001_edge_001, s1_002_edge_004').items.map((i) => i.id)).toEqual(['s1_001_edge_001', 's1_002_edge_004']);
    const labels = parseAffected('Trust behaviour, Funding route, and 6 more.');
    expect(labels.more).toBe(6);
    expect(labels.items).toEqual([
      { id: null, kind: null, label: 'Trust behaviour', quote: null },
      { id: null, kind: null, label: 'Funding route', quote: null },
    ]);
  });

  it('round-trips what validation writes, at every level the clamp degrades to', () => {
    const rejection = (n: number, label: string, quote: string): Rejection => ({ id: `s1_014_claim_${String(n).padStart(3, '0')}`, kind: 'claim', code: 'quote', reason: 'An extracted assertion could not be located in the policy text.', label, quote });
    const one = discardWarning([rejection(2, 'Families can access “Best Start” hubs', 'every family feels\nvalued')]);
    expect(parseAffected(tail(one)).items).toEqual([{ id: 's1_014_claim_002', kind: 'claim', label: 'Families can access Best Start hubs', quote: 'every family feels valued' }]);

    const many = discardWarning(Array.from({ length: 9 }, (_, i) => rejection(i, 'L'.repeat(200), 'Q'.repeat(200))));
    expect(many.length).toBeLessThanOrEqual(1000);
    const read = parseAffected(tail(many));
    expect(read.items.length + read.more).toBe(9);
  });
});

describe('placing a step-1 item on the paper', () => {
  it('reads a slot through its kept siblings — slot 014 is page 17, not page 14', () => {
    // Siblings exactly as the live run has them: slot 000 cites passage 3.
    const artefacts = [...passages, kept('s1_000_001', 3), kept('s1_014_actor_001', 17)];
    const places = stageOnePlaces(artefacts);
    expect(placeOf('s1_000_009', places)?.page).toBe(3);
    expect(placeOf('s1_014_claim_002', places)?.page).toBe(17);
    expect(placeOf('s1_014_claim_002', places)?.passage?.id).toBe('passage_0017');
  });

  it('falls back to the recomputed partition when every item of a slot was refused', () => {
    // No siblings at all: the cover and the contents are skipped, so slot 004
    // is the fifth page analysed — page 7.
    const places = stageOnePlaces(passages);
    expect(placeOf('s1_004_claim_002', places)?.page).toBe(7);
    // Past the end of the partition is somewhere the run never put a slot.
    expect(placeOf('s1_090_claim_001', places)).toBeNull();
  });

  it('places on the sibling page when a shared copy has withheld the passages', () => {
    const places = stageOnePlaces([kept('s1_014_actor_001', 17)]);
    expect(placeOf('s1_014_claim_002', places)).toEqual({ page: 17, passage: null });
  });

  it('places nothing outside step 1', () => {
    const places = stageOnePlaces([...passages, kept('s1_000_001', 3)]);
    expect(placeOf('s4_000_profile_001', places)).toBeNull();
    expect(placeOf(null, places)).toBeNull();
  });
});

describe('grouping what was refused by where it came from', () => {
  const named = (text: string, ordinal: number, stage: string): Named[] =>
    parseAffected(text).items.map((item) => ({ ...item, ordinal, stage }));

  it('says pages for step 1 and steps for the rest, with no id anywhere', () => {
    const places = stageOnePlaces([...passages, kept('s1_000_001', 3), kept('s1_014_actor_001', 17)]);
    const items = [
      ...named(tail(LIVE.slot014), 1, 'Document decomposition'),
      ...named(tail(LIVE.slot000), 1, 'Document decomposition'),
      ...named(LIVE.profiles, 4, 'Actor and incentive profiles'),
      ...named(LIVE.recs, 12, 'Synthesis'),
    ];
    const groups = groupRefused(items, [{ ordinal: 4, stage: 'Actor and incentive profiles', count: 2 }], places);
    const lines = groups.map((g) => g.where === 'page'
      ? `${kindPhrase(g.kinds)} on page ${g.page}`
      : g.unnamed ? `${g.unnamed} more ${stepPhrase(g.ordinal, g.stage)}` : `${kindPhrase(g.kinds)} ${stepPhrase(g.ordinal, g.stage)}`);
    expect(lines).toEqual([
      '2 claims on page 3',
      '1 claim on page 17',
      '6 profiles of bodies from step 5, Actor and incentive profiles',
      '2 more from step 5, Actor and incentive profiles',
      '4 recommendations from step 13, Synthesis',
    ]);
    expect(lines.join(' ')).not.toMatch(/s\d+_/);
  });

  it('folds two kinds on one page into one line', () => {
    const places = stageOnePlaces([...passages, kept('s1_019_actor_001', 22)]);
    const items = named('s1_019_claim_001 (claim), s1_019_assumption_004 (assumption), s1_019_claim_009 (claim)', 1, 'Document decomposition');
    const [group] = groupRefused(items, [], places);
    expect(kindPhrase(group.kinds)).toBe('2 claims and 1 assumption');
    expect(group.page).toBe(22);
  });

  it('says a warning tail in words wherever the whole text is printed', () => {
    const places = stageOnePlaces([...passages, kept('s1_000_001', 3)]);
    expect(affectedInWords(LIVE.slot000, 1, null, places)).toBe(
      'An extracted assertion could not be located in the policy text. Affected: 2 claims the model said were on page 3.',
    );
    expect(affectedInWords(`Affected: ${LIVE.profiles}`, 4, null, places)).toBe(
      'Affected: 6 profiles of bodies from step 5; 2 more from step 5, counted but not named by the run.',
    );
    expect(affectedInWords('Affected: s1_000_009 (claim: “Hubs open to all”).', 1, null, places)).toBe(
      'Affected: 1 claim the model said was on page 3: “Hubs open to all”.',
    );
    expect(affectedInWords('No inventory here.', 1, null, places)).toBe('No inventory here.');
  });

  it('says what a stage-1 item with no place came from without inventing a page', () => {
    const items = named('s1_000_009 (claim)', 1, 'Document decomposition');
    const [group] = groupRefused(items, [], new Map());
    expect(group.where).toBe('step');
    expect(stepPhrase(group.ordinal, group.stage)).toBe('from step 2, Document decomposition');
  });
});
