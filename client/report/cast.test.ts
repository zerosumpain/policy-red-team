// What the cast grid may say about its own coverage.
//
// The strings below are verbatim openings from the 330 profile cells of
// assessment 36ebca37, one per shape the predicate has to catch, plus the two
// shapes it must NOT catch: a real answer that happens to contain the word
// "unknown" later in the sentence, and a real answer naming a regulator. The
// core's own `traitCoverage()` counts every one of these as filled, which is
// true of the pipeline and false of the paper.
import { describe, expect, it } from 'vitest';
import { TRAIT_COLUMNS, type Cell, type TraitRow } from '$lib/policy-analysis/matrix';
import { castCoverage, isSilent } from './cast';

const cell = (full: string, origin = 'structural_inference'): Cell =>
  ({ text: full.slice(0, 28), full, origin, clipped: full.length > 28 });

const ABSENCES = [
  'unknown; the passage does not specify Skills England’s reporting line, sponsoring department, board accountability or statutory basis.',
  'Unknown as a documented motive.',
  'No supported direct gain from failure is identified. Some internal or external actors could avoid implementation costs.',
  'The policy does not specify individual-level success measures, targets or baselines.',
  'Not stated in the passage.',
  'None identified in the supplied material.',
];

const ANSWERS = [
  'Primarily the Office for Students for registration, quality and governance requirements.',
  'Institutional viability over a three to five year planning cycle, with an unknown degree of ministerial pressure.',
  'The body holds the only complete view of learner destinations.',
];

describe('what counts as the paper being silent', () => {
  it('catches every shape the profiles actually write', () => {
    for (const text of ABSENCES) expect(isSilent(cell(text))).toBe(true);
  });

  it('does not catch an answer that merely contains the word later', () => {
    for (const text of ANSWERS) expect(isSilent(cell(text))).toBe(false);
  });

  it('treats a cell the pipeline never wrote as neither answered nor silent', () => {
    expect(isSilent(null)).toBe(false);
  });
});

describe('coverage, per column and per grid', () => {
  const row = (label: string, cells: Cell[]): TraitRow => ({
    id: label, label, entityType: 'agency', profileId: `${label}_p`,
    worst: 77, band: 'severe', playCount: 3, topPlay: null, cells, known: true,
  });

  // Two bodies, six questions each. Every "Gains if it fails" answer is an
  // absence, which is what the live run does across all twelve bodies.
  const rows = [
    row('Skills England', [cell(ANSWERS[0], 'extracted_fact'), cell(ANSWERS[1]), cell(ANSWERS[2]), cell(ABSENCES[0]), cell(ABSENCES[1]), cell(ABSENCES[2])]),
    row('Ofsted', [cell(ABSENCES[3]), cell(ANSWERS[0], 'extracted_fact'), cell(ANSWERS[1], 'behavioural_hypothesis'), cell(ANSWERS[2]), null, cell(ABSENCES[4])]),
  ];
  const coverage = castCoverage(rows);

  it('counts the silence rather than reporting the grid full', () => {
    expect(coverage.total).toBe(2 * TRAIT_COLUMNS.length);
    expect(coverage.answered).toBe(6);
    expect(coverage.silent).toBe(5);
    expect(coverage.missing).toBe(1);
  });

  it('reports each column, so the heading can say how many of the bodies it answers for', () => {
    expect(coverage.columns.map((c) => [c.head, c.answered, c.silent])).toEqual([
      ['Answers to', 1, 1],
      ['Judged on', 2, 0],
      ['Looks ahead', 2, 0],
      ['Controls', 1, 1],
      ['Does instead', 0, 1],
      ['Gains if it fails', 0, 2],
    ]);
  });

  it('states the origins of the ANSWERED cells, largest first', () => {
    expect(coverage.origins).toEqual([
      { origin: 'extracted_fact', count: 2 },
      { origin: 'structural_inference', count: 3 },
      { origin: 'behavioural_hypothesis', count: 1 },
    ].sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin)));
  });
});
