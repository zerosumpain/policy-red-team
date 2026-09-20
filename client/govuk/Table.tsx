import { useState, type ReactNode } from 'react';
import { cx } from './cx';

export interface Column {
  header: ReactNode;
  numeric?: boolean;
  width?: string;
  /**
   * Whether the reader may reorder the table by this column.
   *
   * OPT-IN, and it should stay opt-in. A sort control on a five-row table is a
   * control that costs more than it returns; the two tables that have it are
   * the 47-row playbook, whose Ease column is the only place the enforcement
   * question "which of these is cheapest to do" can be answered, and the reach
   * table, whose own prose asks a comparative question of a fixed order.
   */
  sortable?: boolean;
  /**
   * The column's name in the announcement, where `header` is not a plain
   * string. Sorting is announced in words and a `ReactNode` has none.
   */
  name?: string;
  /**
   * What the two directions are CALLED for this quantity.
   *
   * "Descending" is a database word. A reader sorting by Ease wants "easiest
   * first", and by Band wants "worst first"; saying "descending" leaves them to
   * work out which end of the scale the word points at.
   */
  order?: { asc: string; desc: string };
}

type Direction = 'asc' | 'desc';

/**
 * A table, and — when it is wider than the page — the box it scrolls inside.
 *
 * A scrolling region has to be focusable and labelled or a keyboard user cannot
 * reach the part that is off-screen; axe reports exactly that, and it is the
 * only reason `scroll` exists as an option rather than a wrapper the caller
 * remembers to add.
 *
 * SORTING IS THE MoJ PATTERN, BECAUSE GOV.UK HAS NONE. The framework's table is
 * markup and nothing else — no `aria-sort`, no header control, no state — so
 * every table in the report shipped in exactly one order chosen by the view
 * layer. The Ministry of Justice's design system is the GOV.UK-family answer:
 * the whole header cell is a button, the `<th>` carries `aria-sort`, and the
 * new order is spoken.
 *
 * THE SORT KEY IS PASSED IN, NEVER READ OFF THE CELL. Cells are `ReactNode` —
 * several of them are `<Bar>` elements and several are links — so there is no
 * text to key off, and the text there is would sort "0.9" above "0.72" as
 * strings. `sortKeys` is a parallel array of the values the columns MEAN.
 *
 * AND THE CALLER'S OWN ORDER IS A STATE YOU CAN GET BACK TO. A two-way toggle
 * would have destroyed the one ordering the assessment itself chose — the
 * playbook is ranked by exposure and that ranking is an argument — so the
 * control cycles through three states and the third is the order the rows
 * arrived in.
 */
