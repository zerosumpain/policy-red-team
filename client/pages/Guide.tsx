import { Link } from 'react-router';
import { GLOSSARY } from '$lib/plain-words';
import { InsetText } from '../govuk';
import { usePageTitle } from '../layout/Template';
import { MOVES } from '../moves';
import { HUB } from '../places';

/**
 * "HOW TO READ A REPORT" — the short version, at the address the long one
 * will have (phase 24).
 *
 * The service navigation names this page on every screen, and phase 26 builds
 * the full guide (animation, worked examples, the in-report helpers) at the
 * same `/guide`. Until then the choice was a placeholder that says "coming
 * soon" or a short page that is true today. A navigation item that leads to
 * an apology is a dead end with a better label, and everything a first-time
 * reader needs in order to start is already written down: the six sections are
 * `MOVES`, with the question each answers, and the words that had to stay are
 * `GLOSSARY`. So this page is those two, in that order, and nothing invented.
 */
export function Guide() {
  usePageTitle('How to read a report');
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full">
        <h1 className="govuk-heading-xl">How to read a report</h1>
        <p className="govuk-body-l">
          Each report reads one policy paper the way someone trying to get round it would. It finds
          weak points; it does not predict that anyone will use them.
        </p>
        <InsetText>
          A fuller guide, with worked examples, is being written. This page is the short version.
        </InsetText>

        <h2 className="govuk-heading-l">Start with the summary</h2>
        <p className="govuk-body">
          Every assessment opens on a one-page summary: the answer in a sentence, four figures, and a
          box for each question below. Each box ends in a link to the section that answers it in full.
        </p>

        <h2 className="govuk-heading-l">The sections, and the question each answers</h2>
        <dl className="govuk-summary-list">
          {MOVES.map((move) => (
            <div key={move.id} className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">{move.label}</dt>
              <dd className="govuk-summary-list__value">{move.hint}</dd>
            </div>
          ))}
        </dl>

        <h2 className="govuk-heading-l">What these words mean</h2>
        <dl className="govuk-summary-list">
          {GLOSSARY.map((entry) => (
            <div key={entry.term} className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">{entry.term}</dt>
              <dd className="govuk-summary-list__value">{entry.meaning}</dd>
            </div>
          ))}
        </dl>

        <h2 className="govuk-heading-l">Bodies across policies</h2>
        <p className="govuk-body">
          A body is an organisation or office a paper gives something to do — a department, a
          regulator, a council. When a body turns up in more than one paper, its own page says what
          each paper asks of it. That is context drawn from other papers, never evidence about the one
          in front of you. <Link className="govuk-link" to={HUB}>See every body</Link>.
        </p>
      </div>
    </div>
  );
}
