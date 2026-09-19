import { describe, expect, it } from 'vitest';
import { describeEstimate, estimateRun } from './estimate';
import { PATTERNS, SCENARIOS, STAGES } from '$lib/policy-analysis/contracts';

const base = { passages: 72, depth: 'standard' as const, completedStages: [0], callDurationsMs: [] };

describe('estimating a run before it has made a call', () => {
  it('says nothing about the clock until something has been measured', () => {
    const e = estimateRun(base);
    expect(e.seconds).toBeNull();
    expect(e.perCall).toBeNull();
    // A hard-coded seconds-per-call would be wrong for every model: the same
    // paper ran 6.6s a call on one and 27.5s on another.
    expect(describeEstimate(e)).toMatch(/No timing yet/);
  });

  it('still counts the calls, because those are arithmetic not guesswork', () => {
    const e = estimateRun(base);
    expect(e.calls.low).toBeGreaterThan(72);
    expect(e.calls.high).toBeGreaterThan(e.calls.low);
    expect(e.basis).toContain('72 passages');
  });

  it('puts decomposition’s exact fan-out in the count', () => {
    // Decomposition is one call per passage and most of the run, so the low
    // bound can never be under the passage count.
    for (const passages of [12, 72, 300]) {
      expect(estimateRun({ ...base, passages }).calls.low).toBeGreaterThanOrEqual(passages);
    }
  });

  it('never counts ingestion, which makes no model call', () => {
    // Nothing has completed at all — not even stage 0.
    const fresh = estimateRun({ ...base, completedStages: [] });
    const afterIngestion = estimateRun(base);
    expect(fresh.calls.low).toBe(afterIngestion.calls.low);
  });
});

describe('sharpening as calls complete', () => {
  it('uses the median so one retried call cannot distort it', () => {
    const e = estimateRun({ ...base, callDurationsMs: [5_000, 6_000, 7_000, 180_000] });
    expect(e.perCall).toBe(6.5);
    expect(e.measured).toBe(4);
  });

  it('shrinks as stages finish', () => {
    const early = estimateRun({ ...base, callDurationsMs: [10_000] });
    const later = estimateRun({ ...base, completedStages: [0, 1, 2, 3], callDurationsMs: [10_000] });
    expect(later.calls.high).toBeLessThan(early.calls.high);
    expect(later.seconds!.high).toBeLessThan(early.seconds!.high);
  });

  it('counts a finished run as nothing left to do', () => {
    const e = estimateRun({
      ...base,
      completedStages: [...STAGES.keys()],
      callDurationsMs: [10_000],
    });
    expect(e.calls).toEqual({ low: 0, high: 0 });
    expect(e.seconds).toEqual({ low: 0, high: 0 });
  });
});

describe('what the estimate is made of', () => {
  it('carries the fixed fan-outs from contracts rather than numbers typed here', () => {
    // If a pattern or scenario is added upstream the estimate has to move with
    // it, so the test reads the same constants the code does.
    const one = estimateRun({ ...base, passages: 1, completedStages: [0, 1, 3, 4, 6, 10, 14, 16] });
    // Stages 7 and 9 are untouched, so their exact constants are in the count.
    expect(one.calls.low).toBeGreaterThanOrEqual(PATTERNS.length + SCENARIOS.length);
  });

  it('deeper runs cost more than standard ones', () => {
    const standard = estimateRun(base);
    const deep = estimateRun({ ...base, depth: 'deep' });
    expect(deep.calls.high).toBeGreaterThan(standard.calls.high);
  });
});

describe('saying it in words', () => {
  it('does not print a range whose ends are the same', () => {
    const e = estimateRun({ ...base, completedStages: [...STAGES.keys()], callDurationsMs: [1_000] });
    expect(describeEstimate(e)).toBe('about 1 seconds left');
  });

  it('switches to minutes once seconds stop being readable', () => {
    const e = estimateRun({ ...base, callDurationsMs: [30_000] });
    expect(describeEstimate(e)).toMatch(/minutes left$/);
  });
});

describe('what the run is actually shaped like', () => {
  it('divides the clock by concurrency but not the call count', () => {
    const serial = estimateRun({ ...base, callDurationsMs: [10_000] });
    const parallel = estimateRun({ ...base, callDurationsMs: [10_000], concurrency: 4 });
    expect(parallel.calls).toEqual(serial.calls);
    expect(parallel.seconds!.high).toBe(Math.round(serial.seconds!.high / 4));
  });

  it('defaults to one at a time, which is what a submission gets', () => {
    // DEFAULT_CONCURRENCY is 1, and the run of 2026-09-19 confirmed it: every
    // call started at the exact second the previous one ended.
    expect(estimateRun({ ...base, callDurationsMs: [10_000] }).basis).toContain('one at a time');
  });

  it('adds the repair round-trips, which are real calls on the clock', () => {
    const clean = estimateRun({ ...base, callDurationsMs: [10_000] });
    const sloppy = estimateRun({ ...base, callDurationsMs: [10_000], repairRate: 0.25 });
    expect(sloppy.calls.low).toBeGreaterThan(clean.calls.low);
  });
});

describe('a run that is going badly must not look faster', () => {
  it('counts a timed-out call, because it burned the clock too', () => {
    // Measured 2026-09-19: four calls averaging 172s and three burning 420s on
    // the deadline. Excluding the failures made the estimate cheerier the worse
    // the run got, which is the one direction an estimate must never move.
    const finished = [150_000, 160_000, 180_000, 200_000, 420_000, 420_000, 420_000];
    const survivorsOnly = estimateRun({ ...base, callDurationsMs: finished.filter((d) => d < 420_000) });
    const everything = estimateRun({ ...base, callDurationsMs: finished });
    expect(everything.perCall!).toBeGreaterThan(survivorsOnly.perCall!);
    expect(everything.measured).toBe(7);
  });
});

/**
 * THE MISTAKE THAT COST A SUBSCRIPTION.
 *
 * Sizing every fan-out off the passage count predicted 149–213 calls for a
 * 72-passage paper. The real run made 385 by stage two, because decomposition
 * had turned 72 passages into 4,664 artefacts and the later stages fan out over
 * those. Wrong by 2.5x, and wrong LOW — an estimate that under-reads tells
 * somebody "nearly done" while it keeps spending.
 */
describe('sizing the later stages', () => {
  const real = { passages: 72, artefacts: 4_664, depth: 'standard' as const, completedStages: [0, 1], callDurationsMs: [200_000] };

  it('reads far bigger with a real inventory than with passages alone', () => {
    const naive = estimateRun({ ...real, artefacts: 0 });
    const informed = estimateRun(real);
    expect(informed.calls.high).toBeGreaterThan(naive.calls.high * 2);
  });

  it('would have predicted hundreds of calls, not dozens', () => {
    expect(estimateRun(real).calls.high).toBeGreaterThan(200);
  });

  it('never reads smaller as the inventory grows', () => {
    // An estimate that shrinks while the work grows is the failure mode.
    let previous = 0;
    for (const artefacts of [72, 500, 2_000, 4_664]) {
      const next = estimateRun({ ...real, artefacts }).calls.high;
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('shows the calls already made, so the scale is visible', () => {
    // "149–213 left" read as a small job. "385 made, 200–400 left" would not.
    expect(estimateRun({ ...real, callsMade: 385 }).basis).toContain('385 calls made');
    expect(estimateRun({ ...real, callsMade: 385 }).made).toBe(385);
  });
});
