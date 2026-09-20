import type { ReactNode } from 'react';

/**
 * PREVIOUS AND NEXT, IN THE PATTERN GOV.UK ALREADY SHIPS FOR IT.
 *
 * The drill tells a reader a play is rank 3 of 47 and gives them no way to read
 * rank 4. Move 3 invites exactly that reading — a ranked list of 47 behind a
 * "Show all 47" control — and following it one play at a time cost a round trip
 * through the report for every step: back link, find your place in a 47-row
 * table, click the next name, wait for the fetch.
 *
 * There was no next/previous anywhere in the application. `client/govuk/`
 * exported eleven components and stopped, and GOV.UK ships a Pagination for
 * precisely this. The BLOCK variant is the one that belongs here: it is the
 * "part of a series" shape, where each step is named, rather than the numbered
 * shape for pages of a list.
 *
 * NO STYLESHEET. `client/styles/_govuk.scss` imports the framework's whole
 * index with `$govuk-global-styles: true`, so `.govuk-pagination--block` and
 * its icons are already in the bundle. That was checked before a partial was
 * written rather than after.
 *
 * `render` IS HOW THIS STAYS ROUTER-FREE. Everything in this folder is imported
 * by the report tree as well as by the pages, and the report tree also renders
 * into the offline pack, which has no router in its bundle at all. The default
 * is a plain anchor; the drill passes the router's `Link`, which is what stops
 * a step between two plays reloading the whole application to move one page.
 */
export type PaginationLink = {
  href: string;
  /** "Previous" / "Next", plus whatever the caller wants read as the title. */
  title: string;
  /** What is at the other end — the neighbour's own rank and name. */
  label?: string;
};

const PREV_PATH = 'm6.5938-0.0078125-6.7266 6.7266 6.7441 6.4062 1.377-1.449-4.1856-3.9768h12.896v-2h-12.984l4.2931-4.293-1.414-1.414z';
const NEXT_PATH = 'm8.107-0.0078125-1.4136 1.414 4.2926 4.293h-12.986v2h12.896l-4.1855 3.9766 1.377 1.4492 6.7441-6.4062-6.7246-6.7266z';

function Arrow({ kind }: { kind: 'prev' | 'next' }) {
  return (
    <svg
      className={`govuk-pagination__icon govuk-pagination__icon--${kind}`}
      xmlns="http://www.w3.org/2000/svg"
      height="13"
      width="15"
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 15 13"
    >
      <path d={kind === 'prev' ? PREV_PATH : NEXT_PATH} />
    </svg>
  );
}

export function Pagination({ previous, next, label = 'Pagination', render }: {
  previous?: PaginationLink | null;
  next?: PaginationLink | null;
  /**
   * The landmark's name. It defaults to "Pagination" and should not on a page
   * that has more than one navigation landmark — two `<nav>` elements a screen
   * reader cannot tell apart is axe's `landmark-unique`, which this repo has
   * been caught by once already in the report's five contents lists.
   */
  label?: string;
  render?: (props: { href: string; className: string; rel: string; children: ReactNode }) => ReactNode;
}) {
  // Nothing either side is not an empty control, it is no control.
  if (!previous && !next) return null;
  const anchor = render ?? (({ href, className, rel, children }) => (
    <a className={className} href={href} rel={rel}>{children}</a>
  ));

  const arm = (link: PaginationLink, kind: 'prev' | 'next') => (
    <div className={`govuk-pagination__${kind}`}>
      {anchor({
        href: link.href,
        className: 'govuk-link govuk-pagination__link',
        rel: kind,
        children: (
          <>
            <Arrow kind={kind} />
            <span className="govuk-pagination__link-title">{link.title}</span>
            {link.label ? (
              <>
                {/* The colon is the framework's own: it is what makes a screen
                    reader announce "Next: 4. Fee-setting …" as one destination
                    rather than as two unrelated strings. */}
                <span className="govuk-visually-hidden">:</span>
                <span className="govuk-pagination__link-label">{link.label}</span>
              </>
            ) : null}
          </>
        ),
      })}
    </div>
  );

  return (
    <nav className="govuk-pagination govuk-pagination--block" aria-label={label}>
      {previous ? arm(previous, 'prev') : null}
      {next ? arm(next, 'next') : null}
    </nav>
  );
}
