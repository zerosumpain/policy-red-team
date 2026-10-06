import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { GLOSSARY } from '$lib/plain-words';
import { Details, InsetText, Pagination } from '../govuk';
import { usePageTitle } from '../layout/Template';
import { MOVES } from '../moves';
import { GUIDE } from '../places';
import { BodiesClash } from '../guide/BodiesClash';
import { BuildBand } from '../guide/BuildBand';
import { CHAPTERS, chapterByNumber, chapterPath, MINI_POLICY, type Chapter } from '../guide/content';
import { MiniStress } from '../guide/MiniStress';
import { PaperToParts } from '../guide/PaperToParts';
import { PlainPlay } from '../guide/PlainPlay';
import { StoryOpening } from '../guide/StoryOpening';

/**
 * "HOW TO READ A RED-TEAM REPORT" (phase 26) — six chapters, one screen and
 * one thing to press each, on one made-up policy.
 *
 * Phase 24 put a short page at this address so the navigation item had
 * somewhere true to go; this is the guide that page promised, at the same
 * `/guide`, with a chapter per URL (`/guide/1` … `/guide/6`) so a "?" in a
 * report can open the one that answers its figure, Back works, and a chapter
 * can be sent to a colleague.
 *
 * THE DESIGN STANCE. GOV.UK components stay for everything a reader ACTS on —
 * the buttons, the checkboxes, the contents list, previous and next. The
 * figures are an explainer layer with their own SVG and motion, built on the
 * report's band ramp and type scale so the two read as one system. Every
 * animation has a static end state, the words of the chapter say what the
 * figure shows, and anything that moves for more than five seconds can be
 * paused (`parts/_guide.scss`, `parts/_motion.scss`).
 *
 * The words each chapter teaches are `takeaway` in `client/guide/content.ts`,
 * which the offline pack prints too — the pack has no guide, so its "How to
 * read this report" is those paragraphs and the band key, and cannot drift
 * from what the guide says.
 */
const GUIDE_TITLE = 'How to read a red-team report';

/** The interactive idea each chapter is built around. */
const FIGURE: Record<number, () => ReactNode> = {
  1: () => <StoryOpening />,
  2: () => <PaperToParts />,
  3: () => <PlainPlay />,
  4: () => <BuildBand />,
  5: () => <MiniStress />,
  6: () => <BodiesClash />,
};

/** One line before each figure: what to do with it. */
const PROMPT: Record<number, string> = {
  1: 'Scroll through the story. The picture follows the words.',
  2: 'Read the paper one sentence at a time and watch what each gives up.',
  3: 'This is how the report shows one way to beat the made-up policy.',
  4: 'Move the sliders. They start on the way to beat it from the last chapter.',
  5: 'Switch an assumption off and watch what changes.',
  6: 'Three made-up policies. One body is in two of them.',
};

/**
 * THE CONTENTS, as GOV.UK's guide pages draw them: a numbered list of links,
 * the current chapter marked and not linked. A `nav` with its own name, so it
 * is not confused with the pagination landmark at the foot of the page.
 */
function ChapterList({ current }: { current?: number }) {
  return (
    <nav className="prt-guidenav" aria-label="Chapters of the guide">
      <h2 className="govuk-heading-s prt-guidenav__title">Contents</h2>
      <ol className="prt-guidenav__list">
        {CHAPTERS.map((chapter) => (
          <li key={chapter.n} className={`prt-guidenav__item${chapter.n === current ? ' prt-guidenav__item--current' : ''}`}>
            <span className="prt-guidenav__n" aria-hidden="true">{chapter.n}</span>
            {chapter.n === current ? (
              <span aria-current="page">{chapter.title}</span>
            ) : (
              <Link className="govuk-link" to={chapterPath(chapter)}>{chapter.title}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const routed = ({ href, className, rel, children }: { href: string; className: string; rel: string; children: ReactNode }) => (
  <Link className={className} to={href} rel={rel}>{children}</Link>
);

export function Guide() {
  usePageTitle(GUIDE_TITLE);
  const first = CHAPTERS[0];
  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds-from-desktop">
        <h1 className="govuk-heading-xl">{GUIDE_TITLE}</h1>
        <p className="govuk-body-l">
          Six short chapters, each with one thing to try. Together they show how to read what a report
          says and how far to trust it.
        </p>
        <InsetText>
          Every example uses one made-up policy, <strong>{MINI_POLICY.title}</strong>:{' '}
          {MINI_POLICY.blurb} It is not from any real paper or assessment.
        </InsetText>
        <ol className="govuk-list govuk-list--spaced prt-guideindex">
          {CHAPTERS.map((chapter) => (
            <li key={chapter.n} className="prt-guideindex__item">
              <span className="prt-guidenav__n" aria-hidden="true">{chapter.n}</span>
              <span>
                <Link className="govuk-link govuk-!-font-weight-bold" to={chapterPath(chapter)}>{chapter.title}</Link>
                <br />
                <span className="govuk-body-s prt-meta">{chapter.question}</span>
              </span>
            </li>
          ))}
        </ol>
        <Link to={chapterPath(first)} role="button" draggable={false} className="govuk-button govuk-button--start" data-module="govuk-button">
          Start the guide
          <svg className="govuk-button__start-icon" xmlns="http://www.w3.org/2000/svg" width="17.5" height="19" viewBox="0 0 33 40" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M0 0h13l20 20-20 20H0l20-20z" />
          </svg>
        </Link>

        <h2 className="govuk-heading-m">The short version</h2>
        <Details summary="The sections of a report, and the question each answers">
          <dl className="govuk-summary-list">
            {MOVES.map((move) => (
              <div key={move.id} className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">{move.label}</dt>
                <dd className="govuk-summary-list__value">{move.hint}</dd>
              </div>
            ))}
          </dl>
        </Details>
        <Details summary="What these words mean">
          <dl className="govuk-summary-list">
            {GLOSSARY.map((entry) => (
              <div key={entry.term} className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">{entry.term}</dt>
                <dd className="govuk-summary-list__value">{entry.meaning}</dd>
              </div>
            ))}
          </dl>
        </Details>
      </div>
    </div>
  );
}

export function GuideChapter({ n }: { n: number }) {
  const chapter = chapterByNumber(n) as Chapter;
  usePageTitle(`${chapter.title} — ${GUIDE_TITLE}`);
  const previous = chapterByNumber(n - 1);
  const next = chapterByNumber(n + 1);
  return (
    <div className="prt-guidepage">
      <span className="govuk-caption-l">{GUIDE_TITLE} · {n} of {CHAPTERS.length}</span>
      <h1 className="govuk-heading-xl">{chapter.title}</h1>
      <div className="prt-guidepage__layout">
        <ChapterList current={n} />
        <div className="prt-guidepage__main">
          {chapter.takeaway.map((paragraph, i) => (
            <p key={i} className={i === 0 ? 'govuk-body-l' : 'govuk-body'}>{paragraph}</p>
          ))}
          <p className="govuk-body prt-guidepage__prompt"><strong>Try it.</strong> {PROMPT[n]}</p>
          <div className="prt-guidepage__figure">{FIGURE[n]()}</div>
          <Pagination
            label="Previous and next chapter"
            previous={previous ? { href: chapterPath(previous), title: 'Previous', label: previous.title } : { href: GUIDE, title: 'Previous', label: 'About this guide' }}
            next={next ? { href: chapterPath(next), title: 'Next', label: next.title } : { href: '/', title: 'Next', label: 'Your assessments' }}
            render={routed}
          />
        </div>
      </div>
    </div>
  );
}
