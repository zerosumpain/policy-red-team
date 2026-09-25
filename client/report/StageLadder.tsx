import { Table } from '../govuk';
import { Bar } from './Metrics';
import { Figure } from './Figure';
import { spent } from '../duration';
import { statusLabel } from '../status';

/**
 * THE EIGHTEEN STAGES, WHICH THE FINISHED REPORT DELETED.
 *
 * `Assessment.tsx` drops its own task list the moment a report exists, under a
 * comment saying the stages "live in Provenance, which is what that move is
 * for". They did not: the whole pipeline was one summary-list row reading
 * "Stages — 18 of 18 completed". Measured on the live run, that row is hiding a
 * 10h 23m assessment in which ONE stage took 8h 18m — 80% of it — while three
 * finished in under a second; in which stage 2 minted 1,275 of the 2,296
 * artefacts and stage 12 minted none; and in which two stages recorded 113 of
 * the 270 limits between them and two recorded none.
 *
 * ORDINAL ORDER, NOT SORTED. The pipeline order is itself information — a
 * reader should see that the two stages that struggled most are the second and
 * the fifth, and that the cutting gets worse as the inventory grows — and
 * sorting by any column would destroy the one axis the data already has.
 *
 * NO DURATION BAR, AND THAT IS A MEASUREMENT RATHER THAN A PREFERENCE. The run
 * is 623.0 minutes and Assured synthesis is 498.4 of them, against five stages
 * under ninety seconds and three at 0.0. On a linear axis that is one full bar
 * and seventeen stubs; on a log axis it is a GOV.UK report asking a lay reader
 * to read a log scale. So the duration is printed, in words, with its share of
 * the run beside it — and the two bars are drawn for the two quantities whose
 * ranges a bar can honestly carry.
 *
 * `Bar` PRINTS ITS OWN VALUE — `value.toFixed(places)` — so a zero renders as
 * "0" against an empty track, which reads as a fault in the row rather than as
 * a fact about the stage. The two stages that recorded no limits and the one
 * that minted nothing get the word instead.
 */
export type LadderRow = {
  ordinal: number;
  name: string;
  status: string;
  /** Wall clock for this stage, or null where the pack was made before timings travelled. */
  ms: number | null;
  /** Artefacts minted, or null where nothing on this reading can say. */
  kept: number | null;
  limits: number;
};

