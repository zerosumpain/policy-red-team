import { useMemo, type ReactNode } from 'react';
import { challengeRound, coverageByBand, type RecReach } from '$lib/recommend-view';
import { linkRecommendation, TIER_LABEL, TIER_RULE, type Tier } from '$lib/recommendation';
import { BAND_LABEL, of, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Details } from '../govuk';
import { Matrix, type MatrixAxis } from './Matrix';
import type { ArtefactLink } from './Report';

/**
 * WHICH OF THE FORTY-SEVEN PLAYS THE ADVICE ACTUALLY ANSWERS.
 *
 * The report ends its Verdict panel with four recommendations and never
 * connects them to the forty-seven plays two moves over. Run over this
 * assessment, the four together reach thirty-five: TWELVE PLAYS ARE ANSWERED BY
 * NOTHING, and three of those twelve are severe. There was no way to say that
 * on the page, because nothing on the page did the join.
 *
 * THE JOIN IS `linkRecommendation()`, AND THE OBVIOUS ONE IS WORTHLESS. That
 * file measured a transitive ref-walk first and discarded it: two hops out from
 * a recommendation reaches 44 of the 47 plays and three hops reaches all 47,
 * from any starting point, because the graph is dense. I re-measured the closure
 * on this payload and got 751 to 834 artefacts per recommendation — a third of
 * the whole assessment. So this counts only the bounded two-edge join the drill
 * already uses, and prints the rules it used underneath the grid.
 *
 * ROWS ARE THE RECOMMENDATIONS, COLUMNS ARE THE BANDS, and that way round for
 * two reasons. A recommendation's title is the long string, and `Matrix` gives
 * the row label the whole first column and clips a column header to sixteen
 * characters — so titles across the top would be four broken words each. And a
 * band is one word, which is what a column header can carry and what the ramp
 * already means everywhere else in this report.
 *
 * THE LAST ROW IS THE FINDING AND IS SET IN INK. "Answered by none" is not a
 * fifth recommendation and is not a magnitude, so it takes no band tint: a tint
 * there would file the report's own gap alongside the advice that closes the
 * others.
 *
 * NO PER-CELL CONTROL. `Matrix` refuses them — twenty-five cells is twenty-five
 * tab stops for a keyboard user between the list above and the disclosure below
 * — so the twelve unanswered plays are named in full in the disclosure instead
 * of being hidden behind a cell a reader has to guess is pressable.
 */

/** "13 severe plays", "1 limited play" — the visually-hidden reading of a cell. */
const plural = (n: number, band: string | null) =>
  `${n} ${band ? `${band.toLowerCase()} ` : ''}${n === 1 ? 'play' : 'plays'}`;

/** The column that is not a band: every play the row reaches, however banded. */
const ALL = 'all';
/** The row that is not a recommendation. */
const NONE = 'none';

