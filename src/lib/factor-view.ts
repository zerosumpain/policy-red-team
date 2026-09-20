/**
 * THE FOUR JUDGEMENTS BEHIND EVERY EXPOSURE SCORE, ARRANGED FOR READING.
 *
 * `factorProfile()` in the copied view layer does the arithmetic and has done
 * since the fork was made; its own doc comment says the verdict should show it
 * "because they say WHY the policy is exposed, which no single count does",
 * and it had exactly one caller, which was its own test. Nothing here
 * recomputes any of it.
 *
 * WHAT IS ADDED IS THE TIE, AND IT IS NOT A DETAIL. `factorProfile()` returns
 * one `top` play per factor, found with a `reduce` that keeps the first
 * strictly-greater value — so on a tie it returns whichever play happens to
 * come first in the exposure-sorted list. Measured on the real run, THREE OF
 * THE FOUR FACTORS TIE AT THE TOP: incentive 0.82 on two plays, ease 0.90 on
 * two, concealment 0.86 on two; only impact has a single worst at 0.72. A
 * figure that prints "Worst on this: X" four times, three of them arbitrary
 * between two equally bad plays, asserts a precision the assessment does not
 * have — which is the same defect `PlayList` already fixes for ranks 7 and 8
 * of the playbook, and it is fixed the same way: the tie is said in words.
 *
 * FORK-OWN. `src/lib/policy-analysis/` is a verbatim-tracked copy of the
 * upstream core, so the tie count is computed beside it rather than added to
 * it. `factorProfile` is imported, not reimplemented.
 */
import { factorProfile, type Play } from '$lib/policy-analysis/view';
import { EXPOSURE_FACTORS } from '$lib/policy-analysis/exposure';

/** The `govuk-hint` gloss the Move 3 weighting sliders already show, keyed for lookup. */
const GLOSS: Record<string, string> = Object.fromEntries(EXPOSURE_FACTORS.map(([key, text]) => [key, text]));

export type FactorRow = {
  key: string;
  label: string;
  /** What this judgement asks, in the words the sliders in Move 3 use. */
  gloss: string;
  /** The unweighted mean over every play. */
  mean: number;
  /** The play that tops this factor — one of them, where more than one does. */
  top: Play | null;
  /** The highest score any play reaches on this factor. */
  peak: number;
  /** How many OTHER plays reach that same score. Zero on one factor of four here. */
  sharing: number;
};

const valueOf = (play: Play, key: string): number =>
  play.factors.find((factor) => factor.key === key)?.value ?? 0;

export function factorRows(list: Play[]): FactorRow[] {
  return factorProfile(list).map((factor) => {
    const peak = factor.top ? valueOf(factor.top, factor.key) : 0;
    return {
      key: factor.key,
      label: factor.label,
      gloss: GLOSS[factor.key] ?? '',
      mean: factor.mean,
      top: factor.top,
      peak,
      /*
       * COMPARED AT FULL STORED PRECISION, not at the two decimals the page
       * prints. Rounding first would call 0.857 and 0.864 a tie and draw an
       * equivalence the run did not record — the opposite mistake, and the one
       * `PlayList` warns about where it compares ranks at four decimal places
       * rather than at the printed two.
       */
      sharing: factor.top ? list.filter((play) => valueOf(play, factor.key) === peak).length - 1 : 0,
    };
  });
}

/**
 * The caption, computed: which judgement is highest, which lowest, and what
 * the four numbers are means of.
 *
 * This carries the method sentence that used to stand in the Verdict lead
 * where the answer should have been — "exposure is the geometric mean of
 * incentive, ease, impact and concealment" — because on the figure that draws
 * the four ingredients it is a caption, and anywhere else it was a substitute
 * for one.
 */
export function factorReading(rows: FactorRow[], plays: number): string {
  if (!rows.length || !plays) return '';
  const ranked = [...rows].sort((a, b) => b.mean - a.mean);
  const high = ranked[0];
  const low = ranked[ranked.length - 1];
  /*
   * WHERE EVERY FACTOR SCORES THE SAME there is no highest and no lowest, and
   * naming two of them anyway would invent a shape. It cannot happen on real
   * judgements and it can happen on a fixture, which is reason enough.
   */
  const shape = high.mean === low.mean
    ? `All four judgements average ${high.mean.toFixed(2)}.`
    : `Highest on ${high.label.toLowerCase()} at ${high.mean.toFixed(2)}, lowest on `
      + `${low.label.toLowerCase()} at ${low.mean.toFixed(2)} — read those two against the lines `
      + 'above them for what this playbook is made of.';

  return `${shape} Each figure is the plain mean across all ${plays} plays; a play's own exposure `
    + 'is the geometric mean of its four, so it is a magnitude rather than a score.';
}
