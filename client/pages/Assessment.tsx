import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router';
import type { Artefact } from '$lib/policy-analysis/contracts';
import { api, watchRun, type Detail, type DetailView, type RunProgress } from '../api';
import { RunClock } from './RunClock';
import { RunFindings } from './RunFindings';
import { Button, ButtonGroup, NotificationBanner, ServiceNavigation, Tag, TaskList, type Task, type TagColour } from '../govuk';
import { isFinished, isTerminal, statusColour, statusLabel } from '../status';
import { Report, type ReportRoute } from '../report/Report';
import { ProvenanceLead } from '../report/moves/ProvenanceLead';
import { useNavSlot, usePageTitle } from '../layout/Template';
import { MOVES, USE_SLUG, moveOfId, moveOfSlug, returnTo, viewPath, type MoveId } from '../moves';

/**
 * WHICH PAGE OF THE ASSESSMENT A PATH IS (phase 21), read off the route's splat.
 *
 * `''` is the Summary, `threats` a view's landing page, `threats/weights` one
 * section of it, `use` the page of actions. Anything else is not a page, and
 * says so by returning null — the caller sends it to the Summary rather than
 * drawing an empty one.
 */
function pageOf(splat: string): { view: MoveId | 'do'; section?: string } | null {
  const [slug = '', section, ...rest] = splat.split('/').filter(Boolean);
  if (rest.length) return null;
  if (!slug) return { view: 'overview' };
  if (slug === USE_SLUG) return section ? null : { view: 'do' };
  const view = moveOfSlug(slug);
  return view ? { view, section: section ? decodeURIComponent(section) : undefined } : null;
}

/**
 * WHERE AN OLD ADDRESS MEANT TO GO, or null for one that is already a page.
 *
 * Three shapes reach the bare `/assessments/:id` from before phase 21:
 *
 *   ?move=threats&sel=…           a tab, with whatever it carried
 *   #report-tab-provenance        the failed-run banner's link to a tab
 *   ?/assessments/:id/threats…    a `from=` in the new shape, put back by a
 *                                 drill that still appends it as a query —
 *                                 the item page is being rebuilt alongside
 *                                 this, and the two must not depend on
 *                                 landing in the same commit
 *
 * Each is turned into the page it named, with its query intact and the hash
 * kept where it names a place on that page.
 */
function legacyPage(id: string, search: string, hash: string): string | null {
  if (search.startsWith(`?/assessments/${id}`)) return returnTo(id, search.slice(1));
  const params = new URLSearchParams(search);
  const named = /^#report-(?:tab|panel)-([a-z]+)$/.exec(hash)?.[1];
  const move = moveOfId(params.get('move')) ?? moveOfId(named);
  if (!params.has('move') && !move) return null;
  params.delete('move');
  return `${viewPath(id, move ?? 'overview', undefined, params.toString())}${named ? '' : hash}`;
}

/**
 * One assessment: its progress while it runs, its report when it is done.
 *
 * ONE URL for both, because they are one thing to the reader — "the paper I am
 * having assessed" — and a run that finishes while you are looking at it should
 * become the report without you going anywhere. The progress view is not a
 * loading screen for the report; it is the honest state of a process that takes
 * minutes, which is why it names every stage rather than showing a spinner.
 */
