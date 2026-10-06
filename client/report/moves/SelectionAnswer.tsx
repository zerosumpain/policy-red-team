import type { ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { BAND_LABEL, type Play } from '$lib/policy-analysis/view';
import { answerHeading, nothingUnder, type Selection } from '../selection';

/**
 * THE ANSWER TO A PRESS, WHERE THE PRESS WAS MADE (phase 29).
 *
 * Threats' grid and both tables on Who is involved are pickers: pressing one
 * narrows the whole report. But the lists they narrow live on other pages,
 * and the only sign on the page itself was a banner inserted at the top —
 * which pushed the page down under the reader's pointer and was off screen on
 * a long page. The owner's word for it was "broken". So every picker now
 * answers in place: what was picked, how many ways to beat it that leaves, the
 * worst few by name, a way on to the full ranked list, and a way out.
 *
 * `.prt-mech` because that is the block `CausalityLead` already answers its
 * bars with: one look for "this is the answer to what you pressed".
 *
 * NOT A LIVE REGION. The selection bar says what changed, politely, on every
 * press; a second announcement here would read the same news twice.
 */
const SHOWN = 5;

export function SelectionAnswer({ selection, plays, linkTo, seeAll, onClear, headingLevel = 3 }: {
  selection: Selection;
  /** The ways to beat it the selection leaves, worst first. */
  plays: Play[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
  /** A link on to the ranked list, carrying the selection; none where the list is this page. */
  seeAll?: ReactNode;
  onClear: () => void;
  headingLevel?: 3 | 4;
}) {
  if (!selection) return null;
  const Heading = headingLevel === 3 ? 'h3' : 'h4';
  const shown = plays.slice(0, SHOWN);
  return (
    <div className="prt-mech prt-answer">
      <Heading className="govuk-heading-s govuk-!-margin-bottom-2">{answerHeading(selection, plays.length)}</Heading>
      {plays.length ? (
        <ol className="govuk-list prt-answer__list">
          {shown.map((play) => (
            <li key={play.artefact.id}>
              <span className={`prt-band prt-band--${play.band}`}>{BAND_LABEL[play.band]}</span>{' '}
              {linkTo ? linkTo(play.artefact) : play.artefact.label}
            </li>
          ))}
        </ol>
      ) : (
        <p className="govuk-body">{nothingUnder(selection)}</p>
      )}
      {plays.length > SHOWN ? (
        <p className="govuk-body-s prt-meta govuk-!-margin-bottom-2">and {plays.length - SHOWN} more.</p>
      ) : null}
      <p className="govuk-body-s prt-answer__actions govuk-!-margin-bottom-0">
        {seeAll}
        <button type="button" className="prt-linkbutton" onClick={onClear}>Clear the selection</button>
      </p>
    </div>
  );
}
