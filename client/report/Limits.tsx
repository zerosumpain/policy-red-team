import { useMemo, useState } from 'react';
import { Checkboxes, Details } from '../govuk';
import { groupLimits } from './warnings';

/**
 * WHAT IT COULD NOT ESTABLISH — eight facts, not one fact five times.
 *
 * The list was deduplicated one level too deep. `Report.tsx` keyed the collapse
 * on the WHOLE warning text while the row rendered only `limitLead()`'s first
 * sentence, so two warnings stating the same fact and then listing different
 * withheld items were two rows. Measured on the live run: 270 warnings, 231
 * distinct texts — and of the eight rows a reader was shown, FIVE read "This
 * call exceeded the model's context window, so its input was reduced.",
 * differing only by a trailing count of 10, 8, 7, 3 and 3. The other 223 went
 * behind one disclosure labelled "The other 223".
 *
 * Keyed on the lead sentence the page actually prints, those five are one row
 * reading 43 across 9 stages, the 231 texts collapse to 181 groups, the eight
 * slots carry eight different facts, and the tail falls to 173.
 *
 * AND THE STAGE COMES BACK. `stages.flatMap((s) => s.warnings)` threw away which
 * stage recorded each limit before anything could read it, which is why nothing
 * in this section could say where a limit came from. The losses are not spread
 * evenly — Document decomposition 60, Actor and incentive profiles 53,
 * Exploitation playbook 33, and two stages with none at all — so the stage is
 * both the attribution on every row and the one axis this panel can honestly be
 * filtered by. It is NOT the report-wide `Selection`: a band or a mechanism has
 * nothing to say to a record of how the report was made.
 */
const LIMITS_SHOWN = 8;

export function Limits({ stages }: { stages: { ordinal: number; name: string; warnings: string[] }[] }) {
  const [only, setOnly] = useState<string[]>([]);

  /** Every stage that recorded anything, in pipeline order, with its count. */
  const recorded = useMemo(() => stages
    .filter((stage) => (stage.warnings ?? []).length)
    .sort((a, b) => a.ordinal - b.ordinal), [stages]);

  const shown = only.length ? recorded.filter((stage) => only.includes(stage.name)) : recorded;
  const groups = useMemo(() => groupLimits(shown), [shown]);
  // The whole run's group count, which is the figure the opening sentence
  // states — it must not move when the reader narrows the list underneath it.
  const all = useMemo(() => groupLimits(recorded).length, [recorded]);
  const recordings = groups.reduce((n, group) => n + group.total, 0);

  if (!recorded.length) return null;

  const line = (group: ReturnType<typeof groupLimits>[number]) => {
    const tails = group.stages.flatMap((stage) => stage.tails.map((tail) => ({ stage: stage.name, tail })));
    return (
      <li key={group.lead} className="prt-gap">
        <p className="prt-gap__lead">
          {group.lead}
          {group.total > 1 ? (
            <span className="prt-meta">
              {' '}— {group.total} times, across {group.stages.length}{' '}
              {group.stages.length === 1 ? 'stage' : 'stages'}
            </span>
          ) : (
            <span className="prt-meta"> — {group.stages[0]?.name}</span>
          )}
        </p>
        {tails.length ? (
          /*
            ONE BULLET PER DISTINCT INVENTORY, each named by the stage that
            recorded it. It was a single paragraph holding one tail, so forty-two
            other inventories under the same lead were simply not on the page.
            Nothing is dropped here, which is the invariant this section exists
            for: it is the record of what the assessment could NOT do, and
            quietly truncating it would be the worst possible place to save room.
          */
          <Details summary={`What it withheld — ${tails.length} ${tails.length === 1 ? 'inventory' : 'inventories'}`}>
            <ul className="govuk-list govuk-list--bullet govuk-body-s">
              {tails.map(({ stage, tail }) => (
                <li key={`${stage}-${tail}`}><strong>{stage}</strong> — {tail}</li>
              ))}
            </ul>
          </Details>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <p className="govuk-body">
        The run recorded {recorded.reduce((n, stage) => n + stage.warnings.length, 0).toLocaleString()} limits
        across {recorded.length} of its {stages.length} stages. Grouped on the fact each one states, they
        are {all.toLocaleString()} different limits. Nothing here is dropped —
        this is the record of what the assessment could not do.
      </p>

      {/*
        THE RAIL IS `StressLab`'s, in its small variant, for the reason that panel
        gives: a list a reader SCANS rather than answers once. It carries each
        stage's count, so it is a distribution as well as a control — which is the
        thing the flattened array could never show.

        IT PRINTS, and that is deliberate rather than accidental: it is a
        `<fieldset>` and not a `<form>`, so the print rules leave it alone, and a
        printed copy that says which stages were shown is a printed copy a reader
        can trust. The `Details` around it prints open for the same reason every
        other disclosure in this report does.
      */}
      <Details summary={`Show only certain stages (${recorded.length} recorded something)`} open>
        <div className="prt-stagefilter">
          <Checkboxes
            id="limit-stages"
            small
            legend="Stages"
            legendSize="s"
            hint="Leave every box clear to read the whole run."
            items={recorded.map((stage) => ({
              value: stage.name,
              text: `${stage.ordinal + 1}. ${stage.name} (${stage.warnings.length})`,
            }))}
            values={only}
            onChange={setOnly}
          />
        </div>
      </Details>

      {/*
        ALWAYS MOUNTED, never conditional — the mechanic `Table` and `StressLab`
        both record: a live region inserted and filled in the same frame is not
        reliably announced, so the first press, which is the one that teaches the
        reader the list moves, would be the silent one.
      */}
      <p className="govuk-body-s prt-meta" role="status">
        Showing {groups.length.toLocaleString()} {groups.length === 1 ? 'limit' : 'limits'} from{' '}
        {shown.length} {shown.length === 1 ? 'stage' : 'stages'}, recorded {recordings.toLocaleString()}{' '}
        {recordings === 1 ? 'time' : 'times'}.
      </p>

      {groups.length ? (
        <>
          <ul className="prt-gaps">{groups.slice(0, LIMITS_SHOWN).map(line)}</ul>
          {groups.length > LIMITS_SHOWN ? (
            <Details summary={`The other ${groups.length - LIMITS_SHOWN}`}>
              <ul className="prt-gaps">{groups.slice(LIMITS_SHOWN).map(line)}</ul>
            </Details>
          ) : null}
        </>
      ) : (
        <p className="govuk-body">Those stages recorded nothing.</p>
      )}
    </>
  );
}
