import { useEffect, useState, type ReactNode } from 'react';

/**
 * SECTIONS OF ONE THING, which is what the framework's Tabs are for.
 *
 * Not steps of a journey — GOV.UK is explicit that a sequence belongs in a
 * journey, not behind tabs. The report is the legitimate case: one assessment,
 * four questions a reader might arrive with, and no order in which they must be
 * answered.
 *
 * THE STEP NUMBER IS THE ONE ADDITION. "Move 1 / Verdict" says the first four
 * are an order worth reading in without making them a journey you cannot leave.
 * Everything else — the roles, the keyboard behaviour, the styling — is the
 * framework's.
 *
 * CONTROLLED, AND NOT `govuk-frontend`'s Tabs CLASS. The published component
 * owns its own selected state in the DOM, which fights React and, worse, fights
 * the selection carried across the views: choosing a mechanism in Causality has
 * to be able to move the reader to Threats with that filter intact, and a
 * component that only responds to its own clicks cannot do that. So the ARIA and
 * the key handling are implemented here against the framework's own markup
 * contract, and the class is deliberately not instantiated.
 *
 * THERE IS NO NO-JAVASCRIPT FALLBACK HERE, and claiming one would be a lie: this
 * client is a single-page React app, so with script off nothing renders at all.
 * The framework's fallback exists for a server-rendered page and does not
 * transfer. What DOES transfer is its narrow-width behaviour, below — the
 * framework tears the tabs down under `tablet` and shows every panel, and a
 * component that kept desktop tab semantics on a phone would be showing the
 * framework's mobile document presentation while hiding five sixths of it.
 */
export type Tab = {
  id: string;
  /** "Verdict". The label a reader scans for. */
  label: string;
  /** "Move 1", "Provenance". Printed above the label; omit for no step. */
  step?: string;
  panel: ReactNode;
};

/**
 * The framework's own breakpoint, in pixels.
 *
 * `tabs.mjs` watches `(min-width: tablet)` and calls `teardown()` below it,
 * stripping every role and un-hiding every panel; the CSS agrees, putting the
 * whole tab-strip treatment inside the same media query and rendering the list
 * as em-dash bullets under it. Matching the number here keeps one behaviour
 * rather than two that disagree about what a phone is.
 */
const TABLET = 641;

export function Tabs({ id, label, tabs, current, onSelect }: {
  id: string;
  /** Names the tab list for anyone not looking at it. */
  label: string;
  tabs: Tab[];
  current: string;
  onSelect: (id: string) => void;
}) {
  const index = Math.max(0, tabs.findIndex((t) => t.id === current));

  /*
   * BELOW TABLET THIS IS A DOCUMENT, NOT A TAB STRIP — the same decision the
   * framework makes, for the same reason: on a phone there is no room for a
   * strip, so the list becomes an index and every section is simply present.
   * Keeping the roles and the `hidden` attribute at every width would hide five
   * sixths of the report behind a control the stylesheet has stopped drawing.
   */
  const [stripped, setStripped] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${TABLET}px)`);
    const apply = () => setStripped(!query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /*
   * ARROW KEYS MOVE, AND MOVING SELECTS. That is the framework's behaviour and
   * the WAI-ARIA authoring practice for a tab list whose panels are cheap to
   * render: a reader arrowing along the spine sees each view as they pass it.
   * Home and End are included because a six-tab spine is long enough to want
   * them, and they cost one line each.
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1 };
    let next: number | null = null;
    if (event.key in moves) next = (index + moves[event.key] + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    onSelect(tabs[next].id);
    // Focus follows selection, or the reader is left tabbing from a control
    // that is no longer current.
    document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
  };

  /*
   * NO `data-module` ON THE ROOT. That attribute would tell `initAll()` to
   * instantiate govuk-frontend's Tabs against this markup, and its constructor
   * requires `a.govuk-tabs__tab` — it throws an ElementError on a button. The
   * class is deliberately not used, so the hook it looks for is gone too rather
   * than left as a trap for whoever adds `initAll()` later.
   */
  return (
    <div className="govuk-tabs">
      <h2 className="govuk-tabs__title">{label}</h2>
      <ul
        className="govuk-tabs__list"
        {...(stripped ? {} : { role: 'tablist', 'aria-label': label, onKeyDown })}
      >
        {tabs.map((tab) => {
          const selected = tab.id === current;
          return (
            <li key={tab.id} className={`govuk-tabs__list-item${selected ? ' govuk-tabs__list-item--selected' : ''}`} role="presentation">
              <button
                type="button"
                id={`${id}-tab-${tab.id}`}
                className="govuk-tabs__tab prt-tab"
                {...(stripped
                  ? {}
                  : { role: 'tab', 'aria-controls': `${id}-panel-${tab.id}`, 'aria-selected': selected })}
                // ONE STOP FOR THE WHOLE LIST. A tab list is a single tab stop;
                // the arrow keys move within it. Without this every tab is a
                // stop and the spine becomes six presses to get past.
                tabIndex={stripped || selected ? 0 : -1}
                onClick={() => onSelect(tab.id)}
              >
                {tab.step ? <span className="prt-tab__step">{tab.step}</span> : null}
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
      {tabs.map((tab) => (
        <section
          key={tab.id}
          id={`${id}-panel-${tab.id}`}
          className="govuk-tabs__panel"
          {...(stripped
            ? {}
            : {
                role: 'tabpanel',
                'aria-labelledby': `${id}-tab-${tab.id}`,
                hidden: tab.id !== current,
              })}
          // Focusable so the panel can take focus when a view is entered from
          // somewhere other than its own tab — following a mechanism from
          // Causality into Threats, for instance.
          tabIndex={0}
        >
          {tab.panel}
        </section>
      ))}
    </div>
  );
}
