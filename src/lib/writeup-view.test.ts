// The three things the write-up computes about itself, and the one case each of
// them is in the report for.
//
// The figures below are the real ones from the Post-16 run (assessment
// 36ebca37): nineteen assured findings across nineteen sections, four well
// supported, eleven supported with limits, four provisional.
import { describe, expect, it } from 'vitest';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { actsOf, judgementTally, tallyTotal, unplacedChapters, withoutEcho, type Chapter } from './writeup-view';

const finding = (section: string, judgement?: string, over: Partial<Artefact> = {}): Artefact => ({
  id: `s17_main_finding_${section}`,
  kind: 'finding',
  label: `${section} title`,
  statement: `${section} statement`,
  origin: 'structural_inference',
  confidence: null,
  refs: [],
  sourceId: null,
  sourceQuote: null,
  page: null,
  section: null,
  startOffset: null,
  endOffset: null,
  url: null,
  fromId: null,
  toId: null,
  relation: null,
  temporal: null,
  data: judgement ? { section, judgement } : { section },
  ...over,
});

const chapter = (section: string, ...items: Artefact[]): Chapter => ({ section, label: section, items });

describe('judgementTally', () => {
  it('counts findings in ramp order and drops the categories the run did not use', () => {
    const tally = judgementTally([
      chapter('a', finding('a', 'provisional')),
      chapter('b', finding('b', 'well_supported'), finding('b2', 'supported_with_limits')),
      chapter('c', finding('c', 'supported_with_limits')),
    ]);
    expect(tally).toEqual([
      { key: 'well_supported', label: 'Well supported', count: 1 },
      { key: 'supported_with_limits', label: 'Supported with limits', count: 2 },
      { key: 'provisional', label: 'Provisional', count: 1 },
    ]);
    expect(tallyTotal(tally)).toBe(4);
  });

  it('counts findings, not sections, so a section holding two judgements is two counts', () => {
    const tally = judgementTally([chapter('a', finding('a', 'well_supported'), finding('a2', 'provisional'))]);
    expect(tallyTotal(tally)).toBe(2);
    expect(tally.map((t) => t.count)).toEqual([1, 1]);
  });

  it('falls back to the confidence reading for a finding that carries no judgement', () => {
    // The pre-assured findings have a number and no word. `confidenceJudgement`
    // reads 0.9 as "Well supported", and the tally must agree with the chip the
    // same function draws on the card.
    const tally = judgementTally([chapter('a', finding('a', undefined, { confidence: 0.9 }))]);
    expect(tally).toEqual([{ key: 'well_supported', label: 'Well supported', count: 1 }]);
  });

  it('is empty for a write-up with no findings', () => {
    expect(judgementTally([])).toEqual([]);
    expect(tallyTotal([])).toBe(0);
  });
});

describe('actsOf', () => {
  it('groups the sections into the acts the .docx prints, in act order', () => {
    // Deliberately handed in contract order and expected back in act order:
    // `distribution` is a response-act chapter and `objectives` an intent one,
    // so an act-grouped page must not read them as neighbours.
    const acts = actsOf([
      chapter('scope_methodology', finding('scope_methodology')),
      chapter('objectives', finding('objectives')),
      chapter('distribution', finding('distribution')),
      chapter('executive_assessment', finding('executive_assessment')),
    ]);
    expect(acts.map((act) => [act.key, act.chapters.map((c) => c.section)])).toEqual([
      ['verdict', ['executive_assessment', 'scope_methodology']],
      ['intent', ['objectives']],
      ['response', ['distribution']],
    ]);
    expect(acts[0].strap).toMatch(/what this assessment concludes/i);
  });

  it('drops an act the assessment wrote nothing for rather than heading an empty band', () => {
    expect(actsOf([chapter('objectives', finding('objectives'))]).map((act) => act.key)).toEqual(['intent']);
  });

  it('ignores a section no act claims — that is `unplacedChapters`' + "'" + 's job', () => {
    expect(actsOf([chapter('new_section', finding('new_section'))])).toEqual([]);
  });
});

describe('unplacedChapters', () => {
  it('returns nothing when every section the assessment wrote is claimed by an act', () => {
    const chapters = [chapter('objectives', finding('objectives')), chapter('actors', finding('actors'))];
    expect(unplacedChapters(chapters)).toEqual([]);
  });

  it('returns the section a contract change added and no act claims', () => {
    const placed = chapter('objectives', finding('objectives'));
    const drifted = chapter('new_section', finding('new_section'));
    expect(unplacedChapters([placed, drifted])).toEqual([drifted]);
  });
});

describe('withoutEcho', () => {
  const statement = 'The assured assessment is that the policy is not decision-ready. Full-scale commitment should therefore be conditional.';

  it('drops the sentence the page printed as its headline', () => {
    expect(withoutEcho(statement, 'The assured assessment is that the policy is not decision-ready.'))
      .toBe('Full-scale commitment should therefore be conditional.');
  });

  it('keeps the whole statement when the headline is not its exact opening', () => {
    expect(withoutEcho(statement, 'The assured assessment is that the policy is NOT decision-ready.')).toBe(statement);
    expect(withoutEcho(statement, 'Full-scale commitment')).toBe(statement);
    expect(withoutEcho(statement)).toBe(statement);
  });

  it('keeps the statement when the headline is the whole of it', () => {
    expect(withoutEcho('One sentence only.', 'One sentence only.')).toBe('One sentence only.');
  });
});
