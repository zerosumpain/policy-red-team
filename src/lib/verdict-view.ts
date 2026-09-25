/**
 * BAND AGAINST LEGALITY — the cross-tab that is in the payload and on no page.
 *
 * Every exploitation play carries both `data.band` and `data.legality`, and the
 * report draws each of them alone: the band split is the segmented bar at the
 * top of the page, and legality is a 16px pill on an individual play card 1,400
 * pixels below it. Nobody can assemble the two by eye, because the pill only
 * ever appears on the three plays the Verdict lead shows by default.
 *
 * Cross-tabulated on the real run the answer is the sharpest thing the
 * assessment says: thirteen of the twenty severe plays break no rule at all.
 * `PlayList`'s own source comment calls legality "the assessment's sharpest
 * claim — thirty of the forty-seven plays break no rule, so there is no
 * enforcement answer to them", and that number lived in the comment and
 * appeared on no panel.
 *
 * HERE, NOT IN THE COMPONENT, and not in `src/lib/policy-analysis/` either.
 * That directory is a verbatim-tracked copy of the upstream core and editing a
 * file in it costs a recorded divergence; this reading belongs to the fork. The
 * precedent is `spread.ts` and `weighting.ts`: a sentence that asserts "13 of
 * the 20 severe plays are things nobody is forbidden to do" is a claim about
 * the assessment, and a claim about the assessment is tested rather than typed
 * into JSX.
 */
import { BANDS, type Band } from '$lib/policy-analysis/exposure';
import { BAND_LABEL } from '$lib/policy-analysis/view';

/**
 * Everything this needs off a play, and nothing else.
 *
 * Deliberately not `Play`: the test builds forty-seven of these and a `Play`
 * drags an `Artefact` and an actor join in with it. `spread.ts` takes the same
 * decision for the same reason.
 */
export type LegalityPlay = { band: Band; legality: string };

/**
 * The stored enum, in words.
 *
 * The same three strings `PlayList` prints on a play card, kept here because
 * the bar and the pill must not disagree about what `grey` is called — and the
 * bar is built from this module rather than from the component.
 */
export const LEGALITY_LABEL: Record<string, string> = {
  compliant: 'Inside the rules',
  grey: 'Grey area',
  breach: 'Breaks a rule',
};

/** The order a reader meets them in: what is allowed, what is arguable, what is not. */
export const LEGALITY_ORDER = ['compliant', 'grey', 'breach'] as const;

export type LegalityRow = {
  legality: string;
  label: string;
  count: number;
  /** The bands inside this legality value, in band order, zeros included. */
  bands: { band: Band; label: string; count: number }[];
};

export type BandLegality = {
  /** One row per legality value that has at least one play. */
  rows: LegalityRow[];
  /** Every legality value the vocabulary knows, present or not — the table's columns. */
  columns: { legality: string; label: string; count: number }[];
  /** Band totals across every legality value, in band order — the table's rows. */
  bands: { band: Band; label: string; count: number }[];
  total: number;
  breaches: number;
  /** The worst band, and how much of it is inside the rules. This is the finding. */
  worst: { band: Band; label: string; total: number; compliant: number } | null;
};

/**
 * The cross-tab, with the vocabulary's own order on both axes.
 *
 * Both axes are ordered by the enum rather than by count, so two runs of the
 * same paper put severe in the same place and a reader who has learnt the ramp
 * once does not re-learn it per figure.
 */
export function bandLegality(plays: LegalityPlay[]): BandLegality {
  const bandKeys = BANDS.map((b) => b.band);
  /*
   * A LEGALITY VALUE THE ENUM HAS NEVER HEARD OF IS STILL COUNTED. The pipeline
   * writes this string and a future stage could widen it; dropping an unknown
   * value would make the row counts stop adding up to 47 with nothing on the
   * page saying why. Unknown values sort after the three known ones and are
   * labelled with whatever they are.
   */
  const seen = [...new Set(plays.map((p) => p.legality))];
  const order = [
    ...LEGALITY_ORDER.filter((key) => seen.includes(key)),
    ...seen.filter((key) => !(LEGALITY_ORDER as readonly string[]).includes(key)).sort(),
  ];

  const count = (legality: string, band?: Band) =>
    plays.filter((p) => p.legality === legality && (band === undefined || p.band === band)).length;

  const rows: LegalityRow[] = order
    .map((legality) => ({
      legality,
      label: LEGALITY_LABEL[legality] ?? legality,
      count: count(legality),
      bands: bandKeys.map((band) => ({ band, label: BAND_LABEL[band], count: count(legality, band) })),
    }))
    .filter((row) => row.count);

  /*
   * THE COLUMNS ARE THE VALUES THAT TURNED UP, NOT THE WHOLE ENUM. A column of
   * four zeros headed "Breaks a rule" is a column that has to be read before it
   * can be discarded; that nothing breaches is said once, in a sentence, where
   * it is a finding rather than an empty column.
   */
  const columns = rows.map((row) => ({ legality: row.legality, label: row.label, count: row.count }));

  const bands = bandKeys.map((band) => ({
    band,
    label: BAND_LABEL[band],
    count: plays.filter((p) => p.band === band).length,
  }));

  const worstBand = bands.find((b) => b.count) ?? null;

  return {
    rows,
    columns,
    bands,
    total: plays.length,
    breaches: count('breach'),
    worst: worstBand
      ? {
        band: worstBand.band,
        label: worstBand.label,
        total: worstBand.count,
        compliant: count('compliant', worstBand.band),
      }
      : null,
  };
}

/**
 * The reading, as sentences — one claim per sentence, each one a count.
 *
 * Returned as an array rather than a paragraph because the component sets the
 * first one as the section's lead and the second as the consequence, and
 * because a test can then assert the claim rather than the punctuation.
 */
export function legalityReading(tab: BandLegality): string[] {
  if (!tab.total) return [];
  const lines: string[] = [];

  /*
   * THE HEADLINE IS WHICHEVER IS TRUE. "Nothing here breaks a rule" is the
   * finding on this run and would be a lie on the next one, so the zero case
   * and the non-zero case are both written rather than the zero case being
   * assumed.
   */
  lines.push(
    tab.breaches === 0
      ? `Not one of the ${tab.total} ways to beat it breaks a rule.`
      : `${tab.breaches} of the ${tab.total} ways to beat it would break a rule; the other ${tab.total - tab.breaches} would not.`,
  );

  /*
   * THE CONSEQUENCE, and it is about the worst band only: a compliant play in
   * the mildest band is not an enforcement problem, and saying "30 of 47 break
   * no rule" flattens the two together. The clause is dropped rather than
   * softened where the worst band happens to be entirely outside the rules,
   * because then enforcement IS the answer and the sentence would be wrong.
   */
  if (tab.worst && tab.worst.compliant) {
    lines.push(
      `${tab.worst.compliant} of the ${tab.worst.total} ${tab.worst.label.toLowerCase()} ways to beat it are `
      + 'things nobody is forbidden to do, so enforcement is not the answer to them.',
    );
  }
  return lines;
}