export function RecCoverage({ recs, artefacts, list, linkTo }: {
  recs: Artefact[];
  artefacts: Artefact[];
  /** The whole playbook, unnarrowed — the denominator is all 47, not the current selection. */
  list: Play[];
  linkTo?: ArtefactLink;
}) {
  const plays = useMemo(() => list.map((play) => ({ id: play.artefact.id, band: String(play.band) })), [list]);
  /*
   * Memoised because the join walks every artefact once per recommendation and
   * the report re-renders on every selection change — four passes over 2,296
   * artefacts for a figure that depends on neither the selection nor the move.
   */
  const links = useMemo(
    () => recs.map((rec) => ({ rec, links: linkRecommendation(rec, artefacts) })),
    [recs, artefacts],
  );
  const coverage = useMemo(() => {
    // Derived inside the memo rather than beside it: a `reach` array rebuilt on
    // every render is a new identity every render, and a dependency that always
    // changes is a memo that never holds.
    const reach: RecReach[] = links.map(({ rec, links: found }) => ({
      id: rec.id, label: rec.label, playIds: found.plays.map((p) => p.id),
    }));
    return coverageByBand(reach, plays);
  }, [links, plays]);

  if (!coverage.rows.length || !coverage.plays) return null;

  /*
   * THE TIER SPLIT IS PRINTED BECAUSE THE TIERS ARE NOT EQUAL. `linkRecommendation`
   * separates a play the assessment itself cited from one reached because it
   * needs the same assumption, and calls the first a claim and the rest leads.
   * Counting them into one grid and then saying nothing about the mix would
   * undo that distinction: on this run only 5 of the 90 row-links are cited
   * links and the other 85 rest on a shared assumption.
   */
  const tiers = links.reduce(
    (sum, { links: found }) => ({
      named: sum.named + found.counts.named,
      assumption: sum.assumption + found.counts.assumption,
      mechanism: sum.mechanism + found.counts.mechanism,
    }),
    { named: 0, assumption: 0, mechanism: 0 },
  );

  const rows: MatrixAxis[] = [
    ...links.map(({ rec }, i) => ({
      id: rec.id,
      label: `${i + 1}. ${rec.label}`,
      // The numeral is the same one `.prt-recs` counts with, so a cell can be
      // read back to the recommendation it is about without scrolling twice.
      node: <>{i + 1}. {linkTo ? linkTo(rec) : rec.label}</> as ReactNode,
    })),
    { id: NONE, label: 'Answered by none of the four' },
  ];
  const cols: MatrixAxis[] = [
    ...coverage.bands.map((band) => ({ id: band, label: BAND_LABEL[band as keyof typeof BAND_LABEL] ?? band })),
    { id: ALL, label: 'Any band' },
  ];

  const severeNone = coverage.none.counts.severe ?? 0;

  return (
    <div className="prt-coverage">
      <Matrix
        caption="How many plays each recommendation answers, by exposure band"
        corner="Recommendation / band →"
        rows={rows}
        cols={cols}
        cell={(row, col) => {
          const isNone = row.id === NONE;
          const counts = isNone ? coverage.none.counts : coverage.rows.find((r) => r.id === row.id)?.counts;
          const total = isNone ? coverage.none.total : coverage.rows.find((r) => r.id === row.id)?.total ?? 0;
          const count = col.id === ALL ? total : counts?.[col.id] ?? 0;
          // A zero is drawn, not blanked: "this recommendation answers none of
          // the severe plays" is the strongest thing a cell in this grid can
          // say, and a blank would leave the reader inferring it from absence.
          return {
            text: String(count),
            // Ink for the gap row and for the total column: a tint on either
            // would put the report's own shortfall on the severity ramp.
            band: isNone || col.id === ALL ? undefined : col.id,
            sentence: isNone
              ? `${plural(count, col.id === ALL ? null : col.label)} answered by no recommendation`
              : `${row.label}: ${plural(count, col.id === ALL ? null : col.label)}`,
          };
        }}
        note="Nothing counted here walks more than two edges — recommendation to finding, then finding to what it cites. That bound is the reason the counts mean anything."
      />

      {/*
        THE THREE RULES, NAMED AND KEPT APART. A cell in this grid is a count of
        three different kinds of link, and `recommendation.ts` is emphatic that
        they are not equal: the first is a claim the assessment made itself, the
        other two are leads. Run together into one caption they read as one
        rule; listed, a reader can see which one a number mostly is — and the
        line under the grid says which.
      */}
      <ul className="govuk-list govuk-body-s prt-coverage__rules">
        {(['named', 'assumption', 'mechanism'] as Tier[]).map((tier) => (
          <li key={tier}><strong>{TIER_LABEL[tier]}.</strong> {TIER_RULE[tier]}</li>
        ))}
      </ul>

      <p className="govuk-body-s prt-meta">
        {coverage.none.total} of the {coverage.plays} plays are reached by none of the {coverage.rows.length}{' '}
        {coverage.rows.length === 1 ? 'recommendation' : 'recommendations'}
        {severeNone ? ` — ${severeNone} of them severe` : ''}. A play answered by more than one recommendation is
        counted in every row that answers it, so the rows do not add up to {coverage.plays}. Of the{' '}
        {coverage.rows.reduce((n, row) => n + row.total, 0)} links the grid counts, {tiers.named}{' '}
        {tiers.named === 1 ? 'is a play' : 'are plays'} a finding the recommendation answers cites directly;
        the rest are reached through a shared assumption or a shared mechanism.
      </p>

      {coverage.none.playIds.length ? (
        <Details summary={`The ${coverage.none.playIds.length} plays no recommendation answers`}>
          {/*
            NAMED, NOT COUNTED. A reader who has just been told twelve plays are
            unanswered has exactly one next question, and a figure that made
            them go and diff two lists by hand would be the prose defect this
            whole section was rebuilt out of.
          */}
          <ul className="govuk-list govuk-body-s prt-coverage__missed">
            {coverage.none.playIds.map((id) => {
              const play = list.find((p) => p.artefact.id === id);
              if (!play) return null;
              return (
                <li key={id}>
                  <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
                  {linkTo ? linkTo(play.artefact) : play.artefact.label}
                </li>
              );
            })}
          </ul>
        </Details>
      ) : null}
    </div>
  );
}

