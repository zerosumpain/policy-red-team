import type { ReactNode } from 'react';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { Details } from '../govuk';
import { Bar } from './Metrics';

/**
 * The stored enum, in words. `compliant` is the one a reader must not skim: it
 * means the play breaks no rule, so nothing in the paper answers it.
 */
const LEGALITY_LABEL: Record<string, string> = {
  compliant: 'Inside the rules',
  grey: 'Grey area',
  breach: 'Breaks a rule',
};

/**
 * The three fields every play carries and the report never printed, in the order
 * a reader meets the questions: what it costs us, how we would see it coming,
 * what closes it.
 *
 * All three are present and non-empty on 47 of 47 plays on the Post-16 run —
 * `costToPolicy` averages 194 characters, `earlyWarning` 210 and `counter` 263 —
 * and the only renderer for any of them is `PlayFlow`, which is mounted by the
 * drill page alone. So the move called "what could be done to it" scored
 * forty-seven threats and printed none of the forty-seven answers, and the
 * offline pack, which has no drill to walk to, carried none of them at all.
 */
const CLOSING_FIELDS: [key: string, label: string][] = [
  ['costToPolicy', 'What it costs the policy'],
  ['earlyWarning', 'How you would spot it'],
  ['counter', 'What would close it'],
];

/**
 * A LIST OF PLAYS A READER CAN ACTUALLY SCAN.
 *
 * Forty-seven plays rendered as list items, each a band tag then a link then a
 * body then two numbers, all at 16px and all the same weight, wrapping mid-
 * sentence. The eye had nothing to catch on: finding the severe ones meant
 * reading every row.
 *
 * THE BAND IS THE EDGE OF THE CARD, which is the one place a colour can carry
 * magnitude without competing with the text — and it is doubled by the word, by
 * the ordering, and by the exposure figure, so no reading depends on it. The
 * ramp's two light steps sit below 3:1 against the page and could not be relied
 * on even if we wanted to.
 *
 * THE BODY IS A SEPARATE LINE, not a parenthesis. "Who is positioned to run
 * this" is the second question a reader asks about a play, and it was set in
 * grey after an em dash at the end of the title, where it read as an
 * afterthought to the sentence rather than an answer to a question.
 */
