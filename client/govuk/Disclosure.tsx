import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
// STATIC, not dynamic. A `void import('govuk-frontend')` here pulled in Vite's
// __vitePreload helper, whose whole job is to build a <link rel="stylesheet">
// and fetch it — which is fine on the web and fatal in the offline pack, where
// there is no network and no sibling file to fetch. The pack test caught it.
// govuk-frontend is a direct dependency and already in the bundle; importing it
// statically costs a few kilobytes and removes the helper entirely.
import { Accordion as GovukAccordion } from 'govuk-frontend';

/**
 * Progressive disclosure, for one thing.
 *
 * A native `<details>`: it discloses without JavaScript, is keyboard-operable for
 * free, and replaces the hover-peek card the site version uses — which fails
 * WCAG 2.2 outright, because content that appears on hover and cannot be reached
 * by keyboard is not available to everyone.
 */
export function Details({ summary, children, open }: { summary: ReactNode; children: ReactNode; open?: boolean }) {
  return (
    <details className="govuk-details" open={open}>
      <summary className="govuk-details__summary">
        <span className="govuk-details__summary-text">{summary}</span>
      </summary>
      <div className="govuk-details__text">{children}</div>
    </details>
  );
}

/**
 * Progressive disclosure for a set — the stage guide, and the report's sections.
 *
 * GOV.UK Frontend's accordion is one of the components with real behaviour
 * (show/hide all, remembering what was open), so it is initialised from the
 * framework rather than reimplemented. It degrades to a set of open sections
 * without JavaScript, which is why the markup is complete before it runs.
 */
export function Accordion({ id, sections }: {
  id: string;
  sections: { heading: ReactNode; summary?: ReactNode; content: ReactNode }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    // It throws if the browser is not supported, which is a reason to leave the
    // sections open rather than a reason to break the page.
    try {
      new GovukAccordion(ref.current);
    } catch {
      /* the markup is complete without it */
    }
  }, []);

  return (
    <div className="govuk-accordion" data-module="govuk-accordion" id={id} ref={ref}>
      {sections.map((section, i) => (
        <div className="govuk-accordion__section" key={i}>
          <div className="govuk-accordion__section-header">
            <h2 className="govuk-accordion__section-heading">
              <span className="govuk-accordion__section-button" id={`${id}-heading-${i + 1}`}>
                {section.heading}
              </span>
            </h2>
            {section.summary ? (
              <div className="govuk-accordion__section-summary govuk-body" id={`${id}-summary-${i + 1}`}>
                {section.summary}
              </div>
            ) : null}
          </div>
          <div id={`${id}-content-${i + 1}`} className="govuk-accordion__section-content">
            {section.content}
          </div>
        </div>
      ))}
    </div>
  );
}
