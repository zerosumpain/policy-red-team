// Chapter 5's wiring (phase 26): the guide's switches through the report's own
// `stress` and `reading`, so the miniature cannot disagree with the Stress lab.
import { describe, expect, it } from 'vitest';
import { ASSUMPTION_FLAT, ASSUMPTION_OPEN, ASSUMPTION_SAMPLE, PLAYS } from './content';
import { miniStress } from './stress-mini';

describe('the stress lab in miniature', () => {
  it('moves nothing with nothing switched off', () => {
    const r = miniStress([]);
    expect(r.disarmed).toEqual([]);
    expect(Object.values(r.findings).every((s) => s === 'holds')).toBe(true);
    expect(r.summary).toMatch(/still stands/);
  });

  it('takes off the table every way to beat it that needed the assumption, and only those', () => {
    const r = miniStress([ASSUMPTION_SAMPLE]);
    const needing = PLAYS.filter((p) => (p.data.preconditions as string[]).includes(ASSUMPTION_SAMPLE)).map((p) => p.id);
    expect(r.disarmed.sort()).toEqual(needing.sort());
    expect(r.disarmed).toHaveLength(2);
    expect(r.summary).toBe('2 of 4 ways to beat it are taken off the table. The conclusion still stands.');
  });

  it('shows the OTHER direction too: the conclusion resting on an assumption loses its footing', () => {
    const r = miniStress([ASSUMPTION_FLAT]);
    expect(r.disarmed).toEqual(['guide_play_lapse']);
    expect(r.findings.guide_finding_small).toBe('unsupported');
    expect(r.summary).toMatch(/1 of 4 ways to beat it is taken off the table\. The conclusion loses its footing\./);
  });

  it('switching all three off clears the table', () => {
    const r = miniStress([ASSUMPTION_SAMPLE, ASSUMPTION_FLAT, ASSUMPTION_OPEN]);
    expect(r.disarmed).toHaveLength(PLAYS.length);
  });
});
