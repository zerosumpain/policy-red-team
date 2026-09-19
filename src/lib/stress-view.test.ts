// The reading over the simulation, driven through the real `stress()`.
//
// Nothing here fakes a `StressResult`: the arrangement is only worth testing
// against the shapes the copied module actually produces, and the one property
// that matters most — that a disarmed play is good news and never counted with
// the conclusions that fell — is a property of the two together.
import { describe, expect, it } from 'vitest';
import { artefact, type Artefact } from '$lib/policy-analysis/contracts';
import { leverage, stress } from '$lib/policy-analysis/stress';
import { byCause, reading, reasonsOf, STANDING_COLOUR, STANDING_LABEL } from './stress-view';

const assumption = (id: string, over: Record<string, unknown> = {}) =>
  artefact(id, 'assumption', `Assumption ${id}`, 'Something taken for granted.', { importance: 0.9, uncertainty: 0.9, consequence: 0.9, ...over });

const make = (id: string, kind: Artefact['kind'], data: Record<string, unknown>) =>
  artefact(id, kind, `${kind} ${id}`, 'A statement.', data);

/** One assumption, and everything the assessment hung off it. */
function world() {
  return [
    assumption('a1'),
    assumption('a2'),
    make('m1', 'model', { assumptions: ['a1'] }),
    make('s1', 'scenario', { assumptions: ['a1'] }),
    make('x1', 'exploit', { preconditions: ['a1'] }),
    make('x2', 'exploit', { preconditions: ['a2'] }),
    make('f1', 'finding', { hypothesisIds: ['a1'], resultIds: ['m1'] }),
    make('f2', 'finding', { hypothesisIds: ['a1', 'a2'], resultIds: [] }),
    make('r1', 'recommendation', { findingIds: ['f1'] }),
    artefact('t1', 'test', 'A structural check', 'Walked the paper.', { result: 'high_risk' }),
  ];
}

describe('the reading', () => {
  it('puts what you were about to act on first, and the machinery last', () => {
    const result = reading(stress(world(), ['a1']));
    expect(result.lost.map((g) => g.key)).toEqual(['recommendations', 'findings', 'scenarios', 'models']);
  });

  it('NEVER counts a disarmed play among the things that fell', () => {
    // The switch is bad news in one panel and good news in the next, and
    // collapsing them would be worse than not offering the tool.
    const result = reading(stress(world(), ['a1']));
    expect(result.disarmed.map((r) => r.artefact.id)).toEqual(['x1']);
    for (const group of result.lost) {
      expect(group.rows.some((r) => r.standing === 'disarmed')).toBe(false);
    }
    // `moved` is the things that LOST FOOTING and nothing else. It used to be
    // `counts.total`, which sums all five kinds including plays — so a lever
    // that only disarmed threats reported them as conclusions that fell.
    expect(result.moved).toBe(result.lost.reduce((n, g) => n + g.rows.length, 0));
    expect(result.population).toBe(5);
    expect(result.plays).toBe(2);
  });

  it('says nothing fell when a lever ONLY takes threats off the table', () => {
    // An assumption cited solely as a play precondition is entirely normal —
    // `leverage()` counts preconditions, so it is offered as a lever. The panel
    // reported "2 of 4 conclusions and results move" and suppressed the one
    // sentence that would have told the reader nothing they concluded moved.
    const items = [
      assumption('a1'),
      make('x1', 'exploit', { preconditions: ['a1'] }),
      make('x2', 'exploit', { preconditions: ['a1'] }),
      make('f1', 'finding', { hypothesisIds: [], resultIds: [] }),
    ];
    const result = reading(stress(items, ['a1']));
    expect(result.moved).toBe(0);
    expect(result.lost).toEqual([]);
    expect(result.disarmed).toHaveLength(2);
  });

  it('does NOT report a conclusion as undermined when the threat it cited was removed', () => {
    // `RESULT_KINDS` includes `exploit`, so a finding may cite a play as a
    // result — the expected shape in an adversarial assessment. `stress.ts`'s
    // own test for a lost result is standing-blind, so a DISARMED play counted
    // against the finding, and the page said "nothing left supporting it" three
    // inches above the same event listed as good news.
    const items = [
      assumption('a1'),
      make('x1', 'exploit', { preconditions: ['a1'] }),
      make('f1', 'finding', { hypothesisIds: [], resultIds: ['x1'] }),
      make('r1', 'recommendation', { findingIds: ['f1'] }),
    ];
    const result = reading(stress(items, ['a1']));
    expect(result.lost).toEqual([]);
    expect(result.disarmed.map((r) => r.artefact.id)).toEqual(['x1']);
    // The finding AND the recommendation answering it: eased, not undermined.
    expect(result.eased.map((r) => r.artefact.id).sort()).toEqual(['f1', 'r1']);
    expect(result.moved).toBe(0);
  });

  it('still reports a conclusion as undermined when it ALSO rested on the failed assumption', () => {
    // The easing rule must not launder a real loss: if the lever hit the row
    // directly, a disarmed citation alongside it changes nothing.
    const items = [
      assumption('a1'),
      make('x1', 'exploit', { preconditions: ['a1'] }),
      make('f1', 'finding', { hypothesisIds: ['a1'], resultIds: ['x1'] }),
    ];
    const result = reading(stress(items, ['a1']));
    expect(result.eased).toEqual([]);
    expect(result.lost.find((g) => g.key === 'findings')?.rows.map((r) => r.artefact.id)).toEqual(['f1']);
  });

  it('leads with the conclusion that has nothing left, not the one partly undercut', () => {
    const rows = reading(stress(world(), ['a1'])).lost.find((g) => g.key === 'findings')!.rows;
    // f1 loses its only hypothesis AND its only result; f2 loses one of two.
    expect(rows.map((r) => `${r.artefact.id}:${r.standing}`)).toEqual(['f1:unsupported', 'f2:weakened']);
  });

  it('reports how many of each kind exist, not only how many moved', () => {
    // "2 of 2 conclusions" and "2 of 40" are different readings of the same run.
    const group = reading(stress(world(), ['a1'])).lost.find((g) => g.key === 'findings')!;
    expect(group.rows).toHaveLength(2);
    expect(group.population).toBe(2);
  });

  it('says how much cannot move at all', () => {
    // The structural checks walk the paper's own relationships, so no
    // hypothesis touches them. Saying so is part of the answer.
    expect(reading(stress(world(), ['a1'])).unmovable).toBe(1);
    expect(reading(stress(world(), [])).unmovable).toBe(1);
  });

  it('moves nothing when nothing is failed', () => {
    const result = reading(stress(world(), []));
    expect(result.lost).toEqual([]);
    expect(result.disarmed).toEqual([]);
    expect(result.eased).toEqual([]);
    expect(result.moved).toBe(0);
    expect(result.population).toBe(5);
  });
});

