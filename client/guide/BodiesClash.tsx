import { useId, useState } from 'react';
import { Link } from 'react-router';
import { HUB, hubPath } from '../places';
import { asksOf, CLASH_BODY, MINI_PAPERS, REGISTER_EXAMPLE } from './content';
import { useReducedMotion } from './motion';

/**
 * CHAPTER 6: ONE BODY, TWO PAPERS, TWO JOBS THAT DO NOT FIT.
 *
 * Three made-up papers side by side. Local councils turn up in two of them,
 * and the lines from the body to each paper draw in, then the two asks pulse
 * once — "check clubs" here, "run clubs" there — which is the clash the
 * Bodies across policies hub finds across real papers. It plays ONCE, in
 * under three seconds, so it needs no pause control (WCAG 2.2.2 is about
 * motion that lasts more than five); "Show the clash again" replays it, and
 * under reduced motion the end state is simply there.
 *
 * WORDS IN HTML, LINES IN SVG. The papers and the body are HTML cards so they
 * reflow at 320px; the connectors are an SVG stretched under them, drawn only
 * from tablet up, where the three papers sit in a row and a line has
 * somewhere to go. On a phone the cards stack and the asks to the council are
 * marked in the text, which says the same thing.
 *
 * Then the register's two ideas in ONE PICTURE, drawn at phone width so its
 * type stays legible: a team is PART OF a council (structure), a county
 * council is a KIND OF local council (category).
 */
export function BodiesClash() {
  const reduced = useReducedMotion();
  const [run, setRun] = useState(0);
  const asks = asksOf(CLASH_BODY);
  const id = useId();

  return (
    <>
      <div className={`prt-clash${reduced ? ' is-still' : ''}`} key={run}>
        <ol className="prt-clash__papers" aria-label="Three made-up policies">
          {MINI_PAPERS.map((paper) => {
            const named = paper.asks.some((a) => a.body === CLASH_BODY);
            return (
              <li key={paper.id} className={`prt-clash__paper${named ? ' is-named' : ''}`}>
                <p className="prt-clash__title">{paper.title}</p>
                <ul className="prt-clash__asks">
                  {paper.asks.map((a) => (
                    <li key={a.body} className={a.body === CLASH_BODY ? 'prt-clash__ask is-clash' : 'prt-clash__ask'}>
                      <strong>{a.body}:</strong> {a.ask}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
        <svg className="prt-clash__lines" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <line className="prt-clash__line" x1="100" y1="40" x2="50" y2="0" vectorEffect="non-scaling-stroke" />
          <line className="prt-clash__line" x1="100" y1="40" x2="150" y2="0" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="prt-clash__body">
          <p className="prt-clash__bodyname">{CLASH_BODY}</p>
          <p className="govuk-body-s govuk-!-margin-bottom-0">
            named in {asks.length} of {MINI_PAPERS.length} papers
          </p>
        </div>
        <div className="prt-clash__verdict">
          <p className="govuk-body govuk-!-margin-bottom-1"><strong>A clash:</strong></p>
          <ul className="govuk-list prt-clash__pair">
            {asks.map(({ paper, ask }) => (
              <li key={paper.id}><span className="prt-clash__chip">{ask}</span> <span className="prt-meta">in {paper.title}</span></li>
            ))}
          </ul>
          <p className="govuk-body-s govuk-!-margin-bottom-0">
            If the same council team does both, it checks its own work.
          </p>
        </div>
      </div>
      <p className="govuk-body govuk-!-margin-top-3">
        {/* A new key remounts the figure, which restarts its CSS animations from the top. */}
        <button type="button" className="prt-linkbutton" onClick={() => setRun((n) => n + 1)}>
          Show the clash again
        </button>
      </p>

      <h2 className="govuk-heading-m">One list of bodies, two kinds of link</h2>
      <p className="govuk-body">
        Every body any paper names is matched to one entry on a single list, so the council in one
        paper and the council in the next are the same row. Two kinds of link keep the list in order.
      </p>
      <figure className="prt-figure-guide">
        <svg className="prt-register" viewBox="0 0 320 214" role="img" aria-labelledby={`${id}-rt ${id}-rd`} focusable="false">
          <title id={`${id}-rt`}>Part of and kind of</title>
          <desc id={`${id}-rd`}>
            {`${REGISTER_EXAMPLE.partOf.child} is part of ${REGISTER_EXAMPLE.partOf.parent.toLowerCase()}: a piece of its structure. ${REGISTER_EXAMPLE.kindOf.child} are a kind of ${REGISTER_EXAMPLE.kindOf.parent.toLowerCase()}: a category it belongs to.`}
          </desc>
          <defs>
            <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="#0b0c0c" />
            </marker>
          </defs>
          {/* Part of: a box inside a box, because structure is containment. */}
          <text className="prt-register__head" x="8" y="18">Part of</text>
          <rect className="prt-register__outer" x="8" y="28" width="304" height="72" rx="6" />
          <text className="prt-register__label" x="20" y="48">{REGISTER_EXAMPLE.partOf.parent}</text>
          <rect className="prt-register__inner" x="36" y="58" width="200" height="32" rx="4" />
          <text className="prt-register__label" x="48" y="79">{REGISTER_EXAMPLE.partOf.child}</text>
          {/* Kind of: an arrow up to a category, because a category is not a container. */}
          <text className="prt-register__head" x="8" y="128">Kind of</text>
          <rect className="prt-register__cat" x="8" y="138" width="140" height="32" rx="16" />
          <text className="prt-register__label" x="78" y="159" textAnchor="middle">{REGISTER_EXAMPLE.kindOf.parent}</text>
          <line x1="232" y1="180" x2="152" y2="160" stroke="#0b0c0c" strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
          <rect className="prt-register__inner" x="172" y="176" width="140" height="32" rx="4" />
          <text className="prt-register__label" x="242" y="197" textAnchor="middle">{REGISTER_EXAMPLE.kindOf.child}</text>
        </svg>
        <figcaption className="govuk-body prt-figure-guide__caption">
          <strong>Part of</strong> is structure: {REGISTER_EXAMPLE.partOf.child.toLowerCase()} is part of {REGISTER_EXAMPLE.partOf.parent.toLowerCase()}.{' '}
          <strong>Kind of</strong> is category: {REGISTER_EXAMPLE.kindOf.child.toLowerCase()} are a kind of {REGISTER_EXAMPLE.kindOf.parent.toLowerCase()}.
        </figcaption>
      </figure>
      <p className="govuk-body">
        <Link className="govuk-link" to={HUB}>See every body in Bodies across policies</Link>, or go
        straight to <Link className="govuk-link" to={hubPath('clashes')}>the clashes your papers have</Link>.
      </p>
    </>
  );
}
