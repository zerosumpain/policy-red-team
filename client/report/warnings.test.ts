import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  byReason, discards, groupLimits, humaniseReason, limitLead, parseRefusal, readable, truncations,
} from './warnings';

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

/**
 * The same fixture as the stage rows the page is handed.
 *
 * `groupLimits`, `discards` and `truncations` all exist BECAUSE the stage was
 * being thrown away by `flatMap` before anything could read it, so testing them
 * on a flat array of strings would test the shape the defect had. The fixture
 * carries the stage ordinal on every pair; the name is synthesised here because
 * the fixture never recorded one, and nothing under test reads it as anything
 * but a key.
 */
const STAGES: { name: string; ordinal: number; warnings: string[] }[] = (() => {
  const by = new Map<number, { name: string; ordinal: number; warnings: string[] }>();
  for (const [ordinal, text] of REAL) {
    const stage = by.get(ordinal) ?? { name: `Stage ${ordinal}`, ordinal, warnings: [] };
    stage.warnings.push(text);
    by.set(ordinal, stage);
  }
  return [...by.values()].sort((a, b) => a.ordinal - b.ordinal);
})();

describe('the reason roll-up, which stage-facts does not do', () => {
  const warnings = REAL.map(([, text]) => text);

  it('accounts for every refused artefact the copied parser counts', () => {
    // `stage-facts.ts` counts 148 discarded items across both shapes; the ones
    // carrying a REASON are the subset this file rolls up. It must never exceed
    // that total — a roll-up bigger than the count means double-counting.
    const rolled = byReason(warnings).reduce((n, r) => n + r.count, 0);
    expect(rolled).toBeGreaterThan(0);
    expect(rolled).toBeLessThanOrEqual(148);
  });

  it('orders by size, because the largest reason is the finding', () => {
    const rolled = byReason(warnings);
    expect(rolled[0].count).toBeGreaterThanOrEqual(rolled[rolled.length - 1].count);
  });

  it('reads a refusal into its count, reason and ids', () => {
    const r = parseRefusal('2 model outputs were discarded and are not part of this assessment — An artefact of kind “edge” does not belong to this stage. Affected: s1_001_edge_001, s1_002_edge_004');
    expect(r).toEqual({
      count: 2,
      reason: 'An artefact of kind “edge” does not belong to this stage',
      affected: 's1_001_edge_001, s1_002_edge_004',
    });
  });

  it('returns null for a sentence of a different shape', () => {
    expect(parseRefusal('The paper does not say who holds the budget.')).toBeNull();
    expect(parseRefusal('4 items referred to something that is not in this assessment')).toBeNull();
  });
});

