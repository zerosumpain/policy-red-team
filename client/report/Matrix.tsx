import type { ReactNode } from 'react';
import { axisLabel } from '$lib/policy-analysis/matrix';
import { Table } from '../govuk';

/**
 * A GRID OF ROWS AGAINST COLUMNS, WHICH IS A TABLE AND IS MARKED UP AS ONE.
 *
 * `Network`'s `AdjacencyTable` says why a matrix needs no picture beside it: "a
 * row of full cells is a body everything runs through, an empty column is a body
 * nothing answers to". That component is the precedent this generalises, and the
 * reason it is generalised rather than copied is that four separate changes
 * arrived wanting the same object — bodies against the parts of a policy they
 * are aimed at, models against scenarios, plays against mechanisms — and three
 * of them had written their own.
 *
 * AND A GRID ONLY WHERE THERE IS A MESH. `adjacency()` refuses to draw one below
 * six placeable relationships and the page says so in as many words. Nothing
 * here enforces that, because the density that earns a grid depends on what the
 * axes are: the body-against-target join measured 54 of 120 cells filled on the
 * live run, which is a mesh, where three relationships across forty-seven bodies
 * is not. The caller decides, and the caller should measure first.
 *
 * WHAT A CELL PRINTS IS A NUMBER OR A WORD, NEVER A BAND'S INITIAL. "Severe" and
 * "significant" both begin with S, so an initial is unreadable exactly where the
 * reader needs it most; and a tint alone fails the two light steps of the ramp,
 * which sit below 3:1 against the page. The band tints the cell and the text
 * carries the fact.
 *
 * NO PER-CELL INTERACTION. A twelve-by-ten grid is 120 cells, and 120 tab stops
 * between the table above and the one below is a keyboard trap in everything but
 * name. The column headers are the only controls, and only when a caller asks
 * for them.
 */

export type MatrixAxis = {
  id: string;
  label: string;
  /**
   * What the header renders, where the caller has something richer than a string
   * — a link, usually.
   *
   * A NODE RATHER THAN A `linkTo` PROP, because this renders into the offline
   * pack as well as the service: the pack has no router and no server, so a
   * component that took a link-builder would need the same optional-prop dance
   * every component in this tree performs. Taking the finished node instead
   * leaves the decision where the router actually is.
   */
  node?: ReactNode;
};

export type MatrixCell = {
  /** The number or word the cell prints. Never a band initial, never nothing. */
  text: ReactNode;
  /** A band suffix — severe, significant, moderate, limited — which tints the cell. */
  band?: string;
  /**
   * The sentence a screen reader hears instead of a bare figure, in
   * `cellSentence`'s idiom: "Priority-course starts measure, Department for
   * Education, 2 plays, worst band severe".
   */
  sentence?: string;
};

export function Matrix({
  rows, cols, cell, corner, caption, note, emptyText = 'Nothing', numbered, onColSelect, colSelected,
}: {
  rows: MatrixAxis[];
  cols: MatrixAxis[];
  /** Null where the pair has nothing — the emptiness is usually the finding, so it is said rather than drawn. */
  cell: (row: MatrixAxis, col: MatrixAxis) => MatrixCell | null;
  /** The top-left header, which names both axes: "Body / part →". */
  corner: string;
  caption: string;
  /** A line under the grid — what a cap left off, what the columns are of. */
  note?: ReactNode;
  /** What a screen reader hears in an empty cell: "No play", "Not a player". */
  emptyText?: string;
  /**
   * Number the columns 1…n and print the key beneath.
   *
   * FOR PRINT, AND FOR ANYTHING PAST ABOUT SIX COLUMNS. On paper `.prt-scroll
   * table` is `table-layout: fixed` at 0.85em, so ten columns of clipped names
   * get about 47px each and "Department for…" sets as four broken letters a
   * line. A digit fits in any column that exists, and the key below carries the
   * name at full length.
   */
  numbered?: boolean;
  onColSelect?: (col: MatrixAxis) => void;
  colSelected?: (col: MatrixAxis) => boolean;
}) {
  // An empty grid is a caption over an empty frame, with no way to tell it from
  // a bug. The caller's "nothing to show" sentence is better than this one's.
  if (!rows.length || !cols.length) return null;

  const header = (col: MatrixAxis, i: number) => {
    // `axisLabel` clips on a word boundary at sixteen characters and keeps the
    // leading words — matrix.ts's own note explains why initials are refused:
    // "DLUHC" is a real abbreviation and inventing one for "Large registered
    // providers" is not. The full name is always in the visually-hidden span, so
    // nothing is lost to a screen reader or to search.
    const short = numbered ? String(i + 1) : axisLabel(col.label);
    const inner = (
      <>
        <span aria-hidden="true">{short}</span>
        <span className="govuk-visually-hidden">{col.label}</span>
      </>
    );
    if (!onColSelect) return inner;
    return (
      <button
        type="button"
        className="prt-linkbutton prt-matrix__col"
        aria-pressed={colSelected?.(col) ?? false}
        onClick={() => onColSelect(col)}
      >
        {inner}
      </button>
    );
  };

  return (
    <div className="prt-matrix">
      <Table
        caption={caption}
        captionSize="s"
        scroll
        firstCellIsHeader
        columns={[{ header: corner }, ...cols.map((col, i) => ({ header: header(col, i), numeric: true }))]}
        rows={rows.map((row) => [
          row.node ?? row.label,
          ...cols.map((col) => {
            const found = cell(row, col);
            if (!found) return <span className="govuk-visually-hidden">{emptyText}</span>;
            return (
              <>
                <span className={found.band ? `prt-band prt-band--${found.band}` : undefined}>{found.text}</span>
                {found.sentence ? <span className="govuk-visually-hidden"> — {found.sentence}</span> : null}
              </>
            );
          }),
        ])}
      />
      {numbered ? (
        <ol className="prt-matrix__key">
          {cols.map((col, i) => (
            <li key={col.id}>
              <span className="prt-matrix__num">{i + 1}</span> {col.label}
            </li>
          ))}
        </ol>
      ) : null}
      {note ? <p className="govuk-body-s prt-caption">{note}</p> : null}
    </div>
  );
}
