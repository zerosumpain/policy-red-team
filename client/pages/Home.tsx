import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type AnalysisRow } from '../api';
import { NotificationBanner, Table, Tag, type TagColour } from '../govuk';
import { MOVES } from '../moves';
import { spent, statusLabel, statusColour } from '../status';
import { usePageTitle } from '../layout/Template';

/**
 * Everything assessed so far.
 *
 * A table rather than the site version's card grid: these rows are compared —
 * which paper, when, did it finish — and comparing is what a table is for. The
 * card grid looked better and answered none of those questions at a glance.
 */
export function Home() {
  const [rows, setRows] = useState<AnalysisRow[] | null>(null);
  /**
   * THE EIGHTEEN STAGE NAMES WERE FETCHED AND DROPPED ON THE FLOOR.
   *
   * `server/api.ts` has sent `stages: STAGES` in the landing response since the
   * route existed and `client/api.ts` types it, and the `.then` below took
   * `analyses` and `readOnly` out of the same object and discarded the rest. So
   * the landing screen said "it reads a policy paper as an adversary would" and
   * never showed what reading means — the phrase "eighteen stages" appears once
   * in the whole client, on `/about`, behind a footer link.
   */
  const [stages, setStages] = useState<readonly string[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No page name: the landing page IS the service, and "Policy Red Team —
  // Policy Red Team" is what a title built by rote looks like.
  usePageTitle();

  useEffect(() => {
    api.landing()
      .then((data) => { setRows(data.analyses); setStages(data.stages); setReadOnly(data.readOnly); })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Policy Red Team</h1>
        <p className="govuk-body-l">
          It reads a policy paper as an adversary would: who gains if it fails, and what they can
          do about it while staying compliant.
        </p>
        <p className="govuk-body">
          It is not an assurance review. It will not tell you a policy is fine — a clean report
          means it found nothing, which is not the same thing.
        </p>
        {/* Read-only: say it once, plainly, and do not render a button that
            would 403. A disabled control the reader cannot explain is worse than
            no control at all. */}
        {readOnly ? (
          <NotificationBanner title="Read-only">
            <p className="govuk-body">
              You can open, drill into and download every assessment here. Nothing new can be
              started from this copy.
            </p>
          </NotificationBanner>
        ) : (
          /* The router's Link wearing the button class, rather than our Button
             with an href. Both render the same markup GOV.UK specifies — an <a>
             with role="button" — but an anchor with a plain href reloads the
             whole app to move one page, which in a single-page app is a
             regression nobody would choose deliberately. */
          <Link to="/new" className="govuk-button" role="button" draggable={false} data-module="govuk-button">
            Assess a paper
          </Link>
        )}
      </div>

      {/*
        WHAT IT DOES TO A PAPER, on the screen that is asking you to hand it one.

        The lead says the tool "reads a policy paper as an adversary would" and
        the page then went straight to a table of runs — so a reader could not
        tell whether reading takes ten seconds or ten hours, nor what the thing
        they get back looks like. Both halves were already in hand: the stage
        names arrive in the landing response, and the five moves are the report's
        own tab strip.

        FULL WIDTH, not the two-thirds column the lead sits in. This is a rail of
        eighteen short labels and a row of five blocks; at the measure that suits
        a paragraph the rail is three columns of wrapped text.

        UNGROUPED, AND THAT IS DELIBERATE. The obvious drawing is eighteen stages
        bracketed into the five moves they feed, and the stage-to-move mapping is
        not in the data: `MOVE_ORDER` orders the moves and says nothing about
        stages. Bracketing them would be inventing a correspondence the pipeline
        does not assert, on the first screen of the service.
      */}
      {stages.length ? (
        <div className="govuk-grid-column-full govuk-!-margin-top-6">
          <h2 className="govuk-heading-l">What it does to a paper</h2>
          <ol className="prt-pipeline">
            {stages.map((stage, i) => (
              <li key={stage} className="prt-pipeline__step">
                {/* The ordinal is `aria-hidden` because the list is an `<ol>`:
                    a screen reader already announces "1 of 18", and the printed
                    number is there for the sighted reader who is counting. */}
                <span className="prt-pipeline__n" aria-hidden="true">{i + 1}</span>
                <span className="prt-pipeline__name">{stage}</span>
              </li>
            ))}
          </ol>
          <p className="govuk-body prt-pipeline__joint">
            {stages.length === 18 ? 'Eighteen' : stages.length} stages produce one report in{' '}
            {MOVES.length === 5 ? 'five' : MOVES.length} moves.
          </p>
          <ol className="prt-moves">
            {MOVES.map((move) => (
              <li key={move.id} className="prt-moves__move">
                <span className="prt-moves__step">{move.step}</span>
                <span className="prt-moves__label">{move.label}</span>
                <span className="prt-moves__hint">{move.hint}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="govuk-grid-column-full govuk-!-margin-top-6">
        <h2 className="govuk-heading-l">Assessments</h2>
        {error ? <p className="govuk-body govuk-error-message">{error}</p> : null}
        {rows === null && !error ? <p className="govuk-body">Loading…</p> : null}
        {rows?.length === 0 ? (
          <p className="govuk-body">Nothing assessed yet. Start with a paper you already know well — it is the fastest way to judge whether the thing is any good.</p>
        ) : null}
        {rows?.length ? <Assessments rows={rows} /> : null}
      </div>
    </div>
  );
}

/**
 * THE COLUMN THAT ACTUALLY DISCRIMINATES.
 *
 * Paper / Area / Started / Status, on a real install, is sixteen rows reading
 * "Education | Education | 19 Sep 2026 | <tag>": three of the four columns
 * constant down the whole table, because they are sixteen runs of one paper on
 * one morning. The 2h21m assessment holding the entire exploitation playbook is
 * visually identical to fourteen stubs that lived a few minutes.
 *
 * "Ran for" is `updatedAt - createdAt`, which separates them at a glance. The
 * time is shown as well as the date for the same reason the date alone failed.
 * And the abandoned runs fold away, so the first screen is assessments: a
 * cancelled run is a thing that happened, not a thing to read.
 */
function Assessments({ rows }: { rows: AnalysisRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const table = (list: AnalysisRow[]) => (
    <Table
      columns={[{ header: 'Paper' }, { header: 'Area' }, { header: 'Started' }, { header: 'Ran for' }, { header: 'Status' }]}
      rows={list.map((row) => [
        <Link key="t" className="govuk-link" to={`/assessments/${row.id}`}>{row.title}</Link>,
        row.policyArea ?? row.jurisdiction ?? '—',
        when(row.createdAt),
        // The ladder lives in `client/status.ts` now. It was private here, and
        // the assessment header and the commissioning page both had to state
        // the same span — which is how `/assessments/new` came to describe a
        // 10h 23m run as "two and a half hours".
        spent(row.createdAt, row.updatedAt),
        <Tag key="s" colour={statusColour(row.status) as TagColour}>{statusLabel(row.status)}</Tag>,
      ])}
    />
  );

  const abandoned = rows.filter((row) => row.status === 'cancelled');
  const kept = rows.filter((row) => row.status !== 'cancelled');
  if (!abandoned.length || showAll) return table(rows);

  return (
    <>
      {kept.length ? table(kept) : (
        <p className="govuk-body">Every assessment here was cancelled before it finished.</p>
      )}
      <p className="govuk-body">
        <button type="button" className="prt-linkbutton" onClick={() => setShowAll(true)}>
          Show {abandoned.length} cancelled {abandoned.length === 1 ? 'run' : 'runs'} as well
        </button>
      </p>
    </>
  );
}