describe('making zod legible without hiding it', () => {
  it('turns a thirteen-option enum into a sentence', () => {
    // THE REAL SENTENCE, not the bare inner string: the pipeline wraps it, and
    // an anchored pattern matched nothing it actually writes.
    const raw = 'An artefact did not match its stage contract (claim data.category: Invalid option: expected one of "objective"|"problem"|"mechanism"|"a"|"b"|"c"|"d"|"e"|"f"|"g"|"h"|"i"|"j")';
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

describe('making a machine-written sentence grammatical without touching the stored text', () => {
  it('repairs the "1 group … were" template the first rule never matched', () => {
    // On the live run this is on the page six times, as the fourth of the eight
    // visible limits: "1 group of model output were discarded in this stage."
    const raw = REAL.map(([, text]) => text).find((text) => /1 group of model output/.test(text));
    expect(raw).toBeDefined();
    expect(raw).toContain('1 group of model output were discarded');
    expect(readable(raw!)).toContain('1 group of model output was discarded');
  });

  it('leaves the substring the pipeline counts on exactly where it was', () => {
    // `pipeline.ts` counts discarded groups by matching this literal, and that
    // count is the 162 at the top of the panel — so a repair that touched it
    // would silently zero part of the headline figure.
    const counted = '2 model outputs were discarded and are not part of this assessment — something';
    expect(readable(counted)).toContain('discarded and are not part of this assessment');
  });

  it('still repairs the singular template it was written for', () => {
    expect(readable('1 model output was discarded and are not part of this assessment — x'))
      .toContain('was discarded and is not part of this assessment');
  });
});

describe('a refusal that failed before it had a kind to name', () => {
  /** The live run's own text, verbatim: 29 quoted options over six rendered lines. */
  const RAW = REAL.map(([, text]) => text).find((text) => /did not match the contract \(id:/.test(text))!;

  it('is in the fixture, so this is not a test of invented prose', () => {
    expect(RAW).toBeDefined();
    expect(RAW).toContain('Invalid option: expected one of');
  });

  it('says what happened instead of printing the enum', () => {
    const reason = parseRefusal(RAW)!.reason;
    expect(humaniseReason(reason)).toBe(
      'An artefact arrived with no id and no label, and a kind the contract does not define — not one of the 29 values it allows',
    );
  });

  it('keeps the contract’s own words intact for the disclosure', () => {
    // The exact reason is the only thing that makes a discard checkable; the
    // sentence above it is a summary and never a replacement.
    expect(parseRefusal(RAW)!.reason).toContain('"persona_link"');
  });

  it('does not take over the enum shape that already had a branch', () => {
    const withData = 'An artefact did not match its stage contract (claim data.category: Invalid option: expected one of "a"|"b")';
    expect(humaniseReason(withData)).toBe('Claims filed under a category the contract does not define — not one of the 2 values it allows');
  });
});

describe('the discard arithmetic, from one pass', () => {
  const total = discards(STAGES);

  it('accounts for every discard, not just the ones that named a reason', () => {
    // The defect this exists to close: the card said 162 and the table
    // accounted for 90, with nothing explaining the other 72. On this fixture,
    // an earlier snapshot of the same run, it is 80 + 68 = 148 — and 148 is
    // what `stageFacts` counts over the identical input.
    expect(total.explained).toBe(80);
    expect(total.unexplained).toBe(68);
    expect(total.total).toBe(148);
    expect(total.explained + total.unexplained).toBe(total.total);
  });

  it('is the same rows `byReason` returns, so the table and the total agree', () => {
    expect(total.rows).toEqual(byReason(REAL.map(([, text]) => readable(text))));
    expect(total.rows.reduce((n, row) => n + row.count, 0)).toBe(total.explained);
  });

  it('says where the residue was discarded, largest first', () => {
    expect(total.byStage[0]).toEqual({ name: 'Stage 1', count: 49 });
    expect(total.byStage.reduce((n, row) => n + row.count, 0)).toBe(total.unexplained);
  });

  it('counts nothing when a run recorded nothing', () => {
    expect(discards([])).toEqual({ rows: [], explained: 0, unexplained: 0, total: 0, byStage: [] });
  });
});

describe('limits grouped on the sentence the page prints', () => {
  const groups = groupLimits(STAGES);

  it('collapses the context-window family into one fact', () => {
    // Keyed on the whole text these were five of the eight rows a reader saw,
    // differing only by a trailing count.
    expect(groups[0].lead).toBe("This call exceeded the model's context window, so its input was reduced.");
    expect(groups[0].total).toBe(42);
    expect(groups[0].stages.length).toBe(8);
  });

  it('groups further than the raw text does, and drops nothing', () => {
    const distinctTexts = new Set(REAL.map(([, text]) => text)).size;
    expect(groups.length).toBeLessThan(distinctTexts);
    expect(groups.reduce((n, group) => n + group.total, 0)).toBe(REAL.length);
  });

  it('keeps the stage, which the flatMap threw away', () => {
    for (const group of groups) {
      expect(group.stages.reduce((n, stage) => n + stage.count, 0)).toBe(group.total);
      expect(group.stages.every((stage) => stage.name.startsWith('Stage '))).toBe(true);
    }
  });

  it('keeps every distinct inventory and no duplicates', () => {
    const family = groups[0].stages.find((stage) => stage.tails.length)!;
    expect(new Set(family.tails).size).toBe(family.tails.length);
    expect(family.tails.length).toBeLessThanOrEqual(family.count);
  });

  it('groups AFTER the template repair, so one fact is not split in two', () => {
    const repaired = groups.find((group) => /1 group of model output/.test(group.lead))!;
    expect(repaired.lead).toContain('was discarded');
    expect(groups.filter((group) => /1 group of model output/.test(group.lead))).toHaveLength(1);
  });

  it('splits a limit at its first full stop and keeps the rest', () => {
    const { lead, rest } = limitLead('This call exceeded the window, so its input was reduced. 18 items clipped.');
    expect(lead).toBe('This call exceeded the window, so its input was reduced.');
    expect(rest).toBe('18 items clipped.');
  });
});

describe('where the model could not see everything', () => {
  const rows = truncations(STAGES);

  it('finds one row per affected stage, in pipeline order', () => {
    expect(rows.map((row) => row.ordinal)).toEqual([5, 6, 7, 9, 10, 12, 14, 15, 16]);
  });

  it('reports the deepest single call, never a sum of calls', () => {
    // Twelve calls that each withheld 191 items did not withhold 2,292 items.
    const playbook = rows.find((row) => row.ordinal === 10)!;
    expect(playbook.calls).toBe(12);
    expect(playbook.withheld).toBe(194);
  });

  it('sums BOTH clip sentences in one warning', () => {
    // The clip pattern occurs twice per warning — "7 long items clipped to 500
    // characters" and "196 long items clipped to 250" — so a non-global rule
    // silently reads a third of the clipping.
    const challenge = rows.find((row) => row.ordinal === 16)!;
    expect(challenge.clipped).toBe(203);
  });

  it('carries the run’s own instruction to read a stage as partial', () => {
    expect(rows.filter((row) => row.partial).map((row) => row.ordinal)).toEqual([15, 16]);
  });

  it('names the kinds the deepest call held none of', () => {
    const options = rows.find((row) => row.ordinal === 15)!;
    expect(options.withheld).toBe(1236);
    expect(options.kinds).toHaveLength(14);
    expect(options.kinds).toContain('mechanism');
    expect(options.kinds).toContain('persona_link');
  });

  it('says nothing about a stage that was never truncated', () => {
    expect(truncations([{ name: 'Document ingestion', ordinal: 0, warnings: [] }])).toEqual([]);
  });
});
