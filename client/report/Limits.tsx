import { useMemo, useState } from 'react';
import { Checkboxes, Details } from '../govuk';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { affectedInWords, stageOnePlaces } from '$lib/refused';
import { groupLimits, noteRows, partLimits } from './warnings';

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
/**
 * The model's notes about the paper (phase 23): eight in view, and never more
 * than `NOTES_CAP` on the page however many a run wrote — they are model text,
 * and every render of a model-produced list has a ceiling. Counted past it.
 */
const NOTES_SHOWN = 8;
const NOTES_CAP = 120;
const NONE: Artefact[] = [];

export function Limits({ stages: noted, artefacts = NONE }: {
  stages: { ordinal: number; name: string; warnings: string[]; notes?: string[] }[];
  /** For saying where a refused item came from; see `affectedInWords`. */
  artefacts?: Artefact[];
}) {
  const [only, setOnly] = useState<string[]>([]);
  /*
   * A DISCARD'S INVENTORY IS IDS. "What it withheld" printed the warning's tail
   * as stored — "Affected: s1_000_009 (claim), s1_000_010 (claim)." — the same
   * column of identifiers for things never kept that the discard panel used to
   * print. Said in words here exactly as there: by page for step 2, by step and
   * kind otherwise. The stage is in bold beside it, so it is not said twice.
   */
  const places = useMemo(() => stageOnePlaces(artefacts), [artefacts]);
  /*
   * THE RUN'S LIMITS AND THE MODEL'S NOTES ABOUT THE PAPER ARE TWO LISTS
   * (phase 23). "The passage does not specify funding amounts" is the model
   * reading the paper; "18 long items were clipped" is the run. Everything below
   * that counts or groups a limit reads `stages` — the run's part — and the
   * notes are their own list at the end.
   */
  const { limits: stages, notes: noteStages } = useMemo(() => partLimits(noted), [noted]);
  const ordinalOf = useMemo(() => new Map(stages.map((stage) => [stage.name, stage.ordinal])), [stages]);

  /** Every stage that recorded anything, in pipeline order, with its count. */
  const recorded = useMemo(() => stages
    .filter((stage) => (stage.warnings ?? []).length)
    .sort((a, b) => a.ordinal - b.ordinal), [stages]);
  /** The rail lists every step that noted ANYTHING, limits or notes. */
  const railed = useMemo(() => noted
    .filter((stage) => (stage.warnings ?? []).length)
    .sort((a, b) => a.ordinal - b.ordinal), [noted]);

  const shown = only.length ? recorded.filter((stage) => only.includes(stage.name)) : recorded;
  const notes = useMemo(() => noteRows(only.length ? noteStages.filter((stage) => only.includes(stage.name)) : noteStages), [noteStages, only]);
  const noteTotal = noteStages.reduce((n, stage) => n + stage.notes.length, 0);
  const groups = useMemo(() => groupLimits(shown), [shown]);
  // The whole run's group count, which is the figure the opening sentence
  // states — it must not move when the reader narrows the list underneath it.
  const all = useMemo(() => groupLimits(recorded).length, [recorded]);
  const recordings = groups.reduce((n, group) => n + group.total, 0);

  if (!railed.length) return null;

  const line = (group: ReturnType<typeof groupLimits>[number]) => {
    const tails = group.stages.flatMap((stage) => stage.tails.map((tail) => ({ stage: stage.name, tail })));
    return (
      <li key={group.lead} className="prt-gap">
        <p className="prt-gap__lead">
          {group.lead}
          {group.total > 1 ? (
            <span className="prt-meta">
              {' '}— {group.total} times, across {group.stages.length}{' '}
              {group.stages.length === 1 ? 'step' : 'steps'}
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
                <li key={`${stage}-${tail}`}><strong>{stage}</strong> — {affectedInWords(tail, ordinalOf.get(stage) ?? null, null, places)}</li>
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
        The run noted {recorded.reduce((n, stage) => n + stage.warnings.length, 0).toLocaleString()} gaps
        in its own work across {recorded.length} of its {stages.length} steps. Grouped on the fact each one
        states, they are {all.toLocaleString()} different gaps. Nothing here is dropped —
        this is the record of what the assessment could not do.
        {noteTotal ? <> The model also noted {noteTotal.toLocaleString()} {noteTotal === 1 ? 'thing' : 'things'} the
        paper does not say; they are listed after the gaps.</> : null}
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
      <Details summary={`Show only certain steps (${railed.length} noted something)`} open>
        <div className="prt-stagefilter">
          <Checkboxes
            id="limit-stages"
            small
            legend="Steps"
            legendSize="s"
            hint="Leave every box clear to read the whole run."
            items={railed.map((stage) => ({
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
        {shown.length} {shown.length === 1 ? 'step' : 'steps'}, recorded {recordings.toLocaleString()}{' '}
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
        <p className="govuk-body">Those steps recorded no gap in the run's own work.</p>
      )}

      {/*
        WHAT THE PAPER DOES NOT SAY — the model's notes, apart from the run's
        limits since phase 23. They were the largest single class in the list
        above (103 of 256 on the Post-16 run) and read as failures of the run,
        which they are not: "no funding amounts are stated" is a finding about
        the paper. They are also no longer carried into later steps' prompts.
      */}
      {noteTotal ? (
        <>
          <h3 className="govuk-heading-s">What the paper does not say</h3>
          <p className="govuk-body-s prt-meta">
            {notes.length.toLocaleString()} {notes.length === 1 ? 'note' : 'different notes'} the model made while
            reading the paper{only.length ? ' in the steps chosen above' : ''}. These are about the paper, not about
            this run, and were not carried into later steps.
          </p>
          {notes.length ? (
            <>
              <ul className="prt-gaps">{notes.slice(0, NOTES_SHOWN).map(noteLine)}</ul>
              {notes.length > NOTES_SHOWN ? (
                <Details summary={`The other ${Math.min(notes.length, NOTES_CAP) - NOTES_SHOWN}${notes.length > NOTES_CAP ? ` of ${notes.length - NOTES_SHOWN}` : ''}`}>
                  <ul className="prt-gaps">{notes.slice(NOTES_SHOWN, NOTES_CAP).map(noteLine)}</ul>
                  {notes.length > NOTES_CAP ? (
                    <p className="govuk-body-s prt-meta">And {(notes.length - NOTES_CAP).toLocaleString()} more, not listed here.</p>
                  ) : null}
                </Details>
              ) : null}
            </>
          ) : (
            <p className="govuk-body-s">Those steps noted nothing about the paper.</p>
          )}
        </>
      ) : null}
    </>
  );
}

function noteLine(row: { text: string; stages: string[] }) {
  return (
    <li key={row.text} className="prt-gap">
      <p className="prt-gap__lead">
        {row.text}
        <span className="prt-meta"> — {row.stages.length > 2 ? `${row.stages.length} steps` : row.stages.join(' and ')}</span>
      </p>
    </li>
  );
}
