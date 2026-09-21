import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { cx } from './cx';

/**
 * The error summary — the single most important accessibility component here.
 *
 * On submit it must take focus, so a screen-reader user hears what went wrong
 * instead of being left where they were, and each link must move focus to the
 * field it names. That focus move is the component's whole job, which is why it
 * is done here and not left to every form that uses it.
 */
export function ErrorSummary({ title = 'There is a problem', errors }: {
  title?: string;
  errors: { text: string; href: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  /*
   * KEYED ON WHAT IT SAYS, NOT ON HOW MANY THINGS IT SAYS.
   *
   * This depended on `errors.length`, which does not change when one error
   * replaces another — so a reader who fixes the first problem in a form and
   * submits into a second one gets a summary that appears silently and does not
   * take focus. On a one-thing-per-page journey that is most of the time: the
   * forms have one field, so the count is almost always exactly one.
   */
  const signature = errors.map((e) => e.text).join('\u0000');
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [signature, errors.length]);

  if (!errors.length) return null;
  return (
    <div className="govuk-error-summary" data-module="govuk-error-summary" ref={ref} tabIndex={-1}>
      {/* role="alert" belongs on this INNER container and not on the one that
          takes focus. govuk-frontend's own template says why: putting both on one
          element races the focus against the announcement, and the screen reader
          drops what it was about to read. Having it on both — which is what this
          component did until a browser walk found two elements where it expected
          one — reintroduces exactly the bug the child container exists to avoid. */}
      <div role="alert">
        <h2 className="govuk-error-summary__title">{title}</h2>
        <div className="govuk-error-summary__body">
          <ul className="govuk-list govuk-error-summary__list">
            {errors.map((error, i) => (
              <li key={i}><a href={error.href}>{error.text}</a></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * A banner for something that just happened.
 *
 * `success` gets `role="alert"`; the neutral variant gets `role="region"`,
 * because announcing every informational banner interrupts whatever is being
 * read. That distinction is GOV.UK's, and it is the reason the component takes a
 * type rather than a colour.
 */
export function NotificationBanner({ type, title, children }: {
  type?: 'success';
  title?: string;
  children: ReactNode;
}) {
  const heading = title ?? (type === 'success' ? 'Success' : 'Important');
  return (
    <div
      className={cx('govuk-notification-banner', type === 'success' && 'govuk-notification-banner--success')}
      role={type === 'success' ? 'alert' : 'region'}
      aria-labelledby="govuk-notification-banner-title"
      data-module="govuk-notification-banner"
    >
      <div className="govuk-notification-banner__header">
        <h2 className="govuk-notification-banner__title" id="govuk-notification-banner-title">{heading}</h2>
      </div>
      <div className="govuk-notification-banner__content">{children}</div>
    </div>
  );
}

/** The confirmation panel at the end of a journey. */
export function Panel({ title, children, level = 1 }: {
  title: ReactNode;
  children?: ReactNode;
  /**
   * GOV.UK's panel is an `h1` because it is a confirmation page's own heading —
   * the page IS the panel. On the DESIGN GALLERY it is an example among twenty,
   * under a heading of its own, and rendering it as written put a second level-1
   * heading on the page. axe does not flag that; a screen-reader user hears two
   * top-level headings and cannot tell which one the page is about.
   */
  level?: 1 | 2 | 3;
}) {
  const Heading = `h${level}` as 'h1' | 'h2' | 'h3';
  return (
    <div className="govuk-panel govuk-panel--confirmation">
      <Heading className="govuk-panel__title">{title}</Heading>
      {children ? <div className="govuk-panel__body">{children}</div> : null}
    </div>
  );
}

/** Says what this service is and is not. Shown on every page. */
export function PhaseBanner({ tag = 'Prototype', children }: { tag?: string; children: ReactNode }) {
  return (
    <div className="govuk-phase-banner">
      <p className="govuk-phase-banner__content">
        <strong className="govuk-tag govuk-phase-banner__content__tag">{tag}</strong>
        <span className="govuk-phase-banner__text">{children}</span>
      </p>
    </div>
  );
}

export function InsetText({ children }: { children: ReactNode }) {
  return <div className="govuk-inset-text">{children}</div>;
}

/** The visually hidden "Warning" is what makes this more than a bold paragraph. */
export function WarningText({ children, iconFallback = 'Warning' }: { children: ReactNode; iconFallback?: string }) {
  return (
    <div className="govuk-warning-text">
      <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
      <strong className="govuk-warning-text__text">
        <span className="govuk-visually-hidden">{iconFallback}</span>
        {children}
      </strong>
    </div>
  );
}
