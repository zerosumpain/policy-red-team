import type { Play } from '$lib/policy-analysis/view';
import { bandLegality, legalityReading, type LegalityPlay } from '$lib/verdict-view';
import { Table } from '../govuk';
import { BandKey } from './Metrics';
import { Figure } from './Figure';

/** The two fields the cross-tab reads, off a play. */
const rowsOf = (plays: Play[]): LegalityPlay[] =>
  plays.map((play) => ({ band: play.band, legality: String(play.artefact.data.legality ?? 'unknown') }));

/**
 * NOTHING HERE BREAKS A RULE — the band drawn against the legality.
 *
 * See `src/lib/verdict-view.ts` for why this figure exists at all: both fields
 * are on every play, the report drew each of them alone, and cross-tabulated
 * they say that thirteen of the twenty severe plays are things nobody is
 * forbidden to do. There is no enforcement answer to those thirteen, and that
 * is the single most decision-relevant sentence in the assessment.
 *
 * ONE SHARED SCALE, NOT TWO FULL-WIDTH ROWS. Each row could be normalised to
 * its own count, which would compare the COMPOSITION of the two groups and
 * throw away the fact that one of them is nearly twice the size of the other.
 * Both rows are drawn against the whole run, so the width says how many and the
 * segments say which bands — one population divided two ways, which is what it
 * is.
 *
 * PLAIN HTML FLEX, NOT SVG. The segments are percentage widths of a 100% track,
 * exactly as `.prt-stack__bar` already does, so this reflows at 320px with no
 * viewBox to shrink and the counts printed in it scale with the reader's type.
 * `EgoMap.tsx` and `PlayFlow.tsx` carry the long form of this argument.
 *
 * NO HATCH. A `repeating-linear-gradient` is a background image and browsers
 * drop background images from a print by default, so the one distinction that
 * mattered would vanish on paper. The counts are printed as text instead, which
 * needs no print rule at all.
 *
 * NON-INTERACTIVE. The exposure rail above the tab strip is how a reader picks
 * a band, and it carries that selection into all five moves. A second band
 * control in this section would be two controls for one state.
 */
export function Legality({ list }: { list: Play[] }) {
  if (!list.length) return null;
  const tab = bandLegality(rowsOf(list));
  if (!tab.rows.length) return null;
  const reading = legalityReading(tab);

  const diagram = (
    <figure className="govuk-!-margin-0">
      <ol className="prt-legalitybar">
        {tab.rows.map((row) => (
          <li key={row.legality} className="prt-legalitybar__row">
            {/*
              THE LABEL IS OUTSIDE THE FILL, in black. A word written inside a
              segment has to pass contrast against four different band colours,
              two of which sit below 3:1 against the page; outside, it is black
              on white and the colour carries nothing but identity.
            */}
            <p className="prt-legalitybar__label">
              {row.label} <span className="prt-denom">{row.count} of {tab.total}</span>
            </p>
            <div className="prt-legalitybar__track">
              {row.bands.filter((band) => band.count).map((band) => (
                <span
                  key={band.band}
                  className={`prt-legalitybar__seg prt-band--${band.band}`}
                  style={{ width: `${(band.count / tab.total) * 100}%` }}
                >
                  {/*
                    The count is drawn on the segment where it fits and read
                    from the key and the table where it does not — the same
                    division `StackedBar` already makes, and the reason the
                    table twin is one press away rather than a fallback.
                  */}
                  <span className="prt-legalitybar__n" aria-hidden="true">{band.count}</span>
                  <span className="govuk-visually-hidden">
                    {band.label}: {band.count} of the {row.count} {row.label.toLowerCase()}.
                  </span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <BandKey label="Exposure band" />
      <figcaption className="prt-caption">
        {/*
          THE AXIS, AND NOT THE READING. Both rows are drawn against the whole
          run rather than against their own counts, and a reader has to be told
          that once or they will read each row as a whole. The finding itself
          is the two sentences above the figure; repeating it here put the same
          claim on the screen twice in 400 pixels.
        */}
        Each row is drawn against all {tab.total} plays, so the length is how many and the
        divisions are which bands.
      </figcaption>
    </figure>
  );

  const table = (
    <Table
      caption="Exposure band against legality"
      captionSize="s"
      scroll
      firstCellIsHeader
      columns={[
        { header: 'Band' },
        ...tab.columns.map((column) => ({ header: column.label, numeric: true })),
        { header: 'All plays', numeric: true },
      ]}
      rows={tab.bands.map((band) => [
        band.label,
        ...tab.columns.map((column) =>
          String(tab.rows.find((row) => row.legality === column.legality)?.bands.find((b) => b.band === band.band)?.count ?? 0)),
        String(band.count),
      ])}
    />
  );

  return (
    <>
      {reading.map((line) => <p className="govuk-body" key={line}>{line}</p>)}
      {/*
        THE NARROW FLIP IS KEPT, which the other two HTML charts on this page
        turn off. Their reason for turning it off does not hold here: seven
        segments across two rows each carry a minimum width so their printed
        count is legible, and at 320px those floors come to 196px of a 288px
        content box — the proportions stop being proportions. `parts/_legality-bar`
        drops the printed digits at that width for a reader who presses Diagram
        anyway, and the table below 641px carries every count in words.
      */}
      <Figure label="exposure band against legality" diagram={diagram} table={table} />
    </>
  );
}

/**
 * The same reading, as one line, for the move that is about the plays.
 *
 * Move 3 is "Ways to beat it" and it never counted its sharpest claim: the
 * pill saying "Inside the rules" appears on each of the ten cards it shows and
 * the shape of the whole forty-seven appears nowhere. The figure stays in the
 * Verdict move, where "what did it conclude" is the question; this is the
 * consequence, printed where the threats are.
 */
export function LegalityLead({ list }: { list: Play[] }) {
  if (!list.length) return null;
  const reading = legalityReading(bandLegality(rowsOf(list)));
  if (!reading.length) return null;
  return <p className="govuk-body">{reading.join(' ')}</p>;
}
