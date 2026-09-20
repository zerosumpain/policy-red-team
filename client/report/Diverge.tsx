import type { ReactNode } from 'react';
import { divergePeak, divergeShares } from '$lib/figures';
import { Table } from '../govuk';
import { Figure } from './Figure';

/**
 * TWO DIRECTIONS OFF ONE CENTRE RULE.
 *
 * Move 2 says the same thing five times in prose — "Higher education providers —
 * 9 relationships — 9 out, 0 in", thirty rows of it — and the thing it is saying
 * is a shape: of the 120 entities this paper connects, 46 only ever issue a
 * relationship, 73 only ever receive one, and exactly one appears at both ends of
 * an arrow. Thirty sentences make a reader do that comparison thirty times. A row
 * with nothing on its left is the finding, seen rather than read.
 *
 * HTML AND CSS, NOT SVG, and that is the same argument `Figure` makes about the
 * bar chart: SVG text is resolved in user units, so a 15px label inside a
 * 960-unit box renders at about 7px when the drawing is pinned to its floor on a
 * 320px screen, and no CSS fixes it. Here the labels are body names — the
 * longest thing on the row — and they have to wrap, which SVG cannot do at all.
 *
 * THE COUNTS ARE PRINTED IN BLACK OUTSIDE THE FILLS. Text on a fill is
 * unreadable on the short rows and has to clear contrast against the tone;
 * outside, it is black on white at every length.
 *
 * DIRECTION IS NEVER THE TONE. Which side of the centre rule a bar is on carries
 * it, the two headings above the plot carry it, and the visually-hidden sentence
 * carries it as a → or ← glyph. The two tones are black tint-25 and tint-80, not
 * the exposure ramp: `view.ts` reserves that ramp for magnitude, and a second
 * vocabulary borrowing its colours would make four bands mean two directions
 * somewhere else on the same page.
 *
 * THE THREE PARTS ARE EXPORTED SEPARATELY, and that is for the caller that has
 * two of these making one comparison. `Diverge` is the whole thing — plot, table
 * and the toggle between them — and is what a single figure should use. Two
 * blocks drawn against one shared `peak` want ONE toggle over both, not two, so
 * that caller composes `DivergePlot` and `DivergeTable` inside its own `Figure`
 * instead of stacking two of ours.
 */

export type DivergeRow = {
  id: string;
  label: string;
  left: number;
  right: number;
  /** What the row label renders — a link, where the caller has one. See `Matrix` for why this is a node rather than a `linkTo` prop. */
  node?: ReactNode;
};

type Common = {
  rows: DivergeRow[];
  /** What a bar to the left of the rule means: "out", "bears", "gives". */
  leftLabel: string;
  rightLabel: string;
};

type PlotProps = Common & {
  /**
   * One scale across two figures.
   *
   * Omitted, the peak is the largest half-row in this set. Passed, it is
   * whatever the caller measured across every set it is drawing — Move 2 puts
   * bodies and machinery side by side as one comparison, and two blocks each
   * normalised to their own longest bar would draw 9 out and 6 in at the same
   * length.
   */
  peak?: number;
  caption: ReactNode;
};

/** The drawing on its own, for a caller placing two of them under one toggle. */
export function DivergePlot({ rows, leftLabel, rightLabel, peak, caption }: PlotProps) {
  if (!rows.length) return null;
  const scale = peak ?? divergePeak(rows);
  const shares = divergeShares(rows, scale);

  return (
    <figure className="prt-diverge govuk-!-margin-0">
      <p className="prt-diverge__head" aria-hidden="true">
        <span className="prt-diverge__side">&larr; {leftLabel}</span>
        <span className="prt-diverge__side prt-diverge__side--right">{rightLabel} &rarr;</span>
      </p>
      <ol className="prt-diverge__rows">
        {rows.map((row, i) => (
          <li key={row.id} className="prt-diverge__row">
            <span className="prt-diverge__label">{row.node ?? row.label}</span>
            {/* The plot is hidden from assistive technology and the sentence
                below carries it, rather than a screen reader walking two counts,
                two empty spans and a rule for every row. */}
            <span className="prt-diverge__plot" aria-hidden="true">
              {/* A ZERO IS PRINTED, not left blank. Of the 120 entities in this
                  paper's graph, 119 have a zero on one side, so a blank would be
                  the commonest mark in the figure and a reader would be inferring
                  the finding from the absence of ink. The empty half says it and
                  the "0" confirms it. */}
              <span className="prt-diverge__half">
                <span className="prt-diverge__n">{row.left}</span>
                <span className="prt-diverge__fill" style={{ width: `${shares[i].left}%` }} />
              </span>
              <span className="prt-diverge__half prt-diverge__half--right">
                <span className="prt-diverge__fill prt-diverge__fill--right" style={{ width: `${shares[i].right}%` }} />
                <span className="prt-diverge__n">{row.right}</span>
              </span>
            </span>
            <span className="govuk-visually-hidden">
              {row.label}: {row.left} {leftLabel} &larr;, {row.right} {rightLabel} &rarr;
            </span>
          </li>
        ))}
      </ol>
      <figcaption className="prt-caption">{caption}</figcaption>
    </figure>
  );
}

/** The same rows as a table, which is the reading below 641px, in print and in a screen reader. */
export function DivergeTable({ rows, leftLabel, rightLabel, caption, tableLabel }: Common & {
  caption: string;
  /** The first column's heading: "Body", "Group", "Mechanism". */
  tableLabel: string;
}) {
  if (!rows.length) return null;
  return (
    <Table
      caption={caption}
      captionSize="s"
      scroll
      firstCellIsHeader
      columns={[{ header: tableLabel }, { header: leftLabel, numeric: true }, { header: rightLabel, numeric: true }]}
      rows={rows.map((row) => [row.node ?? row.label, String(row.left), String(row.right)])}
    />
  );
}

export function Diverge({ label, tableLabel, ...plot }: PlotProps & {
  /** The figure's name, for the toggle's visually-hidden text and the table's caption. */
  label: string;
  tableLabel: string;
}) {
  if (!plot.rows.length) return null;
  return (
    <Figure
      label={label}
      diagram={<DivergePlot {...plot} />}
      table={<DivergeTable {...plot} caption={label} tableLabel={tableLabel} />}
    />
  );
}
