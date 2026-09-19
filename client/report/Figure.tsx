import { useEffect, useState, type ReactNode } from 'react';
import { BAR_HEIGHT, bars, barsHeight } from '$lib/relationships';
import { cx } from '../govuk';

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
 * looking at. GOV.UK has no toggle component, so the state is carried by the
 * two button variants it does have — the current view is the solid one.
 */
/**
 * The framework's breakpoint, as `Tabs` uses it. Below this there is no room for
 * a drawing that was laid out for a page.
 */
const TABLET = 641;

export function Figure({ label, diagram, table }: { label: string; diagram: ReactNode; table: ReactNode }) {
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
  const [view, setView] = useState<'diagram' | 'table'>('diagram');
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${TABLET}px)`);
    const apply = () => setView(query.matches ? 'diagram' : 'table');
    apply();
    // Only on the way past the breakpoint: a reader who has pressed Table on a
    // wide screen must not be put back on the diagram by a resize.
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return (
    <>
      <div className="govuk-button-group govuk-!-margin-bottom-2">
        <button type="button" className={cx('govuk-button', view !== 'diagram' && 'govuk-button--secondary')}
                aria-pressed={view === 'diagram'} onClick={() => setView('diagram')}>
          Diagram<span className="govuk-visually-hidden"> of {label}</span>
        </button>
        <button type="button" className={cx('govuk-button', view !== 'table' && 'govuk-button--secondary')}
                aria-pressed={view === 'table'} onClick={() => setView('table')}>
          Table<span className="govuk-visually-hidden"> of {label}</span>
        </button>
      </div>
      {view === 'diagram' ? diagram : table}
    </>
  );
}

/**
 * A horizontal bar chart.
 *
 * The geometry comes from `bars()` in `$lib/relationships`, for the reason the
 * exposure plot takes its points from the copied core: a chart whose arithmetic
 * lives in its own JSX cannot be tested, and the one thing that must never
 * happen to a bar chart is a bar of the wrong length.
 *
 * NO TEXT ON THE FILL. A label written inside a bar is unreadable on the short
 * ones and has to pass contrast against five different hues; outside, it is
 * black on white everywhere and the colour carries nothing but identity — which
 * the table repeats in words for a reader who cannot see it.
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
  // A chart of nothing is a `viewBox` of height zero, which does not render at
  // all — an empty frame under a heading, with no way to tell it from a bug.
  if (!rows.length) return null;

  const WIDTH = 960;
  const TRACK = 360;
  const geometry = bars(rows.map((r) => r.value), TRACK);

  return (
    <figure className="govuk-!-margin-0">
      <div className="prt-scroll" tabIndex={0} role="region" aria-label={`${label}, as a diagram`}>
        <svg
          viewBox={`0 0 ${WIDTH} ${barsHeight(rows.length)}`}
          width="100%"
          // Wide enough for the longest label this can carry — a pair of kind
          // names either side of an arrow — which at 720 ran past the viewBox
          // and was silently clipped.
          style={{ maxWidth: WIDTH, minWidth: 460 }}
          role="img"
          aria-label={`Bar chart: ${label}. ${rows.map((r) => `${r.label}, ${r.value}`).join('. ')}. The same figures are available as a table.`}
        >
          {rows.map((row, i) => {
            const { y, length } = geometry[i];
            return (
              <g key={row.key}>
                {/* A minimum of two pixels: a category with one relationship in
                    it still has to be visible beside one with two hundred, or
                    the chart says it is not there. */}
                <rect x="0" y={y} width={Math.max(length, 2)} height={BAR_HEIGHT} fill={row.colour} />
                <text x={length + 10} y={y + BAR_HEIGHT / 2 + 5} fontSize="15" fill="#0b0c0c">
                  {row.value}
                  {total ? <tspan fill="#505a5f">{`  ${Math.round((row.value / total) * 100)}%`}</tspan> : null}
                  <tspan fill="#0b0c0c">{`  ${row.label}`}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="govuk-body-s prt-meta">{label}. Switch to the table for the detail behind each bar.</figcaption>
    </figure>
  );
}
