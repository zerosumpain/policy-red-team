import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { patternGrid, type GridCell, type PatternGrid as Grid } from '$lib/policy-analysis/patterns';
import { BAND_LABEL, type Band } from '$lib/policy-analysis/view';
import { Table } from '../govuk';
import { Figure } from './Figure';
import { BandKey } from './Metrics';
import { useRoving } from './useRoving';
import type { Selection } from './selection';

/**
 * WHICH IDEA, AIMED AT WHICH PART OF THE POLICY — the lead of Threats.
 *
 * On the real Post-16 run 47 ways to beat the policy were nine ideas written
 * many times over, and 38 of the 47 scored between 0.54 and 0.77, so a list in
 * score order is the same few ideas at about the same height. `patternGrid`
 * (workstream A) groups them: a row per kind of way to beat it, ranked within
 * the run, a column for each of the twelve parts of the policy most aimed at,
 * and in each cell the worst of them. This draws it.
 *
 * A HEATMAP, IN THE BAND RAMP. Each square is shaded by how exposed the worst
 * way to beat it in that square is, on the same four steps that mean "how
 * exposed" everywhere else in the report — one hue, light to dark, so the
 * shading is a magnitude and a reader who has learned the key once can read
 * it here. The square prints its count, and its band is in the sentence a
 * screen reader hears and the table beside it, because the two light steps sit
 * below 3:1 against the page and never carry meaning alone.
 *
 * NOT `relative`, although `patternGrid` computes it for shading. Shading by
 * the cell's percentile would paint the fortieth-best cell in "limited"'s pink
 * whatever its band, in a report where that pink means limited on every other
 * page. The within-grid standing is in the table view instead, as "3rd of 40".
 *
 * A SQUARE, A ROW NAME AND A COLUMN NUMBER ARE ALL SELECTIONS, and the carried
 * selection is the one the rest of the report already uses: a square narrows
 * every tab to that idea aimed at that part (`pattern` with a mechanism), a
 * row name to the idea, and a column number to the part of the policy (the
 * existing `mechanism` kind). Pressing the pressed one clears it. The whole
 * grid is ONE tab stop with arrow keys inside it (`useRoving`), because
 * forty-odd squares of tab stops is the trap `Matrix` refuses per-cell
 * controls over.
 */

const ORDINAL = (n: number) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
};

