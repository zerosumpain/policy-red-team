// The Verdict lead's ranking of the final findings.
//
// On the Post-16 run (36ebca37) this puts test results, unresolved questions
// and high-risk assumptions first: all three cite a check that found high risk
// and all three were judged well supported by the final review.
import { describe, expect, it } from 'vitest';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { rankFindings, severityOf, type Chapter } from './writeup-view';

const base = (id: string, kind: Artefact['kind'], data: Record<string, unknown> = {}): Artefact => ({
  id,
  kind,
  label: `${id} title`,
  statement: `${id} statement`,
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
  data,
});

const high = base('test_authority', 'test', { result: 'high_risk' });
const moderate = base('test_resources', 'test', { result: 'moderate_risk' });
const unclear = base('test_metrics', 'test', { result: 'indeterminate' });
const severePlay = base('s10_000_exploit_001', 'exploit', { band: 'severe' });

const finding = (section: string, judgement: string, resultIds: string[], hypothesisIds: string[] = []) =>
  base(`s17_${section}`, 'finding', { section, judgement, resultIds, hypothesisIds });
const chapter = (item: Artefact): Chapter => ({ section: String(item.data.section), label: String(item.data.section), items: [item] });

describe('severityOf', () => {
  const byId = new Map([high, moderate, unclear, severePlay].map((a) => [a.id, a]));

  it('reads the worst result cited and says what it was', () => {
    const s = severityOf(finding('x', 'provisional', [unclear.id, moderate.id, high.id]), byId);
    expect(s.level).toBe(3);
    expect(s.label).toBe('High');
    expect(s.reason).toBe('It cites 1 check that found high risk.');
  });

  it('counts a severe play as high', () => {
    expect(severityOf(finding('x', 'provisional', [severePlay.id]), byId).reason)
      .toBe('It cites 1 way to beat the policy rated high.');
  });

  it('does not invent a severity for an indeterminate check or a missing id', () => {
    const s = severityOf(finding('x', 'provisional', [unclear.id, 'gone']), byId);
    expect(s.level).toBe(0);
    expect(s.label).toBe('Not rated');
  });
});

describe('rankFindings', () => {
  const artefacts = [high, moderate, unclear, severePlay];

  it('ranks by severity, then judgement, then how much is cited, then report order', () => {
    const chapters = [
      finding('objectives', 'well_supported', [moderate.id]),
      finding('mechanisms', 'provisional', [high.id]),
      finding('test_results', 'well_supported', [high.id, unclear.id], ['a1']),
      finding('assurance', 'well_supported', [high.id]),
      finding('distribution', 'supported_with_limits', [unclear.id]),
    ].map(chapter);
    const { top, rest } = rankFindings(chapters, artefacts, 3);
    expect(top.map((j) => j.id)).toEqual(['s17_test_results', 's17_assurance', 's17_mechanisms']);
    expect(rest.map((r) => r.item.id)).toEqual(['s17_objectives', 's17_distribution']);
  });

  it('never ranks the headline or the scope section, and keeps them in the appendix', () => {
    const chapters = [
      finding('executive_assessment', 'well_supported', [high.id]),
      finding('scope_methodology', 'well_supported', [high.id]),
      finding('objectives', 'provisional', []),
    ].map(chapter);
    const { top, rest } = rankFindings(chapters, artefacts);
    expect(top.map((j) => j.id)).toEqual(['s17_objectives']);
    expect(rest.map((r) => r.item.id)).toEqual(['s17_executive_assessment', 's17_scope_methodology']);
  });

  it('carries what the lead needs to print', () => {
    const { top } = rankFindings([chapter(finding('assurance', 'supported_with_limits', [high.id], ['a', 'b']))], artefacts);
    expect(top[0]).toMatchObject({
      title: 's17_assurance title',
      judgement: { key: 'supported_with_limits', label: 'Supported with limits' },
      severity: { level: 3 },
      support: 3,
      sectionLabel: 'assurance',
    });
  });
});
