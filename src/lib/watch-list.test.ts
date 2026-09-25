import { describe, expect, it } from 'vitest';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { plays } from '$lib/policy-analysis/view';
import { watchCsv, watchList } from './watch-list';

const base = (id: string, kind: Artefact['kind'], data: Record<string, unknown> = {}, refs: string[] = []): Artefact => ({
  id, kind, label: `${id} title`, statement: `${id} statement`, origin: 'structural_inference', confidence: null, refs,
  sourceId: null, sourceQuote: null, page: null, section: null, startOffset: null, endOffset: null, url: null,
  fromId: null, toId: null, relation: null, temporal: null, data,
});

const actor = base('s2_001_actor_001', 'actor');
const playA = base('s10_000_exploit_001', 'exploit', {
  actorId: actor.id, band: 'severe', exposure: 0.77, earlyWarning: 'Few binding agreements', counter: 'Fund transition conditionally',
  preconditions: ['s1_assumption_001'], targets: ['s1_mechanism_001'],
});
const playB = base('s10_001_exploit_001', 'exploit', {
  band: 'moderate', exposure: 0.4, earlyWarning: '=HYPERLINK("x")', counter: 'Say "no", firmly',
  preconditions: [], targets: ['s1_mechanism_001'],
});
const playC = base('s10_002_exploit_001', 'exploit', { band: 'limited', exposure: 0.1, preconditions: [], targets: [] });
const assumption = base('s1_assumption_001', 'assumption');
const mechanism = base('s1_mechanism_001', 'mechanism');
const findingNamesA = base('s17_main_finding_001', 'finding', {}, [playA.id]);
const findingNamesMech = base('s17_main_finding_002', 'finding', {}, [mechanism.id, assumption.id]);
const recWeak = base('s17_main_recommendation_001', 'recommendation', { findingIds: [findingNamesMech.id] });
const recStrong = base('s17_main_recommendation_002', 'recommendation', { findingIds: [findingNamesA.id], owner: 'Department for Education' });

const artefacts = [actor, playA, playB, playC, assumption, mechanism, findingNamesA, findingNamesMech, recWeak, recStrong];

describe('watchList', () => {
  const rows = watchList(plays(artefacts), [recWeak, recStrong], artefacts);

  it('keeps the assessment order and carries the warning and the counter', () => {
    expect(rows.map((r) => r.play.artefact.id)).toEqual([playA.id, playB.id, playC.id]);
    expect(rows[0].warning).toBe('Few binding agreements');
    expect(rows[0].counter).toBe('Fund transition conditionally');
  });

  it('takes the strongest link any recommendation has, whatever order they come in', () => {
    expect(rows[0].recommendation?.id).toBe(recStrong.id);
    expect(rows[0].tier).toBe('named');
    expect(rows[0].owner).toBe('Department for Education');
    expect(rows[1].recommendation?.id).toBe(recWeak.id);
    expect(rows[1].tier).toBe('mechanism');
    expect(rows[1].owner).toBe('');
  });

  it('leaves a play nothing reaches unanswered rather than guessing', () => {
    expect(rows[2].recommendation).toBeNull();
    expect(rows[2].tier).toBeNull();
    expect(rows[2].warning).toBe('');
  });
});

describe('watchCsv', () => {
  const csv = watchCsv(watchList(plays(artefacts), [recWeak, recStrong], artefacts));
  const lines = csv.replace(/^﻿/, '').trim().split('\r\n');

  it('has a byte-order mark, a header and one CRLF row per play', () => {
    expect(csv.startsWith('﻿')).toBe(true);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^Rank,Way to beat the policy,/);
  });

  it('quotes commas and quotes, and defuses a cell a spreadsheet would run', () => {
    expect(lines[2]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[2]).toContain('"Say ""no"", firmly"');
  });
});
