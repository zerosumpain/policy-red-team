import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  /** "Move 1", "Last". Printed above the label; omit for no step. */
  step?: string;
  /**
   * The question this section answers, printed under the label.
   *
   * The second addition to the framework's Tabs, and for the same kind of reason
   * as the step: "Causality" is what the move is called and not what it is for,
   * and a reader arriving with a question cannot match it to a noun they have
   * not been given a definition of.
   */
  hint?: string;
  /**
   * How much is behind this tab — "47 plays · 20 severe".
   *
   * The third addition, and the one a reader asked for by scrolling. Measured at
   * 1280 on this run, the five panels are 919px to 10,137px and the five tabs
   * were pixel-identical three-line boxes, so the only way to find out that
   * Causality is five screens and Actors is one was to open both. A size is not
   * a summary — it is the one thing a reader can use to decide where to spend
   * the next five minutes.
   *
   * A STRING, NOT A NUMBER, because the five moves are counted in different
   * units and a single figure would have to be re-labelled by the caller anyway.
   * It is built by `moveCounts` in `client/report/tabcounts.ts`, which has the
   * pluralisation and the test.
   */
  count?: string;
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

/**
 * Which tab is actually showing, which is not always the one that was asked for.
 *
 * `?move=do` is a live URL on the report — `do` is a real move, deliberately not
 * a tab — and it rendered five panels all carrying `hidden`, five tabs none of
 * which held `tabIndex=0`, and no `aria-selected="true"` anywhere. Measured on
 * the deployed report: {panels: 5, visible: 0, tabs: 5, tabbable: 0}. A tab list
 * is a single tab stop and nothing in it held the stop, so a keyboard user had
 * no route back into the report and the address bar kept the URL that did it, so
 * reloading did not recover either.
 *
 * The caller can still validate its own URLs, and should. This makes the
 * component structurally unable to render nothing whatever it is handed: the
 * index is clamped to a real tab and every comparison is made against the tab at
 * that index rather than against the raw `current`.
 */
export function activeTabId(tabs: Tab[], current: string): string {
  const index = Math.max(0, tabs.findIndex((t) => t.id === current));
  return tabs[index]?.id ?? current;
}