export function PlayList({ plays, linkTo, rank, trailing, exposureMax, rankValue, counters, countersOpen }: {
  plays: Play[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  /** Numbers the list, for a ranking where the position is part of the claim. */
  rank?: boolean;
  /** An extra figure per play — a re-ranked exposure beside the assessment's own. */
  trailing?: (play: Play) => ReactNode;
  /**
   * The whole run's highest exposure, which turns the printed figure into a
   * length as well as a number.
   *
   * PASSED IN RATHER THAN TAKEN FROM `plays`, because the ten rows a reader
   * first meets occupy the top 4% of the run: scaled to their own maximum they
   * would draw ten full bars and say the opposite of the truth. On the Post-16
   * run the ten are 0.7693 down to 0.7377 and the full 47 run to 0.0495, a
   * fifteen-fold spread the reader never sees until they press "Show all 47" —
   * at which point the mildest comes out at 6% of the track.
   */
  exposureMax?: number;
  /**
   * The value the list is actually ordered by, when adjacent rows can tie.
   *
   * Ranks 7 and 8 in the assessment's own order are not close, they are exactly
   * equal — both 0.7388 in the stored data — so the order between "Optimise
   * measured participation and completion" and "Rebase visible progress toward
   * activity measures" is whatever `sort` happened to leave. A hard 7 and 8
   * asserts a precision the run did not record. Given this, tied rows share one
   * number and carry an `=`.
   */
  rankValue?: (play: Play) => number;
  /**
   * The counter-measure, the early warning and the cost, as one disclosure.
   *
   * ONE, NOT THREE: forty-seven cards times three disclosures is 141 controls in
   * the offline pack, and the pack is a document somebody reads top to bottom.
   * Off entirely for the Verdict lead's three-play sample, which is a summary.
   */
  counters?: boolean;
  /**
   * Opens all of them at once.
   *
   * THE DISCLOSURE IS ALWAYS IN THE DOCUMENT WHEN `counters` IS SET, and this
   * only decides whether it starts open — because the print block's rule is
   * `details > *:not(summary) { display: block }`, which opens a disclosure that
   * is there and cannot conjure one that is not. Rendering the fields only once a
   * reader had ticked a box would have meant the paper copy carried the
   * counter-measures only if the reader happened to ask for them on screen first,
   * which is not a rule anybody could have predicted from the page.
   */
  countersOpen?: boolean;
}) {
  if (!plays.length) return null;

  /*
   * TIES ARE FOUND ON THE ORDERING VALUE, NOT ON THE PRINTED ONE. The printed
   * figure is already rounded to two decimals, so four rows print 0.75 and four
   * print 0.74 on this run and a comparison of what is on screen would call all
   * four a tie. Four decimal places is what the pipeline stores.
   */
  const values = rankValue ? plays.map((play) => rankValue(play).toFixed(4)) : null;
  /** For each row: the rank to print, and whether it is shared with a neighbour. */
  const ranks = plays.map((_, i) => {
    if (!values) return { number: i + 1, tied: false };
    let start = i;
    while (start > 0 && values[start - 1] === values[i]) start -= 1;
    const tied = start !== i || (i + 1 < plays.length && values[i + 1] === values[i]);
    return { number: start + 1, tied };
  });

  return (
    <ol className={`prt-plays${rank ? ' prt-plays--ranked' : ''}`}>
      {plays.map((play, i) => (
        <li key={play.artefact.id} className={`prt-play prt-play--${play.band}`}>
          {rank ? (
            <span className={`prt-play__rank${ranks[i].tied ? ' prt-play__rank--tied' : ''}`} aria-hidden="true">
              {ranks[i].tied ? `=${ranks[i].number}` : ranks[i].number}
            </span>
          ) : null}
          <div className="prt-play__main">
            <p className="prt-play__title">{linkTo ? linkTo(play.artefact) : play.artefact.label}</p>
            {play.actor ? <p className="prt-play__who">{play.actor.label}</p> : null}
          </div>
          <div className="prt-play__figures">
            {/*
              LEGALITY, HERE, because the table that carried it is gone.
              "Inside the rules" is the assessment's sharpest claim — thirty of
              the forty-seven plays break no rule, so there is no enforcement
              answer to them — and it was only ever printed in a five-column
              table that repeated this same list below it.
            */}
            <span className={`prt-legality prt-legality--${String(play.artefact.data.legality ?? 'unknown')}`}>
              {LEGALITY_LABEL[String(play.artefact.data.legality ?? '')] ?? '—'}
            </span>
            <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>
            <span className="prt-play__exposure">
              <span className="govuk-visually-hidden">Score </span>
              {/*
                THE BAR LIVES INSIDE THE FIGURE, AND ITS TRACK DISAPPEARS ON A
                PHONE. `.prt-play__figures` is a wrapping flex row whose three
                existing children already come to about 260px, which pushed a
                320px page 34px sideways once before — so the track is a fixed
                64px from tablet and `display: none` below it, leaving exactly
                the bare number the row has always carried. `Bar` prints the
                figure beside the track, so nothing is ever read off length.
              */}
              {exposureMax ? <Bar value={play.exposure} max={exposureMax} /> : play.exposure.toFixed(2)}
            </span>
            {trailing ? trailing(play) : null}
          </div>
          {counters ? (
            /*
              AFTER THE FIGURES, so the card's shape and its band edge are
              unchanged for a reader who does not open it — one summary line per
              row, not 260 characters of policy prose. The print block forces
              every `details` open, so the paper and the pack carry all three
              fields on every play with no rule of their own.
            */
            <div className="prt-play__closing">
              <Details summary="What it would cost, how you would spot it, what would close it" open={countersOpen}>
                {CLOSING_FIELDS.map(([key, label]) => {
                  const value = play.artefact.data[key];
                  // Guarded one field at a time, the way `PlaySection` guards the
                  // same values on the drill: a play written by an earlier
                  // pipeline may carry two of the three, and a missing one should
                  // cost its own line rather than the whole disclosure.
                  if (typeof value !== 'string' || !value) return null;
                  return (
                    <p className="govuk-body-s prt-play__closing-line" key={key}>
                      <span className="prt-play__closing-label">{label}</span>
                      {value}
                    </p>
                  );
                })}
              </Details>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
