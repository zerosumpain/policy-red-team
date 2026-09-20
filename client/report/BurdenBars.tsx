import { useMemo } from 'react';
import { beneficiaryTally, TALLY_FLOOR } from '$lib/recommend-view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Details } from '../govuk';
import { Diverge } from './Diverge';

/**
 * WHO GAINS AND WHO CARRIES IT, ACROSS ALL FOUR RECOMMENDATIONS AT ONCE.
 *
 * Every assured recommendation names a `beneficiaries` list and a
 * `burdenBearers` list — 47 mentions over 26 distinct groups on this run — and
 * until now neither reached the page or the Word export. Tallied, the finding is
 * not that one group wins: it is that the same two groups are at the top of both
 * lists. Employers are named as gaining in four recommendations and as carrying
 * the burden in three; providers gain in three and carry it in four. That is
 * precisely what the write-up's "Distribution" chapter is about — "aggregate
 * progress could conceal unequal effects" — and it was sitting in an array
 * nobody read.
 *
 * `Diverge` IS THE FIGURE THIS WAS BUILT FOR: a centre rule with the two
 * directions either side, so a group on both sides shows both bars on one row
 * rather than one averaged bar that hides the double count. It is HTML and CSS,
 * so the group names wrap — they are the longest thing on the row — and it
 * carries its own table view for 320px, print and a screen reader.
 *
 * THE NAMES ARE NOT NORMALISED, AND THE CAPTION SAYS SO. "providers" and
 * "providers with genuine improvement" are two rows; so are "Government" and
 * "Government departments". Merging them would be this tool asserting an
 * identity the assessment did not write, in the one figure whose entire subject
 * is who is being talked about. See `recommend-view.ts`.
 *
 * AND THE NINETEEN SINGLE MENTIONS ARE UNDER IT, not discarded. Drawn, they are
 * nineteen rows of one identical bar; dropped silently, the figure would be
 * throwing away 40% of what the recommendations named.
 */
export function BurdenBars({ recs }: { recs: Artefact[] }) {
  const tally = useMemo(() => beneficiaryTally(recs), [recs]);
  if (!tally.drawn.length) return null;

  const distinct = tally.drawn.length + tally.singles.length;
  const rows = tally.drawn.map((row) => ({
    id: row.label,
    label: row.label,
    left: row.bears,
    right: row.gains,
  }));

  return (
    <div className="prt-burden">
      <Diverge
        rows={rows}
        leftLabel="named as carrying it"
        rightLabel="named as gaining"
        label="who gains and who carries it, across the recommendations"
        tableLabel="Group"
        caption={`Groups named in ${TALLY_FLOOR} or more of the ${recs.length} recommendations, counted from the recommendations' own lists — ${tally.mentions} mentions over ${distinct} distinct groups. Named as written; a group described differently in two places is counted twice.`}
      />
      {tally.singles.length ? (
        <>
          <p className="govuk-body-s prt-meta prt-burden__tail">
            {tally.singles.length} further {tally.singles.length === 1 ? 'group is' : 'groups are'} named in one
            recommendation each, so {tally.singles.length === 1 ? 'it is' : 'they are'} not drawn above.
          </p>
          <Details summary={`The ${tally.singles.length} groups named once`}>
            {/* A list rather than a second figure: one bar each is not a
                comparison, and the reason they are here at all is that a
                reader must be able to see every group the advice named. */}
            <ul className="govuk-list govuk-list--bullet govuk-body-s">
              {tally.singles.map((row) => (
                <li key={row.label}>
                  {row.label} — {row.gains ? 'gains' : 'carries it'}
                </li>
              ))}
            </ul>
          </Details>
        </>
      ) : null}
    </div>
  );
}