describe('saying the cause once', () => {
  it('separates the reason a reader can act on from the consequence of it', () => {
    // `stress.ts` writes two shapes of sentence. One names what the reader
    // failed and is the same for every row that cited it; the other names
    // whatever each row happened to cite and is different every time.
    const result = stress(world(), ['a1']);
    const f1 = result.findings.find((r) => r.artefact.id === 'f1')!;
    expect(f1.because).toHaveLength(2);
    expect(reasonsOf(f1)).toEqual({ direct: ['rests on “Assumption a1”'], knockOn: 1 });
  });

  it('collapses rows whose DIRECT reason is the same, whatever they each cite', () => {
    // THE DEFECT THIS PINS. Grouping on the whole reason compressed nothing at
    // the second order: six recommendations each carried their own three-clause
    // caption and the panel ran to 4,206 pixels on a real assessment.
    const items = [
      assumption('a1'),
      make('f1', 'finding', { hypothesisIds: ['a1'], resultIds: [] }),
      make('f2', 'finding', { hypothesisIds: ['a1'], resultIds: [] }),
      make('f3', 'finding', { hypothesisIds: ['a1'], resultIds: [] }),
      make('r1', 'recommendation', { findingIds: ['f1'] }),
      make('r2', 'recommendation', { findingIds: ['f1', 'f2'] }),
      make('r3', 'recommendation', { findingIds: ['f1', 'f2', 'f3'] }),
    ];
    const result = stress(items, ['a1']);

    // Three findings, one shared sentence.
    const findings = byCause(result.findings);
    expect(findings).toHaveLength(1);
    expect(findings[0].direct).toEqual(['rests on “Assumption a1”']);

    // Three recommendations citing one, two and three different findings — no
    // shared sentence at all, and previously three groups of prose.
    const recs = byCause(result.recommendations);
    expect(recs).toHaveLength(1);
    expect(recs[0].direct).toEqual([]);
    expect(recs[0].rows.map((r) => r.knockOn)).toEqual([1, 2, 3]);
  });

  it('really does collapse identical reasons rather than merely sorting them', () => {
    const items = [
      assumption('a1'),
      make('m1', 'model', { assumptions: ['a1'] }),
      make('m2', 'model', { assumptions: ['a1'] }),
      make('m3', 'model', { assumptions: ['a1'] }),
    ];
    const groups = byCause(stress(items, ['a1']).models);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(3);
  });

  it('groups two rows undone by the same reasons in a different order', () => {
    // The reasons arrive in whatever order the model wrote the field, so keying
    // on the join made two groups printing the same two sentences.
    const items = [
      assumption('a1'),
      assumption('a2'),
      make('m1', 'model', { assumptions: ['a1', 'a2'] }),
      make('m2', 'model', { assumptions: ['a2', 'a1'] }),
    ];
    const groups = byCause(stress(items, ['a1', 'a2']).models);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });

  it('returns nothing for nothing', () => {
    expect(byCause([])).toEqual([]);
  });
});

describe('the levers', () => {
  it('offers only assumptions something actually rests on', () => {
    // A lever that does nothing when pulled is a worse answer than no lever.
    const items = [...world(), assumption('orphan')];
    expect(leverage(items).map((l) => l.artefact.id)).not.toContain('orphan');
  });

  it('puts the assumption most of the assessment turns on first', () => {
    const levers = leverage(world());
    expect(levers[0].artefact.id).toBe('a1');
    expect(levers[0].dependants).toBeGreaterThan(levers[1].dependants);
  });
});

describe('what a standing is called', () => {
  it('has a word and a colour for every one the module can produce', () => {
    for (const standing of ['holds', 'weakened', 'unsupported', 'disarmed'] as const) {
      expect(STANDING_LABEL[standing]).toBeTruthy();
      expect(STANDING_COLOUR[standing]).toBeTruthy();
    }
    // The only good news on the page is the only green one.
    expect(STANDING_COLOUR.disarmed).toBe('green');
    expect(STANDING_COLOUR.unsupported).toBe('red');
  });
});
