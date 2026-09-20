import { describe, expect, it } from 'vitest';
import { elapsed, inWords, spent, utcInstant } from './duration';

/**
 * THE REAL RUN'S OWN INSTANTS, because the whole reason this module exists is
 * that the report was silent about a duration the landing page states.
 *
 * Assessment 36ebca37 — the Post-16 Education and Skills run of 2026-09-19 —
 * ran from 13:48:44.078Z to 00:11:43.247Z the next day, and stage 18, Assured
 * synthesis, took 15:53:20.705Z to 00:11:43.240Z of that on its own.
 */
const RUN_FROM = '2026-09-19T13:48:44.078Z';
const RUN_TO = '2026-09-20T00:11:43.247Z';
const LONGEST_FROM = '2026-09-19T15:53:20.705Z';
const LONGEST_TO = '2026-09-20T00:11:43.240Z';

describe('how long two instants are apart', () => {
  it('measures the run the landing page already measures', () => {
    expect(elapsed(RUN_FROM, RUN_TO)).toBe(37_379_169);
  });

  it('says nothing where an instant is missing, rather than counting from zero', () => {
    expect(elapsed(null, RUN_TO)).toBeNull();
    expect(elapsed(RUN_FROM, null)).toBeNull();
    expect(elapsed(undefined, undefined)).toBeNull();
  });

  it('says nothing where the clock went backwards', () => {
    // A negative span is a clock that moved, not a duration.
    expect(elapsed(RUN_TO, RUN_FROM)).toBeNull();
    expect(elapsed('not a date', RUN_TO)).toBeNull();
  });
});

describe('the compact form, which is the landing table’s', () => {
  it('prints the run as the landing page prints it', () => {
    expect(spent(elapsed(RUN_FROM, RUN_TO)!)).toBe('10h 23m');
  });

  it('prints the stage that took 80% of it', () => {
    expect(spent(elapsed(LONGEST_FROM, LONGEST_TO)!)).toBe('8h 18m');
  });

  it('keeps minutes as minutes up to ninety of them', () => {
    expect(spent(25 * 60_000)).toBe('25 min');
    expect(spent(89 * 60_000)).toBe('89 min');
    expect(spent(90 * 60_000)).toBe('1h 30m');
  });

  it('floors at a minute, because three stages finished in under a second', () => {
    // "0 min" beside a stage that really did finish instantly reads as a bug.
    expect(spent(0)).toBe('under a minute');
    expect(spent(1_200)).toBe('under a minute');
  });
});

describe('the same duration as a sentence would say it', () => {
  it('spells the run out', () => {
    expect(inWords(elapsed(RUN_FROM, RUN_TO)!)).toBe('10 hours 23 minutes');
  });

  it('drops the half that is zero', () => {
    expect(inWords(120 * 60_000)).toBe('2 hours');
    expect(inWords(38 * 60_000)).toBe('38 minutes');
  });

  it('counts one of a thing as one', () => {
    expect(inWords(61 * 60_000)).toBe('1 hour 1 minute');
  });

  it('shares the compact form’s floor', () => {
    expect(inWords(900)).toBe('under a minute');
  });
});

describe('an instant on a report that travels', () => {
  it('states the date, the clock and which clock it is', () => {
    // Not the reader's timezone: this is the provenance record of a finished
    // run, read by whoever it was sent to.
    expect(utcInstant(RUN_FROM)).toBe('19 September 13:48');
    expect(utcInstant(RUN_TO)).toBe('20 September 00:11');
  });

  it('says nothing about an instant it cannot read', () => {
    expect(utcInstant('never')).toBe('');
  });
});