export function Tabs({ id, label, tabs, current, onSelect, above }: {
  id: string;
  /** Names the tab list for anyone not looking at it. */
  label: string;
  tabs: Tab[];
  current: string;
  onSelect: (id: string) => void;
  /**
   * Rendered immediately above the strip, inside the sticky block.
   *
   * THE SPINE IS ONE STICKY THING NOW, and this prop is what makes that
   * possible. The report's selection banner and this strip were siblings and
   * both `position: sticky; top: 0`, so they pinned to the same line: measured
   * at 1280×900 scrolled to y=3000 under `?sel=band:severe`, the banner's box
   * top was 0 and `elementFromPoint` at the banner's own centre returned
   * `govuk-tabs__tab` — the 113px strip, higher z-index and opaque white,
   * covering the 58px banner for the whole scroll. Stacking them in one sticky
   * wrapper is the only arrangement in which both survive; an offset on the
   * strip has to be measured at runtime and is wrong at every width where the
   * banner wraps.
   *
   * It sits OUTSIDE the `<ul>`, so the roving tabindex and the arrow-key
   * handling below are untouched by it.
   */
  above?: ReactNode;
}) {
  const index = Math.max(0, tabs.findIndex((t) => t.id === current));
  /** The tab that is really showing. See `activeTabId` for the URL that needed it. */
  const activeId = activeTabId(tabs, current);

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
   * SELECTING FROM A DEEP SCROLL USED TO DROP THE READER BELOW THE REPORT.
   *
   * Changing panel changes the document's height, and the browser clamps the
   * scroll position to whatever is left. Measured on the real run at 1280×900:
   * from y=4200 inside Threats (a 6,104px panel), choosing Actors (919px) left
   * the reader at y=2187 with the tab strip 653px ABOVE the viewport and the
   * chosen panel 1,500px above that — looking at the download links, which
   * belong to no move at all, with no visible way back to the spine.
   *
   * So the view is brought back after the switch, and only when it has actually
   * gone — a reader changing tabs from the top of the report must not be jumped
   * anywhere. See `select` for why the panel and not the tab decides that.
   *
   * FOCUS IS NOT MOVED. The obvious alternative, focusing the panel, ships a
   * keyboard regression: `onKeyDown` is bound to the `<ul>` and the panel is its
   * sibling, so once focus leaves the list a second ArrowRight never reaches the
   * handler and arrow navigation stops after one press.
   */
  const root = useRef<HTMLDivElement>(null);
  const select = (next: string) => {
    onSelect(next);
    if (stripped) return; // the anchor below does its own jumping
    /*
     * THE PANEL IS THE TARGET, NOT THE TAB. `.govuk-tabs__list` is
     * `position: sticky`, so it is pinned to the top of the viewport for as long
     * as its container is on screen — which means scrolling IT into view is a
     * no-op precisely when it is stuck, and the first attempt at this landed ten
     * pixels short for exactly that reason. What actually left the reader
     * stranded was the PANEL: measured at 1280×900, from y=4200 inside Threats
     * (6,104px) choosing Actors (919px) clamped the scroll to y=2187 and put the
     * chosen panel 1,500px above the viewport, on the download links.
     *
     * So the panel's bounds decide, and the whole tab block is what gets scrolled
     * to, because arriving at the strip is arriving at the top of the view you
     * asked for. A second frame, because the height changes and the browser
     * clamps the scroll after React commits.
     */
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const panel = document.getElementById(`${id}-panel-${next}`);
      if (!panel || !root.current) return;
      const { top } = panel.getBoundingClientRect();
      if (top < 0 || top > window.innerHeight) root.current.scrollIntoView({ block: 'start' });
    }));
  };

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
    <div className="govuk-tabs" ref={root}>
      <h2 className="govuk-tabs__title">{label}</h2>
      {/*
        ONE STICKY BLOCK, NOT TWO THAT PIN TO THE SAME LINE. The wrapper exists
        so `above` and the strip travel together; see the `above` prop for the
        measurement that made it necessary. It is always rendered, with or
        without a node in it, because `parts/_spine.scss` moves the sticky
        declaration onto it and a conditional wrapper would mean two stylesheets
        for one strip.
      */}
      <div className="prt-spine">
        {above}
        <ul
          className="govuk-tabs__list"
          {...(stripped ? {} : { role: 'tablist', 'aria-label': label, onKeyDown })}
        >
          {tabs.map((tab) => {
            const selected = tab.id === activeId;
            /*
             * THE NAME IS THE LINK; THE STEP AND THE QUESTION ARE NOT.
             *
             * `text-decoration` propagates from an ancestor to its in-flow block
             * children and a child cannot cancel it — so `text-decoration: none` on
             * the step was a dead declaration, and adding the question underneath
             * gave every tab three underlined lines reading as one long link. The
             * decoration comes off the control and goes on the label, which is the
             * part that names where you are going.
             */
            const inside = (
              <>
                {tab.step ? <span className="prt-tab__step">{tab.step}</span> : null}
                <span className="prt-tab__label">{tab.label}</span>
                {tab.hint ? <span className="prt-tab__hint">{tab.hint}</span> : null}
                {tab.count ? <span className="prt-tab__count">{tab.count}</span> : null}
              </>
            );
            return (
              <li
                key={tab.id}
                className={`govuk-tabs__list-item${selected ? ' govuk-tabs__list-item--selected' : ''}`}
                // ONLY WHILE IT IS A TAB LIST. `presentation` strips the `<li>` of
                // its list semantics, which is right for a tablist and wrong for
                // the plain index this becomes on a phone — axe reports the
                // stripped list as a `list` violation, correctly, because every
                // child has had its role taken away.
                {...(stripped ? {} : { role: 'presentation' })}
              >
                {stripped ? (
                  /*
                   * AN ANCHOR ON A PHONE, WHICH IS THE FRAMEWORK'S OWN MARKUP.
                   *
                   * Torn down, every panel is on the page and the list is an index
                   * of them — so the control has to move the reader, and a button
                   * setting state nobody renders cannot. Measured at 390×844 on the
                   * real run: the document is 55,644px, tapping "Move 3 / Threats"
                   * moved the scroll 0px, and the panel it names begins 18,918px
                   * down — twenty-two screens from the reader who asked for it.
                   * The underline and the blue were already there, promising a jump
                   * the button never made.
                   *
                   * `onClick` stays so the selection survives a rotation back above
                   * TABLET, where the strip becomes a tab strip again.
                   */
                  <a
                    id={`${id}-tab-${tab.id}`}
                    className="govuk-tabs__tab prt-tab"
                    href={`#${id}-panel-${tab.id}`}
                    onClick={() => onSelect(tab.id)}
                  >
                    {inside}
                  </a>
                ) : (
                  <button
                    type="button"
                    id={`${id}-tab-${tab.id}`}
                    className="govuk-tabs__tab prt-tab"
                    role="tab"
                    aria-controls={`${id}-panel-${tab.id}`}
                    aria-selected={selected}
                    // ONE STOP FOR THE WHOLE LIST. A tab list is a single tab stop;
                    // the arrow keys move within it. Without this every tab is a
                    // stop and the spine becomes six presses to get past.
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(tab.id)}
                  >
                    {inside}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
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
                hidden: tab.id !== activeId,
              })}
        >
          {/*
            * THE PANEL SAYS WHICH MOVE IT IS, for the two readings where the tab
            * strip is not there to say it.
            *
            * On paper the print stylesheet un-hides all five panels and hides the
            * strip, so the report ran fifteen `h2`s together with nothing marking
            * where Verdict ended and Causality began. On a phone every panel is on
            * the page for the same reason. Hidden above `tablet`, where the
            * selected tab is the heading and a second one would only repeat it.
            */}
          <h2 className="prt-movehead">
            {tab.step ? `${tab.step} — ` : ''}{tab.label}
            {/* THE SIZE HAS TO SURVIVE THE TEARDOWN. `.prt-tab__count` is drawn
                only from 1260px, where the five columns are wide enough for it,
                and below `tablet` there is no strip at all — so on a phone and on
                paper, the two readings where every panel is simply present, the
                count would be the one thing about a move a reader could not see.
                It rides on the heading those two readings already use. */}
            {tab.count ? <span className="prt-movehead__count">{tab.count}</span> : null}
          </h2>
          {tab.panel}
        </section>
      ))}
    </div>
  );
}
