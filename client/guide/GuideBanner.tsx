import { useId, useState } from 'react';
import { Link } from 'react-router';
import { GUIDE } from '../places';
import { bannerDismissed, rememberDismissed } from './remember';

/**
 * "NEW TO THESE REPORTS?" — offered once, then gone (phase 26, John's decision
 * of 5 October: a dismissible banner pointing at `/guide`, not a tour that
 * takes over the page).
 *
 * GOV.UK'S NOTIFICATION BANNER, the neutral variant, with markup from the
 * component's `template.njk`. Its `role="region"` and the heading it is
 * labelled by make it a landmark a screen reader can skip. The component has
 * no close control; the dismiss is the cookie banner's "Hide this message",
 * a secondary button, because that is the pattern GOV.UK readers already know
 * for "I have seen this".
 *
 * ITS OWN HEADING ID, not the shared component's fixed one: a failed run's
 * report page already carries a notification banner, and two elements with
 * `govuk-notification-banner-title` would label both landmarks with one name.
 *
 * Hiding it moves focus to the page's main content, because the button that
 * had focus has gone, and a keyboard user left on a removed element is put
 * back at the top of the document with nothing said.
 */
export function GuideBanner() {
  const [hidden, setHidden] = useState(() => bannerDismissed());
  const id = useId();
  if (hidden) return null;
  const titleId = `${id}-title`;
  return (
    <div className="govuk-notification-banner prt-guidebanner" role="region" aria-labelledby={titleId} data-module="govuk-notification-banner">
      <div className="govuk-notification-banner__header">
        <h2 className="govuk-notification-banner__title" id={titleId}>New to these reports?</h2>
      </div>
      <div className="govuk-notification-banner__content">
        <p className="govuk-notification-banner__heading">
          Learn to read a red-team report in six short steps.{' '}
          <Link className="govuk-notification-banner__link" to={GUIDE}>How to read a red-team report</Link>
        </p>
        <button
          type="button"
          className="govuk-button govuk-button--secondary govuk-!-margin-bottom-0"
          data-module="govuk-button"
          onClick={() => {
            rememberDismissed();
            setHidden(true);
            document.getElementById('main-content')?.focus({ preventScroll: true });
          }}
        >
          Hide this message
        </button>
      </div>
    </div>
  );
}
