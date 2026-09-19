import type { ReactNode } from 'react';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import type { Artefact } from '$lib/policy-analysis/contracts';

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
export function PlayList({ plays, linkTo, rank, trailing }: {
  plays: Play[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  /** Numbers the list, for a ranking where the position is part of the claim. */
  rank?: boolean;
  /** An extra figure per play — a re-ranked exposure beside the assessment's own. */
  trailing?: (play: Play) => ReactNode;
}) {
  if (!plays.length) return null;

  return (
    <ol className={`prt-plays${rank ? ' prt-plays--ranked' : ''}`}>
      {plays.map((play, i) => (
        <li key={play.artefact.id} className={`prt-play prt-play--${play.band}`}>
          {rank ? <span className="prt-play__rank" aria-hidden="true">{i + 1}</span> : null}
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
              <span className="govuk-visually-hidden">Exposure </span>
              {play.exposure.toFixed(2)}
            </span>
            {trailing ? trailing(play) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
