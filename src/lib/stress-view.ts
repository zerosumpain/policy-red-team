/**
 * THE STRESS TEST, ARRANGED FOR READING.
 *
 * `stress.ts` is copied and does the whole simulation: fail an assumption and it
 * walks the citations the assessment already made. Nothing here recomputes any
 * of that. What it does is decide what a reader is shown, and upstream paid for
 * those decisions once already — its own comment records the panel measured at
 * 1,468px with three levers pulled, two and a half screens for a thing whose
 * point is that you pull a lever and SEE the answer. Three causes, none of them
 * the column count:
 *
 *   every row was three lines; the reason was the SAME reason eight times over;
 *   and the lever rail was the tallest thing on the page.
 *
 * So the cause is said once per group rather than once per row, and the groups
 * are capped. Both of those live here, because "which rows share a reason" is a
 * grouping question with a right answer and no markup in it.
 *
 * THE TWO DIRECTIONS ARE OPPOSITE AND STAY OPPOSITE. A conclusion resting on a
 * failed hypothesis has lost its footing — it is not thereby wrong, it is no
 * longer supported by what was cited for it. A play whose precondition fails is
 * DISARMED: the actor needed that to be true, so the same switch is bad news in
 * one panel and good news in the next. Collapsing them into one "affected"
 * count would be worse than not offering the tool at all.
 */
import type { StressResult, StressRow, Standing } from '$lib/policy-analysis/stress';

/** What a standing means, in the reader's words rather than the model's. */
export const STANDING_LABEL: Record<Standing, string> = {
  holds: 'Unchanged',
  weakened: 'Partly undercut',
  unsupported: 'Nothing left supporting it',
  disarmed: 'Taken off the table',
};

/** Red where a conclusion has lost everything, orange where it is partly undercut, green where a threat is removed. */
export const STANDING_COLOUR: Record<Standing, 'red' | 'orange' | 'green' | 'grey'> = {
  holds: 'grey',
  weakened: 'orange',
  unsupported: 'red',
  disarmed: 'green',
};

/**
 * A reason a thing stopped standing, split by whether it is FIRST or SECOND order.
 *
 * `stress.ts` writes two shapes of sentence. One names something the reader
 * failed — *rests on "X"*, *needs "X"* — and is therefore the SAME sentence for
 * every row that cited it. The other is a consequence — *answers "Y", which no
 * longer stands* — and is a different sentence for every row, because every row
 * answers different things.
 *
 * Grouping on the whole reason only compresses the first kind. Measured on a
 * real assessment with one lever pulled, it compressed nothing at the second
 * order and the panel ran to **4,206 pixels** — three screens, and worse than
 * the version upstream rebuilt this panel to escape. Six recommendations each
 * carried their own three-clause caption saying, at length, that the conclusions
 * beneath them had gone.
 *
 * So the two are separated. The direct reasons are printed, once, above the
 * rows that share them. The consequential ones are COUNTED — "3 of the
 * conclusions it answers no longer stand" — and the names behind that count are
 * one click away in the drill, which is the page that exists for exactly this.
 */
const CONSEQUENCE = /, which no longer stands$/;

export function reasonsOf(row: StressRow): { direct: string[]; knockOn: number } {
  const direct = row.because.filter((line) => !CONSEQUENCE.test(line));
  return { direct, knockOn: row.because.length - direct.length };
}

/** Rows sharing the reason a reader can act on, with each row's knock-on count kept. */
export type CauseGroup = {
  /** Verbatim, and always naming something the reader failed. Empty where every reason was a consequence. */
  direct: string[];
  rows: { row: StressRow; knockOn: number }[];
};

/**
 * Group affected rows by the reason they are affected.
 *
 * Rows keep the order they arrived in, and so do the groups — that is the order
 * the caller sorted them into, not something to re-decide here.
 */
export function byCause(rows: StressRow[]): CauseGroup[] {
  const groups = new Map<string, CauseGroup>();
  for (const row of rows) {
    const { direct, knockOn } = reasonsOf(row);
    const key = direct.join(' ');
    const found = groups.get(key);
    if (found) found.rows.push({ row, knockOn });
    else groups.set(key, { direct, rows: [{ row, knockOn }] });
  }
  return [...groups.values()];
}

/** One kind of thing the test can move, and what happened to it. */
export type LostGroup = {
  key: string;
  /** What these are, in the reader's words. */
  label: string;
  rows: StressRow[];
  /** How many of this kind exist at all, moved or not. */
  population: number;
  /**
   * Whether this is a conclusion or the machinery under one.
   *
   * A reader asking "what if we are wrong" wants the recommendation they were
   * about to act on and the finding behind it. That a model and a scenario also
   * lost their footing is how those two lost theirs — true, and not the answer.
   * On a real assessment the four groups together ran to three screens; the
   * machinery goes behind a disclosure and the conclusions stay in the flow.
   */
  primary: boolean;
};

export type Reading = {
  /** Conclusions and the machinery under them, worst consequence first. */
  lost: LostGroup[];
  /**
   * Plays a failed assumption takes OFF the table — the opposite direction, and
   * the only good news on the page.
   */
  disarmed: StressRow[];
  /** Everything the test could move. */
  population: number;
  /** Everything it did move, in either direction. */
  moved: number;
  /** Deterministic checks, which no hypothesis can move. Saying so is part of the answer. */
  unmovable: number;
};

/**
 * WHAT YOU WERE TOLD TO DO COMES FIRST.
 *
 * `StressResult` lists plays, models, scenarios, findings and recommendations in
 * the order the pipeline produces them. A reader asking "what if we are wrong"
 * wants the opposite: the recommendation they were about to act on, then the
 * conclusion behind it, then the machinery those rested on.
 */
const ORDER = [
  ['recommendations', 'Recommendations', true],
  ['findings', 'Conclusions', true],
  ['scenarios', 'Scenarios', false],
  ['models', 'Interaction models', false],
] as const;

/** Nothing left supporting it, before partly undercut — the worse news leads. */
const BY_SEVERITY: Standing[] = ['unsupported', 'weakened', 'disarmed', 'holds'];
const severity = (row: StressRow) => BY_SEVERITY.indexOf(row.standing);

export function reading(result: StressResult): Reading {
  const lost: LostGroup[] = [];
  for (const [key, label, primary] of ORDER) {
    const all = result[key];
    const rows = all.filter((row) => row.standing !== 'holds').sort((a, b) => severity(a) - severity(b));
    if (rows.length) lost.push({ key, label, rows, population: all.length, primary });
  }

  const disarmed = result.plays.filter((row) => row.standing === 'disarmed');
  const population =
    result.plays.length + result.models.length + result.scenarios.length +
    result.findings.length + result.recommendations.length;

  return { lost, disarmed, population, moved: result.counts.total, unmovable: result.checksHeld };
}