export function Assessment() {
  const { id = '', '*': splat = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const slot = useNavSlot();
  const page = pageOf(splat);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<RunProgress | null>(null);
  /*
   * THE DOCUMENT TITLE NAMES THE PAGE, then the assessment. Six views and forty
   * sections under one title were forty browser tabs a reader could not tell
   * apart; the report says which page it drew, because only it knows a
   * section's name.
   */
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  usePageTitle(detail ? [pageTitle, detail.analysis.title].filter(Boolean).join(' — ') : undefined);

  /*
   * `view=report` — the narrow answer, which is what this page renders.
   *
   * It draws the stage list, the findings-so-far index and, once the run is
   * over, the report. None of those reads a causal chain, a research question,
   * a persona link, an assurance challenge or an option appraisal, and on the
   * real run those five kinds are about 1.4 MB of a 4.5 MB response. See
   * `forTheReport` in `server/api.ts` for what a stub keeps and why it is a stub.
   *
   * `fresh` DROPS WHAT IS HELD FIRST. The stream below fires on every stage
   * boundary and the whole point of re-reading then is that the run has moved;
   * serving that from a cache would freeze the page at the first stage.
   */
  const load = useCallback(async (view: DetailView = 'report') => {
    try {
      // A re-read is a re-read: the run has moved, which is the whole reason the
      // stream fired. Serving it from what is held would freeze the page.
      api.forget(id);
      setDetail(await api.detail(id, view));
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => { void load('report'); }, [load]);

  /*
   * KEYED ON WHETHER IT IS RUNNING, NOT ON THE WHOLE `detail`.
   *
   * `load()` assigns a freshly parsed object, so the reference changed on every
   * stage event and both effects below tore themselves down and rebuilt: one
   * EventSource per stage rather than one per visit — nineteen connections held
   * open through Cloudflare over an hours-long run — and a progress interval that
   * was cleared, fired an extra immediate poll, and restarted eighteen times.
   *
   * `running` is a boolean, so it changes exactly once: when the run ends.
   */
  const running = detail ? !isTerminal(detail.analysis.status) : false;

  // Follow the run while it is going. The stream closes itself on `done`; this
  // only has to stop listening when the reader leaves.
  useEffect(() => {
    if (!running) return;
    /*
     * A STAGE BOUNDARY ASKS THE SMALL QUESTION. Eighteen of these fire over a
     * run and the page is drawing a stage list and an index of links; `done`
     * asks the big one, because that is the moment the report appears.
     */
    return watchRun(id, { stage: () => void load('progress'), done: () => void load('report'), error: setError });
  }, [id, running, load]);

  /*
   * HOW MUCH LONGER, asked on a timer because nothing else will say.
   *
   * The stream above fires when a STAGE ends, and a stage can run for forty
   * minutes — so for most of a run the page had nothing new to show and no way
   * to answer the only question a reader watching it actually has. This polls a
   * small endpoint for the arithmetic; it is not the detail, which is thousands
   * of artefacts.
   *
   * THIRTY SECONDS, not one. The estimate moves when a call finishes, and calls
   * take minutes — a faster poll would redraw the same sentence and spend the
   * reader's battery to do it.
   */
  useEffect(() => {
    if (!running) return;
    let live = true;
    const ask = async () => {
      try {
        const next = await api.progress(id);
        if (live) setProgress(next);
      } catch {
        // A poll that fails is not worth an error banner over a run that is
        // fine: the next one is thirty seconds away.
      }
    };
    void ask();
    const timer = setInterval(() => void ask(), 30_000);
    return () => { live = false; clearInterval(timer); };
  }, [id, running]);

  /*
   * THE SIX FIGURES THAT SAT HERE ARE GONE, AND THAT IS PHASE 19's FIRST FIX.
   * "2,296 artefacts held", "10h 23m" and four counts were the first thing a
   * reader met on every move — figures about the machine, above the one
   * sentence the assessment exists to produce. The run's own figures are in
   * the report's last move, "Where this comes from"; the counts about the paper
   * lead the moves that explain them.
   */

  async function act(action: 'cancel' | 'resume' | 'restate') {
    setBusy(true);
    try {
      await api.act(id, action);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const legacy = legacyPage(id, location.search, location.hash);
  if (legacy) return <Navigate replace to={legacy} />;
  if (!page) return <Navigate replace to={`/assessments/${id}${location.search}`} />;

  if (error) return <p className="govuk-body govuk-error-message">{error}</p>;
  if (!detail) return <p className="govuk-body">Loading…</p>;

  const { analysis, stages } = detail;
  const done = stages.filter((s) => s.status === 'completed').length;
  /** The stage that actually stopped — read, not assumed to be the last one. */
  const failed = stages.find((s) => s.status === 'failed');
  /** A run that stopped short still has a report; a run still going does not. */
  const showReport = isFinished(analysis.status) || analysis.status === 'failed' || analysis.status === 'cancelled';
  /** The front page of a report, or the only page of a run that has none yet. */
  const front = !showReport || page.view === 'overview';
  /*
   * WHAT TRAVELS BETWEEN PAGES: the selection and the scenario, as `Report`
   * last wrote them. Read off the router's location — which `Report` writes
   * through, for exactly this — so every item below carries what is narrowed.
   */
  const carried = (() => {
    const params = new URLSearchParams(location.search);
    const kept = new URLSearchParams();
    for (const name of ['sel', 'fail']) {
      const value = params.get(name);
      if (value) kept.set(name, value);
    }
    return kept.toString();
  })();
  const route: ReportRoute = {
    view: page.view,
    section: page.section,
    anchor: decodeURIComponent(location.hash.slice(1)),
    navigate: (href, options) => void navigate(href, options),
  };

  /*
   * THE TAG COUNTS THE GAPS, AND THE HINT SAYS IT IS A SAMPLE.
   *
   * A stage row showed one warning and no sign that there were others. On the
   * real run stage 2 holds 60, stage 5 holds 53 and stage 11 holds 33 — 256 in
   * total, 77 KiB of text — and a reader watching the run had no route to any of
   * it, because the view that rolls them all up lives inside the report and the
   * report is not rendered until the run is over.
   */
  const tasks: Task[] = stages.map((stage) => ({
    title: stage.name,
    hint: stage.error ?? (stage.warnings.length
      ? `${stage.warnings[0]}${stage.warnings.length > 1 ? ` And ${stage.warnings.length - 1} more like it.` : ''}`
      : undefined),
    status: stage.status === 'completed' && stage.warnings.length
      ? { tag: { text: `${stage.warnings.length} ${stage.warnings.length === 1 ? 'gap' : 'gaps'}`, colour: 'yellow' } }
      : stage.status === 'completed' ? { tag: { text: 'Completed', colour: 'green' } }
      : stage.status === 'running' ? { tag: { text: 'Running', colour: 'blue' } }
      : stage.status === 'failed' ? { tag: { text: 'Failed', colour: 'red' } }
      : { text: 'Not started yet' },
  }));

  return (
    <>
      {/*
        ONE HEADER, FULL WIDTH, STATUS STATED ONCE.
        It was a two-thirds column holding a caption, a title, a tag and a stage
        count, followed by a separate full-width warning box repeating the
        failure — so a reader opening a report met the run's own troubles twice
        before meeting a single finding. The status belongs beside the title,
        where it qualifies it; the failure's DETAIL belongs in Provenance, which
        is the move that exists for what the run did to itself.
      */}
      {/*
        THE SIX VIEWS, ACROSS THE TOP OF EVERY PAGE OF THE REPORT (phase 21).
        Portalled into the slot `Template` keeps under the header, because
        GOV.UK puts the service navigation there, full bleed, and only this page
        knows whether there is a report to navigate. A run still going has one
        page and no views, so it draws none.

        THE CURRENT VIEW IS `page` ON ITS LANDING PAGE AND `true` UNDER IT —
        the framework's own distinction between "this is the page" and "you are
        inside this", which a screen reader announces differently.
      */}
      {showReport && slot ? createPortal(
        <ServiceNavigation
          wide
          label="This assessment"
          items={MOVES.map((entry) => ({
            href: viewPath(id, entry.id, undefined, carried),
            text: entry.label,
            current: entry.id === page.view && !page.section,
            active: entry.id === page.view && Boolean(page.section),
          }))}
          render={({ href, className, current, children }) => (
            <Link to={href} className={className} aria-current={current}>{children}</Link>
          )}
        />,
        slot,
      ) : null}

      <header className="prt-pagehead">
        <span className="govuk-caption-l">Assessment</span>
        {/* The full-size title on the front page; one size down on every page
            under it, where the title is context and the section is the news. */}
        <h1 className={front ? 'govuk-heading-xl' : 'govuk-heading-l'}>{analysis.title}</h1>
        <p className="prt-pagehead__status">
          <Tag colour={statusColour(analysis.status) as TagColour}>{statusLabel(analysis.status)}</Tag>
          {/* The step count and the model are about the run. While it runs they
              are the news; once there is a report they are in its last move. */}
          {showReport ? null : <span className="prt-meta">{done} of {stages.length} steps</span>}
          {showReport || !analysis.model ? null : <span className="prt-meta">{analysis.model}</span>}
        </p>
      </header>


      {/*
        A FAILED RUN SAYS WHY IT FAILED.
        `analysis.error` — "1 independent challenge has no response in the revised
        assessment." — was in the payload and rendered nowhere: the page used it
        as a CONDITION and then printed a fixed sentence, "Stopped at the last
        stage", which is a guess that happens to be right for a run that dies at
        eighteen of eighteen and wrong for one that dies at three. So the reason
        is printed as written and the stage is read off the rows.

        The link works now too. It used to point at `#report-tab-provenance`,
        which is the tab BUTTON — but which panel is open is React state, and
        nothing in the client listened to the hash, so above the tablet
        breakpoint the click scrolled to the strip, focused a button and left
        Verdict open. `Report` reads the hash now; see the note there.
      */}
      {analysis.status === 'failed' && front ? (
        <NotificationBanner title="Stopped before the end">
          <p className="govuk-body">{analysis.error ?? 'It recorded no reason.'}</p>
          <p className="govuk-body">
            {failed
              ? `It stopped in ${failed.name.toLowerCase()} — step ${failed.ordinal + 1} of ${stages.length}. `
              : ''}
            {done} {done === 1 ? 'step' : 'steps'} finished and{' '}
            {detail.artefacts.length.toLocaleString()} items were kept.{' '}
            <Link className="govuk-link" to={viewPath(id, 'provenance', undefined, carried)}>
              What it kept and what it lost
            </Link>
          </p>
        </NotificationBanner>
      ) : null}

      {/*
        "FINISHED, WITH GAPS" IS A LINE, NOT A BANNER. It was a notification
        banner of counts — 227 not covered, 162 discarded, 164 open questions —
        between the status and the headline: machine figures again, in the most
        prominent box on the page. The tag beside the title already says "With
        gaps"; this says what that means, in one sentence, and where to look.
      */}
      {analysis.status === 'completed_with_gaps' && front ? (
        <p className="govuk-body prt-gapsline">
          It finished, but some steps could not do everything they tried.{' '}
          <Link className="govuk-link" to={viewPath(id, 'provenance', 'gaps', carried)}>What it could not do</Link> is under
          &ldquo;How it was made&rdquo;.
        </p>
      ) : null}

      {running ? (
        <>
          <p className="govuk-body">
            This runs to the end on its own. You can close the page — it does not stop.
          </p>
          <RunClock progress={progress} />
          <TaskList items={tasks} idPrefix="stages" />
          {/*
            THE INTELLIGENCE IS READABLE BEFORE THE REPORT IS.
            The drill route never required a finished run, but nothing linked to
            it until the end — so a reader waiting four hours could not open work
            that had been stored for three of them.
          */}
          <RunFindings detail={detail} id={id} />
          {/*
            WHAT IT IS THROWING AWAY, WHILE IT IS THROWING IT AWAY.
            `ProvenanceLead` is the view whose stated premise is that an
            undercount is the serious direction — and it lived only inside the
            report, which is not rendered until the run is terminal. So for the
            whole of a several-hour run the one place the discards are counted
            honestly was unreachable. It takes `stages` and nothing else, and
            renders nothing at all until there is something parseable in them.
          */}
          <ProvenanceLead stages={stages} artefacts={detail.artefacts} />
          {/* A control that would only 403 is not drawn. The landing page has
              made this argument since phase 4; the flag needed to make it here
              only arrived with the share panel. */}
          {detail.readOnly ? null : (
            <>
              {/*
                STOPPING IS NOT LOSING, AND THE BUTTON HAS TO SAY SO.
                `control(…, 'cancel')` marks the CURRENT STAGE cancelled and
                leaves every completed stage completed; `resume` re-queues from
                the first unfinished one. So the cost of stopping is the stage in
                flight, not the run.
                Nothing on this page said that, so "Cancel this run" read as
                destructive and the resume control only appeared AFTER you had
                taken the risk — which is the wrong way round. A reader deciding
                whether to stop a four-hour job needs to know what it costs
                BEFORE they decide, not afterwards.
              */}
              <p className="govuk-body">
                Stopping keeps everything finished so far. You can resume from the step it was on —
                only that step is repeated, and repeating it produces the same results.
              </p>
              <ButtonGroup>
                <Button variant="warning" disabled={busy} onClick={() => void act('cancel')}>
                  Stop this run
                </Button>
              </ButtonGroup>
            </>
          )}
        </>
      ) : (
        <>
          {/*
            A RUN THAT STOPPED SHORT STILL HAS A REPORT, and refusing to draw it
            is the more misleading choice.

            The Post-16 run failed at stage 18 of 18 holding 2,265 artefacts —
            every actor, every mechanism, the whole exploitation playbook and the
            independent challenge. Only the final revision is missing. Refusing to
            render meant a reader had no path to seventeen stages of finished
            work, and the failure notice above says plainly what is absent.

            What is NOT done: nothing is silently completed. The status tag reads
            failed, the error is printed, and the assurance response the last
            stage never produced is simply not there — an absent section rather
            than an invented one.
          */}
          {showReport ? (
            <Report
              detail={detail}
              onChanged={() => void load()}
              route={route}
              onTitle={setPageTitle}
              /*
                THE READING POSITION TRAVELS WITH THE LINK, AND IT COMES FROM
                `Report` RATHER THAN FROM THE URL.

                `Report` keeps `?move=…&sel=…` up to date with
                `history.replaceState` in an effect — and an effect runs AFTER
                the render in which this closure was built, so reading
                `window.location.search` here returns the position as it was
                before the reader's last selection. Select a mechanism, click a
                play, and the href would carry the previous state: worse than
                dropping it, because it sends the reader back to the wrong
                place in silence.

                So `at` is handed in as the third argument, from the state
                `Report` is holding at the moment it renders the link. It is an
                opaque query string, never a route — nothing in the report tree
                learns what a URL looks like.

                THE THIRD PARAMETER IS OPTIONAL, which is what lets this compile
                against an `ArtefactLink` that has not been widened yet: a
                function with extra optional parameters is assignable to one
                without them, and the link simply carries no position until
                `Report` starts passing one.
              */
              linkTo={(artefact: Artefact, label?: string, at?: string) => (
                <Link
                  className="govuk-link"
                  to={`/assessments/${id}/items/${encodeURIComponent(artefact.id)}${at ? `?from=${encodeURIComponent(at)}` : ''}`}
                >
                  {label ?? artefact.label}
                </Link>
              )}
            />
          ) : null}
          {/*
            THE STAGE LIST BELONGS TO A RUN THAT IS NOT A REPORT.
            Rendering a report for a failed run put both on the page: eighteen
            stages of prose repeated under every one of the five moves, longer
            than the report itself. Where a report is drawn, the stages live in
            Provenance, which is what that move is for.
          */}
          {showReport ? null : <TaskList items={tasks} idPrefix="stages" />}
          {/* On the front page only: resuming is about the run, and the run's
              state is stated there. Every other page has the views and the
              back link to leave by. */}
          {front ? (
            <ButtonGroup>
              {(analysis.status === 'failed' || analysis.status === 'cancelled') && !detail.readOnly ? (
                <Button disabled={busy} onClick={() => void act('resume')}>
                  {analysis.status === 'cancelled' ? 'Resume from where it stopped' : 'Resume the steps it did not finish'}
                </Button>
              ) : null}
              <Link className="govuk-link" to="/">Back to all assessments</Link>
            </ButtonGroup>
          ) : null}
          {/*
            WHAT YOU CAN DO WITH THIS, AS ONE LINE (phase 21). It was a block —
            a black rule, a heading and two sections of forms — under every
            view, so every page of the report ended in a file picker. Three
            actions are a line of links; the forms are on their own page.
            Inside `<main>` and a `<nav>`, so it is in a landmark and named.
          */}
          {showReport ? (
            <nav className="prt-usebar" aria-label="What you can do with this">
              <ul className="prt-usebar__list">
                <li><Link className="govuk-link" to={`${viewPath(id, 'use', undefined, carried)}#take`}>Download a copy</Link></li>
                {detail.readOnly ? null : (
                  <>
                    <li><Link className="govuk-link" to={`${viewPath(id, 'use', undefined, carried)}#add`}>Add something to it</Link></li>
                    <li><Link className="govuk-link" to={`${viewPath(id, 'use', undefined, carried)}#again`}>Write the report again</Link></li>
                  </>
                )}
              </ul>
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

