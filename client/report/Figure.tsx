import { useEffect, useState, type ReactNode } from 'react';
import { barShares } from '$lib/relationships';

/**
 * A figure and the same figure as a table, with one control between them.
 *
 * THE TABLE IS NOT A FALLBACK — the accessibility statement commits to that, and
 * the toggle is offered to everyone rather than hidden behind assistive
 * technology. A picture answers "is anything up in the top right" in a glance
 * and answers "what exactly is that one" not at all; a table is the other way
 * round, and which question a reader has is not something this page knows.
 *
 * THE BUTTONS CARRY THE FIGURE'S NAME, visually hidden. The report now holds
 * three of these, and three pairs of buttons all announcing "Table" tells a
 * screen-reader user nothing about which table — the same defect
 * `SummaryList`'s `visuallyHiddenText` exists to prevent one component over.
 *
 * AND THE PRESSED ONE LOOKS PRESSED. `aria-pressed` alone tells assistive
 * technology which view is showing and tells a sighted reader nothing: two
 * identical grey buttons over a chart, with no way to know which one you are
 * looking at. GOV.UK has no toggle component, so the state is carried the way
 * `.prt-tab` carries it for the move spine — black text, 700, and a 3px black
 * bottom border on the current one. It used to be carried by the solid green
 * `.govuk-button`, and that was measured as a defect rather than argued as one:
 * at 1280px the green "Diagram" button sat at page y≈2326 and the 95% bar it
 * controls at y≈2388, so the loudest object in "Where the relationships run"
 * was the control, twice in 400px, in the service's call-to-action colour.
 *
 * BOTH VIEWS ARE ALWAYS IN THE DOCUMENT. This rendered `view === 'diagram' ?
 * diagram : table`, so the other view was UNMOUNTED rather than hidden — the one
 * state no print stylesheet can reach. Every printed and PDF copy of the report
 * therefore carried the 47-mark scatter and dropped "Every play, by ease and
 * impact", which is the only place a per-play ease or impact figure appears
 * anywhere in the assessment; and a reader printing from a phone lost the
 * picture instead, because the default below tablet is the table. `[hidden]`
 * keeps exactly one view in the layout and in the accessibility tree, so screen
 * behaviour is unchanged, and `parts/_figure-print` un-hides the other on paper.
 * The cost is 47 extra rows in the document at worst.
 */
export type FigureView = 'diagram' | 'table';

/**
 * The framework's breakpoint, as `Tabs` uses it. Below this there is no room for
 * a drawing that was laid out for a page.
 */
const TABLET = 641;

