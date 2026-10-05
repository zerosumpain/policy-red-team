import { Table } from '../govuk';
import { Bar } from './Metrics';
import { Figure } from './Figure';
import { formatTokens } from '$lib/canvas/stats/costFormat';
import { percent, type ValueLedger as Ledger } from '$lib/value-ledger';

/**
 * WHAT EACH STEP SPENT, AGAINST WHAT CAME OF IT (phase 23, T6).
 *
 * The ladder above says how long each step took and what it kept. This says
 * what the model read and wrote to get there, and whether anything downstream
 * — or any reader — used it. On the Best Start run the two columns disagree
 * loudly: the relationship graph read 19.6M tokens and three quarters of what
 * it made was cited later; the actor profiles read 1.9M and 12% of theirs was.
 * That is the comparison every future cut is judged by, so it is drawn rather
 * than left in a database.
 *
 * TWO BARS, FOR THE TWO QUANTITIES WHOSE RANGES A BAR CAN CARRY: input tokens
 * (one scale for the run, in millions) and the share of a step's items a later
 * step cited (0 to 100, the same for every row). Output tokens, the cache and
 * the repairs are numbers in the table — they matter, but as figures to read,
 * not lengths to compare. Same grid and classes as `StageLadder`, so the two
 * figures line up and drop to one column on a phone the same way.
 *
 * A STEP WITH NO MODEL CALL SAYS SO in words: ingestion and the structural
 * checks are code, and an empty track would read as a step that failed.
 */
export function ValueLedger({ ledger }: { ledger: Ledger }) {
  const rows = ledger.rows.filter((row) => row.calls > 0 || row.made > 0);
  if (!rows.length) return null;
  const { total } = ledger;
  const inputMax = Math.max(0, ...rows.map((row) => row.input)) / 1e6;
  const inputScale = `input tokens in millions, 0 to ${inputMax.toFixed(1)} across this run`;
  const citedScale = 'per cent of this step\'s items that a later step cited, 0 to 100';

  const columns = ['minmax(12em, 22em)', 'minmax(0, 1fr)', 'minmax(0, 1fr)'].join(' ');
  const diagram = (
    <div className="prt-ladder" style={{ ['--prt-ladder-cols' as string]: columns }}>
      <div className="prt-ladder__legend" aria-hidden="true">
        <span>Step</span>
        <span>Input, millions of tokens</span>
        <span>Items cited by a later step, %</span>
      </div>
      <ol className="prt-ladder__rows">
        {rows.map((row) => (
          <li key={row.ordinal} className="prt-ladder__row">
            <span className="prt-ladder__name prt-ladder__name--plain">
              <span className="prt-ladder__ord">{row.ordinal + 1}</span> {row.name}
              <span className="prt-meta">
                {' '}— {row.calls ? `${row.calls.toLocaleString()} ${row.calls === 1 ? 'call' : 'calls'}${row.repairs ? `, ${row.repairs.toLocaleString()} corrective` : ''}` : 'no model call'}
              </span>
            </span>
            <span className="prt-ladder__cell">
              {row.input ? (
                <Bar value={row.input / 1e6} max={inputMax} digits={1} scale={inputScale} />
              ) : (
                <span className="prt-ladder__none">None</span>
              )}
            </span>
            <span className="prt-ladder__cell">
              {row.cited === null ? (
                <span className="prt-ladder__none">Read by you, not a later step</span>
              ) : row.made ? (
                <Bar value={(row.cited / row.made) * 100} max={100} digits={0} scale={citedScale} />
              ) : (
                <span className="prt-ladder__none">Made nothing</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );

  const table = (
    <Table className="prt-table prt-table--zebra"
      caption="What each step spent, and what came of it"
      captionSize="s"
      scroll
      firstCellIsHeader
      columns={[
        { header: 'Step' },
        { header: 'Model calls', numeric: true },
        { header: 'Of which corrective', numeric: true },
        { header: 'Input tokens', numeric: true },
        { header: 'From the cache', numeric: true },
        { header: 'Output tokens', numeric: true },
        { header: 'Items made', numeric: true },
        { header: 'Cited by a later step', numeric: true },
        { header: 'On a page of this report', numeric: true },
      ]}
      rows={[
        ...rows.map((row) => [
          `${row.ordinal + 1}. ${row.name}`,
          row.calls.toLocaleString(),
          row.repairs.toLocaleString(),
          formatTokens(row.input),
          percent(row.cached, row.input),
          formatTokens(row.output),
          row.made.toLocaleString(),
          row.cited === null ? '—' : `${row.cited.toLocaleString()} (${percent(row.cited, row.made)})`,
          row.shown.toLocaleString(),
        ]),
        [
          'The whole run',
          total.calls.toLocaleString(),
          total.repairs.toLocaleString(),
          formatTokens(total.input),
          percent(total.cached, total.input),
          formatTokens(total.output),
          total.made.toLocaleString(),
          total.cited.toLocaleString(),
          total.shown.toLocaleString(),
        ],
      ]}
    />
  );

  return (
    <>
      <p className="govuk-body">
        The model read {formatTokens(total.input)} tokens and wrote {formatTokens(total.output)} in{' '}
        {total.calls.toLocaleString()} calls, {total.repairs.toLocaleString()} of them corrective rounds.{' '}
        {percent(total.cached, total.input)} of what it read came from the provider&rsquo;s cache, which
        makes it cheaper but no faster. Of the {total.made.toLocaleString()} items the steps kept,{' '}
        {total.cited.toLocaleString()} were cited by a later step and {total.shown.toLocaleString()} are of a
        kind this report draws on a page.
      </p>
      {total.unrecorded ? (
        <p className="govuk-body-s prt-meta">
          {total.unrecorded.toLocaleString()} {total.unrecorded === 1 ? 'call' : 'calls'} recorded no tokens — a
          call that runs out of time leaves nothing to count, so the figures above are a floor.
        </p>
      ) : null}
      <Figure label="what each step spent" flipAtNarrow={false} diagram={diagram} table={table} />
      <p className="govuk-body-s prt-meta">
        &ldquo;Cited by a later step&rdquo; counts an item when anything a later step kept names it in its
        references. The last step&rsquo;s items are the report itself, so they are not counted that way.
      </p>
    </>
  );
}
