import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { byReason, humaniseReason, parseStage, parseWarning, totals } from './warnings';

/**
 * TESTED AGAINST THE REAL WARNINGS, because a parser of free prose tested only
 * against prose the author invented is a parser tested against its own
 * assumptions.
 *
 * `warnings.fixture.json` is all 256 warnings from assessment 36ebca37 — the
 * Post-16 Education and Skills run of 2026-09-19 — as `[stage, text]` pairs.
 * The counts asserted below are that run's actual arithmetic.
 */
const REAL: [number, string][] = JSON.parse(
  readFileSync(new URL('./warnings.fixture.json', import.meta.url), 'utf8'),
);

const stages = (() => {
  const byStage = new Map<number, string[]>();
  for (const [stage, text] of REAL) byStage.set(stage, [...(byStage.get(stage) ?? []), text]);
  return [...byStage.entries()].map(([stage, list]) => parseStage(stage, `Stage ${stage}`, list));
})();

describe('reading a run’s own warnings', () => {
  it('recognises all four counted shapes in the real run', () => {
    const kinds = new Set(stages.flatMap((s) => s.discards).map((d) => d.kind));
    expect(kinds).toEqual(new Set(['groups', 'artefacts', 'references', 'pages', 'note']));
  });

  it('gets the totals that decide whether the report overclaims', () => {
    const t = totals(stages);
    // Measured against the run: these are the four figures the provenance view
    // leads with, and the reason it exists.
    expect(t.groups).toBe(68);
    expect(t.artefacts).toBe(80);
    expect(t.references).toBe(113);
    expect(t.pagesUnread).toBe(4);
    expect(t.pagesTotal).toBe(72);
  });

  it('counts a page once however many stages mention it', () => {
    // Summing would say eight pages were unread out of a 72-page paper when
    // four were — an overstatement in the one view that must not overstate.
    const doubled = [...stages, ...stages];
    expect(totals(doubled).pagesUnread).toBe(totals(stages).pagesUnread);
  });

  it('keeps everything it does not recognise, rather than guessing', () => {
    const t = totals(stages);
    const all = stages.flatMap((s) => s.discards).length;
    expect(t.notes).toBe(183);
    expect(t.notes).toBeLessThan(all);
    // Nothing is dropped on the floor: every warning is one discard.
    expect(all).toBe(REAL.length);
  });
});

describe('the largest reason, which is the finding', () => {
  it('rolls up to “rests on something other than an assumption”, biggest first', () => {
    const rolled = byReason(stages);
    expect(rolled.length).toBeGreaterThan(0);
    expect(rolled[0].count).toBeGreaterThanOrEqual(rolled[rolled.length - 1].count);
    // 47 plays survived out of 73 written. A report that says "47 plays"
    // without that is overclaiming.
    const total = rolled.reduce((n, r) => n + r.count, 0);
    expect(total).toBe(totals(stages).artefacts);
  });
});

describe('each shape, read exactly', () => {
  it('splits an artefact discard into its reason and its affected ids', () => {
    const d = parseWarning('2 model outputs were discarded and are not part of this assessment — An artefact of kind “edge” does not belong to this stage. Affected: s1_001_edge_001, s1_002_edge_004');
    expect(d).toMatchObject({ kind: 'artefacts', count: 2 });
    if (d.kind !== 'artefacts') throw new Error('shape');
    expect(d.reason).toBe('An artefact of kind “edge” does not belong to this stage');
    expect(d.affected).toBe('s1_001_edge_001, s1_002_edge_004');
  });

  it('reads a page warning as a count out of a total', () => {
    const d = parseWarning('4 of 72 pages carry no policy text and were not analysed: page 1 (too little text)');
    expect(d).toMatchObject({ kind: 'pages', count: 4, total: 72 });
  });

  it('does not mistake a note for a count', () => {
    expect(parseWarning('The paper does not say who holds the budget.').kind).toBe('note');
    // A sentence that merely contains a number is still a note.
    expect(parseWarning('Only 3 of the bodies named have statutory powers.').kind).toBe('note');
  });
});

describe('making zod legible without hiding it', () => {
  it('turns a thirteen-option enum into a sentence', () => {
    const raw = 'claim data.category: Invalid option: expected one of "objective"|"problem"|"mechanism"|"a"|"b"|"c"|"d"|"e"|"f"|"g"|"h"|"i"|"j"';
    expect(humaniseReason(raw)).toBe('Claims filed under a category the contract does not define — not one of the 13 values it allows');
  });

  it('names the kind a stage was not supposed to write', () => {
    expect(humaniseReason('An artefact of kind “edge” does not belong to this stage'))
      .toBe('Edges produced by a stage that does not write them');
  });

  it('leaves a reason it cannot improve exactly as it was', () => {
    // Never replace the contract's own words with a worse guess.
    expect(humaniseReason('Something entirely unexpected')).toBe('Something entirely unexpected');
  });
});
