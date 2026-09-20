import { describe, expect, it } from 'vitest';
import { spent } from './status';

/**
 * The duration ladder, tested because three surfaces now quote it and the
 * defect it was lifted to fix was two of them disagreeing about one run.
 */
describe('spent', () => {
  it('reports the real run at the figure the landing table shows', () => {
    // The live assessment: 2026-09-19T13:48:44.078Z → 2026-09-20T00:11:43.247Z,
    // 623 minutes. The landing table renders "10h 23m" for this row.
    expect(spent('2026-09-19T13:48:44.078Z', '2026-09-20T00:11:43.247Z')).toBe('10h 23m');
  });

  it('pads the minutes, so a column of durations aligns', () => {
    expect(spent('2026-09-19T00:00:00.000Z', '2026-09-19T02:05:00.000Z')).toBe('2h 05m');
  });

  it('stays in minutes below an hour and a half', () => {
    // 89 minutes is the last minute before the ladder switches; the failed run
    // on this install is 7 minutes and reads "7 min".
    expect(spent('2026-09-19T00:00:00.000Z', '2026-09-19T01:29:00.000Z')).toBe('89 min');
    expect(spent('2026-09-19T00:00:00.000Z', '2026-09-19T01:30:00.000Z')).toBe('1h 30m');
  });

  it('says "under a minute" rather than "0 min"', () => {
    expect(spent('2026-09-19T00:00:00.000Z', '2026-09-19T00:00:20.000Z')).toBe('under a minute');
  });

  it('refuses to print a duration for a clock that ran backwards', () => {
    expect(spent('2026-09-19T02:00:00.000Z', '2026-09-19T01:00:00.000Z')).toBe('—');
    expect(spent('not a date', '2026-09-19T01:00:00.000Z')).toBe('—');
  });
});
