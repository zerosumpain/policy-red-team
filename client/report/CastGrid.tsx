import { useMemo, type ReactNode } from 'react';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { clip, TRAIT_COLUMNS, traitGrid, type Cell, type TraitRow } from '$lib/policy-analysis/matrix';
import type { ActorView, PersonaLink } from '$lib/policy-analysis/view';
import { BAND_LABEL, type Band } from '$lib/policy-analysis/view';
import { Details, Table } from '../govuk';
import { Metrics } from './Metrics';
import { castCoverage, isSilent, SILENT_TEXT } from './cast';

/**
 * WHAT MOVES EACH BODY — and the questions the paper does not answer about it.
 *
 * `matrix.ts` has held `TRAIT_COLUMNS`, `traitGrid()` and `traitCoverage()` since
 * the grid rebuild, with a header making exactly this move's case: "A reader
 * comparing two bodies had to hold one in their head and scroll… A comparison
 * wants a GRID." Nothing in `client/` has ever called them. Move 4 — the move
 * called "who would do it" — showed a reader nothing about any body except its
 * play count and its worst exposure, while 330 profile sentences sat in the
 * payload unread.
 *
 * THE SILENCE IS THE FINDING AND THE GRID IS THE EVIDENCE, which is why the
 * figures come first. Of the 72 cells the twelve active bodies fill, 38 are a
 * sentence saying the paper is silent — every one of the twelve on "Gains if it
 * fails", seven of twelve on "Answers to". `traitCoverage()` counts those as
 * filled, because from inside the pipeline they are; captioning this grid with
 * its own coverage function would print "72 of 72 filled" over a grid that is
 * half absence. `cast.ts` carries the predicate that tells them apart and the
 * audit behind it.
 *
 * ONE GRID, NOT A COVERAGE STRIP AND THEN THE SAME GRID AGAIN. A 12 × 6 map of
 * answered-against-silent above a 12 × 6 table of the answers is the defect this
 * wave is removing from the rest of Move 4 — the same twelve bodies printed
 * twice — so the silence is carried inside the grid, in words, and each column
 * heading says how many of the twelve it holds an answer for.
 */

/**
 * How many characters a cell keeps.
 *
 * `clip`'s own default is 46, chosen for a 10rem column. Six columns of 46
 * characters is about 3,300 characters of grid, and print forces
 * `table-layout: fixed` at 0.85em with roughly 88px a column. 34 is about four
 * words — two lines in the 11rem the stylesheet gives a cell — which is enough
 * to tell two bodies apart down a column; the full sentence, its source and its
 * confidence are one click away in the drill, which is where `matrix.ts` says
 * they belong.
 */
const CAST_CHARS = 34;

