import { useMemo } from 'react';
import { Table, Tag } from '../govuk';
import { Bar } from './Metrics';
import { Figure } from './Figure';
import { truncations } from './warnings';

/**
 * WHERE THE MODEL COULD NOT SEE EVERYTHING.
 *
 * 44 of the run's 270 limits are context-window truncations, spread across
 * exactly 10 of the 18 stages, and nine of them carry the pipeline's own
 * instruction: "Read this stage as partial." Seven of those nine are in
 * Independent challenge — the stage whose entire job is to challenge the
 * assessment — and one each in Options and evaluation and Assured synthesis,
 * which are the two stages that write the report's conclusions.
 *
 * ON THE PAGE THIS WAS FIVE NEAR-IDENTICAL GREY ROWS reading "This call exceeded
 * the model's context window, so its input was reduced. — recorded 10 times",
 * each behind a "What it withheld" disclosure. Nothing above them said that the
 * last three stages of the assessment were written by a model that could not see
 * most of the inventory. That is the strongest caveat this report has, and it
 * was the one thing a reader had to open a disclosure to find.
 *
 * THE DENOMINATOR IS THE HONEST ONE. Not 2,296 — the finished total, which those
 * calls could not have seen because most of it did not exist yet — but the
 * artefacts that had been minted before that stage ran: 1,236 of 2,251 for
 * Options and evaluation, 1,222 of 2,257 for Independent challenge, 1,210 of
 * 2,265 for Assured synthesis. Cumulative `kept`, which `forTheReport` attaches
 * to every stage so the pack has it too.
 *
 * NOT ONE TAG PER ABSENT KIND. Options and evaluation names fourteen of them and
 * ten rows would put up to 140 tags on the page, which is a wall at 320px. Three
 * and a count in the diagram; every one of them in the table.
 */
const KINDS_SHOWN = 3;

export function Withheld({ stages }: {
  stages: { ordinal: number; name: string; warnings: string[]; kept?: number }[];
}) {
  const rows = useMemo(() => truncations(stages), [stages]);

  /*
   * WHAT EXISTED BEFORE EACH STAGE RAN. Built from the stage rows in ordinal
   * order rather than from `artefactMetadata`, which is `[]` in the offline pack
   * — so a denominator derived from the metadata would have been a figure the
   * service could state and the pack could not.
   */
  const before = useMemo(() => {
    const totals = new Map<number, number>();
    let running = 0;
    for (const stage of [...stages].sort((a, b) => a.ordinal - b.ordinal)) {
      totals.set(stage.ordinal, running);
      running += stage.kept ?? 0;
    }
    return totals;
  }, [stages]);

  if (!rows.length) return null;

  const deepest = Math.max(...rows.map((row) => row.withheld));
  const partial = rows.filter((row) => row.partial);
  const scale = `items withheld from one call, 0 to ${deepest.toLocaleString()} on this run`;

  /** "1,236 of 2,251", or the bare figure where nothing can say what it is of. */
  const denominator = (row: { ordinal: number; withheld: number }) => {
    const of = before.get(row.ordinal);
    return of ? `${row.withheld.toLocaleString()} of ${of.toLocaleString()}` : row.withheld.toLocaleString();
  };

  const diagram = (
    <ul className="prt-withheld">
      {rows.map((row) => (
        <li key={row.ordinal} className="prt-withheld__row">
          <span className="prt-withheld__name">
            <span className="prt-ladder__ord">{row.ordinal + 1}</span> {row.name}
            {/* A WORD, NEVER A COLOUR ALONE — and it is the run's own word, not a
                judgement added here. */}
            {row.partial ? <> <Tag colour="yellow">Read as partial</Tag></> : null}
          </span>
          <span className="prt-withheld__bar">
            <Bar value={row.withheld} max={deepest} digits={0} scale={scale} />
          </span>
          <span className="prt-withheld__figures">
            <strong>{denominator(row)}</strong> withheld from its deepest call
            <span className="prt-denom">
              {row.calls} {row.calls === 1 ? 'call' : 'calls'} reduced
              {row.kinds.length ? (
                <>
                  {' · none of '}
                  {row.kinds.slice(0, KINDS_SHOWN).join(', ')}
                  {row.kinds.length > KINDS_SHOWN ? ` and ${row.kinds.length - KINDS_SHOWN} more` : ''}
                </>
              ) : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );

  const table = (
    <Table
      caption="Every step that worked from less than the whole assessment"
      captionSize="s"
      scroll
      firstCellIsHeader
      columns={[
        { header: 'Step' },
        { header: 'Calls reduced', numeric: true },
        { header: 'Withheld from the deepest call', numeric: true },
        { header: 'Kinds that call held none of' },
        { header: 'Read as partial' },
      ]}
      rows={rows.map((row) => [
        `${row.ordinal + 1}. ${row.name}`,
        row.calls.toLocaleString(),
        denominator(row),
        row.kinds.length ? row.kinds.join(', ') : 'none named',
        row.partial ? 'Yes — the run said so' : 'No',
      ])}
    />
  );

  return (
    <>
      <p className="govuk-body">
        {rows.length} of the {stages.length} steps made at least one request to the model that could
        not include the whole assessment. The figures are the DEEPEST single request in each step, not a
        sum across its calls — twelve calls that each withheld 191 items did not withhold 2,292.
      </p>
      {partial.length ? (
        <p className="govuk-body">
          {partial.length === 1 ? 'One step' : `${partial.length} steps`} carried the run&rsquo;s own
          instruction to read them as partial: {partial.map((row) => row.name).join(', ')}. Conclusions
          drawn there rest on less than the whole assessment, and the report says so nowhere else.
        </p>
      ) : null}
      <Figure
        label="how much each step could not be shown"
        /* HTML and CSS, so there is no 7px-SVG-text problem to flip away from. */
        flipAtNarrow={false}
        diagram={diagram}
        table={table}
      />
    </>
  );
}
