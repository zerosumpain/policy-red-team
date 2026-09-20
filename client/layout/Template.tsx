import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import { cx } from '../govuk/cx';
import { PhaseBanner } from '../govuk/Feedback';

/** The service's own name. Not a government service, and it says so. */
export const SERVICE_NAME = 'Policy Red Team';

/**
 * WHAT A DOCUMENT NAVIGATION USED TO DO FOR FREE.
 *
 * Every link in this app was near the top of its own page until the drill
 * arrived, and the drill is reached from a table well down a long report. A
 * client-side navigation moves neither the scroll position nor the focus, so
 * without this a reader clicking a play name lands PARTWAY DOWN the new page,
 * below its own heading, with focus still on `<body>` and nothing announced.
 * The browser did all three when the back link was a plain `<a href>`; swapping
 * it for the router's `Link` is what took them away, so this is the other half
 * of that change rather than a separate improvement.
 *
 * `#main-content` already carries `tabindex="-1"` for the skip link, so it can
 * take focus; `preventScroll` because the scroll has just been set deliberately.
 * Arrival is skipped — the browser has only just loaded the document, and moving
 * focus out of nowhere on arrival is its own kind of rude.
 *
 * THAT FLAG IS AT MODULE SCOPE, not in a ref, and the first version of this had
 * it in a ref and therefore did nothing at all. Each route renders its own
 * `<Template>`, so React unmounts one and mounts another on every navigation and
 * a per-instance "have we landed yet" is false every single time. Arrival is a
 * property of the DOCUMENT, and this module is evaluated once per document.
 */
let arrived = false;

function useRouteChange(transient: boolean) {
  const { pathname } = useLocation();
  useEffect(() => {
    /*
     * A LOADING PLACEHOLDER IS NOT AN ARRIVAL, and this is subtle enough to have
     * shipped once already. Every page but the landing one is code-split, so a
     * cold load renders `App`'s Suspense fallback first — and the fallback draws
     * this same component. Its effect claimed `arrived`, so when the real page
     * mounted a moment later the flag was already true and it was treated as a
     * NAVIGATION: focus moved into `#main-content`, which has `tabindex="-1"`, so
     * the first Tab on a freshly loaded page went to the first focusable element
     * AFTER the main element — a footer link, past the skip link and past the
     * whole page. Measured on /about, /new, /personas, /design and /accessibility.
     */
    if (transient) return;
    if (!arrived) { arrived = true; return; }
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname, transient]);
}

/**
 * What the browser tab says.
 *
 * Called by the page rather than derived here, because the two pages whose name
 * is worth having — an assessment and an artefact — only know it once their data
 * has loaded, which is after any effect of this component has run. A tab reading
 * "Policy Red Team" eight times over is the thing that makes "open three
 * findings in three tabs" — the argument for the drill being a page at all —
 * not actually work.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${SERVICE_NAME}` : SERVICE_NAME;
  }, [title]);
}

/**
 * The page shell.
 *
 * Three things here are not styling choices:
 *
 *   THE SKIP LINK IS FIRST IN THE DOCUMENT and points at `#main-content`, which
 *   carries `tabindex="-1"` so focus can actually land there. A skip link that
 *   targets an element that cannot take focus moves the viewport and leaves the
 *   focus ring behind, which is worse than not having one.
 *
 *   NO CROWN, NO ROYAL ARMS, NO GDS TRANSPORT. This uses GOV.UK Frontend 6's
 *   "generic header", added for exactly this case: a service in the style of
 *   GOV.UK that is not on GOV.UK. Those three assets belong to services that are.
 *
 *   `<main>` IS LANDMARKED and the phase banner sits outside it, so a reader
 *   skipping to the main content skips the "this is not a government service"
 *   notice rather than having to hear it on every page.
 */