export function CastGrid({ board, personas, linkTo }: {
  board: ActorView[];
  personas: PersonaLink[];
  linkTo?: (artefact: Artefact, label?: string) => ReactNode;
}) {
  /*
   * PROFILED ROWS ONLY. `traitGrid` takes the whole board, and on this run the
   * board is 171 candidate rows of which 55 carry a profile — so handing it the
   * raw board would report coverage of 330 cells out of 1,026 and draw 116 rows
   * of six empty cells. The 55 with a profile are the cast.
   */
  const rows = useMemo(() => traitGrid(board.filter((view) => view.profile), personas), [board, personas]);
  const active = rows.filter((row) => row.playCount > 0);
  const idle = rows.filter((row) => row.playCount === 0);

  const coverage = useMemo(() => castCoverage(active), [active]);
  const actorById = useMemo(() => new Map(board.map((view) => [view.actor.id, view.actor])), [board]);
  if (!active.length) return null;

  const accountable = coverage.columns[0];
  const gain = coverage.columns[coverage.columns.length - 1];

  const grid = (subject: TraitRow[], caption: string) => {
    // The column total goes IN the column heading rather than in a row of
    // totals under the grid: "Gains if it fails — 0 of 12 answered" is a fact
    // about the column, and a reader meets it before the cells rather than
    // after scrolling past them.
    const totals = castCoverage(subject);
    return (
    <div className="prt-cast">
    <Table
      caption={caption}
      captionSize="s"
      scroll
      firstCellIsHeader
      columns={[
        { header: 'Body' },
        ...totals.columns.map((column) => ({
          header: (
            <>
              {column.head}
              <span className="prt-cast__count">{column.answered} of {subject.length} answered</span>
            </>
          ),
        })),
      ]}
      rows={subject.map((row) => [
        <>
          {/* The row's own ranking, kept on the row: this grid replaces nothing,
              and a reader arriving at it from the body table above needs to see
              that the order is the same one. */}
          <span className="prt-cast__name">{link(row, actorById, linkTo)}</span>
          <span className="prt-cast__rank">
            {row.band ? <span className={`prt-band prt-band--${row.band}`}>{BAND_LABEL[row.band as Band]}</span> : null}
            <span className="prt-denom">
              {row.playCount} {row.playCount === 1 ? 'play' : 'plays'}
              {row.band ? ` · worst ${(row.worst / 100).toFixed(2)}` : ''}
            </span>
          </span>
        </>,
        ...row.cells.map((cell) => cellText(cell)),
      ])}
    />
    </div>
    );
  };

  return (
    <>
      <p className="govuk-body">
        The assessment builds a profile of every body the paper names and asks the same six
        questions of each: who can call it to account, what it is measured by, how far ahead it can
        afford to care, what it knows that others do not, what it does if it declines to play
        along, and who around it is better off if the policy fails. The grid is those answers for
        the {active.length} bodies positioned to run a play. The figures first, because the answer
        the paper most often gives is that it does not say.
      </p>

      <Metrics
        columns={3}
        metrics={[
          {
            label: 'questions the paper does not answer',
            value: `${coverage.silent} of ${coverage.total}`,
            note: `across ${active.length} bodies and ${TRAIT_COLUMNS.length} questions each`,
          },
          {
            label: gain.head.toLowerCase(),
            value: `${gain.answered} of ${active.length}`,
            note: gain.asks,
          },
          {
            label: accountable.head.toLowerCase(),
            value: `${accountable.answered} of ${active.length}`,
            note: accountable.asks,
          },
        ]}
      />

      {/* THE ORIGIN, STATED ONCE. `matrix.ts` argues for exactly this and
          provides `dominantOrigin` to do it — and that function returns null on
          this assessment, because the split is 55/39/6 and the gate is 60%. So
          the split is stated instead, which is a longer sentence and a true
          one, and the cells stay unannotated either way. */}
      <p className="govuk-body-s prt-meta">
        Of the {coverage.answered} answered cells, {originLine(coverage.origins)}.
      </p>

      {grid(active, `What moves each body — the ${active.length} positioned to run a play`)}

      <p className="govuk-body-s prt-caption">
        Every cell is clipped to about {CAST_CHARS} characters; the full sentence, its source and
        its epistemic status are on the body&rsquo;s own record. A cell reading
        &ldquo;{SILENT_TEXT}&rdquo; is one where the profile&rsquo;s answer opens by saying the
        paper does not.
      </p>

      {idle.length ? (
        <Details summary={`${idle.length} more profiled bodies that run no play`}>
          <p className="govuk-body-s">
            The same six questions, asked of the bodies the paper names and profiles but that no
            play in this assessment runs through.
          </p>
          {grid(idle, `What moves each body — the ${idle.length} that run no play`)}
        </Details>
      ) : null}
    </>
  );
}

/**
 * The body's name, and the way into its record where the caller has one.
 *
 * `traitGrid` returns ids and labels rather than the artefacts they came from,
 * so the board is asked for the artefact `linkTo` needs. A row whose artefact
 * has gone renders as its own name, which is what every other optional-link
 * cell in this tree does.
 */
function link(row: TraitRow, actors: Map<string, Artefact>, linkTo?: (artefact: Artefact, label?: string) => ReactNode): ReactNode {
  const actor = actors.get(row.id);
  return actor && linkTo ? linkTo(actor, row.label) : row.label;
}

/** What a cell prints: the clipped answer, or the fact that there is not one. */
function cellText(cell: Cell): ReactNode {
  if (!cell) return <span className="prt-meta">Not recorded</span>;
  if (isSilent(cell)) return <span className="prt-meta">{SILENT_TEXT}</span>;
  return clip(cell.full, CAST_CHARS).text;
}

/** "22 are extracted from the paper, 9 are inferred from its structure" — origins, in words. */
function originLine(origins: { origin: string; count: number }[]): string {
  const words: Record<string, string> = {
    extracted_fact: 'are extracted from the paper',
    structural_inference: 'are inferred from its structure',
    behavioural_hypothesis: 'are behavioural hypotheses',
  };
  const parts = origins.map(({ origin, count }) => `${count} ${words[origin] ?? `are ${origin.replaceAll('_', ' ')}`}`);
  if (parts.length <= 1) return parts[0] ?? 'none carries a recorded origin';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
