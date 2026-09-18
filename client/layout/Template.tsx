import type { ReactNode } from 'react';
import { cx } from '../govuk/cx';
import { PhaseBanner } from '../govuk/Feedback';

/** The service's own name. Not a government service, and it says so. */
export const SERVICE_NAME = 'Policy Red Team';

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
export function Template({ children, backLink, wide }: {
  children: ReactNode;
  backLink?: { href: string; text?: string };
  wide?: boolean;
}) {
  return (
    <>
      <a href="#main-content" className="govuk-skip-link" data-module="govuk-skip-link">
        Skip to main content
      </a>

      <header className="govuk-template__header">
        <div className="govuk-generic-header">
          <div className="govuk-generic-header__container govuk-width-container">
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
            <a href={backLink.href} className="govuk-back-link">{backLink.text ?? 'Back'}</a>
          </nav>
        ) : null}

        <main className="govuk-main-wrapper" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      <Footer />
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
function Footer() {
  return (
    <footer className="govuk-footer">
      <div className="govuk-width-container">
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
