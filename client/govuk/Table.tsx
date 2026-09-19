import type { ReactNode } from 'react';
import { cx } from './cx';

export interface Column {
  header: ReactNode;
  numeric?: boolean;
  width?: string;
}

/**
 * A table, and — when it is wider than the page — the box it scrolls inside.
 *
 * A scrolling region has to be focusable and labelled or a keyboard user cannot
 * reach the part that is off-screen; axe reports exactly that, and it is the
 * only reason `scroll` exists as an option rather than a wrapper the caller
 * remembers to add.
 */
export function Table({
  caption, captionSize = 'm', columns, rows, scroll, firstCellIsHeader,
}: {
  caption?: ReactNode;
  captionSize?: 's' | 'm' | 'l' | 'xl';
  columns: Column[];
  rows: ReactNode[][];
  scroll?: boolean;
  firstCellIsHeader?: boolean;
}) {
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
                className={cx(
                  'govuk-table__header',
                  column.numeric && 'govuk-table__header--numeric',
                  column.numeric && 'prt-nowrap',
                )}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="govuk-table__body">
        {rows.map((row, i) => (
          <tr key={i} className="govuk-table__row">
            {row.map((cell, j) =>
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

  if (!scroll) return table;
  return (
    <div className="prt-scroll" tabIndex={0} role="region" aria-label={typeof caption === 'string' ? caption : 'Scrollable table'}>
      {table}
    </div>
  );
}
