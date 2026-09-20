import { TRAIT_COLUMNS, type Cell, type TraitRow } from '$lib/policy-analysis/matrix';

/**
 * WHAT THE CAST GRID IS ALLOWED TO CLAIM ABOUT ITS OWN COVERAGE.
 *
 * `traitCoverage()` in the tracked core counts a cell as filled when the profile
 * wrote anything into it, which is the right test for "did the pipeline reach
 * this field" and the wrong one for "does the paper answer this question".
 * Measured on the live run: it returns 72 of 72 filled for the twelve bodies
 * that run a play, and 38 of those 72 cells are a sentence saying the paper is
 * silent — "unknown; the passage does not specify Skills England's reporting
 * line…", "No supported direct gain from failure is identified". Captioning the
 * grid with that function would print "72 of 72" over a grid that is half
 * absence, in the one component whose module header exists to stop exactly that.
 *
 * SO THE PREDICATE LIVES HERE, in the fork, and it is a rule you can read rather
 * than a classification: a cell is an absence when its sentence OPENS by saying
 * so. Run over all 330 cells of the 55 profiles on this assessment it matches
 * 223 and every match was audited by hand — 217 open "unknown", 5 "No supported
 * … is identified", 1 "The policy does not specify" — with no false positive. It
 * is deliberately anchored at the start of the string: a sentence that answers
 * the question and then records a caveat is an answer.
 */
const SILENT = /^(unknown|not stated|not specified|no supported|none identified|no stated|the (policy|passage|text|paper) does not)/i;

export function isSilent(cell: Cell): boolean {
  return Boolean(cell && SILENT.test(cell.full.trim()));
}

/** What a silent cell prints instead of the sentence. Printing the prose asserts the opposite. */
export const SILENT_TEXT = 'Not stated in the paper';

export type CastCoverage = {
  /** Cells the paper actually answers. */
  answered: number;
  /** Cells whose text records that it does not. */
  silent: number;
  /** Cells the pipeline never wrote at all — a third state, and zero on this run. */
  missing: number;
  total: number;
  /** One per `TRAIT_COLUMNS`, in that order, for the column headings. */
  columns: { key: string; head: string; asks: string; answered: number; silent: number }[];
  /**
   * How many cells carry each epistemic status.
   *
   * NOT `traitCoverage().dominantOrigin`, which is null on this assessment: the
   * 330 cells split extracted_fact 129 / structural_inference 182 /
   * behavioural_hypothesis 19, and 182/330 is 55%, under the 0.6 gate the core
   * sets before it will name a dominant origin. The "state it once in the
   * caption" trick that function exists for does not fire here, so the split is
   * stated instead — which is a longer sentence and a true one.
   */
  origins: { origin: string; count: number }[];
};

export function castCoverage(rows: TraitRow[]): CastCoverage {
  const columns = TRAIT_COLUMNS.map((column, i) => {
    const cells = rows.map((row) => row.cells[i]);
    return {
      key: column.key,
      head: column.head,
      asks: column.asks,
      answered: cells.filter((cell) => cell && !isSilent(cell)).length,
      silent: cells.filter((cell) => isSilent(cell)).length,
    };
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const cell of row.cells) {
      if (!cell || isSilent(cell)) continue;
      counts.set(cell.origin, (counts.get(cell.origin) ?? 0) + 1);
    }
  }

  const answered = columns.reduce((n, c) => n + c.answered, 0);
  const silent = columns.reduce((n, c) => n + c.silent, 0);
  const total = rows.length * TRAIT_COLUMNS.length;
  return {
    answered,
    silent,
    missing: total - answered - silent,
    total,
    columns,
    origins: [...counts.entries()]
      .map(([origin, count]) => ({ origin, count }))
      .sort((a, b) => b.count - a.count || a.origin.localeCompare(b.origin)),
  };
}
