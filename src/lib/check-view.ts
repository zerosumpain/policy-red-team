/**
 * WHY SEVEN OF THE TWELVE STRUCTURAL CHECKS COULD NOT DECIDE.
 *
 * The section was a two-column table — check name, result tag — whose bottom
 * seven rows all read "Could not decide" in the same grey pill: about 590
 * pixels carrying one bit of information seven times, with nothing on the page
 * saying why, and nothing saying what any of the twelve actually tested.
 *
 * The reason is in the payload and is one regular expression away. Every
 * `test` artefact carries `data.rule`, which opens "<relation> requires a
 * corresponding <relation>; absent trigger = indeterminate; …". Cross-tabulated
 * against the graph the run resolved, every one of the seven indeterminate
 * checks tests a relation the paper states ZERO times — delivers, depends_on,
 * regulates, supplies_data_to, is_measured_by, can_veto — while all five that
 * decided rest on a relation the paper does state: is_accountable_for 43 times,
 * bears_cost_of 13, has_authority_over 9.
 *
 * So "could not decide" is not a shrug. It is a specific, actionable finding —
 * the paper never says who delivers anything, never says who can veto anything
 * — and the page was withholding it along with the one-sentence `mitigation`
 * each check carries.
 *
 * FORK-OWN, NOT AN EDIT TO THE COPIED CORE. `checks()` lives in the
 * verbatim-tracked view layer and supplies the rows; this only reads them.
 */
import type { Artefact } from '$lib/policy-analysis/contracts';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The two relations a rule names.
 *
 * Anchored at the start and deliberately narrow: a rule the pipeline writes in
 * a shape this does not recognise yields no relations at all, and the row then
 * prints its result and its prose and says nothing it cannot support. Matched
 * on 12 of 12 on the live run.
 */
const RULE = /^(\w+) requires a corresponding (\w+)/;

export type CheckRelation = {
  relation: string;
  /** How many times the resolved graph actually states it. */
  count: number;
};

export type CheckRow = {
  artefact: Artefact;
  result: string;
  /** The relation whose presence triggers the check at all. */
  trigger: CheckRelation | null;
  /** The relation the trigger is supposed to have a counterpart in. */
  counterpart: CheckRelation | null;
  rule: string;
  reasoning: string;
  mitigation: string;
  /** The check could not decide, and the reason is that its trigger is never stated. */
  neverStated: boolean;
  /**
   * The check could not decide because THIS RUN'S graph did not link what the
   * paper states — a limit of the run, not a finding about the paper. Never
   * also `neverStated`: the whole point is that the paper does state it.
   */
  extractionGap: boolean;
};

export type CheckLedger = {
  rows: CheckRow[];
  /** The result tally, in the order the report's own tag component knows them. */
  counts: { key: string; count: number }[];
  /** The largest relation count in the graph — the scale every relation bar is drawn on. */
  peak: number;
  /** One sentence stating the finding, or null where there is no finding to state. */
  reading: string | null;
};

/** Relation counts over the graph the run resolved, built once for all twelve rows. */
export function relationTally(edges: { relation: string }[]): Map<string, number> {
  const tally = new Map<string, number>();
  for (const edge of edges) tally.set(edge.relation, (tally.get(edge.relation) ?? 0) + 1);
  return tally;
}

export function checkLedger(
  checks: Artefact[],
  edges: { relation: string }[],
  /**
   * The result keys, worst first.
   *
   * Passed in rather than imported so the ledger and the tag component cannot
   * drift apart on which four results exist — and so a result the payload
   * carries that the vocabulary does not is still counted at the end rather
   * than dropped.
   */
  resultKeys: readonly string[],
): CheckLedger {
  const tally = relationTally(edges);
  const at = (relation: string | undefined): CheckRelation | null =>
    (relation ? { relation, count: tally.get(relation) ?? 0 } : null);

  const rows: CheckRow[] = checks.map((artefact) => {
    const rule = str(artefact.data.rule);
    const found = RULE.exec(rule);
    const trigger = at(found?.[1]);
    const result = str(artefact.data.result);
    const extractionGap = artefact.data.basis === 'extraction_gap';
    return {
      artefact,
      result,
      trigger,
      counterpart: at(found?.[2]),
      rule,
      reasoning: str(artefact.data.reasoning),
      mitigation: str(artefact.data.mitigation),
      neverStated: result === 'indeterminate' && !extractionGap && trigger !== null && trigger.count === 0,
      extractionGap,
    };
  });

  /*
   * EVERY KNOWN RESULT IS COUNTED, ZEROS INCLUDED, and an unknown one is added
   * after them. "Low risk 0" is the reading a reader needs — not one of the
   * twelve checks came back clean — and a strip that silently omitted it would
   * be four chips on one run and three on the next with no explanation.
   */
  const seen = rows.map((row) => row.result);
  const counts = [
    ...resultKeys,
    ...[...new Set(seen)].filter((key) => key && !resultKeys.includes(key)).sort(),
  ].map((key) => ({ key, count: seen.filter((r) => r === key).length }));

  return {
    rows,
    counts,
    /*
     * THE SCALE IS THE GRAPH'S OWN BUSIEST RELATION, not a constant. On this
     * run that is 43 (`is_accountable_for`), and hard-coding it would draw
     * every bar on the next assessment against a number from this one.
     */
    peak: Math.max(1, ...tally.values()),
    reading: ledgerReading(rows),
  };
}

function ledgerReading(rows: CheckRow[]): string | null {
  const stuck = rows.filter((row) => row.result === 'indeterminate');
  if (!stuck.length) return null;
  const never = stuck.filter((row) => row.neverStated).length;
  const gaps = stuck.filter((row) => row.extractionGap).length;
  /*
   * A RUN'S OWN GAP IS SAID AS ONE. "The paper never states the relation" was
   * the reading for every stuck check whose relation the graph lacked — and on
   * the run that prompted phase 19 the paper stated 39 measures the graph never
   * linked. Those checks now carry `extractionGap`, and the sentence says whose
   * limit it is.
   */
  if (gaps) {
    const parts = [
      ...(never ? [`${never} because the paper never states the relation ${never === 1 ? 'it tests' : 'they test'}`] : []),
      `${gaps} because this run did not link what the paper does state — a limit of this run, not of the paper`,
    ];
    return `${stuck.length} of the ${rows.length} checks could not decide: ${parts.join('; ')}.`;
  }
  if (never === stuck.length) {
    return `${stuck.length} of the ${rows.length} checks could not run: the paper never states `
      + `${stuck.length === 1 ? 'the relation it tests' : 'the relations they test'}.`;
  }
  if (!never) return `${stuck.length} of the ${rows.length} checks could not decide.`;
  return `${stuck.length} of the ${rows.length} checks could not decide, ${never} of them because `
    + 'the paper never states the relation they test.';
}
