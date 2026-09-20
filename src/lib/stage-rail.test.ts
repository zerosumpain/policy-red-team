// The drill's stage rail, against the four cases that are wrong in a way no
// screenshot shows.
//
// The live run is the reference throughout: 18 stages, ordinal 11 producing
// zero artefacts, `citedBy` capping at 12, and a play at ordinal 10 whose walk
// spans ordinals 0 to 4.
import { describe, expect, it } from 'vitest';
import { artefact, PASS_BASE, type Artefact } from '$lib/policy-analysis/contracts';
import { stageMarks, stageSpan } from './stage-rail';

const STAGE_COUNT = 18;

/** An artefact at a stage, optionally citing others. */
const at = (id: string, refs: string[] = []): Artefact =>
  artefact(id, 'claim', id, '', {}, { refs });

/** The stage map the drill builds from `artefactMetadata`. */
const stagesOf = (map: Record<string, number>) => (id: string) => map[id] ?? 0;

describe('stageMarks', () => {
  it('collects every stage the walk reaches, from the rungs and the paper alike', () => {
    const marks = stageMarks({
      artefactId: 'play',
      all: [],
      hops: [
        { depth: 1, items: [at('a'), at('b')] },
        { depth: 2, items: [at('c')] },
      ],
      chainSources: [at('p')],
      stageOf: stagesOf({ a: 4, b: 2, c: 1, p: 0 }),
      stageCount: STAGE_COUNT,
    });
    expect([...marks.sources].sort((x, y) => x - y)).toEqual([0, 1, 2, 4]);
    expect(stageSpan(marks.sources)).toBe('stages 1 to 5');
  });

  it('counts every citer, not the twelve `citedBy` would have returned', () => {
    // MAX_CITED_BY is 12. Thirteen citers spread over two stages: a set built
    // from a capped list could only ever see the first twelve, and here that
    // would drop the whole of stage 14.
    const citers = Array.from({ length: 13 }, (_, i) => at(`c${i}`, ['play']));
    const stages: Record<string, number> = {};
    citers.forEach((c, i) => { stages[c.id] = i < 12 ? 3 : 13; });
    const marks = stageMarks({
      artefactId: 'play',
      all: citers,
      hops: [],
      chainSources: [],
      stageOf: stagesOf(stages),
      stageCount: STAGE_COUNT,
    });
    expect([...marks.citing].sort((x, y) => x - y)).toEqual([3, 13]);
  });

  it('ignores an artefact that does not cite this one', () => {
    const marks = stageMarks({
      artefactId: 'play',
      all: [at('other', ['something-else']), at('none')],
      hops: [],
      chainSources: [],
      stageOf: stagesOf({ other: 5, none: 6 }),
      stageCount: STAGE_COUNT,
    });
    expect(marks.citing.size).toBe(0);
  });

  it('leaves a pass ordinal off the scale entirely', () => {
    // A pass owns `PASS_BASE * n + k` — 101 here — which is off the end of an
    // eighteen-cell rail. Marking it would put a border on stage 1.
    const marks = stageMarks({
      artefactId: 'play',
      all: [at('addendum', ['play'])],
      hops: [{ depth: 1, items: [at('fromPass'), at('real')] }],
      chainSources: [],
      stageOf: stagesOf({ addendum: PASS_BASE + 1, fromPass: PASS_BASE + 2, real: 7 }),
      stageCount: STAGE_COUNT,
    });
    expect([...marks.sources]).toEqual([7]);
    expect(marks.citing.size).toBe(0);
  });

  it('leaves an ordinal past the end of the run off the scale', () => {
    const marks = stageMarks({
      artefactId: 'play',
      all: [],
      hops: [{ depth: 1, items: [at('beyond'), at('inside')] }],
      chainSources: [],
      stageOf: stagesOf({ beyond: 18, inside: 17 }),
      stageCount: STAGE_COUNT,
    });
    expect([...marks.sources]).toEqual([17]);
  });

  it('reports a rung with nothing on the scale as null rather than as stage 1', () => {
    const marks = stageMarks({
      artefactId: 'play',
      all: [],
      hops: [
        { depth: 1, items: [at('a'), at('b')] },
        { depth: 2, items: [at('onlyPass')] },
      ],
      chainSources: [],
      stageOf: stagesOf({ a: 1, b: 4, onlyPass: PASS_BASE + 1 }),
      stageCount: STAGE_COUNT,
    });
    expect(marks.rungs[0]).toEqual({ depth: 1, count: 2, low: 1, high: 4 });
    expect(marks.rungs[1]).toEqual({ depth: 2, count: 1, low: null, high: null });
  });

  it('keeps the rung count true even when some of it is off the scale', () => {
    // The rung's own heading prints this number, and a band whose label
    // disagreed with the heading above it would be worse than no band.
    const marks = stageMarks({
      artefactId: 'play',
      all: [],
      hops: [{ depth: 1, items: [at('a'), at('pass1'), at('pass2')] }],
      chainSources: [],
      stageOf: stagesOf({ a: 2, pass1: PASS_BASE + 1, pass2: PASS_BASE + 2 }),
      stageCount: STAGE_COUNT,
    });
    expect(marks.rungs[0].count).toBe(3);
    expect(marks.rungs[0].low).toBe(2);
  });

  it('marks a stage that produced nothing, when the walk reaches it', () => {
    // Ordinal 11 produced zero artefacts on the live run. A rail gated on an
    // artefact count would skip the cell and renumber every stage after it;
    // nothing here filters on output, so a stage is a stage.
    const marks = stageMarks({
      artefactId: 'play',
      all: [],
      hops: [{ depth: 1, items: [at('x')] }],
      chainSources: [],
      stageOf: stagesOf({ x: 11 }),
      stageCount: STAGE_COUNT,
    });
    expect([...marks.sources]).toEqual([11]);
  });
});

describe('stageSpan', () => {
  it('says one stage in the singular, and uses displayed numbering', () => {
    expect(stageSpan(new Set([0]))).toBe('stage 1');
    expect(stageSpan(new Set([1, 4]))).toBe('stages 2 to 5');
  });

  it('is null for an empty set, so a caller renders no clause at all', () => {
    expect(stageSpan(new Set())).toBeNull();
  });
});
