import { stress, type Standing } from '$lib/policy-analysis/stress';
import { reading } from '$lib/stress-view';
import { MINI_ASSESSMENT } from './content';

/**
 * CHAPTER 5'S ANSWER, from the report's own two functions (phase 26).
 *
 * `stress` walks the links the guide's mini-assessment states — a play's
 * `preconditions`, a finding's `hypothesisIds` — exactly as it walks a real
 * run's, and `reading` sorts the result into the two opposite directions the
 * Stress lab prints. Nothing is recomputed here: this only names the ids that
 * moved and says the sum in a sentence, so the chapter's picture and its words
 * come from one call. `stress-mini.test.ts` pins what each switch does.
 */
export type MiniStressResult = {
  /** Ways to beat it taken off the table — the good news. */
  disarmed: string[];
  /** Each conclusion's standing — the bad news, where it is not `holds`. */
  findings: Record<string, Standing>;
  summary: string;
};

export function miniStress(failed: readonly string[]): MiniStressResult {
  const result = stress([...MINI_ASSESSMENT], failed);
  const read = reading(result);
  const findings: Record<string, Standing> = {};
  for (const row of result.findings) findings[row.artefact.id] = row.standing;

  const off = read.disarmed.length;
  const lost = read.moved;
  const summary = !failed.length
    ? 'Nothing is switched off: every way to beat it, and the conclusion, still stands.'
    : `${off} of ${read.plays} ways to beat it ${off === 1 ? 'is' : 'are'} taken off the table. `
      + (lost ? 'The conclusion loses its footing.' : 'The conclusion still stands.');
  return { disarmed: read.disarmed.map((row) => row.artefact.id), findings, summary };
}
