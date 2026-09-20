// The scatter's arithmetic, asserted rather than eyeballed.
//
// Every number in here is a property the live figure was measured to be getting
// wrong: marks painted in the order that hides the severe ones, a domain the
// data never reaches, three plays drawn on top of three other plays, and a
// quadrant count the page never said out loud. A screenshot cannot catch any of
// them coming back.
import { describe, expect, it } from 'vitest';
import { artefact } from '$lib/policy-analysis/contracts';
import type { Play } from '$lib/policy-analysis/view';
import type { Band } from '$lib/policy-analysis/exposure';
import { axisTicks, BAND_RADIUS, fitDomain, plotFrame, plotPlays, type PlotPlay } from './exposure-plot';

const play = (id: string, band: Band, ease: number, impact: number, exposure = 0.5): PlotPlay =>
  ({ id, label: `Play ${id}`, band, exposure, ease, impact });

/** The shape the live run has: a clot in the top right and an empty bottom left. */
const cloud: PlotPlay[] = [
  play('a', 'severe', 0.90, 0.65, 0.77),
  play('b', 'severe', 0.72, 0.68, 0.7388),
  play('c', 'severe', 0.72, 0.68, 0.7388),
  play('d', 'severe', 0.68, 0.72, 0.75),
  play('e', 'significant', 0.66, 0.55, 0.60),
  play('f', 'moderate', 0.55, 0.22, 0.35),
  play('g', 'limited', 0.20, 0.01, 0.05),
];