export function Template({ children, backLink, wide, transient }: {
  children: ReactNode;
  backLink?: { href: string; text?: string };
  wide?: boolean;
  /**
   * This render is a placeholder for a page still loading, not the page.
   *
   * It suppresses the route-change behaviour, because a fallback that claims the
   * document's one "arrival" makes the real page look like a navigation to it.
   */
  transient?: boolean;
}) {
  useRouteChange(!!transient);
  return (
    <>
      <a href="#main-content" className="govuk-skip-link" data-module="govuk-skip-link">
        Skip to main content
      </a>

      <header className="govuk-template__header">
        <div className="govuk-generic-header">
          {/* The SAME modifier the body container takes. The logo bar had a
              plain width container, so on a wide page it stopped 120px inside
              the content it sits above — a step nobody chose, invisible for as
              long as `--wide` had no rule at all. */}
          <div className={cx('govuk-generic-header__container govuk-width-container', wide && 'govuk-width-container--wide')}>
            <div className="govuk-generic-header__logo">
              <a href="/" className="govuk-generic-header__homepage-link">
                <span className="prt-logotype">{SERVICE_NAME}</span>
                <strong className="govuk-tag govuk-tag--yellow prt-logotype-tag">Prototype</strong>
              </a>
            </div>
          </div>
        </div>
        {/* Inside the banner landmark, not loose between it and <main>. axe's
            "region" rule wants every piece of content inside a landmark, and a
            phase banner floating between two of them is content nobody owns. */}
        <div className={cx('govuk-width-container', wide && 'govuk-width-container--wide')}>
          <PhaseBanner>
            This is a personal tool, not a government service. It reads a policy paper as an
            adversary would; it is not an assurance review and it is not advice.
          </PhaseBanner>
        </div>
      </header>

      <div className={cx('govuk-width-container', wide && 'govuk-width-container--wide')}>
        {/* A back link IS navigation, and wrapping it says so — which both puts it
            in a landmark and gives a screen-reader user a way to find it. */}
        {backLink ? (
          <nav aria-label="Back">
            {/* The router's Link, not a plain anchor. The drill made this matter:
                stepping back out of an artefact with an <a href> reloads the whole
                app and refetches the assessment to render a page the browser was
                already holding. Every Template is inside the router, so this is
                always safe here — the offline pack builds its own shell. */}
            <Link to={backLink.href} className="govuk-back-link">{backLink.text ?? 'Back'}</Link>
          </nav>
        ) : null}

        <main className="govuk-main-wrapper" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Footer wide={wide} />
    </>
  );
}

/**
 * The footer, without the crown or the royal arms.
 *
 * GOV.UK's own footer renders both. This one keeps the layout and the meta links
 * and drops the emblems, which is the same choice local-plan-navigator made and
 * for the same reason.
 */
function Footer({ wide }: { wide?: boolean }) {
  return (
    <footer className="govuk-footer">
      <div className={cx('govuk-width-container', wide && 'govuk-width-container--wide')}>
        <div className="govuk-footer__meta">
          <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
            <h2 className="govuk-visually-hidden">Support links</h2>
            <ul className="govuk-footer__inline-list">
              <li className="govuk-footer__inline-list-item">
                <a className="govuk-footer__link" href="/accessibility">Accessibility statement</a>
              </li>
              <li className="govuk-footer__inline-list-item">
                <a className="govuk-footer__link" href="/about">About this tool</a>
              </li>
              <li className="govuk-footer__inline-list-item">
                <a className="govuk-footer__link" href="/personas">Persona library</a>
              </li>
              <li className="govuk-footer__inline-list-item">
                <a className="govuk-footer__link" href="/design">Design system</a>
              </li>
              <li className="govuk-footer__inline-list-item">
                <a className="govuk-footer__link" href="/admin">Configuration</a>
              </li>
            </ul>
            <p className="govuk-footer__meta-custom">
              Built with the{' '}
              <a className="govuk-footer__link" href="https://design-system.service.gov.uk/" rel="external">
                GOV.UK Design System
              </a>{' '}
              under the MIT Licence. The GOV.UK crown, the royal arms and the GDS Transport
              typeface are not used: they belong to services on GOV.UK.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