/**
 * WHAT THE CHALLENGE ROUND DID TO THE ADVICE, as the list's own standfirst.
 *
 * The section renders a numbered list of four and presents it as the complete
 * answer. There are ten recommendation artefacts: six written at stage 12 and
 * four at stage 17, after the independent challenge. So the number the reader
 * is looking at is a survival count, and nothing said so.
 *
 * Counted here rather than written, and counted from the same `recs` the list
 * below renders, so the two can never disagree about how many there are.
 */
export function ChallengeNote({ recs, artefacts }: { recs: Artefact[]; artefacts: Artefact[] }) {
  const round = useMemo(() => challengeRound(of(artefacts, 'recommendation'), recs), [artefacts, recs]);
  // A run whose challenge round changed nothing has nothing to say here, and a
  // sentence reading "4 recommendations, rewritten from 4" would be noise.
  if (!round.earlier || round.earlier === round.assured) return null;
  return (
    <p className="govuk-body prt-suggests__standfirst">
      {round.assured} recommendations, rewritten by the independent challenge from {round.earlier}.
      {round.dropped.length
        ? ` ${round.dropped.length} of the ${round.earlier} ${round.dropped.length === 1 ? 'is' : 'are'} carried forward by none of them.`
        : ''}
    </p>
  );
}

/**
 * The advice the independent challenge removed, which the numbered list cannot show.
 *
 * Kept in this file rather than its own because it answers the same question the
 * grid does — what is NOT here — and a reader meets the two together.
 */
export function DroppedRecs({ recs, artefacts, linkTo }: {
  recs: Artefact[];
  artefacts: Artefact[];
  linkTo?: ArtefactLink;
}) {
  const round = useMemo(() => challengeRound(of(artefacts, 'recommendation'), recs), [artefacts, recs]);
  if (!round.dropped.length) return null;
  return (
    <Details summary={`${round.dropped.length} earlier recommendations no assured one replaces`}>
      {/*
        TRACED THROUGH `refs`, NOT THROUGH WORDING. An assured recommendation
        that rewrote an earlier one cites it; these are the earlier ones nobody
        cites. The contrast is the point: every one of the thirteen initial
        FINDINGS is carried forward by the assured synthesis, so the challenge
        round kept all of the conclusions and removed half of the advice.
      */}
      <ol className="govuk-list govuk-list--number govuk-body-s">
        {round.dropped.map((rec) => (
          <li key={rec.id}>
            <strong>{linkTo ? linkTo(rec) : rec.label}</strong>
            <br />
            {rec.statement}
          </li>
        ))}
      </ol>
    </Details>
  );
}
