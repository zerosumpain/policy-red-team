import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type AnalysisRow, type RecurringBodies } from '../api';
import { Details, NotificationBanner, Table, Tag, type TagColour } from '../govuk';
import type { OverviewCard } from '$lib/overview';
import { MOVES } from '../moves';
import { isFinished, spent, statusLabel, statusColour } from '../status';
import { usePageTitle } from '../layout/Template';
import { bodyPath, HUB, seenIn } from '../places';

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
  const [recurring, setRecurring] = useState<RecurringBodies | null>(null);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  // No page name: the landing page IS the service, and "Policy Red Team —
  // Policy Red Team" is what a title built by rote looks like.
  usePageTitle();

  useEffect(() => {
    api.landing()
      .then((data) => { setRows(data.analyses); setStages(data.stages); setReadOnly(data.readOnly); })
      .catch((err: Error) => setError(err.message));
    // Its own request, so the assessments are on screen before the graphs
    // the panel reads have been counted.
    api.recurringBodies().then(setRecurring).catch((err: Error) => setRecurringError(err.message));
  }, []);

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full">
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
        {/*
          THE WAY IN, FOR AN INSTALL THAT HAS NOT BEEN SET UP.
          
          A fresh clone had no browser-reachable route to configuration at all:
          `/admin` was closed unless a variable nobody had heard of was set, and
          nothing on any page said its name. Somebody who downloads this and
          opens it should be able to find the thing that makes it work from the
          first page they see.
        */}
        <p className="govuk-body-s prt-meta">
          Not set up yet? <Link className="govuk-link" to="/setup">Get this service working</Link> —
          it takes a model credential and one real call to prove it.
        </p>
      </div>

      {/*
        WHAT IT DOES TO A PAPER, on the screen that is asking you to hand it one.

        The lead says the tool "reads a policy paper as an adversary would" and
        the page then went straight to a table of runs — so a reader could not
        tell whether reading takes ten seconds or ten hours, nor what the thing
        they get back looks like. Both halves were already in hand: the stage
        names arrive in the landing response, and the five moves are the report's
        own tab strip.

        UNGROUPED, AND THAT IS DELIBERATE. The obvious drawing is eighteen stages
        bracketed into the five moves they feed, and the stage-to-move mapping is
        not in the data: `MOVE_ORDER` orders the moves and says nothing about
        stages. Bracketing them would be inventing a correspondence the pipeline
        does not assert, on the first screen of the service.
      */}
      {/*
        THE LATEST FINISHED ASSESSMENT LEADS (phase 20). A reader arriving here
        was almost always sent to read one assessment, and it is almost always
        the newest. Its answer, its exposure and its four figures are on the
        first screen, with one way in: the summary.
      */}
      {(() => {
        // A FINISHED run leads where there is one; a failed run's partial
        // report only when nothing has finished.
        const latest = rows?.find((row) => row.summary && isFinished(row.status)) ?? rows?.find((row) => row.summary);
        /*
          BESIDE IT, FROM DESKTOP: THE BODIES THAT TURN UP AGAIN (phase 24).
          The one thing a single assessment cannot say is which bodies keep
          coming back across papers, and it was reachable only from a footer
          link. Two thirds and one third, so both are on the first screen; a
          column each below desktop, the assessment first.
        */
        return (
          <>
            {latest?.summary ? (
              <div className="govuk-grid-column-two-thirds-from-desktop govuk-!-margin-top-6">
                <h2 className="govuk-heading-l">Latest assessment</h2>
                <Feature row={latest} card={latest.summary} />
              </div>
            ) : null}
            <div className={`${latest?.summary ? 'govuk-grid-column-one-third-from-desktop' : 'govuk-grid-column-full'} govuk-!-margin-top-6`}>
              <h2 className="govuk-heading-l">Bodies that turn up again</h2>
              <Recurring data={recurring} error={recurringError} />
            </div>
          </>
        );
      })()}

      <div className="govuk-grid-column-full govuk-!-margin-top-6">
        <h2 className="govuk-heading-l">All assessments</h2>
        {error ? <p className="govuk-body govuk-error-message">{error}</p> : null}
        {rows === null && !error ? <p className="govuk-body">Loading…</p> : null}
        {rows?.length === 0 ? (
          <p className="govuk-body">Nothing assessed yet. Start with a paper you already know well — it is the fastest way to judge whether the thing is any good.</p>
        ) : null}
        {rows?.length ? <Assessments rows={rows} /> : null}
      </div>

      {stages.length ? (
        <div className="govuk-grid-column-full govuk-!-margin-top-6">
          {/* BEHIND A DISCLOSURE SINCE PHASE 20. The landing page is where a
              reader finds the assessments they were sent to read; eighteen
              stage names above them was the first thing they met, and it
              answers a question only a commissioner asks. */}
          <Details summary="How it works: what it does to a paper">
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
            {stages.length === 18 ? 'Eighteen' : stages.length} steps produce one report in{' '}
            {MOVES.length - 1 === 5 ? 'five' : MOVES.length - 1} parts, opened by a one-page summary.
          </p>
          <ol className="prt-moves">
            {MOVES.filter((move) => move.id !== 'overview').map((move) => (
              <li key={move.id} className="prt-moves__move">
                <span className="prt-moves__label">{move.label}</span>
                <span className="prt-moves__hint">{move.hint}</span>
              </li>
            ))}
          </ol>
          </Details>
        </div>
      ) : null}

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
    /* `scroll`: five columns of real titles pushed a 320px landing page 207px
       sideways (measured on the live list, phase 24). The table scrolls in
       its own box instead, as every other wide table here does. */
    <Table className="prt-table prt-table--zebra" firstCellIsHeader scroll
      columns={[{ header: 'Paper' }, { header: 'What it found' }, { header: 'Started' }, { header: 'Ran for' }, { header: 'Status' }]}
      rows={list.map((row) => [
        <Fragment key="t">
          <Link className="govuk-link prt-runs__title" to={`/assessments/${row.id}`}>{row.title}</Link>
          {row.policyArea ?? row.jurisdiction ? <span className="prt-runs__area">{row.policyArea ?? row.jurisdiction}</span> : null}
        </Fragment>,
        row.summary && row.summary.plays ? (
          <span key="f" className="prt-runs__found">
            <MiniBands bands={row.summary.bands} total={row.summary.plays} />
            <span className="prt-runs__figure">
              {row.summary.plays} ways to beat it{row.summary.bands.severe ? `, ${row.summary.bands.severe} severe` : ''}
            </span>
          </span>
        ) : <span key="f" className="prt-meta">—</span>,
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

const BANDS = [
  ['severe', 'Severe'], ['significant', 'Significant'], ['moderate', 'Moderate'], ['limited', 'Limited'],
] as const;

/**
 * The exposure bar in miniature — the band ramp the report uses, not a new
 * one. An image with its words in the label, because on this page it is a
 * picture of a count rather than a control; the report's own bar is the one a
 * reader presses.
 *
 * THE BANDS ARE WRITTEN OUT HERE rather than imported from the view layer:
 * `Home` is the one eagerly loaded route and `$lib/policy-analysis/view` would
 * bring `contracts.ts` and its zod schemas into the first paint (see App.tsx).
 */
function MiniBands({ bands, total, large }: { bands: OverviewCard['bands']; total: number; large?: boolean }) {
  const words = BANDS.filter(([band]) => bands[band]).map(([band, word]) => `${bands[band]} ${word.toLowerCase()}`).join(', ');
  return (
    <span className={`prt-minibands${large ? ' prt-minibands--large' : ''}`} role="img" aria-label={`How exposed: ${words}`}>
      {BANDS.filter(([band]) => bands[band]).map(([band]) => (
        <span key={band} className={`prt-minibands__seg prt-band--${band}`} style={{ flexGrow: bands[band] / total }}>
          {large ? <span aria-hidden="true">{bands[band]}</span> : null}
        </span>
      ))}
    </span>
  );
}

/**
 * THE NEWEST FINISHED ASSESSMENT, AS A CARD. Every figure is the summary's own
 * (`overviewCard`), which is the Summary tab's, which is the tabs' — so the four
 * numbers here are the four the reader meets again one click in.
 */
function Feature({ row, card }: { row: AnalysisRow; card: OverviewCard }) {
  const when = new Date(row.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const figures: [number, string, string?][] = [
    [card.plays, card.plays === 1 ? 'way to beat it' : 'ways to beat it', card.bands.severe ? `${card.bands.severe} severe` : undefined],
    [card.parts, card.parts === 1 ? 'part of the policy exposed' : 'parts of the policy exposed'],
    [card.bodies, card.bodies === 1 ? 'body could do it' : 'bodies could do it'],
    [card.recs, card.recs === 1 ? 'recommendation' : 'recommendations'],
  ];
  return (
    <section className="prt-feature" aria-labelledby={`feature-${row.id}`}>
      <p className="prt-feature__meta">
        <Tag colour={statusColour(row.status) as TagColour}>{statusLabel(row.status)}</Tag>
        <span>Started {when} · ran for {spent(row.createdAt, row.updatedAt)}</span>
      </p>
      <h3 className="govuk-heading-m prt-feature__title" id={`feature-${row.id}`}>
        <Link className="govuk-link" to={`/assessments/${row.id}`}>{row.title}</Link>
      </h3>
      {card.headline ? <p className="govuk-body-l prt-feature__headline">{card.headline}</p> : null}
      {card.plays ? (
        <div className="prt-feature__bar">
          <MiniBands bands={card.bands} total={card.plays} large />
          <p className="prt-feature__key" aria-hidden="true">
            {BANDS.filter(([band]) => card.bands[band]).map(([band, word]) => (
              <span key={band} className="prt-feature__keyitem">
                <span className={`prt-stack__swatch prt-band--${band}`} />
                {word} {card.bands[band]}
              </span>
            ))}
          </p>
        </div>
      ) : null}
      <ul className="prt-feature__figures">
        {figures.filter(([n]) => n).map(([n, label, note]) => (
          <li key={label} className="prt-feature__figure">
            <span className="prt-feature__n">{n.toLocaleString()}</span>
            <span className="prt-feature__label">{label}</span>
            {note ? <span className="prt-feature__note">{note}</span> : null}
          </li>
        ))}
      </ul>
      <Link to={`/assessments/${row.id}`} className="govuk-button govuk-!-margin-bottom-0" role="button" draggable={false} data-module="govuk-button">
        Open the summary<span className="govuk-visually-hidden"> of {row.title}</span>
      </Link>
    </section>
  );
}

/**
 * "BODIES THAT TURN UP AGAIN" — the landing page's second feature (phase 24).
 *
 * Each body seen in two or more papers, with a SMALL-MULTIPLES STRIP: one
 * square per paper, oldest first, painted with the worst band that paper found
 * for the body — the band ramp and the band words the rest of the landing page
 * uses (`BANDS`, `.prt-band--*`), not a new vocabulary. Under it, what each
 * paper asks of the body, in the paper's own graph's words, where it has any.
 *
 * AN EMPTY PANEL SAYS WHY, and there are two reasons that read differently:
 * fewer than two papers assessed, where nothing could turn up twice yet; and
 * several papers with no body in common. Hiding the panel would hide the very
 * feature a reader was told to look for.
 *
 * LIVE THERE IS ONE: Jobcentre Plus, in two papers. So the panel is built for
 * one row looking deliberate and for five looking like a list, and it counts
 * the rest rather than drawing them.
 */
function Recurring({ data, error }: { data: RecurringBodies | null; error: string | null }) {
  if (error) return <p className="govuk-body govuk-error-message">{error}</p>;
  if (!data) return <p className="govuk-body">Loading…</p>;
  const empty = !data.bodies.length;
  return (
    <section className="prt-recurring" aria-label="Bodies that turn up again">
      {empty ? (
        <p className="govuk-body">
          {data.papers === 0
            ? 'No paper has been assessed yet. A body turns up again when a second paper names it, and this is where it will show.'
            : data.papers === 1
              ? 'One paper has been assessed so far, so nothing can have turned up twice yet. Assess a second paper that names any of the same bodies and they will show here.'
              : `${data.papers} papers have been assessed and no body has turned up in more than one of them yet. A body shows here once a second paper names it.`}
        </p>
      ) : (
        <>
          <p className="govuk-body">
            {data.repeating === 1 ? 'One body has' : `${data.repeating} bodies have`} turned up in more
            than one of the {data.papers} papers assessed here. Each square is a paper, coloured by
            the worst way to beat it found for the body there.
          </p>
          <ul className="prt-recurring__list">
            {data.bodies.map((body) => <RecurringRow key={body.personaId} body={body} />)}
          </ul>
        </>
      )}
      <p className="govuk-body govuk-!-margin-bottom-0">
        <Link className="govuk-link" to={HUB}>
          {empty ? 'See every body the papers name' : data.repeating > data.bodies.length ? `See all ${data.repeating}, and every other body` : 'See every body across policies'}
        </Link>
      </p>
    </section>
  );
}

function RecurringRow({ body }: { body: RecurringBodies['bodies'][number] }) {
  const word = (band: string | null) => BANDS.find(([b]) => b === band)?.[1] ?? 'No way to beat it found';
  /* The strip's words, for anyone not looking at the squares. */
  const label = `Worst in each paper, oldest first: ${body.papers.map((p) => `${p.title}, ${word(p.worstBand).toLowerCase()}`).join('; ')}`;
  /* Three asks at most: a line each, and the body's page has every one. */
  const asks = body.papers.filter((p) => p.ask).slice(-3);
  return (
    <li className="prt-recurring__body">
      <h3 className="prt-recurring__name">
        <Link className="govuk-link" to={bodyPath(body.personaId)}>{body.name}</Link>
      </h3>
      <p className="govuk-body-s govuk-!-margin-bottom-1">
        <span className="prt-papermarks" role="img" aria-label={label}>
          {body.papers.map((p) => (
            <span key={p.id} className={`prt-papermarks__mark${p.worstBand ? ` prt-band--${p.worstBand}` : ''}`} title={`${p.title}: ${word(p.worstBand)}`} />
          ))}
        </span>
        {seenIn(body.sightings)}
        {body.entityType ? <span className="prt-meta"> · {body.entityType.replaceAll('_', ' ')}</span> : null}
      </p>
      {asks.length ? (
        <ul className="prt-recurring__asks">
          {asks.map((p) => (
            <li key={p.id}>
              <span className="prt-meta">{shortTitle(p.title)}:</span> {p.ask}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

const shortTitle = (title: string) => (title.length > 32 ? `${title.slice(0, 30).trimEnd()}…` : title);