export function PatternGrid({ artefacts, selection, onSelect, linkTo }: {
  /** The assessment, with any plays the carried selection excludes already left out. */
  artefacts: Artefact[];
  selection: Selection;
  onSelect: (selection: Selection) => void;
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  const grid = useMemo(() => patternGrid(artefacts), [artefacts]);
  const byId = useMemo(() => new Map(artefacts.map((a) => [a.id, a])), [artefacts]);

  const cellAt = useMemo(() => new Map(grid.cells.map((c) => [`${c.pattern}|${c.mechanismId}`, c])), [grid]);
  const controls = grid.mechanisms.length + grid.patterns.reduce((n, p) => n + 1 + grid.mechanisms.filter((m) => cellAt.has(`${p.key}|${m.id}`)).length, 0);

  // Where the tab stop sits: on the pressed control, if one of these is pressed.
  const order: string[] = [
    ...grid.mechanisms.map((m) => `col|${m.id}`),
    ...grid.patterns.flatMap((p) => [`row|${p.key}`, ...grid.mechanisms.filter((m) => cellAt.has(`${p.key}|${m.id}`)).map((m) => `cell|${p.key}|${m.id}`)]),
  ];
  const pressedKey = selection?.kind === 'mechanism' ? `col|${selection.id}`
    : selection?.kind === 'pattern' ? (selection.mechanism ? `cell|${selection.id}|${selection.mechanism.id}` : `row|${selection.id}`)
      : '';
  const roving = useRoving<HTMLDivElement>(controls, order.indexOf(pressedKey));

  if (!grid.cells.length) return null;

  const ranked = [...grid.cells].sort((a, b) => b.worst - a.worst || b.plays.length - a.plays.length);
  const patternOf = (key: string) => grid.patterns.find((p) => p.key === key);
  const columnOf = (id: string) => grid.mechanisms.find((m) => m.id === id);
  const sentence = (cell: GridCell) => {
    const n = cell.plays.length;
    return `${patternOf(cell.pattern)?.label ?? cell.pattern}, aimed at ${columnOf(cell.mechanismId)?.label ?? cell.mechanismId}: ${n} ${n === 1 ? 'way' : 'ways'} to beat it, the worst ${BAND_LABEL[cell.band as Band].toLowerCase()}`;
  };

  const toggle = (next: NonNullable<Selection>, key: string) => onSelect(key === pressedKey ? null : next);
  let index = -1;
  const control = (key: string) => {
    index += 1;
    return { 'data-roving': '', tabIndex: roving.tabIndexFor(index), 'aria-pressed': key === pressedKey };
  };

  const diagram = (
    <div className="prt-pgrid" ref={roving.container} onKeyDown={roving.onKeyDown}>
      <div className="prt-scroll" role="region" aria-label="Kinds of way to beat it against the parts of the policy they hit">
        <table className="govuk-table prt-pgrid__table">
          {/* Visually hidden: a caption spans the TABLE, which is wider than
              its scroll box on a phone, so a visible one ran off the edge. The
              section's heading and lede say the same above it. */}
          <caption className="govuk-visually-hidden">
            Kinds of way to beat it (rows, most serious first) against the parts of the policy they
            are aimed at (columns, most aimed-at first)
          </caption>
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header prt-pgrid__corner">Kind of way to beat it</th>
              {grid.mechanisms.map((m, i) => {
                const key = `col|${m.id}`;
                return (
                  <th key={m.id} scope="col" className="govuk-table__header prt-pgrid__colhead">
                    <button type="button" className="prt-pgrid__col" {...control(key)}
                            onClick={() => toggle({ kind: 'mechanism', id: m.id, label: m.label }, key)}>
                      <span aria-hidden="true">{i + 1}</span>
                      <span className="govuk-visually-hidden">{m.label}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {grid.patterns.map((p) => {
              const rowKey = `row|${p.key}`;
              return (
                <tr key={p.key} className="govuk-table__row">
                  <th scope="row" className="govuk-table__header prt-pgrid__rowhead">
                    <button type="button" className="prt-pgrid__row" {...control(rowKey)}
                            onClick={() => toggle({ kind: 'pattern', id: p.key, label: p.label }, rowKey)}>
                      {p.label}
                    </button>
                    <span className="prt-pgrid__rowmeta">
                      {p.plays.length} {p.plays.length === 1 ? 'way' : 'ways'} · {p.bodies.length} {p.bodies.length === 1 ? 'body' : 'bodies'}
                    </span>
                  </th>
                  {grid.mechanisms.map((m) => {
                    const cell = cellAt.get(`${p.key}|${m.id}`);
                    if (!cell) {
                      return (
                        <td key={m.id} className="govuk-table__cell prt-pgrid__cell prt-pgrid__cell--empty">
                          <span className="govuk-visually-hidden">None</span>
                        </td>
                      );
                    }
                    const key = `cell|${p.key}|${m.id}`;
                    return (
                      <td key={m.id} className="govuk-table__cell prt-pgrid__cell">
                        <button type="button" className={`prt-pgrid__square prt-band--${cell.band}`} {...control(key)}
                                title={sentence(cell)}
                                onClick={() => toggle({ kind: 'pattern', id: p.key, label: p.label, mechanism: { id: m.id, label: m.label } }, key)}>
                          <span aria-hidden="true">{cell.plays.length}</span>
                          <span className="govuk-visually-hidden">{sentence(cell)}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ol className="prt-matrix__key prt-pgrid__key" aria-label="The parts of the policy, by column number">
        {grid.mechanisms.map((m, i) => {
          const artefact = byId.get(m.id);
          return (
            <li key={m.id}>
              <span className="prt-matrix__num">{i + 1}</span>{' '}
              {artefact && linkTo ? linkTo(artefact, m.label) : m.label}
            </li>
          );
        })}
      </ol>
      <BandKey label="Each square is shaded by how exposed its worst way to beat it is, and shows how many there are:" />
    </div>
  );

  const table = (
    <Table
      caption="Every filled square, worst first"
      captionSize="s"
      scroll
      firstCellIsHeader
      columns={[
        { header: 'Kind of way to beat it' },
        { header: 'Part of the policy' },
        { header: 'Ways to beat it', numeric: true },
        { header: 'How exposed' },
        { header: 'Where it stands' },
      ]}
      rows={ranked.map((cell, i) => {
        const artefact = byId.get(cell.mechanismId);
        const label = columnOf(cell.mechanismId)?.label ?? cell.mechanismId;
        const rank = ranked.findIndex((c) => c.worst === cell.worst) + 1;
        return [
          patternOf(cell.pattern)?.label ?? cell.pattern,
          artefact && linkTo ? <span key={`m${i}`}>{linkTo(artefact, label)}</span> : label,
          String(cell.plays.length),
          <span key={`b${i}`} className={`prt-band prt-band--${cell.band}`}>{BAND_LABEL[cell.band as Band]}</span>,
          `${ORDINAL(rank)} of ${ranked.length}`,
        ];
      })}
    />
  );

  return (
    <section aria-labelledby="patterns">
      <h2 className="govuk-heading-l" id="patterns">The same few ideas, aimed at the same parts</h2>
      <p className="govuk-body prt-pgrid__lede">
        {lede(grid)} Select a square, a row or a column number to narrow every tab to it.
      </p>
      {/* THE GRID ON A PHONE TOO. It is HTML, not an SVG, so it scrolls in its
          own box with the row names pinned; the table view it would otherwise
          flip to measured 17,294px at 420 on the real run — forty rows of five
          narrow columns. */}
      <Figure label="kinds of way to beat it against the parts of the policy" diagram={diagram} table={table} flipAtNarrow={false} />
      <Tail grid={grid} />
    </section>
  );
}

/** One sentence that says what the grid shows, generated from the grid. */
function lede(grid: Grid): string {
  const plays = grid.patterns.reduce((n, p) => n + p.plays.length, 0);
  const top = grid.patterns[0];
  return `The ${plays} ways to beat the policy come down to ${grid.patterns.length} kinds of idea.`
    + (top ? ` The most serious is “${top.label.toLowerCase()}”: ${top.plays.length} ${top.plays.length === 1 ? 'way' : 'ways'}, open to ${top.bodies.length} ${top.bodies.length === 1 ? 'body' : 'bodies'}.` : '');
}

/** What the grid does not draw, counted so nobody takes the grid for the whole. */
function Tail({ grid }: { grid: Grid }) {
  const parts: string[] = [];
  if (grid.hiddenMechanisms) parts.push(`${grid.hiddenMechanisms} more ${grid.hiddenMechanisms === 1 ? 'part of the policy is' : 'parts of the policy are'} aimed at less often and ${grid.hiddenMechanisms === 1 ? 'is' : 'are'} not drawn`);
  if (grid.offGrid) parts.push(`${grid.offGrid} ${grid.offGrid === 1 ? 'way to beat it is' : 'ways to beat it are'} aimed at no part of the policy at all — at a measure or an aim`);
  if (!parts.length) return null;
  return (
    <p className="govuk-body-s prt-meta">
      {parts.join('; ')}. Every one of them is in the list below.
    </p>
  );
}