export function StageLadder({ rows, runMs, selected, onSelect }: {
  rows: LadderRow[];
  /** The whole run, for the share column. Null where the timings are absent. */
  runMs: number | null;
  selected: number | null;
  /**
   * Optional, like every control in the report tree: the offline pack renders
   * whatever it is handed, and a ladder with no way to narrow anything is still
   * the figure this panel was missing.
   */
  onSelect?: (ordinal: number | null) => void;
}) {
  if (!rows.length) return null;

  const keptMax = Math.max(0, ...rows.map((row) => row.kept ?? 0));
  const limitMax = Math.max(0, ...rows.map((row) => row.limits));
  const timed = rows.some((row) => row.ms !== null);
  const counted = rows.some((row) => row.kept !== null);

  /** "80%", or nothing at all below one per cent — a row of "0%" says less than a blank. */
  const share = (ms: number | null) => {
    if (ms === null || !runMs) return '';
    const percent = Math.round((ms / runMs) * 100);
    return percent >= 1 ? `${percent}%` : '';
  };

  const keptScale = `items kept, 0 to ${keptMax.toLocaleString()} across this run`;
  const limitScale = `limits recorded, 0 to ${limitMax.toLocaleString()} across this run`;

  /*
   * THE COLUMNS THIS READING ACTUALLY HAS.
   *
   * A pack made before the timings and counts travelled has neither, and the
   * ladder drew eighteen rows of "not recorded" in a column headed "Ran for" —
   * which is a column of apologies rather than a figure. The template is carried
   * as a custom property rather than as an inline `grid-template-columns`
   * because the stylesheet has to be able to override it: the 320px rule
   * collapses every one of these to a single column, and an inline declaration
   * would beat the media query and take the phone layout with it.
   */
  const columns = [
    'minmax(12em, 22em)',
    timed ? 'minmax(7em, 11em)' : '',
    counted ? 'minmax(0, 1fr)' : '',
    'minmax(0, 1fr)',
  ].filter(Boolean).join(' ');

  const diagram = (
    <div className="prt-ladder" style={{ ['--prt-ladder-cols' as string]: columns }}>
      {/*
        THE COLUMN NAMES, FOR WHOEVER CAN SEE THE COLUMNS. Every row states its
        own figures in words for a screen reader — `Bar` takes a `scale` for
        exactly that — so announcing this strip as well would be hearing each
        heading nineteen times.
      */}
      <div className="prt-ladder__legend" aria-hidden="true">
        <span>Step</span>
        {timed ? <span>Ran for</span> : null}
        {counted ? <span>Items kept</span> : null}
        <span>Limits</span>
      </div>
      <ol className="prt-ladder__rows">
        {rows.map((row) => (
          <li key={row.ordinal} className={`prt-ladder__row${selected === row.ordinal ? ' is-selected' : ''}`}>
            {onSelect ? (
              <button
                type="button"
                className="prt-ladder__name"
                aria-pressed={selected === row.ordinal}
                onClick={() => onSelect(selected === row.ordinal ? null : row.ordinal)}
              >
                <span className="prt-ladder__ord">{row.ordinal + 1}</span> {row.name}
                {/* A STAGE THAT DID NOT FINISH IS NOT A STAGE THAT RAN QUICKLY,
                    and the word is the only thing on the row that says which it
                    was. It rides with the NAME rather than with the duration,
                    because a pack that carries no timings has no duration cell
                    and a failed stage would have lost its only marker with it. */}
                {row.status === 'completed' ? null : (
                  <span className="prt-ladder__status"> — {statusLabel(row.status)}</span>
                )}
              </button>
            ) : (
              <span className="prt-ladder__name prt-ladder__name--plain">
                <span className="prt-ladder__ord">{row.ordinal + 1}</span> {row.name}
                {row.status === 'completed' ? null : (
                  <span className="prt-ladder__status"> — {statusLabel(row.status)}</span>
                )}
              </span>
            )}

            {timed ? (
              <span className="prt-ladder__spent">
                {row.ms === null ? <span className="prt-meta">not recorded</span> : spent(row.ms)}
                {share(row.ms) ? <span className="prt-denom"> · {share(row.ms)}</span> : null}
              </span>
            ) : null}

            {counted ? (
              <span className="prt-ladder__cell">
                {row.kept ? (
                  <Bar value={row.kept} max={keptMax} digits={0} scale={keptScale} />
                ) : (
                  <span className="prt-ladder__none">None</span>
                )}
              </span>
            ) : null}

            <span className="prt-ladder__cell">
              {row.limits ? (
                <Bar value={row.limits} max={limitMax} digits={0} scale={limitScale} />
              ) : (
                <span className="prt-ladder__none">None</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );

  const table = (
    <Table
      caption="Every step, in the order it ran"
      captionSize="s"
      scroll
      firstCellIsHeader
      columns={[
        { header: 'Step' },
        ...(timed ? [{ header: 'Ran for' }] : []),
        ...(timed && runMs ? [{ header: 'Share of the run', numeric: true }] : []),
        ...(counted ? [{ header: 'Items kept', numeric: true }] : []),
        { header: 'Limits', numeric: true },
        { header: 'Status' },
      ]}
      rows={rows.map((row) => [
        `${row.ordinal + 1}. ${row.name}`,
        ...(timed ? [row.ms === null ? 'not recorded' : spent(row.ms)] : []),
        ...(timed && runMs ? [share(row.ms) || '—'] : []),
        ...(counted ? [(row.kept ?? 0).toLocaleString()] : []),
        row.limits.toLocaleString(),
        statusLabel(row.status),
      ])}
    />
  );

  return (
    <Figure
      label="the steps of this run"
      /* HTML AND CSS, SO IT DOES NOT NEED THE NARROW FLIP. The flip exists for
         SVG, whose text resolves to about 7px at the 460px floor; this is a
         grid that drops to one column on a phone and scales with the reader's
         type size. */
      flipAtNarrow={false}
      diagram={diagram}
      table={table}
    />
  );
}
