import { useEffect, useId, useState, type ReactNode } from 'react';

/**
 * GOV.UK FRONTEND 6's SERVICE NAVIGATION, rendered by React (phase 21).
 *
 * The report's six views were a tab strip, and a tab strip is for sections of
 * ONE thing on one page. They are pages now, and the framework's pattern for
 * "the sections of this service, current one marked" is this component. The
 * markup is `components/service-navigation/template.njk` as written — the
 * `<strong>` fallback inside the current link included, because a reader who
 * overrides colours loses the underline bar and keeps the bold.
 *
 * NOT `govuk-frontend`'s ServiceNavigation CLASS, for the reason `Tabs` gave
 * before it: that class owns its state in the DOM, and React re-renders this on
 * every page change. Its whole behaviour is twelve lines — below `tablet` the
 * list hides behind a Menu button; from `tablet` the button hides and the list
 * shows — so it is restated here against the same attributes the class sets
 * (`hidden`, `aria-hidden`, `aria-expanded`), and `data-module` is left off so
 * a later `initAll()` cannot instantiate the class over the top of it.
 *
 * BEFORE SCRIPT RUNS the button carries `hidden` and the list does not — the
 * template's own no-JavaScript state — so the first paint never hides the
 * navigation from anyone.
 *
 * `render` keeps this folder router-free, as `Pagination`'s does: the report
 * tree imports from here and renders into a pack with no router in its bundle.
 */
export type ServiceNavItem = {
  href: string;
  text: string;
  /** This page is the item. `aria-current="page"`. */
  current?: boolean;
  /** This page is inside the item. `aria-current="true"`. */
  active?: boolean;
};

/** The framework's own breakpoint, as `getBreakpoint('tablet')` reads it. */
const TABLET = 641;

export function ServiceNavigation({ items, label = 'Menu', wide, render }: {
  items: ServiceNavItem[];
  /** Matches `Template`'s own `wide`, or the bar's contents stop short of the page's. */
  wide?: boolean;
  /** The `<nav>`'s name, which defaults to the button's text as the template's does. */
  label?: string;
  render?: (props: { href: string; className: string; current?: 'page' | 'true'; children: ReactNode }) => ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  /* null until measured: the template's no-JS state, button hidden, list shown. */
  const [narrow, setNarrow] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${TABLET}px)`);
    const apply = () => setNarrow(!query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /*
   * A CHOICE CLOSES THE MENU. On a phone the list is between the reader and
   * the page they asked for; the class never needed this because a real
   * navigation threw the whole document away, and a routed one does not.
   */
  const anchor = render ?? (({ href, className, current, children }) => (
    <a className={className} href={href} aria-current={current}>{children}</a>
  ));

  return (
    <div className="govuk-service-navigation">
      <div className={`govuk-width-container${wide ? ' govuk-width-container--wide' : ''}`}>
        <div className="govuk-service-navigation__container">
          <nav aria-label={label} className="govuk-service-navigation__wrapper">
            <button
              type="button"
              className="govuk-service-navigation__toggle govuk-js-service-navigation-toggle"
              aria-controls={listId}
              {...(narrow
                ? { 'aria-expanded': open }
                : { hidden: true, 'aria-hidden': true })}
              onClick={() => setOpen((was) => !was)}
            >
              Menu
            </button>
            <ul className="govuk-service-navigation__list" id={listId} hidden={narrow === true && !open}>
              {items.map((item) => {
                const marked = item.current || item.active;
                return (
                  <li
                    key={item.href}
                    className={`govuk-service-navigation__item${marked ? ' govuk-service-navigation__item--active' : ''}`}
                    onClick={() => setOpen(false)}
                  >
                    {anchor({
                      href: item.href,
                      className: 'govuk-service-navigation__link',
                      current: item.current ? 'page' : item.active ? 'true' : undefined,
                      children: marked
                        ? <strong className="govuk-service-navigation__active-fallback">{item.text}</strong>
                        : item.text,
                    })}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