export function Figure({ label, diagram, table, flipAtNarrow = true, value, onChange }: {
  label: string;
  diagram: ReactNode;
  table: ReactNode;
  /**
   * Whether a narrow screen should open on the table rather than the diagram.
   *
   * ONLY AN SVG NEEDS THIS. It was unconditional, and it is why "How they
   * connect" was two tables on a phone while the HTML mechanism chart 400px
   * above them rendered its bars perfectly at 320px. The default is kept at
   * `true` so every caller that has not been measured behaves exactly as it did
   * — the exposure plot is a genuine 47-point scatter in a square viewBox and
   * cannot be rebuilt in CSS, so it still wants the flip — and the two charts
   * whose diagrams are now HTML opt out.
   */
  flipAtNarrow?: boolean;
  /**
   * The view, where the caller is holding it.
   *
   * Three figures held three independent states in three components, all lost
   * on reload and on the drill-and-back journey the URL work exists for. A
   * caller that wants the choice to survive that journey passes it in and puts
   * it in the URL; a caller that does not passes nothing and this keeps its own.
   */
  value?: FigureView;
  onChange?: (view: FigureView) => void;
}) {
  /*
   * A PHONE MEETS THE TABLE, A PAGE MEETS THE DIAGRAM.
   *
   * SVG text scales with the viewBox and not with the reader: `<text
   * fontSize="15">` inside a 960-unit box is 16px when the drawing renders at
   * 918px and about 7px when it is pinned to its 460px floor on a 320px screen.
   * Measured on the live report at 320: all seven bar labels — "101 95% Bodies →
   * Machinery" and the rest — came out in an 8px box. There is no CSS fix, which
   * is the part that matters: a `font-size` on SVG text is still resolved in user
   * units, and `vector-effect: non-scaling-size` is unimplemented everywhere.
   *
   * So the default changes rather than the type. The toggle is untouched and
   * either view is one press away, which is the whole argument of this component
   * — "THE TABLE IS NOT A FALLBACK" — and `ExposurePlot` already says the table
   * is the more capable of the two anyway.
   */
  const [own, setOwn] = useState<FigureView>('diagram');
  useEffect(() => {
    if (!flipAtNarrow) return;
    const query = window.matchMedia(`(min-width: ${TABLET}px)`);
    const apply = () => setOwn(query.matches ? 'diagram' : 'table');
    apply();
    // Only on the way past the breakpoint: a reader who has pressed Table on a
    // wide screen must not be put back on the diagram by a resize.
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [flipAtNarrow]);

  const view = value ?? own;
  const choose = (next: FigureView) => {
    // Written to both, so a controlled caller that later stops passing a value
    // — the offline pack, where the URL is never read back — does not throw the
    // reader's choice away on the next render.
    setOwn(next);
    onChange?.(next);
  };

  const button = (name: FigureView, text: string) => (
    <button type="button" className="govuk-button govuk-button--secondary"
            aria-pressed={view === name} onClick={() => choose(name)}>
      {text}<span className="govuk-visually-hidden"> of {label}</span>
    </button>
  );

  return (
    <>
      <div className="govuk-button-group prt-figtoggle">
        {button('diagram', 'Diagram')}
        {button('table', 'Table')}
      </div>
      {/* The name of each view, for paper. On screen it is clipped — the
          pressed button already says which view is showing — and in print the
          two views sit one above the other with nothing between them, where
          "As a diagram" / "As figures" is what stops the second reading as a
          repeat of the first. A paragraph rather than a heading, deliberately:
          a heading here would land at whatever level the caller's own headings
          make wrong, and this says what the block is, not what it is called. */}
      <div className="prt-figure__view" hidden={view !== 'diagram'}>
        <p className="prt-figure__viewhead">As a diagram</p>
        {diagram}
      </div>
      <div className="prt-figure__view" hidden={view !== 'table'}>
        <p className="prt-figure__viewhead">As figures</p>
        {table}
      </div>
    </>
  );
}

/**
 * A horizontal bar chart, in HTML.
 *
 * IT WAS AN SVG IN A 960-UNIT viewBox AND IT NEVER NEEDED TO BE. Three rows and
 * four rows of `label — value — share` is a list with a length on it, and the
 * viewBox cost real things: the labels resolved to about 7px at the 460px
 * minimum width, so both charts in Move 2 defaulted to a table on a phone while
 * the HTML mechanism chart in the same panel rendered fine; the drawing clipped
 * in print, which `.prt-scroll` has a special case for; and 600 of the 960 units
 * went on a label column. The same three facts in HTML wrap, scale with the
 * reader's type size, and print.
 *
 * ON `.prt-nodebar`, THE PATTERN ALREADY IN THIS PANEL, rather than a second
 * bar vocabulary: a fixed label column, a bordered track, a fill, and the
 * figures as real text in the third column. Nothing new is added to the
 * stylesheet for it.
 *
 * NO TEXT ON THE FILL. A label written inside a bar is unreadable on the short
 * ones and has to pass contrast against the fill; outside, it is black on white
 * everywhere and the colour carries nothing but identity — which the table
 * repeats in words for a reader who cannot see it.
 */
export function BarChart({ rows, label, total }: {
  rows: { key: string; label: string; value: number; colour: string }[];
  label: string;
  /**
   * What the percentages are OF.
   *
   * Passed in rather than summed here, because the two charts on the report have
   * identical grammar and different denominators: the shape chart's rows
   * partition every relationship in the graph, while the families chart leaves
   * out any relation type no family claims. Summing the rows made one chart's
   * percentages quietly mean something else, with nothing on either saying so.
   */
  total: number;
}) {
  // A chart of nothing is an empty frame under a heading, with no way to tell
  // it from a bug. The caller's own "nothing to show" sentence is better.
  if (!rows.length) return null;

  const shares = barShares(rows.map((row) => row.value));

  return (
    <figure className="govuk-!-margin-0">
      {/*
        A LIST, NOT AN IMAGE WITH A LABEL. The SVG was `role="img"` with the
        whole reading in `aria-label`, and porting that to the `<ul>` was wrong
        twice over: `role="img"` is not an allowed role on a list — axe reports
        it, and 15 `<li>`s lost their list parent with it — and the rows here are
        real text, so a screen reader that walks them hears "Bodies to
        Machinery, 101, 95%" rather than one 300-character sentence. The empty
        track is the only part with nothing to say.
      */}
      <ul className="prt-nodebars">
        {rows.map((row, i) => (
          <li key={row.key} className="prt-nodebar">
            {/* No class: the row is a three-column grid and this is its first
                column, so it inherits the panel's 19px — which is the size
                `.prt-nodebar__name` sets for the same column on the mechanism
                chart. A class here would be a rule that restates one. */}
            <span>{row.label}</span>
            <span className="prt-nodebar__bar" aria-hidden="true">
              {/* `.prt-nodebar__seg` carries a 3px floor, which is the rule the
                  SVG spelled out as `Math.max(length, 2)`: a family with one
                  relationship still has to be visible beside one with forty-eight,
                  or the chart says it is not there. A family with NONE draws no
                  segment at all, because an empty track is the reading. */}
              {row.value ? <span className="prt-nodebar__seg" style={{ width: `${shares[i]}%`, background: row.colour }} /> : null}
            </span>
            <span className="prt-nodebar__n">
              <strong>{row.value}</strong>
              {total ? ` · ${Math.round((row.value / total) * 100)}%` : ''}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="govuk-body-s prt-meta">{label}. Switch to the table for the detail behind each bar.</figcaption>
    </figure>
  );
}
