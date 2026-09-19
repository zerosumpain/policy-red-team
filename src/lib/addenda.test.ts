// The precondition, written down twice on purpose.
//
// `store.ts` refuses a restatement in two cases and this mirrors both, so the
// page can explain a refusal instead of drawing a button that 400s. These tests
// exist to catch the mirror drifting from the thing it reflects.
import { describe, expect, it } from 'vitest';
import type { PassRow } from '$lib/policy-analysis/view';
import { canRestate, passState, REVISION_COLOUR, REVISION_LABEL } from './addenda';

const pass = (over: Partial<PassRow> = {}): PassRow => ({
  pass: 1,
  kind: 'addendum',
  role: 'critique',
  note: null,
  filename: 'rebuttal.pdf',
  size: 4096,
  status: 'completed',
  error: null,
  createdAt: '2026-09-19T00:00:00.000Z',
  completedAt: '2026-09-19T01:00:00.000Z',
  ...over,
});

describe('whether the report can be written again', () => {
  it('allows it once one addendum has finished', () => {
    expect(canRestate('completed', [pass()])).toEqual({ ok: true });
    expect(canRestate('completed_with_gaps', [pass({ status: 'completed_with_gaps' })])).toEqual({ ok: true });
  });

  it('refuses over an inventory nothing has been added to, and says why', () => {
    // The store's own words: it would spend the most expensive call in the
    // feature to produce the report that already exists.
    const refusal = canRestate('completed', []);
    expect(refusal.ok).toBe(false);
    expect(refusal.ok === false && refusal.because).toMatch(/nothing to write in/i);
  });

  it('refuses while the assessment itself has not finished', () => {
    for (const status of ['queued', 'running', 'failed', 'cancelled']) {
      const refusal = canRestate(status, [pass()]);
      expect(`${status}: ${refusal.ok}`).toBe(`${status}: false`);
    }
  });

  it('refuses while a pass is still running, rather than queueing a second', () => {
    const refusal = canRestate('completed', [pass(), pass({ pass: 2, status: 'running' })]);
    expect(refusal.ok).toBe(false);
    expect(refusal.ok === false && refusal.because).toMatch(/still running/i);
  });

  it('does not count a FAILED addendum as something to write in', () => {
    // A pass that fell over read the material and concluded nothing, so there
    // is no more to restate over than before it ran.
    const refusal = canRestate('completed', [pass({ status: 'failed', error: 'The attachment could not be read.' })]);
    expect(refusal.ok).toBe(false);
    expect(refusal.ok === false && refusal.because).toMatch(/nothing to write in/i);
  });
});

describe('what is in flight', () => {
  it('separates what finished, what failed and what is still going', () => {
    const state = passState([
      pass({ pass: 1, status: 'completed' }),
      pass({ pass: 2, status: 'failed' }),
      pass({ pass: 3, status: 'running' }),
      pass({ pass: 4, kind: 'restatement', status: 'completed' }),
    ]);
    expect(state.completed.map((p) => p.pass)).toEqual([1]);
    expect(state.failed.map((p) => p.pass)).toEqual([2]);
    expect(state.running?.pass).toBe(3);
    expect(state.restatements.map((p) => p.pass)).toEqual([4]);
  });

  it('counts a restatement as running too, so a second cannot be queued behind it', () => {
    const state = passState([pass({ kind: 'restatement', status: 'queued' })]);
    expect(state.running?.kind).toBe('restatement');
    expect(canRestate('completed', [pass(), pass({ pass: 2, kind: 'restatement', status: 'queued' })]).ok).toBe(false);
  });

  it('has nothing in flight for an assessment nothing was added to', () => {
    expect(passState([])).toEqual({ running: null, completed: [], failed: [], restatements: [] });
  });
});

describe('what a verdict is called', () => {
  it('has a word and a colour for every status the pipeline ranks', () => {
    // `REVISION_RANK` in the copied view layer is the list; these must cover it
    // or a real verdict renders as an empty tag.
    for (const status of ['overturned', 'superseded', 'weakened', 'strengthened', 'upheld']) {
      expect(REVISION_LABEL[status]).toBeTruthy();
      expect(REVISION_COLOUR[status]).toBeTruthy();
    }
  });

  it('distinguishes material that SUPPORTS a conclusion from material that leaves it alone', () => {
    expect(REVISION_COLOUR.strengthened).toBe('green');
    expect(REVISION_COLOUR.upheld).toBe('grey');
    expect(REVISION_COLOUR.overturned).toBe('red');
  });
});