export function Table({
  caption, captionSize = 'm', columns, rows, scroll, firstCellIsHeader, sortKeys, defaultOrder,
}: {
  caption?: ReactNode;
  captionSize?: 's' | 'm' | 'l' | 'xl';
  columns: Column[];
  rows: ReactNode[][];
  scroll?: boolean;
  firstCellIsHeader?: boolean;
  /**
   * One row of sort values per row of cells, in column order.
   *
   * Required for any column marked `sortable`; a column with no key sorts on
   * nothing and keeps the caller's order, which is the safe failure.
   */
  sortKeys?: (string | number)[][];
  /** What the rows' own order is called, for the third press. */
  defaultOrder?: string;
}) {
  const [sort, setSort] = useState<{ column: number; direction: Direction } | null>(null);
  const sortable = columns.some((column) => column.sortable);

  /*
   * NOT MEMOISED, DELIBERATELY. `rows` is built fresh by every caller on every
   * render — `plays.map(...)` — so a `useMemo` keyed on it would miss every
   * time and read as a guard that is not guarding anything. Ordering 47
   * integers is nothing; the expensive thing on this page is `network()`, and
   * that one is memoised at the root.
   */
  const rowOrder = rows.map((_, i) => i);
  if (sort && sortKeys) {
    const sign = sort.direction === 'asc' ? 1 : -1;
    // Broken on the original index, so the sort is STABLE: two plays with the
    // same ease must not swap places each time the reader presses something
    // else, which is how a 47-row table stops being trustworthy.
    rowOrder.sort((a, b) => {
      const x = sortKeys[a]?.[sort.column];
      const y = sortKeys[b]?.[sort.column];
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign || a - b;
      return String(x ?? '').localeCompare(String(y ?? '')) * sign || a - b;
    });
  }

  /*
   * THREE STATES, AND THE FIRST PRESS GOES THE WAY THE READER IS ASKING.
   *
   * A numeric column is pressed to find the top of it — the easiest play, the
   * body that reaches furthest — so it opens descending; a column of names is
   * pressed to find a name, so it opens A to Z. Opening every column ascending
   * would put 0.05 at the top of a table whose question is 0.90.
   */
  const press = (index: number) => {
    const numeric = columns[index]?.numeric ?? false;
    const opening: Direction = numeric ? 'desc' : 'asc';
    setSort((current) => {
      if (current?.column !== index) return { column: index, direction: opening };
      if (current.direction === opening) return { column: index, direction: opening === 'asc' ? 'desc' : 'asc' };
      return null;
    });
  };

  const named = (column: Column, i: number) => column.name ?? (typeof column.header === 'string' ? column.header : `column ${i + 1}`);
  const direction = (column: Column, dir: Direction) =>
    column.order ? column.order[dir] : dir === 'asc' ? 'lowest first' : 'highest first';

  const announcement = sort
    ? `Sorted by ${named(columns[sort.column], sort.column)}, ${direction(columns[sort.column], sort.direction)}.`
    : `In ${defaultOrder ?? 'the original order'}.`;

  const table = (
    <table className="govuk-table">
      {caption ? <caption className={`govuk-table__caption govuk-table__caption--${captionSize}`}>{caption}</caption> : null}
      <thead className="govuk-table__head">
        <tr className="govuk-table__row">
          {/*
            A NUMERIC COLUMN NEVER WRAPS ITS OWN HEADING. The browser sizes a
            column to its content, and a column of two-digit counts is narrower
            than the word above it — so "Artefacts" rendered as a vertical stack
            of four letters beside rows of prose that had taken all the width.
            `white-space: nowrap` makes the heading the floor for its column.
          */}
          {columns.map((column, i) => (
            <th key={i} scope="col" style={column.width ? { width: column.width } : undefined}
                aria-sort={column.sortable
                  ? sort?.column === i ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                  : undefined}
                className={cx(
                  'govuk-table__header',
                  column.numeric && 'govuk-table__header--numeric',
                  column.numeric && 'prt-nowrap',
                )}>
              {column.sortable && sortKeys ? (
                /*
                 * THE WHOLE CELL IS THE CONTROL. A small chevron beside the
                 * heading is a 12px target in a header a reader is already
                 * pointing at, and the pressed state has to be visible to a
                 * sighted reader as well as announced — `aria-sort` alone tells
                 * assistive technology which column is sorted and tells everyone
                 * else nothing.
                 */
                <button type="button" className="prt-sortbutton" onClick={() => press(i)}>
                  {column.header}
                  <span className="prt-sortbutton__mark" aria-hidden="true">
                    {sort?.column === i ? (sort.direction === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </button>
              ) : column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="govuk-table__body">
        {rowOrder.map((source) => (
          <tr key={source} className="govuk-table__row">
            {rows[source].map((cell, j) =>
              j === 0 && firstCellIsHeader ? (
                <th key={j} scope="row" className="govuk-table__header">{cell}</th>
              ) : (
                <td key={j} className={cx('govuk-table__cell', columns[j]?.numeric && 'govuk-table__cell--numeric')}>{cell}</td>
              )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const body = scroll
    ? (
      <div className="prt-scroll" tabIndex={0} role="region" aria-label={typeof caption === 'string' ? caption : 'Scrollable table'}>
        {table}
      </div>
    )
    : table;

  if (!sortable) return body;
  return (
    <>
      {body}
      {/*
        ALWAYS MOUNTED, never conditional. A live region inserted and filled in
        the same frame is not reliably announced by NVDA or JAWS — `StressLab`
        and `Feedback` both record the same mechanic — so the first press, which
        is the one that teaches the reader the table moves, would be the silent
        one. It prints too, which is the reading where nobody can see which
        column the arrow is on.
      */}
      <p className="govuk-body-s prt-meta" role="status">{announcement}</p>
    </>
  );
}