describe('the domain the marks are drawn into', () => {
  it('fits the data and snaps outward to a number a reader would write', () => {
    // Ease 0.20–0.90 padded by a twentieth of 0.70 is 0.165–0.935, which snaps
    // out to 0.15–0.95. The fixed [0,1] the core used left half the box empty.
    expect(fitDomain([0.2, 0.9, 0.72])).toEqual([0.15, 0.95]);
  });

  it('never runs past the 0–1 the factors are defined on', () => {
    expect(fitDomain([0.01, 0.72])).toEqual([0, 0.8]);
    expect(fitDomain([0, 1])).toEqual([0, 1]);
  });

  it('gives one repeated value an axis with a width', () => {
    // A zero-width domain puts every mark in the same place and divides by
    // zero doing it. One value repeated is a legitimate run.
    const [lo, hi] = fitDomain([0.4, 0.4, 0.4]);
    expect(hi).toBeGreaterThan(lo);
  });

  it('prints every tenth inside the domain and none outside it', () => {
    expect(axisTicks([0.15, 0.95])).toEqual([0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
    expect(axisTicks([0, 0.8])).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
    // `Math.ceil(-1e-9)` is negative zero, and a tick label of "-0.0" is what
    // that looks like on the page.
    expect(Object.is(axisTicks([0, 0.8])[0], -0)).toBe(false);
  });

  it('always leaves clear air above the topmost mark, which is where the count is written', () => {
    const frame = plotFrame(cloud);
    const highest = Math.min(...frame.points.map((p) => p.y - p.r));
    expect(highest - frame.area.top).toBeGreaterThan(16);
  });
});

describe('the paint order', () => {
  it('draws severe LAST, so nothing lighter lands on top of it', () => {
    // This is the defect that mattered most: `plays()` sorts descending by
    // exposure and the old component mapped it straight into the DOM, so 16 of
    // the 20 severe marks were painted over by a lighter mark drawn after them.
    const order = plotFrame(cloud).points.map((p) => p.play.exposure);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(plotFrame(cloud).points.at(-1)?.play.id).toBe('a');
  });

  it('is stable when two plays share an exposure exactly', () => {
    const ids = plotFrame(cloud).points.filter((p) => p.play.exposure === 0.7388).map((p) => p.play.id);
    expect(ids).toEqual(['b', 'c']);
  });
});

describe('two plays at the same coordinate', () => {
  it('separates them and centres the pair on the value they share', () => {
    const frame = plotFrame(cloud);
    const pair = frame.points.filter((p) => p.play.id === 'b' || p.play.id === 'c');
    expect(pair.map((p) => p.shifted)).toEqual([-BAND_RADIUS.severe / 2, BAND_RADIUS.severe / 2]);
    // The midpoint is still the truth, which is the whole licence for moving
    // anything on a figure that has just been given ticks.
    expect((pair[0].x + pair[1].x) / 2).toBeCloseTo(frame.points.find((p) => p.play.id === 'd')!.x
      + (0.72 - 0.68) / (frame.domain.x[1] - frame.domain.x[0]) * frame.area.width, 6);
  });

  it('moves nothing else at all', () => {
    const moved = plotFrame(cloud).points.filter((p) => p.shifted !== 0).map((p) => p.play.id);
    expect(moved).toEqual(['b', 'c']);
  });
});

describe('the reading the figure exists to give', () => {
  it('counts the dangerous quadrant rather than describing it', () => {
    const { quadrant } = plotFrame(cloud);
    expect(quadrant).toEqual({ both: 5, hard: 3, total: 7 });
  });

  it('names the furthest right and the highest, breaking a tie on the other axis', () => {
    // Two plays share the highest ease on the real run — 0.90 with impact 0.65
    // and 0.90 with impact 0.18 — so a bare argmax names a different play
    // depending on the sort.
    const tied = [...cloud, play('h', 'moderate', 0.90, 0.18, 0.4)];
    const { extremes } = plotFrame(tied);
    expect(extremes?.ease.play.id).toBe('a');
    expect(extremes?.impact.play.id).toBe('d');
  });

  it('reports how many marks touch another, because that is a fact about the playbook', () => {
    const { overlap } = plotFrame(cloud);
    expect(overlap.pairs).toBeGreaterThanOrEqual(1);
    expect(overlap.marks).toBeGreaterThanOrEqual(2);
  });
});

describe('the geometry', () => {
  it('puts the halfway rule where the value 0.5 is, not in the middle of the canvas', () => {
    const frame = plotFrame(cloud);
    const half = frame.ticks.x.find((t) => t.value === 0.5);
    expect(frame.cross.x).toBeCloseTo(half!.at, 6);
    // The canvas centre is nowhere near it once the domain is fitted, which is
    // what the old cross was drawn at.
    expect(Math.abs(frame.cross.x! - frame.box / 2)).toBeGreaterThan(10);
  });

  it('drops a rule that falls outside the fitted domain rather than clamping it to the edge', () => {
    const high = [play('x', 'severe', 0.8, 0.9, 0.8), play('y', 'severe', 0.9, 0.95, 0.9)];
    expect(plotFrame(high).cross.y).toBeNull();
  });

  it('gives the two illegible bands a heavier outline and a smaller mark', () => {
    const frame = plotFrame(cloud);
    const of = (id: string) => frame.points.find((p) => p.play.id === id)!;
    expect(of('g').stroke).toBe(1.5);
    expect(of('a').stroke).toBe(1);
    expect(of('a').r).toBeGreaterThan(of('g').r);
    expect(of('g').shape).toBe('ring');
    expect(of('a').shape).toBe('circle');
  });
});

describe('reading a Play down to what the drawing needs', () => {
  it('takes each factor by NAME, never by position in the array', () => {
    const source: Play = {
      artefact: artefact('s10_000_exploit_001', 'exploit', 'A play', 'They could do this.', {}),
      actor: null,
      band: 'severe',
      exposure: 0.77,
      // Deliberately out of `FACTOR_KEYS` order: the old component read
      // `plays[i]` alongside `points[i]` and colouring by index is the same
      // class of bug one array along.
      factors: [{ key: 'impact', value: 0.65 }, { key: 'ease', value: 0.9 }, { key: 'incentive', value: 0.8 }],
    };
    expect(plotPlays([source])).toEqual([
      { id: 's10_000_exploit_001', label: 'A play', band: 'severe', exposure: 0.77, ease: 0.9, impact: 0.65 },
    ]);
  });

  it('treats a missing factor as zero rather than crashing the panel', () => {
    const bare: Play = {
      artefact: artefact('s10_000_exploit_002', 'exploit', 'Another', 'They could do this.', {}),
      actor: null, band: 'limited', exposure: 0.05, factors: [],
    };
    expect(plotPlays([bare])[0]).toMatchObject({ ease: 0, impact: 0 });
  });
});
