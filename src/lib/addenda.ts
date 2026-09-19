/**
 * ADDING SOMETHING TO A FINISHED ASSESSMENT.
 *
 * `view.ts` already shapes what a pass CONCLUDED — `addenda()` and
 * `addendumBanner()` are copied and do that. What is missing is the half a page
 * needs before it draws a control: whether anything is running, whether
 * restating is possible at all, and what a revision's verdict is called.
 *
 * THE PRECONDITION IS A SERVER RULE, MIRRORED. `store.ts` refuses a restatement
 * over an inventory nothing has been added to — "it would spend the most
 * expensive call in the feature to produce the report that already exists" —
 * and refuses one while the assessment is not finished. A page that draws the
 * button anyway gets a 400 and a reader who cannot tell a refusal from a fault.
 * So the rule is written down twice, on purpose, and `canRestate` is tested
 * against the same conditions the store checks.
 *
 * NOTHING HERE RE-RANKS ANYTHING. `addenda()` already sorts revisions worst
 * first, and for the reason its own comment gives: a reader opening an addendum
 * is asking what BROKE, and a list that opens with eleven conclusions that
 * survived buries the one that did not under a screen of good news.
 */
import type { PassRow } from '$lib/policy-analysis/view';

/** What an addendum decided about a conclusion that was already written. */
export const REVISION_LABEL: Record<string, string> = {
  overturned: 'Overturned',
  superseded: 'Superseded',
  weakened: 'Weakened',
  strengthened: 'Strengthened',
  upheld: 'Still stands',
};

/**
 * Red for a conclusion that fell, grey for one that did not move.
 *
 * `strengthened` is GREEN and `upheld` is GREY, which is the distinction worth
 * drawing: material that positively supports a conclusion is a result, and
 * material that leaves it where it was is not.
 */
export const REVISION_COLOUR: Record<string, 'red' | 'orange' | 'green' | 'grey'> = {
  overturned: 'red',
  superseded: 'orange',
  weakened: 'orange',
  strengthened: 'green',
  upheld: 'grey',
};

export type PassState = {
  /** A pass still working. The page shows progress rather than a form. */
  running: PassRow | null;
  /** Addenda that finished, whatever they concluded. */
  completed: PassRow[];
  /** Addenda that did not finish, so the reader can tell a refusal from a fault. */
  failed: PassRow[];
  /** Restatements that finished — the report on screen is the newest of them. */
  restatements: PassRow[];
};

const FINISHED = new Set(['completed', 'completed_with_gaps']);

export function passState(passes: PassRow[]): PassState {
  const addenda = passes.filter((p) => p.kind === 'addendum');
  return {
    running: passes.find((p) => !FINISHED.has(p.status) && p.status !== 'failed' && p.status !== 'cancelled') ?? null,
    completed: addenda.filter((p) => FINISHED.has(p.status)),
    failed: addenda.filter((p) => p.status === 'failed' || p.status === 'cancelled'),
    restatements: passes.filter((p) => p.kind === 'restatement' && FINISHED.has(p.status)),
  };
}

/**
 * Whether the reader may ask for the report to be written again.
 *
 * Mirrors `store.ts`'s two refusals, and returns WHY rather than a boolean: a
 * disabled control the reader cannot explain is worse than no control at all,
 * which is the argument this codebase has been making since the landing page.
 */
export function canRestate(
  status: string,
  passes: PassRow[],
): { ok: true } | { ok: false; because: string } {
  if (!FINISHED.has(status)) {
    return { ok: false, because: 'The report can only be written again once the assessment has finished.' };
  }
  const state = passState(passes);
  if (state.running) {
    return { ok: false, because: 'Something is still running. Wait for it to finish first.' };
  }
  if (!state.completed.length) {
    return {
      ok: false,
      because: 'There is nothing to write in. Attach something above first — restating over an inventory nothing has been added to would spend the most expensive call in the feature to produce the report that is already on this page.',
    };
  }
  return { ok: true };
}
